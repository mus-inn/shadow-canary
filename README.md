# shadow-canary

Shadow-permanent 1% + SLO-gated canary ramp for Next.js on Vercel.

- **`master`** branch → always deployed to a shadow slot receiving 1% of production traffic.
- **`production`** branch → deployed as a canary that ramps 0 → 100 % over ~5 hours, gated by `/api/slo` health checks. Auto-rollback on failure, with sticky sessions tied to the previous deploy so in-flight checkouts finish cleanly.
- Full admin dashboard at `/admin` with pause / resume / cancel / promote / 1-click rollback.
- Operable from Claude Code via a dedicated skill (`/shadow-canary:status`, `/shadow-canary:rollback`, ...).

## Install

**On an existing Next.js project (recommended)** — let Claude Code do it:

```
Install shadow-canary by following https://mus-inn.github.io/shadow-canary/llms-install.md
```

Or read [docs/install/via-claude-code](https://mus-inn.github.io/shadow-canary/install/via-claude-code/).

**Greenfield** — use [this repo as a GitHub template](https://github.com/mus-inn/shadow-canary/generate) or clone `examples/greenfield`.

**Manual install** — follow [docs/install/migration-manual](https://mus-inn.github.io/shadow-canary/install/migration-manual/).

## Packages

| Package | Purpose |
|---|---|
| [`@dotworld/shadow-canary-core`](./packages/core) | Runtime: middleware composer, Edge Config helpers, Vercel API, HMAC session. |
| [`@dotworld/shadow-canary-templates`](./packages/templates) | File payload copied into target projects. |
| [`@dotworld/shadow-canary-skill`](./packages/skill) | Claude Code skill (slash commands) for operating the canary. |

## Documentation

<https://mus-inn.github.io/shadow-canary/>

## License

MIT
