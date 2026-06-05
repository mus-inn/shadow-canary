import type { Deployment, ShadowConfig } from '@/lib/admin-vercel';
import type { BucketInfoMap, ShadowHistoryEntry } from '../types/dashboard';
import { parseJsonError } from './errors';

const NO_STORE: RequestInit = { cache: 'no-store' };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, NO_STORE);
  if (!res.ok) throw await parseJsonError(res);
  return (await res.json()) as T;
}

async function postJson(path: string, body?: object): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseJsonError(res);
}

export const adminApi = {
  // Reads
  fetchState: () => getJson<{ config: ShadowConfig | null }>('/api/admin/state'),
  fetchDeployments: () =>
    getJson<{ deployments: Deployment[] }>('/api/admin/deployments'),
  fetchBucketInfo: () => getJson<BucketInfoMap>('/api/admin/bucket-info'),
  fetchShadowHistory: () =>
    getJson<{ entries: ShadowHistoryEntry[] }>('/api/admin/shadow-history'),

  // Canary control
  pause: () => postJson('/api/admin/canary/pause'),
  resume: () => postJson('/api/admin/canary/resume'),
  cancel: () => postJson('/api/admin/canary/cancel'),
  promote: () => postJson('/api/admin/canary/promote'),
  stepBack: (step: number) => postJson('/api/admin/canary/step-back', { step }),
  stepForward: (step: number) =>
    postJson('/api/admin/canary/step-forward', { step }),

  // Shadow
  setShadowPercent: (value: number) =>
    postJson('/api/admin/shadow-percent', { value }),
  rollbackShadow: (targetUrl: string) =>
    postJson('/api/admin/rollback-shadow', { targetUrl }),

  // Prod rollback
  rollback: (deploymentId: string, deploymentUrl: string) =>
    postJson('/api/admin/rollback', { deploymentId, deploymentUrl }),
} as const;

export type AdminApi = typeof adminApi;
