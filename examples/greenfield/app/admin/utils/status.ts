import type { ShadowConfig } from '@/lib/admin-vercel';
import type { Status } from '../types/dashboard';

export function deriveStatus(cfg: ShadowConfig | null): Status {
  if (!cfg) return 'unknown';
  const pct = cfg.trafficProdCanaryPercent ?? 100;
  const hasPrev = Boolean(cfg.deploymentDomainProdPrevious);
  if (pct === 100 && !hasPrev) return 'stable';
  if (pct === 100 && hasPrev) return 'complete-sticky';
  if (cfg.canaryPaused) return 'paused';
  if (pct === 0) return 'starting';
  return 'ramping';
}

export function statusToPhase(s: Status): 0 | 1 | 2 | 3 | 4 {
  if (s === 'starting') return 2;
  if (s === 'ramping' || s === 'paused') return 3;
  if (s === 'complete-sticky') return 4;
  return 0;
}

export function isCanaryLive(s: Status): boolean {
  return s === 'ramping' || s === 'starting' || s === 'paused';
}
