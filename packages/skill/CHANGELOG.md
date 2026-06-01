# @dotworld/shadow-canary-skill

## 0.8.0

### Minor Changes

- e218703: Add an opt-in fixed 3-slot model (nightly / canary / production) alongside the
  existing 2-branch shadow + canary-ramp model. Fully additive — no breaking
  changes; existing consumers are unaffected.

  **core**

  - New runtime: `getSlotInfo()` / `getSlotRuntime()` / `formatSlotTag()` and the
    `FixedSlot` (`nightly | canary | production | preview | development |
unknown`), `SlotBuildInfo`, `SlotRuntimeInfo` types. The slot is derived
    synchronously from `VERCEL_TARGET_ENV` (Vercel Custom Environments) — no Edge
    Config read, no `production-track` disambiguation.
  - New middleware: `slotCanaryMiddleware()` / `slotCanaryProxy()` — a single
    percentage roll partitions traffic into nightly | canary | production. The
    routing deploy (holding the public domain) owns the split and rewrites to the
    stable `domainNightly` / `domainCanary`. Two topologies:
    - **Custom-environment mode** (default): `routingEnv` /
      `SHADOW_CANARY_ROUTING_ENV` selects which `VERCEL_TARGET_ENV` runs the split.
    - **Branch mode**: when every slot deploys `--prod` to the same env, set
      `productionBranch` / `SHADOW_CANARY_PRODUCTION_BRANCH` — only that branch's
      deploy owns the split; nightly / canary branch deploys serve their own
      content. Rewrite targets are the stable branch-pinned URLs.
  - `ShadowConfig` gains optional fields `domainNightly`, `domainCanary`,
    `trafficNightlyPercent`, `trafficCanaryPercent`, `forceNightlyIPs`. The
    legacy fields are untouched; a project uses one set or the other.

  **templates** — new `three-slot/` reference set: `proxy.ts` (slotCanaryProxy),
  `deploy-nightly` / `deploy-canary` / `deploy-prod` workflows (plain
  `vercel deploy --target=<env>`, no Edge Config writes), and an admin
  `rollout` route to edit the two percentages.

  **skill** — new `three-slot.md` command doc + topology detection note in
  `SKILL.md`.

## 0.7.2

### Patch Changes

- 0790820: **Fix: workflows could silently clobber the entire Edge Config item when the Vercel API hiccupped, plus a battery of related hardening across the three GitHub Actions workflows.**

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
  - **Promote ordering**: `deploy-prod.yml` previously ran `vercel promote` _before_ updating Edge Config. If the Edge Config write failed (now hard-failing on transient errors), the custom domain would be aliased to a deploy not referenced in Edge Config — recoverable but inconsistent. Promote now runs _after_ the Edge Config PATCH succeeds; a failed PATCH leaves the custom domain pointing at the previous prod and the workflow re-run is fully idempotent.
  - **Tmp file isolation**: response bodies are now written to `${RUNNER_TEMP}/edge-config-${GITHUB_RUN_ID}*.json` (with a `trap … EXIT` cleanup) instead of fixed `/tmp/*.json` paths. Defends against subsequent steps in the same job reading stale data, and keeps the response body — which contains every Edge Config item, not just the canary key — out of long-lived /tmp on self-hosted runners.
  - **Ownership-violating defaults removed**: `deploy-shadow.yml` previously set `trafficProdCanaryPercent: (.trafficProdCanaryPercent // 100)` in its merge. The same `// fallback` anti-pattern as the bootstrap shadow→prod issue fixed in `e4a8e60`: if an admin handler ever `unset`'d the field, the next master push would silently re-set it to 100%, defeating operator intent. The line is dropped — that field is owned by `deploy-prod.yml` + `canary-ramp.yml` + `/api/admin/*` exclusively.
  - **Slack on failure**: `::error::` annotations are visible in the GitHub Actions UI but invisible to operators watching Slack. All three workflows now post a Slack failure notice via `if: failure() && env.SLACK_WEBHOOK_URL != ''`.
  - **Greenfield example synced**: pre-existing comment drift between `packages/templates/files/.github/workflows/*` and `examples/greenfield/.github/workflows/*` is resolved — the two trees are now byte-equivalent.

  ### Migration for already-clobbered Edge Configs

  If your `deploymentDomainProd` ended up pointing at a shadow URL or `deploymentDomainProdPrevious` got wiped during a prior canary, the procedure documented in [`fix-deploy-shadow-no-prod-bootstrap`](./fix-deploy-shadow-no-prod-bootstrap.md) applies — push to `production`, use admin "Rollback", or patch Edge Config directly.

  This fix prevents future occurrences but does not retroactively repair a stored value.

## 0.7.1

### Patch Changes

- f1c7f4f: **Fix: `deploy-shadow.yml` no longer writes the shadow URL into `deploymentDomainProd`.**

  Since the initial monorepo scaffold, `deploy-shadow.yml` carried a `deploymentDomainProd: (.deploymentDomainProd // $shadowUrl)` line meant as a bootstrap fallback for greenfield projects without a `production` branch yet. The intent was to give the admin UI / `runtime-info` something to display before the first prod deploy ran. In practice this violated the contract of `deploymentDomainProd` (must be a Vercel-promoted prod URL) and produced a class of silently-broken setups:

  - `canary-ramp.yml` probes `<deploymentDomainProd>/api/slo` for SLO gating — with the bootstrap, it probed a shadow URL as if it were prod.
  - `runtime-info` labelled the shadow as `prod-current` in Sentry / PostHog telemetry.
  - The admin "new prod" host pointed at a shadow deploy, so rollback / canary actions operated on the wrong target.
  - The custom domain promoted by Vercel (`vercel promote` is only ever run by `deploy-prod.yml`) was decorrelated from the URL stored in Edge Config.

  If a host project never pushed to `production` (e.g. workflows were customised to trigger on `main` only, or the second branch was never set up), `deploymentDomainProd` would freeze on the _very first_ shadow URL forever — every subsequent shadow deploy updated `deploymentDomainShadow` but skipped `deploymentDomainProd` thanks to the `//` jq fallback.

  **What changed:**

  - `deploy-shadow.yml` no longer writes `deploymentDomainProd` directly. The field is now exclusively owned by `deploy-prod.yml` and `/api/admin/rollback` after the first init.
  - A new bootstrap-only step resolves the current prod URL via Vercel API (`GET /v9/projects/{id}` → `targets.production.url`, i.e. the deployment currently aliased to the custom domain). When the Edge Config key is empty AND Vercel has a current prod target, the workflow seeds `deploymentDomainProd` with that URL — the only honest value available at that point.
  - When Vercel has no prod target yet (truly greenfield project), `deploymentDomainProd` stays unset. The middleware doesn't read this field for routing (passthrough on "new prod"), `canary-ramp.yml` already has a `if [ -z "$PROD_URL" ]; then skip` guard, and the admin will display "—" instead of a misleading shadow URL.

  **Migration for already-polluted setups** (Edge Config has a shadow URL stored as `deploymentDomainProd`):

  Re-copying the workflows alone won't repair the stored value. Pick one:

  1. **Push to `production`** — `deploy-prod.yml` will overwrite `deploymentDomainProd` with the new prod URL.
  2. **Use admin "Rollback"** on a known-good `production` deploy from the recent deploys list — re-aliases the custom domain and writes the correct URL.
  3. **Patch Edge Config directly** — set `deploymentDomainProd` to the URL returned by `GET /v9/projects/{id}?teamId=…` → `.targets.production.url` (prefixed with `https://`).

  After step 1, 2, or 3, subsequent shadow deploys are read-only on `deploymentDomainProd` — no further drift possible.

## 0.7.0

### Minor Changes

- 6d13f7f: feat(core): Next.js 16 `proxy.ts` support via `shadowCanaryProxy` alias

  Next.js 16 (Oct 2025) renamed the file convention from `middleware.ts` →
  `proxy.ts` and the exported function from `middleware()` → `proxy()`. The
  wire-level API (`NextRequest`, `NextResponse`, `config.matcher`) is unchanged
  in v16, so `shadowCanaryMiddleware` already worked — but importing a function
  named `Middleware` into a file named `proxy.ts` reads awkwardly.

  Two ergonomic exports added, both in the main and edge entry points:

  - `shadowCanaryProxy` — strict alias of `shadowCanaryMiddleware` (same
    function reference, no re-implementation).
  - `ShadowCanaryProxyOptions` — alias of `ShadowCanaryMiddlewareOptions`.

  ```ts
  // Next.js 16 proxy.ts (Node runtime)
  import { shadowCanaryProxy } from "@dotworld/shadow-canary-core";

  export async function proxy(req: NextRequest) {
    const res = await shadowCanaryProxy(req);
    return res ?? NextResponse.next();
  }
  ```

  The middleware function is also now exported from the main entry point (it
  was previously only on `/edge`) so v16 `proxy.ts` files can import without
  the subpath. v15 setups and v16 Edge-runtime `middleware.ts` keep working
  unchanged — both names point at the same function.

  Note: `proxy.ts` runs on Node.js runtime only. `middleware.ts` is the only
  path for Edge runtime on v16 (deprecated, no removal date announced).

## 0.6.0

### Minor Changes

- 7f4d9ec: feat(core): runtime info helper for Sentry / PostHog telemetry

  Two new exports that tell the running code where it lives — which deploy
  slot, which commit, which branch — so every Sentry error, PostHog event,
  log line, or debug header can carry that context.

  ```ts
  import { getBuildInfo, getRuntimeBucket } from "@dotworld/shadow-canary-core";

  // Sync, env vars only — safe in Sentry.init / module-level.
  const info = getBuildInfo();
  // { slot: 'production-track', commitShaShort: 'abc1234', branch: 'production', ... }

  // Async, queries Edge Config — narrows production-track to prod-current vs prod-previous.
  const runtime = await getRuntimeBucket();
  // { bucket: 'prod-current', resolvedFromEdgeConfig: true, ... }
  ```

  The split is load-bearing: build env vars cannot tell `prod-current` from
  `prod-previous` (both share `VERCEL_ENV=production` and the prod branch).
  Edge Config is the only source of truth — the helper compares `VERCEL_URL`
  against `deploymentDomainProd` / `deploymentDomainProdPrevious`.

  Why this matters during a canary: when `trafficProdCanaryPercent: 25`, ~25%
  of prod traffic hits `prod-current` and 75% hits `prod-previous`. Without
  the bucket tag, you see a global error rate increase but can't anchor it
  to the new code. With it, filtering Sentry by `bucket:prod-current` gives
  stack traces in seconds.

  Plus `formatBuildInfoTag()` for `[prod-current @ production abc1234]` log
  lines / debug headers. Exported from both Node and edge entry points. Full
  Sentry / PostHog integration recipes in
  [docs/reference/runtime-info](https://mus-inn.github.io/shadow-canary/reference/runtime-info/).

  ***

  fix(admin): React error #418 hydration mismatch on time-derived UI

  The admin dashboard surfaced a hydration mismatch in production builds
  because server-rendered timestamps differed from client (Date.now() drift,
  locale-default timezone for `toLocaleString`). The `now` ticker now starts
  `null` and is set in `useEffect`, `prettyTimeAgo` takes `now` as parameter,
  and the SLO log's full-timestamp tooltip uses an explicit `Europe/Paris`
  timezone. SSR shows `'—'` for time text; real values appear after mount.

## 0.5.1

### Patch Changes

- Version-aligned with `@dotworld/shadow-canary-templates@0.5.1` (legend clarity fix). No skill content changes.

## 0.5.0

### Minor Changes

- Version-aligned with `@dotworld/shadow-canary-core@0.5.0` (shadow history 20 + configurable step). No skill content changes.

## 0.4.1

### Patch Changes

- Version-aligned with `@dotworld/shadow-canary-templates@0.4.1`. No skill content changes.

## 0.4.0

### Minor Changes

- Version-aligned with `@dotworld/shadow-canary-core@0.4.0` (admin UX additions). No skill content changes in this release — the new admin features are in the templates package.

## 0.3.0

### Major Changes

- Align with `@dotworld/shadow-canary-core@0.3.0` breaking change: the Edge Config key is now derived from the repo slug (`shadow-<slug>-canary`) and is not configurable.

  - `doctor.md` check 8 now derives the expected key from the `origin` git remote instead of hardcoding `shadow-configuration`.
  - `llms-install.md` (the install guide that `install.md` WebFetches) no longer asks for a configKey input, no longer writes `configKey` into `.shadow-canary.json`, and no longer guides setting `SHADOW_CANARY_KEY` as a GH secret / Vercel env var.

## 0.2.4

### Patch Changes

- da354c6: feat: guardrails against the #1 silent-shadow trap

  When the `SHADOW_CANARY_KEY` GH Actions secret and the Vercel project env var
  drift apart, the deploy workflows happily write to one Edge Config entry
  while the middleware reads a different one — routing silently freezes on
  whatever the last matching write was, with no error anywhere. Stargaze hit
  this exact trap: PR #3's shadow URL stuck in the config for hours.

  Two guardrails now catch this early:

  **1. Runtime warn in the middleware** (`@dotworld/shadow-canary-core`)

  `getShadowConfig` now emits a one-shot `console.warn` (visible in Vercel
  runtime logs) when the configured Edge Config key returns no value,
  pointing at the three most likely causes (workflow never ran, key
  mismatch, wrong EDGE_CONFIG store). Deduped per-key so warm instances
  don't spam on every request.

  **2. Pre-flight check in the deploy workflows** (`@dotworld/shadow-canary-templates`)

  All three workflows (`deploy-shadow`, `deploy-prod`, `canary-ramp`) now
  call the Vercel env API before writing to Edge Config and fail loud with
  an actionable error when the GH Actions value and the Vercel project
  value don't match. If `VERCEL_TOKEN` lacks the `env:read` scope the check
  degrades to a warning so the workflow still ships — but it cannot silently
  write to the wrong place anymore.

  **Upgrade steps** for existing projects: re-copy the three workflow files
  (`npx @dotworld/shadow-canary-templates@latest copy . --force` on the
  workflows) and confirm `SHADOW_CANARY_KEY` is set identically as a GH
  repo secret and a Vercel project env var. The next workflow run verifies
  this automatically.

## 0.2.3

### Patch Changes

- 6df3573: feat(core): configurable production branch for the middleware filter

  The middleware filter that gates routing on "deploys built from the prod
  branch" hardcoded the branch name to `'production'`. This silently broke
  any project whose prod branch was named differently (`main`, `master`,
  etc.) — `VERCEL_GIT_COMMIT_REF !== 'production'` always tripped and the
  middleware never routed traffic.

  New `productionBranch` option (and `SHADOW_CANARY_PRODUCTION_BRANCH` env
  var) let the middleware target the actual prod branch:

  ```ts
  await shadowCanaryMiddleware(req, { productionBranch: "master" });
  ```

  Default stays `'production'` for existing shadow-canary setups. Pass
  `productionBranch: ''` (or set the env var to empty) to disable the branch
  filter entirely when the 2-branch shadow-canary convention doesn't apply.

  The filter is still load-bearing: shadow deploys are built with
  `vercel deploy --prod`, so they share `VERCEL_ENV=production` with current
  prod — the branch name is the only runtime signal that separates them.

## 0.2.2

### Patch Changes

- e3f688a: feat(core): auto-wire Vercel Deployment Protection bypass on rewrites

  `shadowCanaryMiddleware` now injects `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie: samesitenone` on every shadow / previous-prod rewrite when a bypass secret is available. The token is resolved from `opts.bypassToken` (new option), falling back to the `VERCEL_AUTOMATION_BYPASS_SECRET` env var — which Vercel auto-injects when "Protection Bypass for Automation" is enabled.

  Before this patch, rewrites to shadow / previous-prod deployment URLs were blocked by Deployment Protection (password / SSO), forcing every consumer project to copy the wiring into its own middleware. Protected projects now work out of the box with zero caller config.

  Pass `bypassToken: ''` to explicitly opt out of auto-detection.

## 0.2.1

### Patch Changes

- 233efad: fix(templates): workflows now honor `SHADOW_CANARY_KEY`

  The three GitHub Actions workflows (`deploy-shadow.yml`, `deploy-prod.yml`, `canary-ramp.yml`) hardcoded the Edge Config item key `shadow-configuration`, bypassing the `SHADOW_CANARY_KEY` feature added in 0.2.0. This caused projects sharing an Edge Config store (the documented workaround for Vercel Pro's 3-store limit) to overwrite each other's routing state on every deploy.

  Workflows now read `$SHADOW_CANARY_KEY` (from GH Actions env, sourced from `secrets.SHADOW_CANARY_KEY`) with a fallback to `'shadow-configuration'` for existing single-tenant setups.

  **Upgrade steps** when sharing one store across projects:

  1. `npx @dotworld/shadow-canary-templates@latest copy . --force` (or copy the three `.github/workflows/*.yml` manually).
  2. Add a GitHub repo secret `SHADOW_CANARY_KEY` with the same value as the `SHADOW_CANARY_KEY` env var in Vercel (e.g. `shadow-configuration-stargaze`).
  3. Re-run the workflows.

  Single-tenant setups (one store per project, default key) need no changes — the fallback keeps working.
