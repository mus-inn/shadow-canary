'use client';

import { STEP_DEFAULT, STEP_MAX, STEP_MIN } from '../constants/config';
import { stepSize } from '../utils/step';
import { ActionButton } from './action-button';

type Props = {
  stepInput: string;
  setStepInput: (value: string) => void;
  canaryPct: number;
  hasPrev: boolean;
  isBusy: boolean;
  pendingAction: string | null;
  onStepBack: (step: number) => void;
  onStepForward: (step: number) => void;
  onPromote: () => void;
};

export function CanaryManualControls({
  stepInput,
  setStepInput,
  canaryPct,
  hasPrev,
  isBusy,
  pendingAction,
  onStepBack,
  onStepForward,
  onPromote,
}: Props) {
  const validStep = stepSize(stepInput);
  const stepLabel = validStep ?? STEP_DEFAULT;
  const stepInvalid = validStep === null;

  return (
    <div className="adm-actions adm-actions--secondary">
      <span className="adm-actions-label">Manuel</span>
      <span className="adm-step-input-wrap">
        <input
          type="number"
          min={STEP_MIN}
          max={STEP_MAX}
          step={1}
          value={stepInput}
          onChange={(e) => setStepInput(e.target.value)}
          aria-label="Taille du pas (en points de %)"
          className="adm-input adm-step-input"
          disabled={isBusy}
        />
      </span>
      <ActionButton
        id="step-back"
        pendingId={pendingAction}
        disabled={isBusy || canaryPct <= 0 || !hasPrev || stepInvalid}
        onClick={() => onStepBack(validStep ?? STEP_DEFAULT)}
      >
        − {stepLabel}% (step back)
      </ActionButton>
      <ActionButton
        id="step-forward"
        pendingId={pendingAction}
        disabled={isBusy || canaryPct >= 100 || !hasPrev || stepInvalid}
        onClick={() => onStepForward(validStep ?? STEP_DEFAULT)}
      >
        + {stepLabel}% (step forward)
      </ActionButton>
      <ActionButton
        id="promote"
        variant="primary"
        pendingId={pendingAction}
        disabled={isBusy || canaryPct >= 100 || !hasPrev}
        onClick={onPromote}
      >
        Promote à 100%
      </ActionButton>
    </div>
  );
}
