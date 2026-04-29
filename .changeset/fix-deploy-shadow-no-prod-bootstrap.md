---
'@dotworld/shadow-canary-core': patch
'@dotworld/shadow-canary-templates': patch
'@dotworld/shadow-canary-skill': patch
---

**Fix: `deploy-shadow.yml` no longer writes the shadow URL into `deploymentDomainProd`.**

Since the initial monorepo scaffold, `deploy-shadow.yml` carried a `deploymentDomainProd: (.deploymentDomainProd // $shadowUrl)` line meant as a bootstrap fallback for greenfield projects without a `production` branch yet. The intent was to give the admin UI / `runtime-info` something to display before the first prod deploy ran. In practice this violated the contract of `deploymentDomainProd` (must be a Vercel-promoted prod URL) and produced a class of silently-broken setups:

- `canary-ramp.yml` probes `<deploymentDomainProd>/api/slo` for SLO gating — with the bootstrap, it probed a shadow URL as if it were prod.
- `runtime-info` labelled the shadow as `prod-current` in Sentry / PostHog telemetry.
- The admin "new prod" host pointed at a shadow deploy, so rollback / canary actions operated on the wrong target.
- The custom domain promoted by Vercel (`vercel promote` is only ever run by `deploy-prod.yml`) was decorrelated from the URL stored in Edge Config.

If a host project never pushed to `production` (e.g. workflows were customised to trigger on `main` only, or the second branch was never set up), `deploymentDomainProd` would freeze on the *very first* shadow URL forever — every subsequent shadow deploy updated `deploymentDomainShadow` but skipped `deploymentDomainProd` thanks to the `//` jq fallback.

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
