---
'@dotworld/shadow-canary-templates': patch
'@dotworld/shadow-canary-skill': patch
---

**Fix: workflows could silently clobber the entire Edge Config item when the Vercel API hiccupped, plus a battery of related hardening across the three GitHub Actions workflows.**

### Root cause: silent state-clobber on transient API failure

`deploy-shadow.yml`, `deploy-prod.yml`, AND `canary-ramp.yml` all opened their "merge into Edge Config" steps with the same defensive-looking-but-actually-destructive pattern:

```bash
CURRENT=$(curl -sf … | jq … '.[0].value // {}' || echo '{}')
if [ -z "$CURRENT" ] || [ "$CURRENT" = "null" ]; then CURRENT='{}'; fi
```

On any transient Vercel API failure (401/403 stale token, 429 rate limit, 5xx outage, network blip), `curl -sf` exited with an error code and an empty stdout. GitHub Actions defaults `run:` steps to `bash -e {0}` (no pipefail) unless `shell: bash` is set explicitly, so the upstream curl error never propagated through the pipe — `jq` then saw empty stdin, raised a parse error, and the `|| echo '{}'` captured the whole thing. The `if [ -z … ]` guard treated this exactly the same as a legitimate greenfield Edge Config (key absent, 200 OK), so the merge that followed upserted a state assembled entirely from `// fallback` defaults:

- `deploymentDomainProd` reset to the shadow URL (with the pre-`e4a8e60` workflow) or left untouched but with bogus stamping.
- `deploymentDomainProdPrevious` dropped (not present in the merge object → upsert removed it).
- `trafficProdCanaryPercent` reset to `100` (`// 100` fallback).
- `trafficShadowPercent` reset to `1`, `shadowForceIPs` reset to `[]`.

A canary in mid-ramp could be slammed to 100% with the previous pointer wiped out by nothing more than a single failing API call — no log, no warning, no alert. The effect was most dangerous in `canary-ramp.yml`: the cron runs 96×/day and hits the read path twice (initial state + post-bump re-read), making the failure mode a "when, not if" event over long enough windows.

The companion fix `cf422f1` ("surface Vercel API failures + defend against scheme drift") had already applied the right defensive shape to the `targets.production.url` lookup in `deploy-shadow.yml` but left the three Edge Config reads untouched.

### What changed (read clobber fix)

All three workflows now read Edge Config with explicit HTTP code handling + JSON validation:

```bash
EDGE_FILE="${RUNNER_TEMP}/edge-config-${GITHUB_RUN_ID}.json"
trap 'rm -f "$EDGE_FILE"' EXIT

HTTP=$(curl -s -o "$EDGE_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v1/edge-config/$EDGE_CONFIG_ID/items?teamId=$VERCEL_ORG_ID" \
  || echo '000')
case "$HTTP" in
  200)
    if ! jq -e . "$EDGE_FILE" >/dev/null 2>&1; then
      echo "::error::Edge Config read returned 200 but body is not valid JSON — refusing to merge."
      exit 1
    fi
    CURRENT=$(jq … "$EDGE_FILE")
    ;;
  *)
    echo "::error::Edge Config read failed (HTTP $HTTP) — refusing to merge against empty state."
    exit 1
    ;;
esac
```

`200` + valid JSON is the only path that proceeds. Anything else — transport error (`000`), auth (`401`/`403`), rate limit (`429`), outage (`5xx`), or HTML error page returned with a 200 status during a CDN incident — hard-fails the workflow with a GitHub `::error::` annotation. Re-running the deploy once Vercel recovers is strictly safer than landing a defaulted state.

### Additional hardening rolled in

Because all three workflows were touched anyway, the following findings from a multi-agent code review (security, architecture, code quality, ops) were addressed in the same PR rather than left as follow-ups:

- **Concurrency**: `deploy-shadow.yml` had no `concurrency:` block, while `deploy-prod.yml` and `canary-ramp.yml` shared `shadow-canary-${{ github.repository }}`. A push-to-master that landed during a canary-ramp tick could read the pre-bump state and PATCH back over the cron's bump, silently undoing the ramp. All three workflows now share the same group.
- **Pipefail by default**: every job declares `defaults.run.shell: bash`, which upgrades the step shell from `bash -e {0}` (no pipefail) to `bash --noprofile --norc -eo pipefail {0}`. Closes the bug class, not just the three patched call sites.
- **JSON injection hardening**: `${{ steps.X.outputs.url }}` was previously interpolated by GitHub Actions templating directly into the bash heredoc that fed `jq --arg`. A malformed Vercel URL containing a single quote, backtick, or `$(...)` would have escaped the surrounding quoting and executed on the runner. All output references now route through step-level `env:` blocks so jq receives the values via `"$VAR"` and bash never re-evaluates them.
- **Token argv exposure**: `vercel deploy --token=$VERCEL_TOKEN` and `vercel promote … --token=$VERCEL_TOKEN` placed the token on the process command line, visible via `/proc/<pid>/cmdline` and surfaced in CLI error traces. Both calls now rely on the existing `env: VERCEL_TOKEN: …` (which the Vercel CLI already honors), so the token never reaches argv.
- **Promote ordering**: `deploy-prod.yml` previously ran `vercel promote` *before* updating Edge Config. If the Edge Config write failed (now hard-failing on transient errors), the custom domain would be aliased to a deploy not referenced in Edge Config — recoverable but inconsistent. Promote now runs *after* the Edge Config PATCH succeeds; a failed PATCH leaves the custom domain pointing at the previous prod and the workflow re-run is fully idempotent.
- **Tmp file isolation**: response bodies are now written to `${RUNNER_TEMP}/edge-config-${GITHUB_RUN_ID}*.json` (with a `trap … EXIT` cleanup) instead of fixed `/tmp/*.json` paths. Defends against subsequent steps in the same job reading stale data, and keeps the response body — which contains every Edge Config item, not just the canary key — out of long-lived /tmp on self-hosted runners.
- **Ownership-violating defaults removed**: `deploy-shadow.yml` previously set `trafficProdCanaryPercent: (.trafficProdCanaryPercent // 100)` in its merge. The same `// fallback` anti-pattern as the bootstrap shadow→prod issue fixed in `e4a8e60`: if an admin handler ever `unset`'d the field, the next master push would silently re-set it to 100%, defeating operator intent. The line is dropped — that field is owned by `deploy-prod.yml` + `canary-ramp.yml` + `/api/admin/*` exclusively.
- **Slack on failure**: `::error::` annotations are visible in the GitHub Actions UI but invisible to operators watching Slack. All three workflows now post a Slack failure notice via `if: failure() && env.SLACK_WEBHOOK_URL != ''`.
- **Greenfield example synced**: pre-existing comment drift between `packages/templates/files/.github/workflows/*` and `examples/greenfield/.github/workflows/*` is resolved — the two trees are now byte-equivalent.

### Migration for already-clobbered Edge Configs

If your `deploymentDomainProd` ended up pointing at a shadow URL or `deploymentDomainProdPrevious` got wiped during a prior canary, the procedure documented in [`fix-deploy-shadow-no-prod-bootstrap`](./fix-deploy-shadow-no-prod-bootstrap.md) applies — push to `production`, use admin "Rollback", or patch Edge Config directly.

This fix prevents future occurrences but does not retroactively repair a stored value.
