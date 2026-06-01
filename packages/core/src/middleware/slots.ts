// Fixed 3-slot routing middleware (v0.8+). Opt-in, additive layer alongside
// the legacy shadow + canary-ramp middleware in `compose.ts`.
//
// The `production` deploy (the Custom Environment holding the public domain)
// owns the split: it rewrites `trafficNightlyPercent`% of traffic to the
// nightly domain, `trafficCanaryPercent`% to the canary domain, and serves the
// remainder itself. Assignment is sticky via a cookie. Slots are identified by
// `VERCEL_TARGET_ENV`, so nightly / canary / preview / dev deploys pass through
// and serve their own content.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getShadowConfig } from '../edge-config/read.js';

type Slot = 'nightly' | 'canary' | 'production';

export type SlotMiddlewareOptions = {
  /** Cookie name for sticky slot assignment. Default: 'shadow-bucket' */
  cookieName?: string;
  /** Request header set on rewrites to prevent routing loops. Default: 'x-shadow-routed' */
  routedHeader?: string;
  /** UA pattern that receives passthrough (no split). Default: /bot|crawl|spider|scraper|headless|preview/i */
  botPattern?: RegExp;
  /** Max-age in seconds for the sticky slot cookie. Default: 86400 (24h) */
  cookieMaxAge?: number;
  /**
   * Vercel Deployment Protection bypass secret, injected on the rewrite so the
   * nightly / canary domains pass password / SSO protection. Default:
   * `VERCEL_AUTOMATION_BYPASS_SECRET`. Pass `''` to disable auto-detection.
   */
  bypassToken?: string;
  /**
   * **Custom-environment mode.** `VERCEL_TARGET_ENV` value of the Custom
   * Environment that owns the routing decision (the one holding the public
   * domain). Only deploys whose target env matches run the split. Default:
   * `SHADOW_CANARY_ROUTING_ENV` env var if set, else `'production'`.
   *
   * Used only when {@link productionBranch} is not set.
   */
  routingEnv?: string;
  /**
   * **Branch mode** (no Custom Environments). When every slot deploys with
   * `vercel deploy --prod` to the same production env, the git branch is the
   * only runtime signal. Set this to the production branch name (e.g.
   * `'production'`): only that branch's deploy owns the split; the nightly /
   * canary branch deploys serve their own content. The nightly / canary
   * rewrite targets (`domainNightly` / `domainCanary`) are then the stable
   * branch-pinned URLs (`<project>-git-<branch>-<team>.vercel.app`).
   *
   * Default: `SHADOW_CANARY_PRODUCTION_BRANCH` env var. Leave unset to use
   * {@link routingEnv} (Custom Environment) detection instead.
   */
  productionBranch?: string;
};

function getClientIP(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}

function rewriteTo(
  req: NextRequest,
  host: string,
  routedHeader: string,
  bypassToken?: string,
): NextResponse {
  const target = host.replace(/^https?:\/\//, '');
  const url = req.nextUrl.clone();
  url.hostname = target;
  url.protocol = 'https:';
  url.port = '';
  const headers = new Headers(req.headers);
  headers.set(routedHeader, '1');
  if (bypassToken) {
    headers.set('x-vercel-protection-bypass', bypassToken);
    headers.set('x-vercel-set-bypass-cookie', 'samesitenone');
  }
  return NextResponse.rewrite(url, { request: { headers } });
}

function clampPct(n: number | undefined): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/**
 * Fixed 3-slot routing middleware. Returns a NextResponse (rewrite or
 * cookie-set) when action is needed, or `null` for passthrough — the caller
 * returns `NextResponse.next()` in that case.
 *
 * @example
 * import { slotCanaryMiddleware } from '@dotworld/shadow-canary-core/edge';
 * import { NextRequest, NextResponse } from 'next/server';
 *
 * export async function middleware(req: NextRequest) {
 *   const res = await slotCanaryMiddleware(req);
 *   return res ?? NextResponse.next();
 * }
 */
export async function slotCanaryMiddleware(
  req: NextRequest,
  opts?: SlotMiddlewareOptions,
): Promise<NextResponse | null> {
  const cookieName = opts?.cookieName ?? 'shadow-bucket';
  const routedHeader = opts?.routedHeader ?? 'x-shadow-routed';
  const botPattern =
    opts?.botPattern ?? /bot|crawl|spider|scraper|headless|preview/i;
  const cookieMaxAge = opts?.cookieMaxAge ?? 86400;
  const bypassToken =
    opts?.bypassToken ?? process.env['VERCEL_AUTOMATION_BYPASS_SECRET'];
  const routingEnv =
    opts?.routingEnv ??
    process.env['SHADOW_CANARY_ROUTING_ENV'] ??
    'production';
  const productionBranch =
    opts?.productionBranch ?? process.env['SHADOW_CANARY_PRODUCTION_BRANCH'];

  // Already rewritten upstream — serve as-is (prevents loops on the nightly /
  // canary deploys, which re-run this middleware on the rewritten request).
  if (req.headers.get(routedHeader) === '1') {
    return null;
  }

  // Decide whether THIS deploy owns the routing split. Two topologies:
  //
  //   Branch mode (productionBranch set): every slot deploys `--prod` to the
  //   same env, so the git branch is the only signal. Only the production
  //   branch owns the split; nightly / canary branch deploys serve their own
  //   content. Preview / dev (VERCEL_ENV != production) pass through.
  //
  //   Custom-environment mode (default): VERCEL_TARGET_ENV distinguishes slots;
  //   only the routing env owns the split.
  let onRoutingDeploy: boolean;
  if (productionBranch) {
    const vercelEnv = process.env['VERCEL_ENV'];
    if (vercelEnv && vercelEnv !== 'production') return null;
    const branch = process.env['VERCEL_GIT_COMMIT_REF'];
    if (branch && branch !== productionBranch) return null;
    onRoutingDeploy = vercelEnv === 'production';
  } else {
    const targetEnv = process.env['VERCEL_TARGET_ENV'];
    if (targetEnv && targetEnv !== routingEnv) return null;
    onRoutingDeploy = targetEnv === routingEnv;
  }

  // Only the routing deploy runs the split; everything else serves its own
  // content. This catches the case the topology guards above DON'T: a deploy
  // with VERCEL_TARGET_ENV unset (older Vercel runtime, local `next dev`, or a
  // misconfig) where `targetEnv && …` is falsy — without this it would fall
  // through and rewrite to domainNightly/domainCanary despite not owning the
  // public domain. To exercise the split locally, set VERCEL_TARGET_ENV (or
  // VERCEL_ENV=production + the production branch) so this resolves true.
  if (!onRoutingDeploy) return null;

  if (botPattern.test(req.headers.get('user-agent') ?? '')) {
    return null;
  }

  // We own routing — hard-fail on a config read error so misconfigs surface
  // immediately rather than silently serving an unsplit production.
  let cfg: Awaited<ReturnType<typeof getShadowConfig>>;
  cfg = await getShadowConfig();
  if (!cfg) return null;

  const clientIP = getClientIP(req);
  const ipForced = Boolean(clientIP && cfg.forceNightlyIPs?.includes(clientIP));

  const nightlyPct = clampPct(cfg.trafficNightlyPercent);
  const canaryPct = clampPct(cfg.trafficCanaryPercent);

  const stickyRaw = req.cookies.get(cookieName)?.value;
  const sticky: Slot | null =
    stickyRaw === 'nightly' ||
    stickyRaw === 'canary' ||
    stickyRaw === 'production'
      ? stickyRaw
      : null;

  // Sticky cookie wins over forceNightlyIPs: a QA IP that already picked up a
  // (say) `production` cookie stays there until the cookie expires. forceIPs is
  // therefore best-effort for fresh sessions — clear the cookie to re-pin.
  let slot: Slot;
  if (sticky) {
    slot = sticky;
  } else if (ipForced) {
    slot = 'nightly';
  } else {
    // Single roll partitions [0,100) into nightly | canary | production.
    const roll = Math.random() * 100;
    if (roll < nightlyPct) slot = 'nightly';
    else if (roll < nightlyPct + canaryPct) slot = 'canary';
    else slot = 'production';
  }

  // Map slot → domain. production is served in place. If a chosen slot's domain
  // is missing from config, fall back to production rather than 404.
  const domain =
    slot === 'nightly'
      ? cfg.domainNightly
      : slot === 'canary'
        ? cfg.domainCanary
        : undefined;
  if (slot !== 'production' && !domain) {
    slot = 'production';
  }

  const res =
    slot === 'production'
      ? null
      : rewriteTo(req, domain!, routedHeader, bypassToken);

  if (stickyRaw !== slot && !ipForced) {
    const carrier = res ?? NextResponse.next();
    carrier.cookies.set(cookieName, slot, {
      maxAge: cookieMaxAge,
      path: '/',
      sameSite: 'lax',
    });
    return carrier;
  }

  return res;
}

/** Alias of {@link slotCanaryMiddleware} for the Next.js 16 `proxy.ts` convention. */
export const slotCanaryProxy = slotCanaryMiddleware;

/** Alias of {@link SlotMiddlewareOptions} for v16 `proxy.ts` ergonomics. */
export type SlotProxyOptions = SlotMiddlewareOptions;
