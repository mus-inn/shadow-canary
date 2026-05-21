import type { Deployment, ShadowConfig } from '@/lib/admin-vercel';

export type Status =
  | 'stable'
  | 'starting'
  | 'ramping'
  | 'paused'
  | 'complete-sticky'
  | 'unknown';

export type BucketInfo = {
  url: string;
  sha: string | null;
  ref: string | null;
  message: string | null;
  createdAt: number | null;
  state: string | null;
} | null;

export type BucketInfoMap = {
  shadow: BucketInfo;
  prodNew: BucketInfo;
  prodPrevious: BucketInfo;
};

export type ShadowHistoryEntry = {
  url: string;
  sha: string | null;
  ref: string | null;
  message: string | null;
  createdAt: number | null;
  state: string | null;
};

export type SloCheck = NonNullable<ShadowConfig['sloChecks']>[number];

export type Segment = {
  label: string;
  widthValue: number;
  displayPct: number;
  displayUnit: string;
  effectiveHint?: string;
  color: string;
  host: string;
  active: boolean;
  info?: BucketInfo;
};

export type DashboardProps = {
  initial: {
    config: ShadowConfig | null;
    deployments: Deployment[];
    error: string | null;
  };
};
