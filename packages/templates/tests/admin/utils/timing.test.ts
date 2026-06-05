import { describe, expect, it } from 'vitest';
import type { ShadowConfig } from '@dotworld/shadow-canary-core';
import { computeTiming } from '../../../files/app/admin/utils/timing';

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

describe('computeTiming', () => {
  it('returns null fields when both config and now are missing', () => {
    expect(computeTiming(null, null)).toEqual({
      startedAt: null,
      elapsed: null,
      expectedNextTs: null,
      msToNext: null,
      overdue: false,
    });
  });

  it('falls back to the cron grid when no SLO check has run yet', () => {
    const now = Date.UTC(2026, 4, 21, 10, 7, 0, 0);
    const t = computeTiming(cfg({ canaryStartedAt: new Date(now - 5 * 60_000).toISOString() }), now);
    expect(t.startedAt).toBe(now - 5 * 60_000);
    expect(t.elapsed).toBe(5 * 60_000);
    expect(t.expectedNextTs).toBe(Date.UTC(2026, 4, 21, 10, 15, 0, 0));
    expect(t.msToNext).toBe(8 * 60_000);
    expect(t.overdue).toBe(false);
  });

  it('anchors on the last SLO check + 15min when one exists', () => {
    const now = Date.UTC(2026, 4, 21, 10, 20, 0, 0);
    const lastSloTs = Date.UTC(2026, 4, 21, 10, 3, 0, 0);
    const t = computeTiming(
      cfg({
        sloChecks: [
          {
            ts: new Date(lastSloTs).toISOString(),
            ok: true,
            pctBefore: 10,
            pctAfter: 14,
            codes: [200, 200, 200],
          },
        ] as unknown as ShadowConfig['sloChecks'],
      }),
      now,
    );
    expect(t.expectedNextTs).toBe(lastSloTs + 15 * 60_000);
    expect(t.msToNext).toBe(-2 * 60_000);
    expect(t.overdue).toBe(true);
  });
});
