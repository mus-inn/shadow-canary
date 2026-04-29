#!/usr/bin/env node
import { cp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILES_DIR = resolve(__dirname, '..', 'files');
const dest = resolve(process.argv[2] ?? '.');
const force = process.argv.includes('--force');

const manifest = JSON.parse(await readFile(resolve(__dirname, '..', 'manifest.json'), 'utf8'));
console.log(`shadow-canary templates v${manifest.version} → ${dest}`);

// Next.js 16 (Oct 2025) renamed `middleware.ts` → `proxy.ts`. If the host
// project already uses the v16 convention, do NOT write our legacy
// `middleware.ts` — the user is expected to compose `shadowCanaryProxy` into
// their existing `proxy.ts`. Both files coexisting on v16 is technically
// allowed but confusing (different runtimes: middleware=Edge, proxy=Node)
// and wastes the lib's main entry point ergonomics.
const NEXTJS16_PROXY_PATHS = [
  'proxy.ts', 'proxy.tsx', 'proxy.js', 'proxy.mjs', 'proxy.cjs', 'proxy.mts',
  'src/proxy.ts', 'src/proxy.tsx', 'src/proxy.js', 'src/proxy.mjs', 'src/proxy.cjs', 'src/proxy.mts',
];
const detectedProxy = NEXTJS16_PROXY_PATHS.find((p) => existsSync(join(dest, p)));

let files = manifest.files;
if (detectedProxy) {
  const before = files.length;
  files = files.filter((f) => f !== 'middleware.ts');
  if (files.length < before) {
    console.log(`  detect  Next.js 16 ${detectedProxy} — skipping middleware.ts`);
    console.log(`          compose shadowCanaryProxy into your existing ${detectedProxy}:`);
    console.log(`          https://mus-inn.github.io/shadow-canary/install/migration-manual/#nextjs-16-proxyts`);
    if (existsSync(join(dest, 'middleware.ts'))) {
      console.log(`  warn    middleware.ts also exists — safe to delete (your ${detectedProxy} owns routing now)`);
    }
  }
}

let wrote = 0, skipped = 0;
for (const file of files) {
  const from = join(FILES_DIR, file);
  const to = join(dest, file);
  if (existsSync(to) && !force) {
    console.log(`  skip    ${file} (exists, use --force to overwrite)`);
    skipped++;
    continue;
  }
  await cp(from, to, { recursive: true });
  console.log(`  write   ${file}`);
  wrote++;
}
console.log(`Done: ${wrote} written, ${skipped} skipped.`);
if (skipped > 0) console.log('Re-run with --force to overwrite skipped files.');
