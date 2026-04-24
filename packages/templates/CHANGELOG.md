# @dotworld/shadow-canary-templates

## 0.4.1

### Patch Changes

- **Admin UX polish** on top of 0.4.0:
  - **Timer accuracy**: "Prochain check dans Xm Ys" is now computed from `lastSloCheck.ts + 15min` instead of the theoretical next cron firing time. GH Actions cron has multi-minute latency, so the theoretical schedule drifts from reality. When overdue, the label switches to "Check attendu il y a Xm" in amber so operators see the cron is late.
  - **Pct clarity**: the traffic-bar legend now shows the share of prod alongside the share of total on prod buckets — e.g. "7.9%" with "8% du prod" underneath. Resolves the confusion where the canary pct (8%) didn't visually match the legend (7.9% = 8% × 99% of non-shadow traffic).
  - **Expandable SLO body**: `canary-ramp.yml` bumps the SLO response body truncation from 80 → 500 chars. Admin UI makes each SLO log row clickable with a caret — clicking expands to a scrollable `<pre>` block showing the full stored body. Lets operators read full JSON / error payloads that used to be cut mid-field.

## 0.4.0

### Minor Changes

- **Admin dashboard improvements** — four features added, no breaking changes for host projects that re-copy the template.

  - **Bug fix**: the dead `/debug` link is removed from the Bucket forcer section (the page was optional and often renamed during install).
  - **Version/branch per bucket**: the Traffic bar legend now displays the branch name and short commit SHA under each bucket URL (shadow, prod-new, prod-previous). Requires the new `/api/admin/bucket-info` endpoint (included).
  - **SLO check log**: `canary-ramp.yml` now appends each SLO check result into a ring buffer in Edge Config (`sloChecks`, last 10). The admin UI renders a timeline with pass/fail icon, timestamp, HTTP codes, pct transition and body excerpt. Empty list = cron isn't running; ✗ = SLO failed → rollback; body excerpt shows the response that triggered it.
  - **Shadow rollback**: `deploy-shadow.yml` now saves the current shadow URL into `deploymentDomainShadowPrevious` before overwriting on each push. The Shadow traffic card gets a "Rollback shadow" button that swaps the two URLs (symmetric — click again to toggle back). New endpoint `/api/admin/rollback-shadow`.

  Pair with `@dotworld/shadow-canary-core@0.4.0`. Re-copy the workflow files and admin UI: `npx @dotworld/shadow-canary-templates@latest copy . --force`.

## 0.3.0

### Major Changes

- **BREAKING**: workflows now derive the Edge Config key from the repo slug instead of a configurable `SHADOW_CANARY_KEY` secret.

  - `deploy-shadow.yml` and `deploy-prod.yml` set `SHADOW_CANARY_KEY: shadow-${{ github.event.repository.name }}-canary` at the job env level.
  - `canary-ramp.yml` derives it in a shell step from `$GITHUB_REPOSITORY` (scheduled events don't populate `github.event.repository.name`).
  - The pre-flight "Verify SHADOW_CANARY_KEY consistency with Vercel project env" step has been removed — it's no longer possible for the two sides to disagree by construction.
  - `.env.local.example` replaces the `SHADOW_CANARY_KEY` hint with `VERCEL_GIT_REPO_SLUG` (needed locally to match the auto-injected Vercel value).

  Pair with `@dotworld/shadow-canary-core@0.3.0`. See the core changelog for migration steps.

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
