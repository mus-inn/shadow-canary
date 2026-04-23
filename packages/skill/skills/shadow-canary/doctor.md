# /shadow-canary:doctor

Verify that shadow-canary is correctly installed and configured on the current project.

For each check, report PASS or FAIL with a one-line remediation hint on failure.

Checks:
1. `.shadow-canary.json` exists and contains required fields:
   `vercelProjectId`, `vercelOrgId`, `edgeConfigId`, `adminUrl`, `sloPath`, `adminPath`.
2. `middleware.ts` (or `middleware.js`) exists and imports from `@dotworld/shadow-canary-core/edge`
   or calls `shadowCanaryMiddleware`.
3. `.env.local` contains all required variables:
   `VERCEL_API_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_EDGE_CONFIG_ID`, `ADMIN_USER`, `ADMIN_PASS`, `ADMIN_SESSION_SECRET`.
4. `next.config.ts` (or `next.config.js`) sets `deploymentId: process.env.VERCEL_DEPLOYMENT_ID`
   inside `generateBuildId` or the `env` block.
5. `vercel.json` has `git.deploymentEnabled.master = false` and `git.deploymentEnabled.production = false`.
6. GitHub workflow files all exist:
   `.github/workflows/deploy-shadow.yml`
   `.github/workflows/deploy-prod.yml`
   `.github/workflows/canary-ramp.yml`
7. Admin API is reachable: login → GET /api/admin/state → returns valid ShadowConfig (non-null).
8. Edge Config key `shadow-<repo-slug>-canary` is populated (verify via /api/admin/state response;
   derive the expected key from the `origin` git remote, e.g. for `owner/my-app` expect
   `shadow-my-app-canary`. If config is null, report that Edge Config may be empty, not linked,
   or the deploy workflows have not run yet).
9. Git branch `master` exists locally or on origin.
10. Git branch `production` exists locally or on origin.
11. Default branch on the remote is `master` (required for canary-ramp.yml cron to trigger).
    Check with: `git remote show origin | grep 'HEAD branch'`

After all checks, print a summary:
```
doctor summary: <N> passed, <M> failed
```
If any checks fail, list the failed items with their remediation hints grouped at the bottom.
