import { get } from '@vercel/edge-config';
import type { ShadowConfig } from '../types.js';

/**
 * Default Edge Config key holding the ShadowConfig payload.
 * Override via the `configKey` argument, the `SHADOW_CANARY_KEY` env var, or
 * the `configKey` option on `shadowCanaryMiddleware`.
 */
export const DEFAULT_CONFIG_KEY = 'shadow-configuration';

/**
 * Resolve the Edge Config key with fallbacks:
 * explicit argument > `SHADOW_CANARY_KEY` env var > `'shadow-configuration'`.
 *
 * Use a non-default key when you need to host several shadow-canary projects
 * in a single Edge Config store (e.g. to work around Vercel Pro's 3-store
 * limit). Give each project its own sub-key, like `shadow-configuration-<app>`.
 */
export function resolveConfigKey(explicit?: string): string {
  return explicit ?? process.env['SHADOW_CANARY_KEY'] ?? DEFAULT_CONFIG_KEY;
}

// Shared across all users on the same middleware instance — NOT per-user.
// Fluid Compute keeps warm instances that reuse memory between invocations,
// so one instance reads Edge Config once and serves thousands of req/s from RAM.
// Tradeoff: higher TTL = fewer reads = cheaper, but config changes (e.g. adding
// an IP to the allowlist) take up to TTL seconds to propagate to warm instances.
const CACHE_TTL_MS = 60_000;
// Cache keyed by config-key so a single process handling multiple projects
// (uncommon but valid) doesn't cross-contaminate reads.
const cache = new Map<string, { data: ShadowConfig; timestamp: number }>();

export async function getShadowConfig(
  configKey?: string,
): Promise<ShadowConfig | null> {
  const key = resolveConfigKey(configKey);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await get<ShadowConfig>(key);
  if (!data) return null;
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

/** Clear the in-memory cache. Intended for tests / forced re-read. */
export function clearConfigCache(): void {
  cache.clear();
}
