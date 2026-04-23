import { get } from '@vercel/edge-config';
import type { ShadowConfig } from '../types.js';

// Shared across all users on the same middleware instance — NOT per-user.
// Fluid Compute keeps warm instances that reuse memory between invocations,
// so one instance reads Edge Config once and serves thousands of req/s from RAM.
// Tradeoff: higher TTL = fewer reads = cheaper, but config changes (e.g. adding
// an IP to the allowlist) take up to TTL seconds to propagate to warm instances.
const CACHE_TTL_MS = 60_000;
let cachedConfig: { data: ShadowConfig; timestamp: number } | null = null;

export async function getShadowConfig(): Promise<ShadowConfig | null> {
  if (cachedConfig && Date.now() - cachedConfig.timestamp < CACHE_TTL_MS) {
    return cachedConfig.data;
  }
  const data = await get<ShadowConfig>('shadow-configuration');
  if (!data) return null;
  cachedConfig = { data, timestamp: Date.now() };
  return data;
}
