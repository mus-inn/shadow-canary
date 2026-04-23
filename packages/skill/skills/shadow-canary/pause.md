# /shadow-canary:pause

Pause the canary ramp. The cron job will skip percentage bumps until resumed.

Steps:
1. Read `.shadow-canary.json`. If missing, tell user to run /shadow-canary:install. STOP.
2. Read admin credentials from env or .env.local.
3. POST to `<host>/api/admin/login` to get session cookie.
4. POST `<host>/api/admin/canary/pause` with the session cookie.
   - Expects: `{ config: ShadowConfig }`
   - On 401: re-login and retry once.
5. Run /shadow-canary:status logic to show updated state.
