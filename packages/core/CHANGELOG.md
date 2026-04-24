# @dotworld/shadow-canary-core

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
