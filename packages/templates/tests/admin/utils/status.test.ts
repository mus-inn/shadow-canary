import { describe, expect, it } from 'vitest';
import type { ShadowConfig } from '@dotworld/shadow-canary-core';
import {
  deriveStatus,
  isCanaryLive,
  statusToPhase,
} from '../../../files/app/admin/utils/status';

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

describe('deriveStatus', () => {
  it("returns 'unknown' when config is null", () => {
    expect(deriveStatus(null)).toBe('unknown');
  });

  it("returns 'stable' at 100% with no previous", () => {
    expect(deriveStatus(cfg({ trafficProdCanaryPercent: 100 }))).toBe('stable');
  });

  it("returns 'complete-sticky' at 100% when previous is still set", () => {
    expect(
      deriveStatus(
        cfg({
          trafficProdCanaryPercent: 100,
          deploymentDomainProdPrevious: 'old.example.com',
        }),
      ),
    ).toBe('complete-sticky');
  });

  it("returns 'paused' when canaryPaused even mid-ramp", () => {
    expect(
      deriveStatus(
        cfg({
          trafficProdCanaryPercent: 40,
          canaryPaused: true,
          deploymentDomainProdPrevious: 'old.example.com',
        }),
      ),
    ).toBe('paused');
  });

  it("returns 'starting' at 0% with previous and not paused", () => {
    expect(
      deriveStatus(
        cfg({
          trafficProdCanaryPercent: 0,
          deploymentDomainProdPrevious: 'old.example.com',
        }),
      ),
    ).toBe('starting');
  });

  it("returns 'ramping' between 0 and 100 with previous", () => {
    expect(
      deriveStatus(
        cfg({
          trafficProdCanaryPercent: 25,
          deploymentDomainProdPrevious: 'old.example.com',
        }),
      ),
    ).toBe('ramping');
  });
});

describe('statusToPhase', () => {
  it('maps each status to its phase index', () => {
    expect(statusToPhase('stable')).toBe(0);
    expect(statusToPhase('unknown')).toBe(0);
    expect(statusToPhase('starting')).toBe(2);
    expect(statusToPhase('ramping')).toBe(3);
    expect(statusToPhase('paused')).toBe(3);
    expect(statusToPhase('complete-sticky')).toBe(4);
  });
});

describe('isCanaryLive', () => {
  it('is true while the canary is in flight', () => {
    expect(isCanaryLive('ramping')).toBe(true);
    expect(isCanaryLive('starting')).toBe(true);
    expect(isCanaryLive('paused')).toBe(true);
  });

  it('is false outside the in-flight statuses', () => {
    expect(isCanaryLive('stable')).toBe(false);
    expect(isCanaryLive('complete-sticky')).toBe(false);
    expect(isCanaryLive('unknown')).toBe(false);
  });
});
