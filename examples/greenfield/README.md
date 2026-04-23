# greenfield — reference shadow-canary Next.js app

This is the canonical reference implementation of the shadow-canary deployment pattern. It's also published as a GitHub Template so you can click **Use this template** to start a fresh project with everything wired up.

## What's in here

- `middleware.ts` — uses `shadowCanaryMiddleware` from `@dotworld/shadow-canary-core/edge`
- `app/admin/**` — full dashboard (login, canary control, rollback, force-buckets, phase diagram)
- `app/api/admin/**` — admin API endpoints (state, deployments, pause, resume, promote, cancel, step, rollback, shadow-percent)
- `app/api/slo/route.ts` — SLO health check (stub → wire Sentry/DD later)
- `app/debug/**` — per-request bucket inspector
- `app/page.tsx` — marketing home showing served deploy metadata
- `lib/admin-auth.ts` — `requireAdmin()` wrapper + re-exports from core
- `lib/admin-vercel.ts` — re-exports from core
- `.github/workflows/*.yml` — deploy-shadow, deploy-prod, canary-ramp
- `next.config.ts` — sets `deploymentId` for Skew Protection
- `vercel.json` — disables auto-deploy on `master` and `production`

## Start from this as a template

Click **Use this template** on the GitHub repo, or:

```bash
npx degit mus-inn/shadow-canary/examples/greenfield my-new-app
cd my-new-app
npm install
```

Then follow the [Quickstart](https://mus-inn.github.io/shadow-canary/quickstart/).

## Install shadow-canary on an EXISTING project instead

See [install via Claude Code](https://mus-inn.github.io/shadow-canary/install/via-claude-code/) or the [manual migration guide](https://mus-inn.github.io/shadow-canary/install/migration-manual/).
