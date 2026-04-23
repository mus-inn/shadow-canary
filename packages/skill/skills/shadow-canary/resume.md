# /shadow-canary:resume

Resume the canary ramp after a pause. The cron job will resume bumping on its schedule.

Steps:
1. Read `.shadow-canary.json`. If missing, tell user to run /shadow-canary:install. STOP.
2. Read admin credentials from env or .env.local.
3. POST to `<host>/api/admin/login` to get session cookie.
4. POST `<host>/api/admin/canary/resume` with the session cookie.
   - Expects: `{ config: ShadowConfig }`
   - On 401: re-login and retry once.
5. Run /shadow-canary:status logic to show updated state.
