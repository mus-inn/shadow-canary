'use client';

import { STATUS_LABEL } from '../constants/labels';
import type { Status } from '../types/dashboard';

type Props = {
  status: Status;
  pct: number;
};

export function StatusLine({ status, pct }: Props) {
  const dotKind = status === 'complete-sticky' ? 'complete' : status;
  return (
    <div className="adm-status">
      <span
        className={`adm-status-dot adm-status-dot--${dotKind}`}
        aria-hidden="true"
      />
      <span className="adm-status-label">{STATUS_LABEL[status]}</span>
      {status !== 'stable' && status !== 'unknown' && (
        <span className="adm-status-pct">{pct}%</span>
      )}
    </div>
  );
}
