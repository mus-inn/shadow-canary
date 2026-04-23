// Server-only helpers for talking to Vercel REST API and patching Edge Config.
// Never import from client components or edge runtime.
import type { ShadowConfig } from '../types.js';
import { resolveConfigKey } from './read.js';

const VERCEL_API_TOKEN = process.env['VERCEL_API_TOKEN'];
const VERCEL_ORG_ID = process.env['VERCEL_ORG_ID'];
const VERCEL_PROJECT_ID = process.env['VERCEL_PROJECT_ID'];
const EDGE_CONFIG_ID = process.env['VERCEL_EDGE_CONFIG_ID'];

function checkEnv(): string | null {
  const missing: string[] = [];
  if (!VERCEL_API_TOKEN) missing.push('VERCEL_API_TOKEN');
  if (!VERCEL_ORG_ID) missing.push('VERCEL_ORG_ID');
  if (!VERCEL_PROJECT_ID) missing.push('VERCEL_PROJECT_ID');
  if (!EDGE_CONFIG_ID) missing.push('VERCEL_EDGE_CONFIG_ID');
  return missing.length > 0 ? `Missing env vars: ${missing.join(', ')}` : null;
}

async function vercelFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(path, 'https://api.vercel.com');
  if (VERCEL_ORG_ID && !url.searchParams.has('teamId')) {
    url.searchParams.set('teamId', VERCEL_ORG_ID);
  }
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

/**
 * Read the ShadowConfig payload from Edge Config. If `configKey` is omitted,
 * resolves via `SHADOW_CANARY_KEY` env var, then defaults to
 * `'shadow-configuration'`.
 */
export async function readShadowConfig(
  configKey?: string,
): Promise<ShadowConfig | null> {
  const err = checkEnv();
  if (err) throw new Error(err);
  const key = resolveConfigKey(configKey);

  const res = await vercelFetch(`/v1/edge-config/${EDGE_CONFIG_ID}/items`);
  if (!res.ok) throw new Error(`Edge Config read failed: ${res.status}`);
  const items = (await res.json()) as Array<{ key: string; value: unknown }>;
  const hit = items.find((i) => i.key === key);
  return (hit?.value as ShadowConfig) ?? null;
}

/**
 * Merge-patch the ShadowConfig at the resolved key. `opts.unset` deletes those
 * keys from the merged object before writing. Pass `opts.configKey` to target
 * a specific Edge Config entry (useful for multi-project stores).
 */
export async function patchShadowConfig(
  patch: Partial<ShadowConfig>,
  opts?: { unset?: (keyof ShadowConfig)[]; configKey?: string },
): Promise<ShadowConfig> {
  const err = checkEnv();
  if (err) throw new Error(err);
  const key = resolveConfigKey(opts?.configKey);

  const current = (await readShadowConfig(key)) ?? {};
  const merged: ShadowConfig = { ...current, ...patch };
  if (opts?.unset) {
    for (const k of opts.unset) delete merged[k];
  }

  const res = await vercelFetch(`/v1/edge-config/${EDGE_CONFIG_ID}/items`, {
    method: 'PATCH',
    body: JSON.stringify({
      items: [
        {
          operation: 'upsert',
          key,
          value: merged,
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Config write failed: ${res.status} — ${text}`);
  }
  return merged;
}
