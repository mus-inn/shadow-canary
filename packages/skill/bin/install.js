#!/usr/bin/env node
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_SRC = resolve(__dirname, '..', 'skills', 'shadow-canary');
const targetDir = join(homedir(), '.claude', 'skills', 'shadow-canary');

if (existsSync(targetDir) && !process.argv.includes('--force')) {
  console.error(`Skill already installed at ${targetDir}. Use --force to reinstall.`);
  process.exit(1);
}

await mkdir(dirname(targetDir), { recursive: true });
await cp(SKILLS_SRC, targetDir, { recursive: true, force: true });
console.log(`Installed shadow-canary skill to ${targetDir}`);
console.log(`Now available in Claude Code as /shadow-canary:<command>`);
console.log('Try: /shadow-canary:status');
