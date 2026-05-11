---
'@dotworld/shadow-canary-templates': minor
---

**Migrate canary ramp scheduler to Vercel Cron.**

The GH Actions `schedule: '*/15 * * * *'` in `canary-ramp.yml` was best-effort under runner load (intervals up to 80+ min observed in practice) and could be silently cancelled by `deploy-shadow.yml` sharing the `shadow-canary-${repo}` concurrency group. Vercel Cron fires on time with guaranteed delivery.

### What new adopters get

- **`app/api/canary-tick/route.ts`** — orchestration entry point hit by Vercel Cron every 15 min. Mirrors the bash workflow logic 1:1: bearer auth (`CRON_SECRET`), SLO probe against the new prod deploy with bypass support, 2-tick hysteresis (a single NOK records but does not rollback; two consecutive NOKs trigger), Paris-time-gated ramp cap (20% before 12:00, 100% after), `sloChecks` ring buffer, Slack notify on promote / rollback (opt-in via `SLACK_WEBHOOK_URL_MONITORING_CHANNEL`).
- **`lib/canary/tick.ts`** — pure decision helpers (`decideAction`, `parisHourCap`, `extractPrevOk`, `appendSloCheck`, `pctAfterTick`, `trimBodyExcerpt`). Imports `@dotworld/shadow-canary-core` types only — easy to unit-test without IO.
- **`vercel.json`** — registers `crons: [{ path: '/api/canary-tick', schedule: '*/15 * * * *' }]`.

### What existing adopters need to do

1. Re-run `npx shadow-canary-copy` (or copy the three new files by hand).
2. Add to env: `CRON_SECRET` (required — Vercel auto-injects in deployed envs; sign cron calls), `SLO_AUTH_TOKEN` (required — bearer forwarded to the SLO endpoint). Optional: `VERCEL_AUTOMATION_BYPASS_SECRET` (bypass deployment protection on `/api/slo`), `SLACK_WEBHOOK_URL_MONITORING_CHANNEL` (notifications).
3. Ensure `/api/slo` on the host project reads `SLO_AUTH_TOKEN` and accepts `Authorization: Bearer ${SLO_AUTH_TOKEN}`.

### `canary-ramp.yml` is now a manual fallback

The workflow is kept (`workflow_dispatch` only — `schedule:` dropped) so an operator can hand-trigger a tick if `/api/canary-tick` is broken (e.g. a bad deploy shipping a failing route). Same decision logic, same env, no behavioural drift.
