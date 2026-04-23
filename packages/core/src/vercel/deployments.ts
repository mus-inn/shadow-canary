// Server-only. Returns deployments from the `production` branch only.
// The workflows `--prod` both master (shadow slot) and production (real prod),
// so we can't rely on Vercel's target=production filter alone — it'd mix shadow
// deploys in. Pulls a wider window and trims client-side.
import type { Deployment } from '../types.js';

const VERCEL_API_TOKEN = process.env['VERCEL_API_TOKEN'];
const VERCEL_ORG_ID = process.env['VERCEL_ORG_ID'];
const VERCEL_PROJECT_ID = process.env['VERCEL_PROJECT_ID'];

function checkEnv(): string | null {
  const missing: string[] = [];
  if (!VERCEL_API_TOKEN) missing.push('VERCEL_API_TOKEN');
  if (!VERCEL_ORG_ID) missing.push('VERCEL_ORG_ID');
  if (!VERCEL_PROJECT_ID) missing.push('VERCEL_PROJECT_ID');
  return missing.length > 0 ? `Missing env vars: ${missing.join(', ')}` : null;
}

async function vercelFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(path, 'https://api.vercel.com');
  if (VERCEL_ORG_ID && !url.searchParams.has('teamId')) {
    url.searchParams.set('teamId', VERCEL_ORG_ID);
  }
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function listDeployments(limit = 20): Promise<Deployment[]> {
  const err = checkEnv();
  if (err) throw new Error(err);

  const res = await vercelFetch(
    `/v6/deployments?projectId=${VERCEL_PROJECT_ID}&target=production&limit=${limit * 2}`,
  );
  if (!res.ok) throw new Error(`Deployments list failed: ${res.status}`);
  const data = (await res.json()) as { deployments?: Deployment[] };
  const all = data.deployments ?? [];
  return all
    .filter((d) => d.meta?.githubCommitRef === 'production')
    .slice(0, limit);
}
