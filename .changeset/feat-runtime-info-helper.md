---
'@dotworld/shadow-canary-core': minor
'@dotworld/shadow-canary-templates': minor
'@dotworld/shadow-canary-skill': minor
---

feat(core): runtime info helper for Sentry / PostHog telemetry

Two new exports that tell the running code where it lives — which deploy
slot, which commit, which branch — so every Sentry error, PostHog event,
log line, or debug header can carry that context.

```ts
import { getBuildInfo, getRuntimeBucket } from '@dotworld/shadow-canary-core';

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

---

fix(admin): React error #418 hydration mismatch on time-derived UI

The admin dashboard surfaced a hydration mismatch in production builds
because server-rendered timestamps differed from client (Date.now() drift,
locale-default timezone for `toLocaleString`). The `now` ticker now starts
`null` and is set in `useEffect`, `prettyTimeAgo` takes `now` as parameter,
and the SLO log's full-timestamp tooltip uses an explicit `Europe/Paris`
timezone. SSR shows `'—'` for time text; real values appear after mount.
