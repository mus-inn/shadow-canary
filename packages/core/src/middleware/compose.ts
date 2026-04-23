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
): NextResponse {
  const target = host.replace(/^https?:\/\//, '');
  const url = req.nextUrl.clone();
  url.hostname = target;
  url.protocol = 'https:';
  url.port = '';
  const headers = new Headers(req.headers);
  headers.set(routedHeader, '1');
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

  // Already rewritten upstream — serve as-is (prevents loops on the shadow /
  // previous-prod deploys).
  if (req.headers.get(routedHeader) === '1') {
    return null;
  }

  // Only the production-branch deploy owns the routing decision. Master-branch
  // deploys (shadow role) and any former-prod deploys (previous slot) serve
  // their own content when hit directly.
  if (
    process.env['VERCEL_GIT_COMMIT_REF'] &&
    process.env['VERCEL_GIT_COMMIT_REF'] !== 'production'
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

  const cfg = await getShadowConfig();
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
    const res = rewriteTo(req, cfg.deploymentDomainShadow, routedHeader);
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
      ? rewriteTo(req, previous, routedHeader)
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
