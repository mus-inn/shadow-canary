'use client';

import type { Deployment } from '@/lib/admin-vercel';
import { DeployRow } from './deploy-row';

type Props = {
  deployments: Deployment[];
  prodHost: string | undefined;
  pendingAction: string | null;
  disabled: boolean;
  onRollback: (deployment: Deployment) => void;
  now: number | null;
};

export function DeploymentsCard({
  deployments,
  prodHost,
  pendingAction,
  disabled,
  onRollback,
  now,
}: Props) {
  return (
    <section className="adm-card">
      <div className="adm-card-header">
        <h2 className="adm-card-title">Deploys production récents</h2>
        <span
          style={{
            fontSize: '0.72rem',
            opacity: 0.4,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {deployments.length}
        </span>
      </div>
      <p className="adm-card-hint">
        Les 20 derniers deploys de la branche <code>production</code>. Cliquer
        « Rollback » re-alias le custom domain sur ce deploy et remet{' '}
        <code>trafficProdCanaryPercent</code> à 100 — les sessions sticky
        continuent sur leur deploy assigné jusqu&apos;à expiration.
      </p>
      {deployments.length === 0 ? (
        <p style={{ opacity: 0.5, fontSize: '0.9rem', margin: 0 }}>
          Aucun deploy.
        </p>
      ) : (
        <ul className="adm-deploys" role="list">
          {deployments.map((d) => {
            const isCurrent = Boolean(
              prodHost && d.url && prodHost.includes(d.url),
            );
            return (
              <DeployRow
                key={d.uid}
                variant="prod"
                item={d}
                isCurrent={isCurrent}
                disabled={disabled || isCurrent || d.state !== 'READY'}
                pending={pendingAction === `rollback-${d.uid}`}
                onRollback={() => onRollback(d)}
                now={now}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
