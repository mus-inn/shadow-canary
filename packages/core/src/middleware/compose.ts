import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getShadowConfig } from '../edge-config/read.js';

export type ShadowCanaryMiddlewareOptions = {
  /** Cookie name for sticky bucket assignment. Default: 'shadow-bucket' */
  cookieName?: string;
  /** Request header set on rewrites to prevent routing loops. Default: 'x-shadow-routed' */
  routedHeader?: string;
  /** UA pattern that receives passthrough (no split). Default: /bot|crawl|spider|scraper|headless|preview/i */
  botPattern?: RegExp;
  /** Max-age in seconds for the sticky bucket cookie. Default: 86400 (24h) */
  cookieMaxAge?: number;
  /**
   * Edge Config key holding this project's ShadowConfig payload.
   * Default: resolved from `SHADOW_CANARY_KEY` env var, else `'shadow-configuration'`.
   *
   * Use a project-specific key (e.g. `shadow-configuration-<app>`) when
   * sharing one Edge Config store across multiple projects, typically to
   * sidestep Vercel Pro's 3-store limit.
   */
  configKey?: string;
  /**
   * Vercel Deployment Protection bypass secret. Injected on the rewrite as
   * `x-vercel-protection-bypass` + `x-vercel-set-bypass-cookie: samesitenone`
   * so shadow / previous-prod deployment URLs pass password / SSO protection.
   *
   * Default: `VERCEL_AUTOMATION_BYPASS_SECRET` env var (Vercel auto-injects
   * this when "Protection Bypass for Automation" is enabled on the project),
   * so the out-of-the-box setup requires zero caller config.
   *
   * Pass `''` (empty string) to explicitly disable auto-detection.
   */
  bypassToken?: string;
  /**
   * Git branch name that produces the "current prod" deployment. The shadow
   * slot is deployed from a different branch (usually `master`) but with
   * `vercel deploy --prod`, so both shadow and current-prod end up with
   * `VERCEL_ENV=production` baked in at build time. `VERCEL_GIT_COMMIT_REF`
   * is the only runtime signal that distinguishes them — if it doesn't match
   * this branch, the middleware bails out and the deploy serves its own
   * content directly.
   *
   * Default: `SHADOW_CANARY_PRODUCTION_BRANCH` env var if set, else
   * `'production'` (the branch name the reference deploy workflows use).
   *
   * Pass `''` (empty string) — or set the env var to empty — to disable the
   * branch filter entirely and rely only on `VERCEL_ENV` + the
   * `x-shadow-routed` loop guard. Use this if you don't follow the 2-branch
   * shadow-canary convention (e.g. your prod branch is `main` or `master`).
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

/**
 * Composable shadow + canary routing middleware.
 *
 * Returns a NextResponse (rewrite or cookie-set) when action is needed, or
 * `null` when the request should pass through — the caller is responsible for
 * returning `NextResponse.next()` in that case.
 *
 * @example
 * // middleware.ts in the host project
 * import { shadowCanaryMiddleware } from '@dotworld/shadow-canary-core/edge';
 * import { NextRequest, NextResponse } from 'next/server';
 *
 * export async function middleware(req: NextRequest) {
 *   const res = await shadowCanaryMiddleware(req);
 *   return res ?? NextResponse.next();
 * }
 */
export async function shadowCanaryMiddleware(
  req: NextRequest,
  opts?: ShadowCanaryMiddlewareOptions,
): Promise<NextResponse | null> {
  const cookieName = opts?.cookieName ?? 'shadow-bucket';
  const routedHeader = opts?.routedHeader ?? 'x-shadow-routed';
  const botPattern =
    opts?.botPattern ?? /bot|crawl|spider|scraper|headless|preview/i;
  const cookieMaxAge = opts?.cookieMaxAge ?? 86400;
  const bypassToken =
    opts?.bypassToken ?? process.env['VERCEL_AUTOMATION_BYPASS_SECRET'];
  const productionBranch =
    opts?.productionBranch ??
    process.env['SHADOW_CANARY_PRODUCTION_BRANCH'] ??
    'production';

  // Already rewritten upstream — serve as-is (prevents loops on the shadow /
  // previous-prod deploys).
  if (req.headers.get(routedHeader) === '1') {
    return null;
  }

  // Only the current-prod branch deploy owns the routing decision. Both
  // shadow and current-prod are built with `vercel deploy --prod` so they
  // share VERCEL_ENV=production — branch name is the only runtime signal
  // that separates them. Skip the check when productionBranch is '' so
  // consumers outside the strict 2-branch shadow-canary topology aren't
  // forced to rename their branch.
  if (
    productionBranch &&
    process.env['VERCEL_GIT_COMMIT_REF'] &&
    process.env['VERCEL_GIT_COMMIT_REF'] !== productionBranch
  ) {
    return null;
  }

  // Skip split on preview / development deploys — show the preview content
  // as-is.
  if (
    process.env['VERCEL_ENV'] &&
    process.env['VERCEL_ENV'] !== 'production'
  ) {
    return null;
  }

  if (botPattern.test(req.headers.get('user-agent') ?? '')) {
    return null;
  }

  const cfg = await getShadowConfig(opts?.configKey);
  if (!cfg) return null;

  const clientIP = getClientIP(req);
  const ipForced = Boolean(clientIP && cfg.shadowForceIPs?.includes(clientIP));

  // Cookie values: 'shadow' | 'prod-new' | 'prod-previous'. Legacy 'prod'
  // (pre-canary) is treated as "prod bucket, sub-bucket undecided" → fresh
  // roll + upgrade.
  const stickyRaw = req.cookies.get(cookieName)?.value;
  const stickyShadow = stickyRaw === 'shadow';
  const stickyProd: 'new' | 'previous' | null =
    stickyRaw === 'prod-new'
      ? 'new'
      : stickyRaw === 'prod-previous'
        ? 'previous'
        : null;
  const stickyProdBucket = stickyProd !== null || stickyRaw === 'prod';

  const shadowPercent = cfg.trafficShadowPercent ?? 0;
  const isShadow =
    ipForced ||
    stickyShadow ||
    (!stickyProdBucket && Math.random() * 100 < shadowPercent);

  if (isShadow && cfg.deploymentDomainShadow) {
    const res = rewriteTo(
      req,
      cfg.deploymentDomainShadow,
      routedHeader,
      bypassToken,
    );
    if (!stickyShadow && !ipForced) {
      res.cookies.set(cookieName, 'shadow', {
        maxAge: cookieMaxAge,
        path: '/',
        sameSite: 'lax',
      });
    }
    return res;
  }

  // Prod bucket — sub-split between new prod and previous prod during canary.
  // Sticky assignment survives canary completion (pct=100) so in-flight
  // sessions on previous finish their journey there. Only rollback (pct=0)
  // force-migrates everyone off new. Previous URL stays in Edge Config until
  // the next deploy-prod overwrites it; the middleware gives up on previous
  // only when the key is absent.
  const canaryPct = cfg.trafficProdCanaryPercent ?? 100;
  const previous = cfg.deploymentDomainProdPrevious;

  let prodBucket: 'new' | 'previous';
  if (!previous) {
    prodBucket = 'new';
  } else if (canaryPct === 0) {
    prodBucket = 'previous';
  } else if (stickyProd) {
    prodBucket = stickyProd;
  } else if (canaryPct === 100) {
    prodBucket = 'new';
  } else {
    prodBucket = Math.random() * 100 < canaryPct ? 'new' : 'previous';
  }

  const res =
    prodBucket === 'previous' && previous
      ? rewriteTo(req, previous, routedHeader, bypassToken)
      : null; // caller does NextResponse.next()

  const want = prodBucket === 'new' ? 'prod-new' : 'prod-previous';
  if (stickyRaw !== want) {
    if (res) {
      res.cookies.set(cookieName, want, {
        maxAge: cookieMaxAge,
        path: '/',
        sameSite: 'lax',
      });
      return res;
    } else {
      // Need to set cookie but pass through — return a NextResponse.next()
      // with the cookie attached.
      const passthrough = NextResponse.next();
      passthrough.cookies.set(cookieName, want, {
        maxAge: cookieMaxAge,
        path: '/',
        sameSite: 'lax',
      });
      return passthrough;
    }
  }

  return res; // null (passthrough) or rewrite to previous
}
