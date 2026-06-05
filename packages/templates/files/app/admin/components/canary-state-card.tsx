'use client';

import type { BucketInfoMap, Status } from '../types/dashboard';
import type { TrafficShares } from '../utils/traffic';
import { buildTrafficSegments } from '../utils/segments';
import { StatusLine } from './status-line';
import { TimingLine } from './timing-line';
import { TrafficBar } from './traffic-bar';
import { CanaryActions } from './canary-actions';
import { CanaryManualControls } from './canary-manual-controls';

type Props = {
  // status / data
  status: Status;
  shares: TrafficShares;
  canaryLive: boolean;
  canaryPaused: boolean;
  prodHost: string | undefined;
  prevHost: string | undefined;
  shadowHost: string | undefined;
  bucketInfo: BucketInfoMap | null;

  // timing
  elapsed: number | null;
  msToNext: number | null;
  overdue: boolean;
  phase: string | null;

  // refresh
  refreshing: boolean;
  onRefresh: () => void;

  // action state
  isBusy: boolean;
  pendingAction: string | null;

  // canary action handlers
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onStepBack: (step: number) => void;
  onStepForward: (step: number) => void;
  onPromote: () => void;

  // manual step input
  stepInput: string;
  setStepInput: (value: string) => void;
};

export function CanaryStateCard({
  status,
  shares,
  canaryLive,
  canaryPaused,
  prodHost,
  prevHost,
  shadowHost,
  bucketInfo,
  elapsed,
  msToNext,
  overdue,
  phase,
  refreshing,
  onRefresh,
  isBusy,
  pendingAction,
  onPause,
  onResume,
  onCancel,
  onStepBack,
  onStepForward,
  onPromote,
  stepInput,
  setStepInput,
}: Props) {
  const segments = buildTrafficSegments({
    shares,
    status,
    canaryLive,
    prodHost,
    prevHost,
    shadowHost,
    bucketInfo,
  });

  return (
    <section className="adm-card adm-card--emphasis">
      <div className="adm-card-header">
        <h2 className="adm-card-title">État du canary</h2>
        <button
          type="button"
          className="adm-refresh"
          onClick={onRefresh}
          aria-label="Rafraîchir"
        >
          {refreshing ? (
            <span className="adm-refresh-spin" aria-hidden="true" />
          ) : null}
          {refreshing ? 'Sync…' : 'Refresh'}
        </button>
      </div>

      <StatusLine status={status} pct={shares.canaryPct} />
      <TimingLine
        canaryLive={canaryLive}
        status={status}
        elapsed={elapsed}
        msToNext={msToNext}
        overdue={overdue}
        phase={phase}
      />

      <div className="adm-bar-wrap">
        <TrafficBar segments={segments} />
      </div>

      <CanaryActions
        status={status}
        isBusy={isBusy}
        canaryPaused={canaryPaused}
        hasPrev={Boolean(prevHost)}
        pendingAction={pendingAction}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />

      <CanaryManualControls
        stepInput={stepInput}
        setStepInput={setStepInput}
        canaryPct={shares.canaryPct}
        hasPrev={Boolean(prevHost)}
        isBusy={isBusy}
        pendingAction={pendingAction}
        onStepBack={onStepBack}
        onStepForward={onStepForward}
        onPromote={onPromote}
      />
    </section>
  );
}
