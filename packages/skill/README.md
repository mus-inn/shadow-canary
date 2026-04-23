# @dotworld/shadow-canary-skill

Claude Code skill for operating the shadow-canary deployment pattern on Next.js + Vercel projects.

## Installation

```bash
npx @dotworld/shadow-canary-skill install
```

Or with force-reinstall:

```bash
npx @dotworld/shadow-canary-skill install --force
```

This copies the skill into `~/.claude/skills/shadow-canary/`. Claude Code auto-discovers it and makes the slash commands available in any project session.

## Slash commands

| Command | Description |
|---|---|
| `/shadow-canary:install` | Install shadow-canary on the current project |
| `/shadow-canary:status` | Show canary state, traffic split, and recent deploys |
| `/shadow-canary:pause` | Pause the canary ramp (cron skips bumps) |
| `/shadow-canary:resume` | Resume the canary ramp |
| `/shadow-canary:promote` | Jump to 100% immediately (confirmation required) |
| `/shadow-canary:cancel` | Revert to previous deploy at 0% (confirmation required) |
| `/shadow-canary:rollback [sha]` | Promote an older production deploy |
| `/shadow-canary:deploy <shadow\|prod> [flags]` | Trigger shadow or prod deploy via git |
| `/shadow-canary:doctor` | Verify installation and configuration |

## Prerequisites

- Claude Code installed (`npm i -g @anthropic-ai/claude-code`)
- A project with shadow-canary installed (run `/shadow-canary:install` to set up)
- `.shadow-canary.json` at the project root (created by the install command)
- `ADMIN_USER`, `ADMIN_PASS` in `.env.local` or environment

## Deploy flags

```
/shadow-canary:deploy prod                # normal canary ramp
/shadow-canary:deploy prod --skip-canary  # jump to 100% on deploy
/shadow-canary:deploy prod --keep-canary  # fix-in-place, no ramp restart
/shadow-canary:deploy shadow              # update shadow (1% mirror)
```

## Links

- [shadow-canary documentation](https://github.com/mus-inn/shadow-canary)
- [llms-install guide](https://raw.githubusercontent.com/mus-inn/shadow-canary/master/llms-install.md)
