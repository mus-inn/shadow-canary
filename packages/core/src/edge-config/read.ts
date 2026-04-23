import { get } from '@vercel/edge-config';
import type { ShadowConfig } from '../types.js';

/**
 * Edge Config key holding the ShadowConfig payload. Derived from
 * `VERCEL_GIT_REPO_SLUG` (auto-injected by Vercel in every deploy) as
 * `shadow-<repo-slug>-canary`.
 *
 * The key is intentionally not configurable: it's the single source of truth
 * that removes the class of bugs where the deploy workflow and the runtime
 * middleware read/write different keys on a shared Edge Config store.
 */

// Slug shape matches what Vercel / GitHub accept for repo names, with a
// defense-in-depth cap so a malformed env var can't produce garbage Edge
// Config keys, log-inject, or collide with another tenant's slug.
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

export function resolveConfigKey(): string {
  const raw = process.env['VERCEL_GIT_REPO_SLUG'];
  const slug = raw?.trim();
  if (!slug) {
    throw new Error(
      '[shadow-canary] VERCEL_GIT_REPO_SLUG is not set — cannot derive Edge Config key. ' +
        'On Vercel this is auto-injected from the linked Git repo; for local dev, ' +
        'run `vercel env pull` or export VERCEL_GIT_REPO_SLUG=<repo-name> in .env.local.',
    );
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `[shadow-canary] VERCEL_GIT_REPO_SLUG is not a valid repo slug (got: ${JSON.stringify(
        slug,
      )}). Expected 1–100 chars, alphanumeric with "._-".`,
    );
  }
  return `shadow-${slug}-canary`;
}

// Shared across all users on the same middleware instance — NOT per-user.
// Fluid Compute keeps warm instances that reuse memory between invocations,
// so one instance reads Edge Config once and serves thousands of req/s from RAM.
// Tradeoff: higher TTL = fewer reads = cheaper, but config changes (e.g. adding
// an IP to the allowlist) take up to TTL seconds to propagate to warm instances.
const CACHE_TTL_MS = 60_000;
// Cache keyed by resolved key so a single process handling multiple projects
// (uncommon but valid) doesn't cross-contaminate reads.
const cache = new Map<string, { data: ShadowConfig; timestamp: number }>();
// Warn once per missing key so absent/unpopulated Edge Config entries surface
// in Vercel runtime logs without spamming on every request.
const warnedMissingKeys = new Set<string>();

export async function getShadowConfig(): Promise<ShadowConfig | null> {
  const key = resolveConfigKey();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await get<ShadowConfig>(key);
  if (!data) {
    if (!warnedMissingKeys.has(key)) {
      warnedMissingKeys.add(key);
      console.warn(
        `[shadow-canary] Edge Config key "${key}" returned no value — middleware will passthrough. ` +
          `Check: (1) deploy-shadow.yml / deploy-prod.yml ran at least once to populate the config; ` +
          `(2) EDGE_CONFIG env var points to the Edge Config store that holds this key; ` +
          `(3) VERCEL_GIT_REPO_SLUG matches the GitHub repo name the workflows write from.`,
      );
    }
    return null;
  }
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

/** Clear the in-memory cache. Intended for tests / forced re-read. */
export function clearConfigCache(): void {
  cache.clear();
}
