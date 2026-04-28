import { getShadowConfig } from '../edge-config/read.js';

/**
 * Coarse-grained classification of which deploy slot the running code lives
 * in, derived from build-time env vars only (no Edge Config read). Stable
 * across every request to the same deploy.
 *
 * - `shadow`            → master-branch deploy on `VERCEL_ENV=production`,
 *                         receives `trafficShadowPercent` of traffic.
 * - `production-track`  → either current prod or previous-prod (during a
 *                         canary). Build env vars cannot disambiguate the
 *                         two: both share `VERCEL_ENV=production` and the
 *                         production branch. Use {@link getRuntimeBucket} to
 *                         narrow this down via Edge Config.
 * - `preview`           → Vercel preview deploy (PR / non-prod branch).
 * - `development`       → local `next dev` (or any context where
 *                         `VERCEL_ENV` is unset).
 * - `unknown`           → env vars present but in an unexpected combination.
 */
export type ShadowCanarySlot =
  | 'shadow'
  | 'production-track'
  | 'preview'
  | 'development'
  | 'unknown';

/**
 * Fine-grained classification narrowed via Edge Config. `production-track`
 * is split into `prod-current` vs `prod-previous` by comparing the running
 * deploy's URL against `deploymentDomainProd` / `deploymentDomainProdPrevious`.
 */
export type ShadowCanaryBucket =
  | 'shadow'
  | 'prod-current'
  | 'prod-previous'
  | 'preview'
  | 'development'
  | 'unknown';

export type BuildInfo = {
  /** Vercel runtime classification: 'production' | 'preview' | 'development'. */
  vercelEnv: 'production' | 'preview' | 'development' | null;
  /** Edge / serverless region (e.g. `iad1`). */
  region: string | null;
  /** Vercel deployment ID (e.g. `dpl_xxx`). */
  deploymentId: string | null;
  /** Hostname of THIS deploy (no protocol), e.g. `my-app-abc.vercel.app`. */
  vercelUrl: string | null;
  /** Branch-pinned URL, e.g. `my-app-git-master-team.vercel.app`. */
  branchUrl: string | null;
  /** Git branch the deploy was built from. */
  branch: string | null;
  /** Full git commit SHA. */
  commitSha: string | null;
  /** First 7 chars of `commitSha`, convenient for logs / UI. */
  commitShaShort: string | null;
  /** First line of the commit message, trimmed. */
  commitMessage: string | null;
  /** Author name from the commit. */
  commitAuthor: string | null;
  /** GitHub repo slug (e.g. `mus-inn/shadow-canary` → `shadow-canary`). */
  repoSlug: string | null;
  /** Build classification — see {@link ShadowCanarySlot}. */
  slot: ShadowCanarySlot;
};

export type RuntimeInfo = BuildInfo & {
  /** Narrowed bucket — see {@link ShadowCanaryBucket}. */
  bucket: ShadowCanaryBucket;
  /**
   * `true` if Edge Config was queried to disambiguate `production-track`
   * into prod-current/prod-previous. `false` for shadow/preview/dev (no
   * disambiguation needed) and when the Edge Config read failed.
   */
  resolvedFromEdgeConfig: boolean;
};

export type GetBuildInfoOptions = {
  /**
   * Branch name that produces the "current prod" track. Same semantics as
   * {@link ShadowCanaryMiddlewareOptions#productionBranch}: when the deploy's
   * `VERCEL_GIT_COMMIT_REF` matches, we classify it as `production-track`;
   * otherwise (still on `VERCEL_ENV=production`) it's `shadow`.
   *
   * Default: `SHADOW_CANARY_PRODUCTION_BRANCH` env var, then `'production'`.
   * Pass `''` to disable the branch filter — every production deploy is then
   * classified as `production-track`.
   */
  productionBranch?: string;
};

function envOrNull(key: string): string | null {
  const v = process.env[key];
  return v && v.length > 0 ? v : null;
}

function readVercelEnv(): BuildInfo['vercelEnv'] {
  const v = process.env['VERCEL_ENV'];
  if (v === 'production' || v === 'preview' || v === 'development') return v;
  return null;
}

function deriveSlot(
  vercelEnv: BuildInfo['vercelEnv'],
  branch: string | null,
  productionBranch: string,
): ShadowCanarySlot {
  if (vercelEnv === null) return 'development';
  if (vercelEnv === 'development') return 'development';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'production') {
    // When productionBranch is empty string, the consumer opted out of the
    // 2-branch convention — every prod deploy is classified as the prod
    // track (no shadow distinction at the build level).
    if (!productionBranch) return 'production-track';
    if (branch === productionBranch) return 'production-track';
    return 'shadow';
  }
  return 'unknown';
}

function normalizeHost(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/^https?:\/\//, '').toLowerCase();
}

/**
 * Synchronous build-info snapshot. Reads only `process.env` — safe in edge
 * runtime, server components, API routes, and Node serverless. Does NOT read
 * Edge Config (use {@link getRuntimeBucket} for that).
 *
 * Caveat: env vars are only available server-side. To surface this info to
 * the client, return it from a server component / route handler / API route.
 *
 * @example
 * import { getBuildInfo } from '@dotworld/shadow-canary-core';
 *
 * export async function GET() {
 *   return Response.json(getBuildInfo());
 * }
 */
export function getBuildInfo(opts?: GetBuildInfoOptions): BuildInfo {
  const productionBranch =
    opts?.productionBranch ??
    process.env['SHADOW_CANARY_PRODUCTION_BRANCH'] ??
    'production';

  const vercelEnv = readVercelEnv();
  const branch = envOrNull('VERCEL_GIT_COMMIT_REF');
  const commitSha = envOrNull('VERCEL_GIT_COMMIT_SHA');
  const commitMessage = envOrNull('VERCEL_GIT_COMMIT_MESSAGE');

  return {
    vercelEnv,
    region: envOrNull('VERCEL_REGION'),
    deploymentId: envOrNull('VERCEL_DEPLOYMENT_ID'),
    vercelUrl: envOrNull('VERCEL_URL'),
    branchUrl: envOrNull('VERCEL_BRANCH_URL'),
    branch,
    commitSha,
    commitShaShort: commitSha ? commitSha.slice(0, 7) : null,
    commitMessage: commitMessage ? commitMessage.split('\n')[0]!.trim() : null,
    commitAuthor: envOrNull('VERCEL_GIT_COMMIT_AUTHOR_NAME'),
    repoSlug: envOrNull('VERCEL_GIT_REPO_SLUG'),
    slot: deriveSlot(vercelEnv, branch, productionBranch),
  };
}

/**
 * Async, Edge-Config-aware variant. Returns the same fields as
 * {@link getBuildInfo} plus a `bucket` narrowed via the live Edge Config:
 *
 * | slot               | bucket lookup                                                                  |
 * | ------------------ | ------------------------------------------------------------------------------ |
 * | `shadow`           | → `'shadow'` (no read needed)                                                  |
 * | `production-track` | compare `VERCEL_URL` to `deploymentDomainProd` / `deploymentDomainProdPrevious`|
 * | `preview`          | → `'preview'`                                                                  |
 * | `development`      | → `'development'`                                                              |
 *
 * Edge Config is cached for 60s by the underlying reader, so calling this
 * once per request is cheap on warm instances.
 *
 * @example
 * import { getRuntimeBucket } from '@dotworld/shadow-canary-core';
 *
 * export default async function Page() {
 *   const info = await getRuntimeBucket();
 *   return <pre>{JSON.stringify(info, null, 2)}</pre>;
 * }
 */
export async function getRuntimeBucket(
  opts?: GetBuildInfoOptions,
): Promise<RuntimeInfo> {
  const build = getBuildInfo(opts);

  if (build.slot !== 'production-track') {
    return {
      ...build,
      bucket: build.slot,
      resolvedFromEdgeConfig: false,
    };
  }

  let cfg: Awaited<ReturnType<typeof getShadowConfig>> = null;
  try {
    cfg = await getShadowConfig();
  } catch {
    // Edge Config unreachable — fall through to 'unknown' rather than throw.
    // Caller intent is "tell me where I am" not "fail if telemetry is down".
    return { ...build, bucket: 'unknown', resolvedFromEdgeConfig: false };
  }

  if (!cfg) {
    return { ...build, bucket: 'unknown', resolvedFromEdgeConfig: false };
  }

  const self = normalizeHost(build.vercelUrl);
  const current = normalizeHost(cfg.deploymentDomainProd);
  const previous = normalizeHost(cfg.deploymentDomainProdPrevious);

  let bucket: ShadowCanaryBucket = 'unknown';
  if (self) {
    if (current && current.includes(self)) bucket = 'prod-current';
    else if (previous && previous.includes(self)) bucket = 'prod-previous';
  }

  return { ...build, bucket, resolvedFromEdgeConfig: true };
}

/**
 * Single-line tag for logs / debug UI, e.g. `[prod-current @ production abc1234 v0.4.0]`.
 * Falls back to whatever data is available (e.g. just `[development]` locally).
 */
export function formatBuildInfoTag(info: BuildInfo | RuntimeInfo): string {
  const parts: string[] = [];
  parts.push('bucket' in info ? info.bucket : info.slot);
  if (info.branch) parts.push(`@ ${info.branch}`);
  if (info.commitShaShort) parts.push(info.commitShaShort);
  return `[${parts.join(' ')}]`;
}
