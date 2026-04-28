---
'@dotworld/shadow-canary-core': minor
'@dotworld/shadow-canary-templates': minor
'@dotworld/shadow-canary-skill': minor
---

feat(core): Next.js 16 `proxy.ts` support via `shadowCanaryProxy` alias

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
import { shadowCanaryProxy } from '@dotworld/shadow-canary-core';

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
