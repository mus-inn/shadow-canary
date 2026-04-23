# shadow-canary — Installation guide for AI coding agents

You (Claude Code) are installing the shadow-canary deployment pattern on an **existing Next.js + Vercel project**. Follow these instructions step by step. Ask the user ONLY for inputs listed in "Inputs to collect". Do not ask the user about implementation choices — the steps are prescriptive.

## Inputs to collect from the user (before running any commands)

Ask once, up front:

1. **Vercel Project ID** (format `prj_xxx`) — from `.vercel/project.json` or Vercel dashboard Project Settings → General
2. **Vercel Org/Team ID** (format `team_xxx` or `ORG_xxx`) — same location
3. **Vercel Edge Config Store ID** (format `ecfg_xxx`) — user must create one in Vercel Storage tab, named e.g. `<project>-shadow-config`, and link it to the project. If they don't have one yet, tell them to create it before continuing.
4. **Admin username** for the /admin dashboard (default: `admin`)
5. **Admin password** — ask if they want you to generate one (run `openssl rand -base64 24`) or provide their own
6. **Slack webhook URL** (optional) — for canary notifications

## Pre-flight detection (run read-only)

Run these commands and act on the output:

```bash
node -v
cat package.json | grep '"next"'
ls middleware.ts middleware.js src/middleware.ts src/middleware.js 2>/dev/null
ls app/admin app/api/slo 2>/dev/null
cat .vercel/project.json 2>/dev/null
```

Interpretation:
- If Node < 20 → WARN, recommend upgrade (workflows target Node 20)
- If `next` version < 13.4 → STOP, report "shadow-canary requires Next.js >=13.4 (App Router)". Do not proceed.
- If `middleware.ts` or `middleware.js` exists → note "existing middleware detected, will use composition pattern in Step 6"
- If `app/admin` exists → report collision, ask user for alternate path (suggest `app/_canary`); rename in Step 7
- If `app/api/slo` exists → same collision handling (suggest `app/api/_slo-canary`)
- If `.vercel/project.json` exists → extract `orgId` and `projectId` for confirmation with the user

## Installation steps

### Step 1 — Install dependencies

Detect package manager from lockfiles, then run:

```bash
# npm
npm install @dotworld/shadow-canary-core @vercel/edge-config

# pnpm (if pnpm-lock.yaml exists)
pnpm add @dotworld/shadow-canary-core @vercel/edge-config

# yarn (if yarn.lock exists)
yarn add @dotworld/shadow-canary-core @vercel/edge-config
```

### Step 2 — Copy template files

```bash
npx @dotworld/shadow-canary-templates copy .
```

This writes: `middleware.ts`, `next.config.ts` (if absent), `vercel.json` (if absent), `.env.local.example`, `app/admin/**`, `app/api/admin/**`, `app/api/slo/route.ts`, `lib/admin-{auth,vercel}.ts`, `.github/workflows/{deploy-shadow,deploy-prod,canary-ramp}.yml`.

Files that already exist are SKIPPED by default. If `next.config.ts` or `vercel.json` already exist, proceed to Step 3/4 to merge manually.

### Step 3 — Patch next.config (if it existed before Step 2)

Read the existing `next.config.{ts,js,mjs}`. Add this field to the config object, preserve everything else:

```ts
deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
```

### Step 4 — Patch vercel.json (if it existed before Step 2)

Merge this into the existing JSON (preserve all other keys):

```json
{ "git": { "deploymentEnabled": { "master": false, "production": false } } }
```

### Step 5 — Create .env.local

```bash
cp .env.local.example .env.local
```

Fill in using the inputs collected at start. Generate `ADMIN_SESSION_SECRET`:

```bash
openssl rand -hex 32
```

### Step 6 — Handle existing middleware (CONDITIONAL)

Only if Pre-flight detected an existing middleware file:

- DO NOT overwrite the project's middleware.
- The file written by Step 2 at `middleware.ts` conflicts with the existing one. Rename it: `mv middleware.ts middleware-canary.ts.bak` (keep as reference).
- Edit the project's existing middleware to compose shadow-canary:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { shadowCanaryMiddleware } from '@dotworld/shadow-canary-core/edge';

export async function middleware(req: NextRequest) {
  // ... existing logic (auth, i18n, etc.) ...
  // If existing logic returns early with a redirect/rewrite, that wins.

  const canaryResult = await shadowCanaryMiddleware(req);
  if (canaryResult) return canaryResult;

  return NextResponse.next();
}
```

- Merge the matchers: union of existing + shadow-canary exclusions (`api`, `_next/static`, `_next/image`, `favicon.ico`, `admin`, files with extensions). Be conservative.

### Step 7 — Resolve collisions (CONDITIONAL)

Only if `/admin` or `/api/slo` already existed before Step 2:

- Rename the shadow-canary directories: `app/admin` → `app/_canary`, `app/api/slo` → `app/api/_slo-canary`
- Update the middleware matcher to exclude the new paths
- Update `.github/workflows/canary-ramp.yml`: change the `/api/slo` curl call to `/api/_slo-canary`
- Update any dashboard references if present

### Step 8 — Create `.shadow-canary.json` project config

Write at project root:

```json
{
  "version": "0.1.0",
  "vercelProjectId": "<from input>",
  "vercelOrgId": "<from input>",
  "edgeConfigId": "<from input>",
  "adminPath": "/admin",
  "sloPath": "/api/slo"
}
```

Adjust `adminPath`/`sloPath` if renamed in Step 7. This file is read by the `@dotworld/shadow-canary-skill` Claude Code skill.

### Step 9 — Update .gitignore

Ensure `.env.local` is listed. Add it if absent.

### Step 10 — Verify build

```bash
npm run build
```

Must pass. If it fails, report the errors to the user — do not proceed to commit.

### Step 11 — Commit

Create a feature branch first if not already on one:

```bash
git checkout -b feat/install-shadow-canary
```

Then commit:

```bash
git add -A && git commit -m "feat: install shadow-canary"
```

## Manual steps the user must do (you cannot do these)

Print this checklist at the end, verbatim:

```
Before shadow-canary is active, you must manually:

1. Vercel Project Settings → Git:
   - Production Branch = `production`
   - Auto-assign Custom Production Domains = OFF

2. Vercel Project Settings → Advanced:
   - Skew Protection = ON (7 days)

3. Vercel Edge Config → the store you created:
   - Add key `shadow-configuration` with initial value:
     {"trafficShadowPercent": 0, "trafficProdCanaryPercent": 100, "shadowForceIPs": []}

4. Vercel Project Environment Variables (Production + Preview):
   - VERCEL_API_TOKEN (Vercel account token, create at vercel.com/account/tokens)
   - VERCEL_ORG_ID (your team ID)
   - VERCEL_EDGE_CONFIG_ID (the ecfg_xxx you provided)
   - ADMIN_USER, ADMIN_PASS, ADMIN_SESSION_SECRET (as filled in .env.local)

5. GitHub Repository Settings → Secrets and variables → Actions:
   - VERCEL_TOKEN (same as VERCEL_API_TOKEN above, named differently)
   - VERCEL_ORG_ID
   - VERCEL_PROJECT_ID
   - VERCEL_EDGE_CONFIG_ID
   - SLACK_WEBHOOK_URL (optional)

6. Branch model:
   - Rename current default branch to `production`
   - Create a `master` branch from it: `git checkout -b master && git push -u origin master`
   - Update branch protections on both
   - Tell teammates the new flow: feature PRs → master (shadow), master → production (canary)

7. First deploy:
   - Push master → triggers deploy-shadow.yml
   - Open PR master → production with commit message `bootstrap [skip-canary]`
   - Merge → triggers deploy-prod.yml → immediate 100% promotion (no previous to canary against)
   - Subsequent merges → normal canary ramp
```

## Common gotchas (reference these if user hits issues)

- Chunks 404 on cross-deploy rewrites → Skew Protection is OFF
- /admin shows "unconfigured" → Edge Config ID wrong or store not linked to project
- SSO 401 on rewrites → Deployment Protection enabled without bypass; see Vercel docs
- Cron not firing → canary-ramp.yml cron runs on default branch only; verify default = master
- `VERCEL_DEPLOYMENT_ID` undefined in build → do not use `--prebuilt` flag in CI workflows
