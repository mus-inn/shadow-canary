---
'@dotworld/shadow-canary-core': patch
'@dotworld/shadow-canary-templates': patch
'@dotworld/shadow-canary-skill': patch
---

feat(core): auto-wire Vercel Deployment Protection bypass on rewrites

`shadowCanaryMiddleware` now injects `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie: samesitenone` on every shadow / previous-prod rewrite when a bypass secret is available. The token is resolved from `opts.bypassToken` (new option), falling back to the `VERCEL_AUTOMATION_BYPASS_SECRET` env var — which Vercel auto-injects when "Protection Bypass for Automation" is enabled.

Before this patch, rewrites to shadow / previous-prod deployment URLs were blocked by Deployment Protection (password / SSO), forcing every consumer project to copy the wiring into its own middleware. Protected projects now work out of the box with zero caller config.

Pass `bypassToken: ''` to explicitly opt out of auto-detection.
