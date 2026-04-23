---
'@dotworld/shadow-canary-core': patch
'@dotworld/shadow-canary-templates': patch
'@dotworld/shadow-canary-skill': patch
---

feat(core): configurable production branch for the middleware filter

The middleware filter that gates routing on "deploys built from the prod
branch" hardcoded the branch name to `'production'`. This silently broke
any project whose prod branch was named differently (`main`, `master`,
etc.) — `VERCEL_GIT_COMMIT_REF !== 'production'` always tripped and the
middleware never routed traffic.

New `productionBranch` option (and `SHADOW_CANARY_PRODUCTION_BRANCH` env
var) let the middleware target the actual prod branch:

```ts
await shadowCanaryMiddleware(req, { productionBranch: 'master' });
```

Default stays `'production'` for existing shadow-canary setups. Pass
`productionBranch: ''` (or set the env var to empty) to disable the branch
filter entirely when the 2-branch shadow-canary convention doesn't apply.

The filter is still load-bearing: shadow deploys are built with
`vercel deploy --prod`, so they share `VERCEL_ENV=production` with current
prod — the branch name is the only runtime signal that separates them.
