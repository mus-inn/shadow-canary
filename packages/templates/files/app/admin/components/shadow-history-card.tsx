'use client';

import { SHADOW_HISTORY_CAP } from '../constants/config';
import type { ShadowHistoryEntry } from '../types/dashboard';
import { DeployRow } from './deploy-row';

type Props = {
  entries: ShadowHistoryEntry[];
  currentShadowUrl?: string;
  pendingAction: string | null;
  disabled: boolean;
  onRollback: (entry: ShadowHistoryEntry) => void;
  now: number | null;
};

export function ShadowHistoryCard({
  entries,
  currentShadowUrl,
  pendingAction,
  disabled,
  onRollback,
  now,
}: Props) {
  return (
    <section className="adm-card">
      <div className="adm-card-header">
        <h2 className="adm-card-title">Shadow deploys récents</h2>
        <span
          style={{
            fontSize: '0.72rem',
            opacity: 0.4,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {entries.length} / {SHADOW_HISTORY_CAP}
        </span>
      </div>
      <p className="adm-card-hint">
        Les {SHADOW_HISTORY_CAP} derniers deploys de la branche{' '}
        <code>master</code>. Chaque push sur <code>master</code> empile
        l&apos;ancien URL ici avant d&apos;être remplacé. Cliquer « Rollback »
        passe <code>deploymentDomainShadow</code> sur ce deploy — pas de
        re-alias de domaine, propagation ≤ 60s.
      </p>
      {entries.length === 0 ? (
        <p style={{ opacity: 0.5, fontSize: '0.9rem', margin: 0 }}>
          Aucun shadow précédent — le premier apparaîtra ici après le prochain
          push sur <code>master</code>.
        </p>
      ) : (
        <ul className="adm-deploys" role="list">
          {entries.map((entry) => (
            <DeployRow
              key={entry.url}
              variant="shadow"
              item={entry}
              isCurrent={Boolean(
                currentShadowUrl && currentShadowUrl === entry.url,
              )}
              disabled={disabled}
              pending={pendingAction === `rollback-shadow-${entry.url}`}
              onRollback={() => onRollback(entry)}
              now={now}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
