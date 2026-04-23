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
| `ADMIN_USER` | Session auth | Admin login (default: `admin`) |
| `ADMIN_PASS` | Session auth | Admin login (default: `12345`) |
| `ADMIN_SESSION_SECRET` | HMAC signing | Session tokens |

## License

MIT
