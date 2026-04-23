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

let wrote = 0, skipped = 0;
for (const file of manifest.files) {
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
