---
'@dotworld/shadow-canary-core': patch
---

**Fix: the public `readShadowConfig` export now reads via the CDN-cached `@vercel/edge-config` SDK instead of the rate-limited Vercel management API.**

### Root cause: shared rate-limit pool starving every read consumer

Before this fix, `readShadowConfig` (exported from `index.ts`) was the management-API-backed implementation in `edge-config/patch.ts`:

```ts
const res = await vercelFetch(`/v1/edge-config/${EDGE_CONFIG_ID}/items`);
```

That endpoint is rate-limited to **20 requests per 60 seconds per token** (`api-edge-config-items-get`, documented in the 429 body). The limit is per-token, not per-route, so every consumer holding the same `VERCEL_API_TOKEN` competes for the same 20-call budget:

- `/api/slo` polled by Better Stack uptime → 1 read every 3 min
- `canary-ramp.yml` cron at `*/15 * * * *` → 2 reads per tick (initial state + post-bump re-read on the read-clobber-hardened version)
- `deploy-shadow.yml` / `deploy-prod.yml` on each push → 1-2 reads each
- Admin dashboard refresh on `/admin` → 1 read per route per polling interval (bucket-info, shadow-history, state)
- `patchShadowConfig` read-modify-write cycle → 1 read per write
- Any debug curls operators run during incidents → blow through the budget instantly

Realistic load on a single project hits the 20/60s ceiling within minutes. Past that, `readShadowConfig` throws `Edge Config read failed: 429`, which surfaces in callers like `/api/slo` as a 503 — and the canary-ramp workflow interprets two consecutive non-200s as an SLO failure → automatic rollback to 0% even though the canary is healthy. The symptom is "the ramp won't progress" with `canaryPaused: true` posted by the rollback step, requiring manual operator intervention to un-pause and resume.

The CDN-cached path through `@vercel/edge-config` was already implemented in `edge-config/read.ts` as `getShadowConfig`, with a 60-second in-process cache and a "warn once per missing key" log. Quota on that path is ~10 000+ reads/sec backed by Vercel's edge CDN, latency ~30–80 ms vs ~150–300 ms for the management API. **The export in `index.ts` was just pointing at the wrong implementation.**

### What changed

`packages/core/src/edge-config/patch.ts`:

1. The implementation that called the management API was renamed to a private `readShadowConfigViaApi()` and is no longer exported. Only `patchShadowConfig` calls it, and it has to: the patch step performs a read-modify-write cycle and reading through the same authoritative path as the write avoids the 60-second SDK cache producing a stale base for the merge.
2. `readShadowConfig` is now `export const readShadowConfig = getShadowConfig` (re-export from `./read.js`), wired to the CDN-cached SDK path.

`packages/core/src/index.ts`: no edit needed — the `readShadowConfig` export from `./edge-config/patch.js` now resolves to the SDK-backed function transparently.

### Behavior delta

| | Before | After |
| --- | --- | --- |
| Endpoint | `GET /v1/edge-config/{id}/items` (mgmt API) | CDN edge endpoint via `@vercel/edge-config` SDK |
| Quota | 20 req / 60 s / token | ~10 000+ req / s |
| Latency | 150–300 ms | 30–80 ms |
| In-process cache | none (every call hits API) | 60 s TTL keyed by resolved key |
| Required env | `VERCEL_API_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_EDGE_CONFIG_ID` | `EDGE_CONFIG` (auto-injected by Vercel) |
| Warn-on-empty | none | `console.warn` once per missing key with remediation hints |
| Throws on missing env | "Missing env vars: …" custom error | SDK-level error from `@vercel/edge-config` |

The function signature and return type (`Promise<ShadowConfig | null>`) are unchanged, so no caller code has to be modified. The error semantics differ — consumers that match on the old `Edge Config read failed:` string in catch blocks will need to adapt — but the previous error was itself a symptom of the problem this fix addresses, so the breakage is desirable.

### Why patch and not minor

The public surface (function name, parameters, return type, module path) is unchanged. The behavior change is a strict improvement on a previously-broken-under-load implementation, not a new feature. Per the project's existing changelog convention (the read-clobber fix was also marked `patch`), this slots in as a `patch`.

### What `patchShadowConfig` does

Internally still uses the management API for its read-before-write — required for atomicity. The internal helper is now `readShadowConfigViaApi` and is no longer exported. Consumers that need management-API-strength consistency for some reason can copy the four-line pattern locally; in practice, no one needed it externally — the only call site was `patchShadowConfig` itself.
