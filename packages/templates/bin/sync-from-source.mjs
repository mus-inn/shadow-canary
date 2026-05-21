#!/usr/bin/env node
// Keeps examples/greenfield/ in sync with packages/templates/files/.
// Walks the templates source tree, hashes each file, and compares with
// the matching path under examples/greenfield/. Files present only in
// greenfield (the example app shell) are left untouched.
//
// Usage:
//   node bin/sync-from-source.mjs           copy diverging files into greenfield
//   node bin/sync-from-source.mjs --check   exit 1 if any divergence (CI guard)

import { cp, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILES_DIR = resolve(__dirname, '..', 'files');
const DEST_DIR = resolve(__dirname, '..', '..', '..', 'examples', 'greenfield');

const check = process.argv.includes('--check');

async function hashFile(path) {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex');
  } catch {
    return null;
  }
}

async function* walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const p = join(root, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const srcStat = await stat(FILES_DIR).catch(() => null);
if (!srcStat?.isDirectory()) {
  console.error(`source not found: ${FILES_DIR}`);
  process.exit(2);
}

const diffs = [];
for await (const srcFile of walk(FILES_DIR)) {
  const rel = relative(FILES_DIR, srcFile);
  const dstFile = join(DEST_DIR, rel);
  const sh = await hashFile(srcFile);
  const dh = await hashFile(dstFile);
  if (sh !== dh) diffs.push(rel);
}

if (check) {
  if (diffs.length) {
    console.error('packages/templates/files is out of sync with examples/greenfield:');
    for (const f of diffs) console.error(`  - ${f}`);
    console.error('\nRun: pnpm sync:templates');
    process.exit(1);
  }
  console.log('sync:templates:check OK — examples/greenfield is in sync.');
  process.exit(0);
}

if (!diffs.length) {
  console.log('sync:templates: already in sync.');
  process.exit(0);
}

for (const rel of diffs) {
  await cp(join(FILES_DIR, rel), join(DEST_DIR, rel), { recursive: true });
  console.log(`  sync   ${rel}`);
}
console.log(`sync:templates: ${diffs.length} file(s) synchronized.`);
