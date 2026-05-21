'use client';

import type { Status } from '../types/dashboard';
import { ActionButton } from './action-button';

type Props = {
  status: Status;
  isBusy: boolean;
  canaryPaused: boolean;
  hasPrev: boolean;
  pendingAction: string | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
};

export function CanaryActions({
  status,
  isBusy,
  canaryPaused,
  hasPrev,
  pendingAction,
  onPause,
  onResume,
  onCancel,
}: Props) {
  return (
    <div className="adm-actions">
      <ActionButton
        id="pause"
        pendingId={pendingAction}
        disabled={
          isBusy ||
          status === 'stable' ||
          status === 'paused' ||
          status === 'complete-sticky' ||
          !hasPrev
        }
        onClick={onPause}
      >
        Pause
      </ActionButton>
      <ActionButton
        id="resume"
        pendingId={pendingAction}
        disabled={isBusy || !canaryPaused}
        onClick={onResume}
      >
        Resume
      </ActionButton>
      <ActionButton
        id="cancel"
        variant="danger"
        pendingId={pendingAction}
        disabled={isBusy || status === 'stable' || !hasPrev}
        onClick={onCancel}
      >
        Cancel canary
      </ActionButton>
      <span className="adm-actions-spacer" />
    </div>
  );
}
