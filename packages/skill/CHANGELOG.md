# @dotworld/shadow-canary-skill

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
