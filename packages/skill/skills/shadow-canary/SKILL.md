---
name: shadow-canary
description: Operate the shadow-canary deployment pattern on a Next.js + Vercel project. Use when the user invokes /shadow-canary:<command> (install, status, pause, resume, promote, cancel, rollback, deploy, doctor) or when they ask about canary status, rollback, or deploy of a shadow-canary-installed project.
---

# shadow-canary skill

This skill lets Claude Code operate a shadow-canary deployment on the user's project.

## Project detection

When any subcommand runs, first locate `.shadow-canary.json` at the project root (or search upward from CWD). It contains:
- `vercelProjectId`, `vercelOrgId`, `edgeConfigId` — Vercel references
- `adminUrl` — URL to the admin dashboard (e.g. `https://myapp.com/admin`)
- `sloPath` — typically `/api/slo`
- `adminPath` — typically `/admin`

If the file is missing, the project is not installed. Suggest running `/shadow-canary:install`.

## Credentials

Admin API calls require `ADMIN_USER`, `ADMIN_PASS`, `VERCEL_API_TOKEN`. Read from (in order):
1. Environment variables already in shell
2. `.env.local` at project root (parse, do not print secrets)
3. `~/.shadow-canary/credentials` if present (format: dotenv)

Never log or print secrets. When you need to run an authenticated request, use curl or node fetch with the cookie/token inline but redact in any output shown to the user.

## Admin session cookie flow

To call authenticated admin endpoints:
1. POST `${adminUrl.replace('/admin','')}/api/admin/login` with form-encoded body `username=X&password=Y` and `-i` to capture Set-Cookie.
2. Extract `admin-session` cookie value.
3. Include `-H 'Cookie: admin-session=<value>'` on subsequent requests.

Cache the cookie in memory for the session. If it expires (401), re-login.

## Subcommands

Each subcommand has its own instruction file:
- `install.md` — /shadow-canary:install
- `status.md` — /shadow-canary:status
- `pause.md`, `resume.md`, `promote.md`, `cancel.md` — canary state changes
- `rollback.md` — 1-click rollback to previous deploy
- `deploy.md` — trigger shadow or prod deploy via git push
- `doctor.md` — verify setup
