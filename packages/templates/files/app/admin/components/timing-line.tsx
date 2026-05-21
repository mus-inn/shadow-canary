'use client';

import type { ReactNode } from 'react';
import type { Status } from '../types/dashboard';
import { formatDuration } from '../utils/format';

type Props = {
  canaryLive: boolean;
  status: Status;
  elapsed: number | null;
  msToNext: number | null;
  overdue: boolean;
  phase: string | null;
};

export function TimingLine({
  canaryLive,
  status,
  elapsed,
  msToNext,
  overdue,
  phase,
}: Props) {
  const items: ReactNode[] = [];
  if (phase !== null) items.push(phase);
  if (elapsed !== null) {
    items.push(<>Démarré il y a {formatDuration(elapsed)}</>);
  }
  if ((status === 'ramping' || status === 'starting') && msToNext !== null) {
    items.push(
      overdue ? (
        <>
          Check attendu{' '}
          <span className="adm-timing-countdown adm-timing-countdown--overdue">
            il y a {formatDuration(-msToNext)}
          </span>
        </>
      ) : (
        <>
          Prochain check dans{' '}
          <span className="adm-timing-countdown">
            {formatDuration(msToNext)}
          </span>
        </>
      ),
    );
  } else if (status === 'paused') {
    items.push(<>Pause · cron skippé</>);
  }

  if (items.length === 0) return null;
  if (items.length === 1 && status === 'stable') return null;

  return (
    <div className="adm-timing">
      <div className="adm-timing-row">
        {items.map((x, i) => (
          <span key={i}>
            {i > 0 && <span className="adm-timing-sep"> · </span>}
            {x}
          </span>
        ))}
      </div>
      {canaryLive && status === 'ramping' && (
        <div className="adm-timing-note">
          Le cron GitHub Actions peut avoir plusieurs minutes de latence.
        </div>
      )}
    </div>
  );
}
