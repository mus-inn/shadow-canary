---
'@dotworld/shadow-canary-core': patch
'@dotworld/shadow-canary-templates': patch
'@dotworld/shadow-canary-skill': patch
---

feat: guardrails against the #1 silent-shadow trap

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
