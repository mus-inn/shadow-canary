---
'@dotworld/shadow-canary-templates': patch
---

fix(templates): skip `middleware.ts` when host project uses Next.js 16 `proxy.ts`

The templates installer (`@dotworld/shadow-canary-templates`) previously wrote
`./middleware.ts` unconditionally. On Next.js 16 host projects that already
follow the v16 convention (`./proxy.ts` or `./src/proxy.ts`), this left both
files coexisting — `middleware.ts` (Edge runtime, deprecated on v16) and
`proxy.ts` (Node runtime). Both run, in different runtimes, with no clear
ownership of the routing concern.

The installer now detects the v16 file convention before copying. When any of
`./proxy.ts`, `./src/proxy.ts`, `./proxy.js`, or `./src/proxy.js` exists in
the destination, `middleware.ts` is filtered out of the manifest and a hint
is printed pointing at the manual migration doc:

```
detect  Next.js 16 src/proxy.ts — skipping middleware.ts
        compose shadowCanaryProxy into your existing src/proxy.ts:
        https://mus-inn.github.io/shadow-canary/install/migration-manual/#nextjs-16-proxyts
```

The user is then expected to compose `shadowCanaryProxy` (the v16 alias added
in v0.7.0) into their existing `proxy.ts`. v15 projects and fresh
installations are unaffected — `middleware.ts` is still written when no
`proxy.ts` is detected.
