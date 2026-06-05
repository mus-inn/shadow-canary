'use client';

import { useCallback, useReducer } from 'react';
import type { Deployment, ShadowConfig } from '@/lib/admin-vercel';
import { adminApi } from '../api/admin-client';
import type {
  BucketInfoMap,
  DashboardProps,
  ShadowHistoryEntry,
} from '../types/dashboard';

export type DashboardDataState = {
  config: ShadowConfig | null;
  deployments: Deployment[];
  bucketInfo: BucketInfoMap | null;
  shadowHistory: ShadowHistoryEntry[];
  error: string | null;
  refreshing: boolean;
};

type RefreshResult = Partial<
  Pick<
    DashboardDataState,
    'config' | 'deployments' | 'bucketInfo' | 'shadowHistory'
  >
> & { error: string | null };

export type DashboardDataAction =
  | { type: 'refresh/start' }
  | { type: 'refresh/end'; result: RefreshResult };

export function dashboardReducer(
  state: DashboardDataState,
  action: DashboardDataAction,
): DashboardDataState {
  switch (action.type) {
    case 'refresh/start':
      return { ...state, refreshing: true };
    case 'refresh/end':
      return { ...state, ...action.result, refreshing: false };
  }
}

export function useDashboardState(initial: DashboardProps['initial']): {
  state: DashboardDataState;
  refresh: () => Promise<void>;
} {
  const [state, dispatch] = useReducer(dashboardReducer, undefined, () => ({
    config: initial.config,
    deployments: initial.deployments,
    bucketInfo: null,
    shadowHistory: [],
    error: initial.error,
    refreshing: false,
  }));

  const refresh = useCallback(async () => {
    dispatch({ type: 'refresh/start' });
    const [stateRes, deployRes, bucketRes, historyRes] =
      await Promise.allSettled([
        adminApi.fetchState(),
        adminApi.fetchDeployments(),
        adminApi.fetchBucketInfo(),
        adminApi.fetchShadowHistory(),
      ]);

    const result: RefreshResult = { error: null };
    if (stateRes.status === 'fulfilled') result.config = stateRes.value.config;
    if (deployRes.status === 'fulfilled')
      result.deployments = deployRes.value.deployments;
    if (bucketRes.status === 'fulfilled') result.bucketInfo = bucketRes.value;
    if (historyRes.status === 'fulfilled')
      result.shadowHistory = historyRes.value.entries ?? [];

    const firstFailed = [stateRes, deployRes, bucketRes, historyRes].find(
      (r) => r.status === 'rejected',
    );
    if (firstFailed?.status === 'rejected') {
      const reason = firstFailed.reason;
      result.error =
        reason instanceof Error ? reason.message : 'refresh failed';
    }

    dispatch({ type: 'refresh/end', result });
  }, []);

  return { state, refresh };
}
