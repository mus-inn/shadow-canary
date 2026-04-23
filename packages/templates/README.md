# @dotworld/shadow-canary-templates

File payload for [shadow-canary](https://github.com/your-org/shadow-canary) — copyable into existing Next.js + Vercel projects.

This package ships the host-side files that must live in the project repository. Logic is imported from `@dotworld/shadow-canary-core`; these files are thin wrappers, UI components, API routes, and CI workflows.

## Usage

```bash
npx @dotworld/shadow-canary-templates copy .
```

Files that already exist are skipped. Use `--force` to overwrite:

```bash
npx @dotworld/shadow-canary-templates copy . --force
```

You can also target a specific directory:

```bash
npx @dotworld/shadow-canary-templates copy /path/to/my-next-app
```

## Files delivered

| Path | Purpose |
|---|---|
| `middleware.ts` | Edge middleware: routes shadow/canary traffic via `@dotworld/shadow-canary-core/edge` |
| `next.config.ts` | Sets `deploymentId` for Skew Protection |
| `vercel.json` | Disables automatic git deploys (workflows control deploys) |
| `.env.local.example` | All required environment variables documented |
| `lib/admin-auth.ts` | Auth helpers: re-exports from core + `requireAdmin()` (host-side, needs `next/headers`) |
| `lib/admin-vercel.ts` | Vercel API helpers: thin re-exports from `@dotworld/shadow-canary-core` |
| `app/admin/` | Admin dashboard (server + client components, CSS) |
| `app/admin/login/page.tsx` | Login page |
| `app/api/admin/**` | REST endpoints: state, deployments, login, logout, rollback, shadow-percent, canary controls |
| `app/api/slo/route.ts` | SLO health endpoint used by canary ramp cron |
| `.github/workflows/deploy-shadow.yml` | CI: deploy master branch to shadow slot |
| `.github/workflows/deploy-prod.yml` | CI: deploy production branch, start canary ramp |
| `.github/workflows/canary-ramp.yml` | CI: cron every 15 min, SLO-gated traffic bump |

## After copying

Follow the `llms-install.md` guide at the monorepo root (or in the published docs) to:

1. Install dependencies (`@dotworld/shadow-canary-core`, `@vercel/edge-config`)
2. Fill in `.env.local` from `.env.local.example`
3. Configure Vercel project settings and Edge Config
4. Set GitHub repository secrets
5. Establish the `master` / `production` branch model
