# /shadow-canary:cancel

Rollback canary to 0% and pause. All production traffic reverts to the previous deploy.

**Confirmation required before any API call.**

Steps:
1. Read `.shadow-canary.json`. If missing, tell user to run /shadow-canary:install. STOP.
2. Read admin credentials from env or .env.local.
3. Run /shadow-canary:status logic to display current state.
4. Warn: "This will send 100% of prod traffic to the PREVIOUS deploy and pause the cron."
5. Ask the user: "Type 'cancel' to confirm."
6. If the user's input is not exactly `cancel`, print "Aborted." and STOP.
7. POST to `<host>/api/admin/login` to get session cookie.
8. POST `<host>/api/admin/canary/cancel` with the session cookie.
   - Expects: `{ config: ShadowConfig }`
   - On 401: re-login and retry once.
9. Run /shadow-canary:status logic to show updated state.
