import { describe, expect, it } from 'vitest';
import type { ShadowConfig } from '@dotworld/shadow-canary-core';
import {
  dashboardReducer,
  type DashboardDataState,
} from '../../../files/app/admin/hooks/use-dashboard-state';

const cfg = { trafficProdCanaryPercent: 50 } as ShadowConfig;

function base(): DashboardDataState {
  return {
    config: null,
    deployments: [],
    bucketInfo: null,
    shadowHistory: [],
    error: null,
    refreshing: false,
  };
}

describe('dashboardReducer', () => {
  it('refresh/start flips refreshing without dropping data', () => {
    const next = dashboardReducer(
      { ...base(), config: cfg, error: 'stale' },
      { type: 'refresh/start' },
    );
    expect(next.refreshing).toBe(true);
    expect(next.config).toBe(cfg);
    expect(next.error).toBe('stale');
  });

  it('refresh/end merges the partial payload + clears refreshing', () => {
    const next = dashboardReducer(
      { ...base(), refreshing: true },
      {
        type: 'refresh/end',
        result: {
          config: cfg,
          deployments: [{ uid: 'dpl_1' } as never],
          error: null,
        },
      },
    );
    expect(next.refreshing).toBe(false);
    expect(next.config).toBe(cfg);
    expect(next.deployments).toEqual([{ uid: 'dpl_1' }]);
    expect(next.error).toBeNull();
  });

  it('refresh/end keeps previous data for endpoints that failed (partial payload)', () => {
    const next = dashboardReducer(
      {
        ...base(),
        config: cfg,
        deployments: [{ uid: 'old' } as never],
        refreshing: true,
      },
      {
        type: 'refresh/end',
        result: {
          deployments: [{ uid: 'new' } as never],
          error: 'state fetch failed',
        },
      },
    );
    expect(next.config).toBe(cfg);
    expect(next.deployments).toEqual([{ uid: 'new' }]);
    expect(next.error).toBe('state fetch failed');
    expect(next.refreshing).toBe(false);
  });
});
