# /shadow-canary:rollback

Promote an older production deployment to serve the custom domain.

Usage:
- `/shadow-canary:rollback` — list recent deploys, prompt user to select
- `/shadow-canary:rollback <sha-or-uid>` — roll back directly to that deploy

Steps:
1. Read `.shadow-canary.json`. If missing, tell user to run /shadow-canary:install. STOP.
2. Read admin credentials from env or .env.local.
3. POST to `<host>/api/admin/login` to get session cookie.
4. GET `<host>/api/admin/deployments` → last 10 production deploys.
5. If no argument was given, display the list with index, uid (short), commit message, age, and URL.
   Ask: "Enter the number or uid of the deploy to roll back to."
6. Resolve the selected deploy: find matching entry by index, uid prefix, or commit sha.
7. Show the selected deploy's details (uid, commit message, committed at, url).
8. Ask: "Type the first 7 characters of the commit sha to confirm rollback."
9. If input does not match the first 7 chars of the deploy's commitSha, print "Aborted." and STOP.
10. POST `<host>/api/admin/rollback` with JSON body:
    ```json
    { "deploymentId": "<uid>", "deploymentUrl": "<url>" }
    ```
    - Expects: `{ config: ShadowConfig }`
    - On 401: re-login and retry once.
11. Run /shadow-canary:status logic to show updated state.
