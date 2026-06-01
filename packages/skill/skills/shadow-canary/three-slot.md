# /shadow-canary:three-slot — fixed 3-slot model

Applies only to projects on the **fixed 3-slot** topology (nightly / canary /
production), detected when the Edge Config holds `domainNightly` /
`domainCanary` / `trafficNightlyPercent` / `trafficCanaryPercent` (and NOT the
legacy `deploymentDomainProd` / ramp fields).

There is no auto-ramp here: the three slots are stable Vercel Custom
Environments, the production deploy owns the traffic split, and rollout is a
direct edit of two percentages.

## Read state

`GET ${adminUrl.replace('/admin','')}/api/admin/state` (authenticated) returns
the Edge Config. Report:
- `trafficNightlyPercent` (nightly share), `trafficCanaryPercent` (canary share),
  production = `100 − nightly − canary`.
- `domainNightly` / `domainCanary` (rewrite targets).
- `forceNightlyIPs` if present.

Also surface the running slot of any deploy via `getSlotInfo()` /
`getSlotRuntime()` (derived from `VERCEL_TARGET_ENV`).

## Edit rollout

`POST /api/admin/rollout` with `{ "nightly": <0-100>, "canary": <0-100> }`
(either or both). Enforce `nightly + canary ≤ 100`. Confirm the new split with
the user before sending — this changes live production traffic distribution.

## Promote between slots (MEP)

Promotion is NOT a slot toggle. To ship: open + merge PR `canary → production`,
wait for the prod deploy, then open + merge PR `main → canary` (which cuts a
Sentry release + GitHub tag). This is automated by the project's MEP workflow —
trigger it rather than merging by hand. Never promote without checking PostHog
conversion + Sentry error-rate signals first.

## Rollback

Revert the `production` branch (e.g. the project's `rollback-prod` flow). Do not
look for `deploymentDomainProdPrevious` — it does not exist in this model.
