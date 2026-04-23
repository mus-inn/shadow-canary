# @dotworld/shadow-canary-templates

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
