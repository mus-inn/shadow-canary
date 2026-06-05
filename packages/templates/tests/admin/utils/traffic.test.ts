import { describe, expect, it } from 'vitest';
import type { ShadowConfig } from '@dotworld/shadow-canary-core';
import { computeTrafficShares } from '../../../files/app/admin/utils/traffic';

function cfg(overrides: Partial<ShadowConfig>): ShadowConfig {
  return {
    deploymentDomainShadow: 'shadow.example.com',
    deploymentDomainProd: 'prod.example.com',
    trafficShadowPercent: 1,
    trafficProdCanaryPercent: 100,
    canaryPaused: false,
    ...overrides,
  } as ShadowConfig;
}

describe('computeTrafficShares', () => {
  it('falls back to 100% canary / 0% shadow when config is null', () => {
    expect(computeTrafficShares(null)).toEqual({
      shadowPct: 0,
      canaryPct: 100,
      totalProdShare: 100,
      newShare: 100,
      prevShare: 0,
      hasPrev: false,
    });
  });

  it('splits the prod traffic between new and previous when canary is mid-ramp', () => {
    const s = computeTrafficShares(
      cfg({
        trafficShadowPercent: 1,
        trafficProdCanaryPercent: 25,
        deploymentDomainProdPrevious: 'old.example.com',
      }),
    );
    expect(s.shadowPct).toBe(1);
    expect(s.canaryPct).toBe(25);
    expect(s.totalProdShare).toBe(99);
    expect(s.newShare).toBeCloseTo(24.75, 4);
    expect(s.prevShare).toBeCloseTo(74.25, 4);
    expect(s.hasPrev).toBe(true);
  });

  it('returns prevShare = 0 when there is no previous deploy', () => {
    const s = computeTrafficShares(
      cfg({
        trafficShadowPercent: 1,
        trafficProdCanaryPercent: 100,
      }),
    );
    expect(s.prevShare).toBe(0);
    expect(s.hasPrev).toBe(false);
  });

  it('clamps to a fully-shadow split when shadow=100', () => {
    const s = computeTrafficShares(
      cfg({
        trafficShadowPercent: 100,
        trafficProdCanaryPercent: 100,
      }),
    );
    expect(s.shadowPct).toBe(100);
    expect(s.totalProdShare).toBe(0);
    expect(s.newShare).toBe(0);
    expect(s.prevShare).toBe(0);
  });
});
