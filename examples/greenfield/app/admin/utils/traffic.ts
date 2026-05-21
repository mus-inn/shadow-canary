import type { ShadowConfig } from '@/lib/admin-vercel';

export type TrafficShares = {
  shadowPct: number;
  canaryPct: number;
  totalProdShare: number;
  newShare: number;
  prevShare: number;
  hasPrev: boolean;
};

// Derives the traffic split numbers from the live config. All percentages
// are "of total" (shadow + prevShare + newShare ≈ 100). `canaryPct` and
// `shadowPct` mirror the raw knob values; the bar widths use the derived
// shares.
export function computeTrafficShares(cfg: ShadowConfig | null): TrafficShares {
  const canaryPct = cfg?.trafficProdCanaryPercent ?? 100;
  const shadowPct = cfg?.trafficShadowPercent ?? 0;
  const hasPrev = Boolean(cfg?.deploymentDomainProdPrevious);

  const totalProdShare = 100 - shadowPct;
  const newShare = (totalProdShare * canaryPct) / 100;
  const prevShare = hasPrev ? totalProdShare - newShare : 0;

  return { shadowPct, canaryPct, totalProdShare, newShare, prevShare, hasPrev };
}
