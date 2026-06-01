# @dotworld/shadow-canary-core

## 0.8.0

### Minor Changes

- e218703: Add an opt-in fixed 3-slot model (nightly / canary / production) alongside the
  existing 2-branch shadow + canary-ramp model. Fully additive — no breaking
  changes; existing consumers are unaffected.

  **core**

  - New runtime: `getSlotInfo()` / `getSlotRuntime()` / `formatSlotTag()` and the
    `FixedSlot` (`nightly | canary | production | preview | development |
unknown`), `SlotBuildInfo`, `SlotRuntimeInfo` types. The slot is derived
    synchronously from `VERCEL_TARGET_ENV` (Vercel Custom Environments) — no Edge
    Config read, no `production-track` disambiguation.
  - New middleware: `slotCanaryMiddleware()` / `slotCanaryProxy()` — a single
    percentage roll partitions traffic into nightly | canary | production. The
    routing deploy (holding the public domain) owns the split and rewrites to the
    stable `domainNightly` / `domainCanary`. Two topologies:
    - **Custom-environment mode** (default): `routingEnv` /
      `SHADOW_CANARY_ROUTING_ENV` selects which `VERCEL_TARGET_ENV` runs the split.
    - **Branch mode**: when every slot deploys `--prod` to the same env, set
      `productionBranch` / `SHADOW_CANARY_PRODUCTION_BRANCH` — only that branch's
      deploy owns the split; nightly / canary branch deploys serve their own
      content. Rewrite targets are the stable branch-pinned URLs.
  - `ShadowConfig` gains optional fields `domainNightly`, `domainCanary`,
    `trafficNightlyPercent`, `trafficCanaryPercent`, `forceNightlyIPs`. The
    legacy fields are untouched; a project uses one set or the other.

  **templates** — new `three-slot/` reference set: `proxy.ts` (slotCanaryProxy),
  `deploy-nightly` / `deploy-canary` / `deploy-prod` workflows (plain
  `vercel deploy --target=<env>`, no Edge Config writes), and an admin
  `rollout` route to edit the two percentages.

  **skill** — new `three-slot.md` command doc + topology detection note in
  `SKILL.md`.

## 0.7.2

### Patch Changes

- 507988b: **Fix: the public `readShadowConfig` export now reads via the CDN-cached `@vercel/edge-config` SDK instead of the rate-limited Vercel management API.**

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

  |                       | Before                                                                            | After                                                      |
  | --------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
  | Endpoint              | `GET /v1/edge-config/{id}/items` (mgmt API)                                       | CDN edge endpoint via `@vercel/edge-config` SDK            |
  | Quota                 | 20 req / 60 s / token                                                             | ~10 000+ req / s                                           |
  | Latency               | 150–300 ms                                                                        | 30–80 ms                                                   |
  | In-process cache      | none (every call hits API)                                                        | 60 s TTL keyed by resolved key                             |
  | Required env          | `VERCEL_API_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_EDGE_CONFIG_ID` | `EDGE_CONFIG` (auto-injected by Vercel)                    |
  | Warn-on-empty         | none                                                                              | `console.warn` once per missing key with remediation hints |
  | Throws on missing env | "Missing env vars: …" custom error                                                | SDK-level error from `@vercel/edge-config`                 |

  The function signature and return type (`Promise<ShadowConfig | null>`) are unchanged, so no caller code has to be modified. The error semantics differ — consumers that match on the old `Edge Config read failed:` string in catch blocks will need to adapt — but the previous error was itself a symptom of the problem this fix addresses, so the breakage is desirable.

  ### Why patch and not minor

  The public surface (function name, parameters, return type, module path) is unchanged. The behavior change is a strict improvement on a previously-broken-under-load implementation, not a new feature. Per the project's existing changelog convention (the read-clobber fix was also marked `patch`), this slots in as a `patch`.

  ### What `patchShadowConfig` does

  Internally still uses the management API for its read-before-write — required for atomicity. The internal helper is now `readShadowConfigViaApi` and is no longer exported. Consumers that need management-API-strength consistency for some reason can copy the four-line pattern locally; in practice, no one needed it externally — the only call site was `patchShadowConfig` itself.

## 0.7.1

### Patch Changes

- f1c7f4f: **Fix: `deploy-shadow.yml` no longer writes the shadow URL into `deploymentDomainProd`.**

  Since the initial monorepo scaffold, `deploy-shadow.yml` carried a `deploymentDomainProd: (.deploymentDomainProd // $shadowUrl)` line meant as a bootstrap fallback for greenfield projects without a `production` branch yet. The intent was to give the admin UI / `runtime-info` something to display before the first prod deploy ran. In practice this violated the contract of `deploymentDomainProd` (must be a Vercel-promoted prod URL) and produced a class of silently-broken setups:

  - `canary-ramp.yml` probes `<deploymentDomainProd>/api/slo` for SLO gating — with the bootstrap, it probed a shadow URL as if it were prod.
  - `runtime-info` labelled the shadow as `prod-current` in Sentry / PostHog telemetry.
  - The admin "new prod" host pointed at a shadow deploy, so rollback / canary actions operated on the wrong target.
  - The custom domain promoted by Vercel (`vercel promote` is only ever run by `deploy-prod.yml`) was decorrelated from the URL stored in Edge Config.

  If a host project never pushed to `production` (e.g. workflows were customised to trigger on `main` only, or the second branch was never set up), `deploymentDomainProd` would freeze on the _very first_ shadow URL forever — every subsequent shadow deploy updated `deploymentDomainShadow` but skipped `deploymentDomainProd` thanks to the `//` jq fallback.

  **What changed:**

  - `deploy-shadow.yml` no longer writes `deploymentDomainProd` directly. The field is now exclusively owned by `deploy-prod.yml` and `/api/admin/rollback` after the first init.
  - A new bootstrap-only step resolves the current prod URL via Vercel API (`GET /v9/projects/{id}` → `targets.production.url`, i.e. the deployment currently aliased to the custom domain). When the Edge Config key is empty AND Vercel has a current prod target, the workflow seeds `deploymentDomainProd` with that URL — the only honest value available at that point.
  - When Vercel has no prod target yet (truly greenfield project), `deploymentDomainProd` stays unset. The middleware doesn't read this field for routing (passthrough on "new prod"), `canary-ramp.yml` already has a `if [ -z "$PROD_URL" ]; then skip` guard, and the admin will display "—" instead of a misleading shadow URL.

  **Migration for already-polluted setups** (Edge Config has a shadow URL stored as `deploymentDomainProd`):

  Re-copying the workflows alone won't repair the stored value. Pick one:

  1. **Push to `production`** — `deploy-prod.yml` will overwrite `deploymentDomainProd` with the new prod URL.
  2. **Use admin "Rollback"** on a known-good `production` deploy from the recent deploys list — re-aliases the custom domain and writes the correct URL.
  3. **Patch Edge Config directly** — set `deploymentDomainProd` to the URL returned by `GET /v9/projects/{id}?teamId=…` → `.targets.production.url` (prefixed with `https://`).

  After step 1, 2, or 3, subsequent shadow deploys are read-only on `deploymentDomainProd` — no further drift possible.

## 0.7.0

### Minor Changes

- 6d13f7f: feat(core): Next.js 16 `proxy.ts` support via `shadowCanaryProxy` alias

  Next.js 16 (Oct 2025) renamed the file convention from `middleware.ts` →
  `proxy.ts` and the exported function from `middleware()` → `proxy()`. The
  wire-level API (`NextRequest`, `NextResponse`, `config.matcher`) is unchanged
  in v16, so `shadowCanaryMiddleware` already worked — but importing a function
  named `Middleware` into a file named `proxy.ts` reads awkwardly.

  Two ergonomic exports added, both in the main and edge entry points:

  - `shadowCanaryProxy` — strict alias of `shadowCanaryMiddleware` (same
    function reference, no re-implementation).
  - `ShadowCanaryProxyOptions` — alias of `ShadowCanaryMiddlewareOptions`.

  ```ts
  // Next.js 16 proxy.ts (Node runtime)
  import { shadowCanaryProxy } from "@dotworld/shadow-canary-core";

  export async function proxy(req: NextRequest) {
    const res = await shadowCanaryProxy(req);
    return res ?? NextResponse.next();
  }
  ```

  The middleware function is also now exported from the main entry point (it
  was previously only on `/edge`) so v16 `proxy.ts` files can import without
  the subpath. v15 setups and v16 Edge-runtime `middleware.ts` keep working
  unchanged — both names point at the same function.

  Note: `proxy.ts` runs on Node.js runtime only. `middleware.ts` is the only
  path for Edge runtime on v16 (deprecated, no removal date announced).

## 0.6.0

### Minor Changes

- 7f4d9ec: feat(core): runtime info helper for Sentry / PostHog telemetry

  Two new exports that tell the running code where it lives — which deploy
  slot, which commit, which branch — so every Sentry error, PostHog event,
  log line, or debug header can carry that context.

  ```ts
  import { getBuildInfo, getRuntimeBucket } from "@dotworld/shadow-canary-core";

  // Sync, env vars only — safe in Sentry.init / module-level.
  const info = getBuildInfo();
  // { slot: 'production-track', commitShaShort: 'abc1234', branch: 'production', ... }

  // Async, queries Edge Config — narrows production-track to prod-current vs prod-previous.
  const runtime = await getRuntimeBucket();
  // { bucket: 'prod-current', resolvedFromEdgeConfig: true, ... }
  ```

  The split is load-bearing: build env vars cannot tell `prod-current` from
  `prod-previous` (both share `VERCEL_ENV=production` and the prod branch).
  Edge Config is the only source of truth — the helper compares `VERCEL_URL`
  against `deploymentDomainProd` / `deploymentDomainProdPrevious`.

  Why this matters during a canary: when `trafficProdCanaryPercent: 25`, ~25%
  of prod traffic hits `prod-current` and 75% hits `prod-previous`. Without
  the bucket tag, you see a global error rate increase but can't anchor it
  to the new code. With it, filtering Sentry by `bucket:prod-current` gives
  stack traces in seconds.

  Plus `formatBuildInfoTag()` for `[prod-current @ production abc1234]` log
  lines / debug headers. Exported from both Node and edge entry points. Full
  Sentry / PostHog integration recipes in
  [docs/reference/runtime-info](https://mus-inn.github.io/shadow-canary/reference/runtime-info/).

  ***

  fix(admin): React error #418 hydration mismatch on time-derived UI

  The admin dashboard surfaced a hydration mismatch in production builds
  because server-rendered timestamps differed from client (Date.now() drift,
  locale-default timezone for `toLocaleString`). The `now` ticker now starts
  `null` and is set in `useEffect`, `prettyTimeAgo` takes `now` as parameter,
  and the SLO log's full-timestamp tooltip uses an explicit `Europe/Paris`
  timezone. SSR shows `'—'` for time text; real values appear after mount.

## 0.5.1

### Patch Changes

- No public API changes. Templates 0.5.1 ships a traffic-bar legend fix — the numbers shown on each bucket are now the canary knobs (9% / 91% of prod, 1% of total) instead of the effective traffic share (8.9% / 90.1% / 1.0%), matching the SLO log and the `Canary en progression X%` header. Bar widths remain proportional to the actual share. See templates changelog.

## 0.5.0

### Minor Changes

- **Shadow deploy history (20 deep)**. `ShadowConfig` gains `shadowHistory?: string[]` — a ring buffer of the last 20 outgoing shadow deploy URLs, most recent first. Populated by `deploy-shadow.yml` on every push to `master` (dedupes + trims). Commit metadata is fetched on-demand from the Vercel API (see `getDeploymentByUrl`) so history stays compact in Edge Config (~1.5 KB for 20 entries).

  `deploymentDomainShadowPrevious` is now **deprecated** but still populated with `shadowHistory[0]` for back-compat with v0.4.x admin UIs. Will be removed in v0.6.

- **Configurable manual step**: no API change in core, but the `/api/admin/canary/step-forward` and `/api/admin/canary/step-back` endpoints now accept `{step?: number}` in the body (default 4, range 1–50). Admin UI adds an input for it.

## 0.4.1

### Patch Changes

- No public API changes; ships alongside `@dotworld/shadow-canary-templates@0.4.1` admin UX fixes (timer accuracy, pct clarity, expandable SLO body). See templates changelog.

## 0.4.0

### Minor Changes

- **Admin UX improvements** — no breaking changes to the public API.

  - New `getDeploymentByUrl(url)` helper exported from core. Looks up a single Vercel deployment by its per-deploy URL (the one stored in `ShadowConfig`) and returns the full `Deployment` object (state, `meta.githubCommitSha`, `meta.githubCommitRef`, `meta.githubCommitMessage`). Powers the new `/api/admin/bucket-info` endpoint that shows commit / branch / message under each bucket in the admin dashboard.
  - `ShadowConfig` gains two optional fields:
    - `deploymentDomainShadowPrevious?: string` — saved by `deploy-shadow.yml` before overwriting `deploymentDomainShadow` on every push to `master`. Enables the new shadow rollback flow (swap current ↔ previous, no Vercel promote needed since shadow is addressed by URL, not custom domain).
    - `sloChecks?: SloCheck[]` — ring buffer of the last 10 SLO check results written by `canary-ramp.yml`. Each entry has `{ts, ok, codes, bodyExcerpt, pctBefore, pctAfter}`. Surfaces in the admin UI why the canary is/isn't advancing without digging into GH Actions logs.
  - New exported type `SloCheck` for the ring buffer entries.

## 0.3.0

### Major Changes

- **BREAKING**: the Edge Config key is no longer configurable. It is now derived deterministically from the repo slug as `shadow-<slug>-canary` on both sides:

  - **Runtime (middleware)** reads `VERCEL_GIT_REPO_SLUG` (auto-injected by Vercel on every deploy).
  - **CI (GH Actions workflows)** reads `github.event.repository.name` for push/dispatch events and `$GITHUB_REPOSITORY` for scheduled events.

  This removes by construction the silent-mismatch bug class that the 0.2.4 guardrails were detecting (workflow writes to one key, middleware reads another). The pre-flight verification steps in the workflows are no longer needed and have been removed.

  **Removed APIs:**

  - `DEFAULT_CONFIG_KEY` export (value was `'shadow-configuration'`)
  - `configKey?: string` option on `ShadowCanaryMiddlewareOptions`
  - `configKey?: string` argument on `getShadowConfig()`, `readShadowConfig()`, `patchShadowConfig()`
  - `resolveConfigKey(explicit?: string)` signature simplified — now takes no arguments
  - `SHADOW_CANARY_KEY` env var is ignored (runtime uses `VERCEL_GIT_REPO_SLUG` only)

  **Migration:**

  1. Re-copy the workflow files: `npx @dotworld/shadow-canary-templates@latest copy . --force`
  2. Remove the `SHADOW_CANARY_KEY` secret from GitHub Actions (no longer read)
  3. Remove `SHADOW_CANARY_KEY` from Vercel project env (no longer read)
  4. Remove `configKey` from `.shadow-canary.json` (no longer used)
  5. In local dev, add `VERCEL_GIT_REPO_SLUG=<repo-slug>` to `.env.local` (or run `vercel env pull`). The middleware throws at boot if it's missing.
  6. Copy your current Edge Config value from the old key (e.g. `shadow-configuration` or `shadow-configuration-<app>`) into the new derived key (`shadow-<repo-slug>-canary`). The next `deploy-shadow` / `deploy-prod` run will keep it in sync from there.

## 0.2.4

### Patch Changes

- da354c6: feat: guardrails against the #1 silent-shadow trap

  When the `SHADOW_CANARY_KEY` GH Actions secret and the Vercel project env var
  drift apart, the deploy workflows happily write to one Edge Config entry
  while the middleware reads a different one — routing silently freezes on
  whatever the last matching write was, with no error anywhere. Stargaze hit
  this exact trap: PR #3's shadow URL stuck in the config for hours.

  Two guardrails now catch this early:

  **1. Runtime warn in the middleware** (`@dotworld/shadow-canary-core`)

  `getShadowConfig` now emits a one-shot `console.warn` (visible in Vercel
  runtime logs) when the configured Edge Config key returns no value,
  pointing at the three most likely causes (workflow never ran, key
  mismatch, wrong EDGE_CONFIG store). Deduped per-key so warm instances
  don't spam on every request.

  **2. Pre-flight check in the deploy workflows** (`@dotworld/shadow-canary-templates`)

  All three workflows (`deploy-shadow`, `deploy-prod`, `canary-ramp`) now
  call the Vercel env API before writing to Edge Config and fail loud with
  an actionable error when the GH Actions value and the Vercel project
  value don't match. If `VERCEL_TOKEN` lacks the `env:read` scope the check
  degrades to a warning so the workflow still ships — but it cannot silently
  write to the wrong place anymore.

  **Upgrade steps** for existing projects: re-copy the three workflow files
  (`npx @dotworld/shadow-canary-templates@latest copy . --force` on the
  workflows) and confirm `SHADOW_CANARY_KEY` is set identically as a GH
  repo secret and a Vercel project env var. The next workflow run verifies
  this automatically.

## 0.2.3

### Patch Changes

- 6df3573: feat(core): configurable production branch for the middleware filter

  The middleware filter that gates routing on "deploys built from the prod
  branch" hardcoded the branch name to `'production'`. This silently broke
  any project whose prod branch was named differently (`main`, `master`,
  etc.) — `VERCEL_GIT_COMMIT_REF !== 'production'` always tripped and the
  middleware never routed traffic.

  New `productionBranch` option (and `SHADOW_CANARY_PRODUCTION_BRANCH` env
  var) let the middleware target the actual prod branch:

  ```ts
  await shadowCanaryMiddleware(req, { productionBranch: "master" });
  ```

  Default stays `'production'` for existing shadow-canary setups. Pass
  `productionBranch: ''` (or set the env var to empty) to disable the branch
  filter entirely when the 2-branch shadow-canary convention doesn't apply.

  The filter is still load-bearing: shadow deploys are built with
  `vercel deploy --prod`, so they share `VERCEL_ENV=production` with current
  prod — the branch name is the only runtime signal that separates them.

## 0.2.2

### Patch Changes

- e3f688a: feat(core): auto-wire Vercel Deployment Protection bypass on rewrites

  `shadowCanaryMiddleware` now injects `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie: samesitenone` on every shadow / previous-prod rewrite when a bypass secret is available. The token is resolved from `opts.bypassToken` (new option), falling back to the `VERCEL_AUTOMATION_BYPASS_SECRET` env var — which Vercel auto-injects when "Protection Bypass for Automation" is enabled.

  Before this patch, rewrites to shadow / previous-prod deployment URLs were blocked by Deployment Protection (password / SSO), forcing every consumer project to copy the wiring into its own middleware. Protected projects now work out of the box with zero caller config.

  Pass `bypassToken: ''` to explicitly opt out of auto-detection.

## 0.2.1

### Patch Changes

- 233efad: fix(templates): workflows now honor `SHADOW_CANARY_KEY`

  The three GitHub Actions workflows (`deploy-shadow.yml`, `deploy-prod.yml`, `canary-ramp.yml`) hardcoded the Edge Config item key `shadow-configuration`, bypassing the `SHADOW_CANARY_KEY` feature added in 0.2.0. This caused projects sharing an Edge Config store (the documented workaround for Vercel Pro's 3-store limit) to overwrite each other's routing state on every deploy.

  Workflows now read `$SHADOW_CANARY_KEY` (from GH Actions env, sourced from `secrets.SHADOW_CANARY_KEY`) with a fallback to `'shadow-configuration'` for existing single-tenant setups.

  **Upgrade steps** when sharing one store across projects:

  1. `npx @dotworld/shadow-canary-templates@latest copy . --force` (or copy the three `.github/workflows/*.yml` manually).
  2. Add a GitHub repo secret `SHADOW_CANARY_KEY` with the same value as the `SHADOW_CANARY_KEY` env var in Vercel (e.g. `shadow-configuration-stargaze`).
  3. Re-run the workflows.

  Single-tenant setups (one store per project, default key) need no changes — the fallback keeps working.
