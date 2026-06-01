// Fixed 3-slot model (v0.8+). Opt-in, additive layer that lives alongside the
// legacy shadow + canary-ramp runtime in `info.ts`. Slots are derived purely
// from `VERCEL_TARGET_ENV` (the Vercel Custom Environment slug), so resolution
// is fully synchronous and needs no Edge Config read.
import { getBuildInfo, type BuildInfo } from './info.js';

/**
 * Which fixed slot the running code lives in.
 *
 * - `nightly`     → main-branch Custom Environment (bleeding edge, small %).
 * - `canary`      → canary-branch Custom Environment (pre-prod, medium %).
 * - `production`  → production Custom Environment (owns the public domain and
 *                   the traffic split; majority %).
 * - `preview`     → Vercel preview deploy (PR / unassigned branch).
 * - `development` → local `next dev` (or any context where the env is unset).
 * - `unknown`     → `VERCEL_TARGET_ENV` present but an unrecognized value.
 */
export type FixedSlot =
  | 'nightly'
  | 'canary'
  | 'production'
  | 'preview'
  | 'development'
  | 'unknown';

/** Build-info snapshot for the 3-slot model. Same env fields as the legacy
 *  {@link BuildInfo}, but `slot` is a {@link FixedSlot} plus a `targetEnv`. */
export type SlotBuildInfo = Omit<BuildInfo, 'slot'> & {
  /** Vercel Custom Environment slug (`VERCEL_TARGET_ENV`). */
  targetEnv: string | null;
  /** Build classification — see {@link FixedSlot}. */
  slot: FixedSlot;
};

export type SlotRuntimeInfo = SlotBuildInfo & {
  /** Narrowed bucket — always equal to {@link SlotBuildInfo.slot} (no read). */
  bucket: FixedSlot;
  /** Always `false`: the bucket is derived synchronously, never from a read. */
  resolvedFromEdgeConfig: boolean;
};

export type GetSlotInfoOptions = {
  /**
   * Env-var name carrying the Custom Environment slug. Defaults to
   * `VERCEL_TARGET_ENV`. Override to read a `NEXT_PUBLIC_`-prefixed mirror on
   * the client (e.g. `NEXT_PUBLIC_VERCEL_TARGET_ENV`).
   */
  targetEnvVar?: string;
};

function deriveFixedSlot(
  targetEnv: string | null,
  vercelEnv: BuildInfo['vercelEnv'],
): FixedSlot {
  switch (targetEnv) {
    case 'nightly':
      return 'nightly';
    case 'canary':
      return 'canary';
    case 'production':
      return 'production';
    case 'preview':
      return 'preview';
    case 'development':
      return 'development';
  }
  // Fallback when VERCEL_TARGET_ENV is absent (older runtime / local dev).
  if (targetEnv === null) {
    if (vercelEnv === 'production') return 'production';
    if (vercelEnv === 'preview') return 'preview';
    return 'development';
  }
  return 'unknown';
}

/**
 * Synchronous build-info snapshot for the 3-slot model. Reads only
 * `process.env` — safe in edge runtime, server components, API routes, and
 * Node serverless. Never reads Edge Config.
 *
 * @example
 * import { getSlotInfo } from '@dotworld/shadow-canary-core';
 * export async function GET() {
 *   return Response.json(getSlotInfo());
 * }
 */
export function getSlotInfo(opts?: GetSlotInfoOptions): SlotBuildInfo {
  const targetEnvVar = opts?.targetEnvVar ?? 'VERCEL_TARGET_ENV';
  // Reuse the legacy reader for all the shared env fields; `productionBranch:''`
  // keeps its branch heuristics from adding noise (we ignore base.slot).
  const { slot: _legacySlot, ...base } = getBuildInfo({ productionBranch: '' });
  const raw = process.env[targetEnvVar];
  const targetEnv = raw && raw.length > 0 ? raw : null;
  return {
    ...base,
    targetEnv,
    slot: deriveFixedSlot(targetEnv, base.vercelEnv),
  };
}

/**
 * Async wrapper mirroring {@link getRuntimeBucket} for the 3-slot model. The
 * bucket equals the slot (no Edge Config narrowing), so it resolves
 * synchronously.
 */
export async function getSlotRuntime(
  opts?: GetSlotInfoOptions,
): Promise<SlotRuntimeInfo> {
  const build = getSlotInfo(opts);
  return { ...build, bucket: build.slot, resolvedFromEdgeConfig: false };
}

/** Single-line tag for logs / debug UI, e.g. `[canary @ canary abc1234]`. */
export function formatSlotTag(info: SlotBuildInfo | SlotRuntimeInfo): string {
  const parts: string[] = [];
  parts.push('bucket' in info ? info.bucket : info.slot);
  if (info.branch) parts.push(`@ ${info.branch}`);
  if (info.commitShaShort) parts.push(info.commitShaShort);
  return `[${parts.join(' ')}]`;
}
