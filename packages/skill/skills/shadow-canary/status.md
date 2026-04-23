# /shadow-canary:status

Show current canary status and recent deployments for the current project.

Steps:
1. Read `.shadow-canary.json`. If missing, tell user to run /shadow-canary:install. STOP.
2. Read admin credentials from env or .env.local.
3. POST to `<host>/api/admin/login` with form-encoded `username=X&password=Y` to get session cookie.
4. GET `<host>/api/admin/state` → extract ShadowConfig from `{ config }`.
5. GET `<host>/api/admin/deployments` → last 20 deploys from `{ deployments }`.
6. Derive status label:
   - `STABLE` if no `deploymentDomainProdPrevious` or `trafficProdCanaryPercent` is 100
   - `RAMPING` if previous present and 0 < pct < 100 and !canaryPaused
   - `PAUSED` if canaryPaused=true and pct < 100
   - `ROLLED-BACK` if pct=0 and previous present
7. Format output:

```
Project: <name> (<vercelProjectId>)
Status:   <STATE>
Shadow:   <trafficShadowPercent>% on master @ <deploymentDomainShadow>
Prod:     <trafficProdCanaryPercent>% on production @ <deploymentDomainProd>
Previous: <100-pct>% on previous @ <deploymentDomainProdPrevious>

Traffic:  [=========>         ] <pct>%  (prod canary)

Recent deploys (production):
  > <uid>  <commitMessage>  <time-ago>  <- current
    <uid>  <commitMessage>  <time-ago>
    ...

Dashboard: <adminUrl>
Actions:  /shadow-canary:pause  /shadow-canary:rollback  /shadow-canary:deploy
```

8. Show elapsed time since `canaryStartedAt` if status is RAMPING.
9. Show next cron tick: next :00, :15, :30, or :45 UTC from current time.

Output only the formatted block. Do not print credentials.
