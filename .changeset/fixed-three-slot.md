---
'@dotworld/shadow-canary-core': minor
'@dotworld/shadow-canary-templates': minor
'@dotworld/shadow-canary-skill': minor
---

Add an opt-in fixed 3-slot model (nightly / canary / production) alongside the
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
  `production` deploy (holding the public domain) owns the split and rewrites
  to the stable `domainNightly` / `domainCanary`. `routingEnv` /
  `SHADOW_CANARY_ROUTING_ENV` selects which target env runs the split (default
  `production`).
- `ShadowConfig` gains optional fields `domainNightly`, `domainCanary`,
  `trafficNightlyPercent`, `trafficCanaryPercent`, `forceNightlyIPs`. The
  legacy fields are untouched; a project uses one set or the other.

**templates** — new `three-slot/` reference set: `proxy.ts` (slotCanaryProxy),
`deploy-nightly` / `deploy-canary` / `deploy-prod` workflows (plain
`vercel deploy --target=<env>`, no Edge Config writes), and an admin
`rollout` route to edit the two percentages.

**skill** — new `three-slot.md` command doc + topology detection note in
`SKILL.md`.
