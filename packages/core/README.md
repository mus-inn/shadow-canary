# @dotworld/shadow-canary-core

Runtime primitives for the shadow-canary deployment pattern on Vercel.

Implements permanent 1% shadow traffic (master branch) plus an SLO-gated
canary ramp (0→100%) for Next.js projects, using Vercel Edge Config for
real-time configuration and HMAC-based admin sessions.

## Two entry points

| Import path | Runtime | What it exports |
|---|---|---|
| `@dotworld/shadow-canary-core` | Node.js only | Everything — Vercel REST wrappers, HMAC session helpers, types |
| `@dotworld/shadow-canary-core/edge` | Edge + Node | `getShadowConfig`, `shadowCanaryMiddleware`, types |

## Installation

```bash
pnpm add @dotworld/shadow-canary-core
```

Peer dependencies (already installed in a Next.js project):

```bash
pnpm add next @vercel/edge-config
```

## Usage

### Drop-in middleware (edge entry)

```ts
// middleware.ts
import { shadowCanaryMiddleware } from '@dotworld/shadow-canary-core/edge';
import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|admin|.*\\..*).*)'],
};

export async function middleware(req: NextRequest) {
  const res = await shadowCanaryMiddleware(req);
  return res ?? NextResponse.next();
}
```

### Composing with existing middleware

```ts
// middleware.ts
import { shadowCanaryMiddleware } from '@dotworld/shadow-canary-core/edge';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  // Your existing logic first
  if (req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const res = await shadowCanaryMiddleware(req, {
    cookieName: 'my-bucket',    // default: 'shadow-bucket'
    cookieMaxAge: 3600,         // default: 86400 (24h)
  });
  return res ?? NextResponse.next();
}
```

### Production branch

Both the shadow and current-prod slots are deployed with `vercel deploy --prod`,
which means both get `VERCEL_ENV=production` baked in at build time. The
middleware uses `VERCEL_GIT_COMMIT_REF` (git branch name) as the only runtime
signal to distinguish them — only deploys built from the configured prod
branch actually route traffic.

Default branch name: `'production'` (matches the branch the reference deploy
workflows push to). If your prod branch is `main`, `master`, or anything else,
tell the middleware:

```ts
await shadowCanaryMiddleware(req, {
  productionBranch: 'master', // or 'main', etc.
});
```

Or set the `SHADOW_CANARY_PRODUCTION_BRANCH` env var on Vercel — the middleware
picks it up automatically, no code change needed. Pass `''` (empty string) to
disable the branch filter entirely when you don't follow the 2-branch
shadow-canary topology.

### Vercel Deployment Protection

If your Vercel project has Deployment Protection enabled (password / SSO), the
shadow and previous-prod deployment URLs would block the rewrite. Enable
**"Protection Bypass for Automation"** in the project settings — Vercel
auto-injects the `VERCEL_AUTOMATION_BYPASS_SECRET` env var, which the
middleware picks up automatically and attaches to rewrites as
`x-vercel-protection-bypass` + `x-vercel-set-bypass-cookie: samesitenone`.

Zero caller config required. Override with the `bypassToken` option if you
need a different source, or pass `''` to explicitly disable:

```ts
await shadowCanaryMiddleware(req, {
  bypassToken: process.env.MY_CUSTOM_BYPASS, // default: VERCEL_AUTOMATION_BYPASS_SECRET
});
```

### Reading config from the edge

```ts
import { getShadowConfig } from '@dotworld/shadow-canary-core/edge';

const cfg = await getShadowConfig(); // 60s in-memory TTL cache
console.log(cfg?.trafficShadowPercent); // e.g. 1
```

### Vercel REST API wrappers (node only)

```ts
import {
  readShadowConfig,
  patchShadowConfig,
  listDeployments,
  promoteDeployment,
} from '@dotworld/shadow-canary-core';

// Read current config
const cfg = await readShadowConfig();

// Patch — start a canary at 5%
await patchShadowConfig({
  trafficProdCanaryPercent: 5,
  canaryStartedAt: new Date().toISOString(),
});

// Promote a deployment
const deployments = await listDeployments();
await promoteDeployment(deployments[0].uid);
```

### HMAC admin sessions (node only)

```ts
import {
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@dotworld/shadow-canary-core';

// In a login route handler
if (verifyCredentials(user, pass)) {
  const token = createSessionToken();
  // Set SESSION_COOKIE = token with maxAge SESSION_MAX_AGE
}

// In a protected route
if (!verifySessionToken(token)) {
  return new Response('Unauthorized', { status: 401 });
}
```

## Environment variables

| Variable | Used by | Required |
|---|---|---|
| `EDGE_CONFIG` | `@vercel/edge-config` SDK | Edge Config reads |
| `VERCEL_API_TOKEN` | REST API calls | Admin operations |
| `VERCEL_ORG_ID` | REST API calls | Admin operations |
| `VERCEL_PROJECT_ID` | REST API calls | Deployments / promote |
| `VERCEL_EDGE_CONFIG_ID` | REST API patching | Config writes |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Edge middleware | Rewrites past Deployment Protection (auto-injected by Vercel) |
| `SHADOW_CANARY_PRODUCTION_BRANCH` | Edge middleware | Git branch name of the current-prod slot (default: `production`) |
| `ADMIN_USER` | Session auth | Admin login (default: `admin`) |
| `ADMIN_PASS` | Session auth | Admin login (default: `12345`) |
| `ADMIN_SESSION_SECRET` | HMAC signing | Session tokens |

## License

MIT
