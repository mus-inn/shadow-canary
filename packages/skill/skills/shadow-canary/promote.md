# /shadow-canary:promote

Skip the ramp and jump to 100% immediately. The previous deploy is kept for sticky sessions.

**Confirmation required before any API call.**

Steps:
1. Read `.shadow-canary.json`. If missing, tell user to run /shadow-canary:install. STOP.
2. Read admin credentials from env or .env.local.
3. Run /shadow-canary:status logic to display current state.
4. Ask the user: "Type 'promote' to jump canary to 100% immediately."
5. If the user's input is not exactly `promote`, print "Aborted." and STOP.
6. POST to `<host>/api/admin/login` to get session cookie.
7. POST `<host>/api/admin/canary/promote` with the session cookie.
   - Expects: `{ config: ShadowConfig }`
   - On 401: re-login and retry once.
8. Run /shadow-canary:status logic to show updated state.
