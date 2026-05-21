'use client';

import type { Deployment } from '@/lib/admin-vercel';
import type { ShadowHistoryEntry } from '../types/dashboard';
import type { ModalState } from '../types/modal';
import { shortHost } from '../utils/format';
import { ConfirmModal } from '../confirm-modal';

type Props = {
  modal: ModalState;
  canaryPct: number;
  currentShadowUrl: string | undefined;
  pendingAction: string | null;
  onClose: () => void;
  onConfirmCancel: () => void;
  onConfirmPromote: () => void;
  onConfirmRollback: (deploy: Deployment) => void;
  onConfirmRollbackShadow: (target: ShadowHistoryEntry) => void;
};

export function CanaryModals({
  modal,
  canaryPct,
  currentShadowUrl,
  pendingAction,
  onClose,
  onConfirmCancel,
  onConfirmPromote,
  onConfirmRollback,
  onConfirmRollbackShadow,
}: Props) {
  return (
    <>
      <ConfirmModal
        open={modal.kind === 'cancel'}
        tone="danger"
        title="Annuler le canary en cours ?"
        body={
          <>
            <p style={{ margin: '0 0 10px' }}>
              Met <code>trafficProdCanaryPercent</code> à <code>0</code> et
              active <code>canaryPaused</code>. 100% du trafic prod retombe
              immédiatement sur l&apos;ancien deploy (previous).
            </p>
            <p style={{ margin: 0 }}>
              Le cron n&apos;essaiera plus de progresser tant que tu
              n&apos;auras pas cliqué <strong>Resume</strong>. Action réversible
              mais nécessitera une intervention manuelle.
            </p>
          </>
        }
        confirmPhrase="cancel"
        confirmLabel="Annuler le canary"
        pending={pendingAction === 'cancel'}
        onClose={onClose}
        onConfirm={onConfirmCancel}
      />

      <ConfirmModal
        open={modal.kind === 'promote'}
        tone="warn"
        title="Promote à 100% maintenant ?"
        body={
          <>
            <p style={{ margin: '0 0 10px' }}>
              Skip la rampe restante (<code>{canaryPct}%</code> →{' '}
              <code>100%</code>) et le gate SLO. Les nouveaux visiteurs iront
              directement sur new prod.
            </p>
            <p style={{ margin: 0 }}>
              <code>deploymentDomainProdPrevious</code> reste en Edge Config —
              les sessions sticky <code>prod-previous</code> finiront leur
              parcours sur l&apos;ancien deploy.
            </p>
          </>
        }
        confirmPhrase="promote"
        confirmLabel="Promote à 100%"
        pending={pendingAction === 'promote'}
        onClose={onClose}
        onConfirm={onConfirmPromote}
      />

      {modal.kind === 'rollback' && (
        <RollbackModal
          deploy={modal.deploy}
          pendingAction={pendingAction}
          onClose={onClose}
          onConfirm={() => onConfirmRollback(modal.deploy)}
        />
      )}

      {modal.kind === 'rollback-shadow' && (
        <RollbackShadowModal
          target={modal.target}
          currentShadowUrl={currentShadowUrl}
          pendingAction={pendingAction}
          onClose={onClose}
          onConfirm={() => onConfirmRollbackShadow(modal.target)}
        />
      )}
    </>
  );
}

function RollbackModal({
  deploy,
  pendingAction,
  onClose,
  onConfirm,
}: {
  deploy: Deployment;
  pendingAction: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const sha = deploy.meta?.githubCommitSha?.slice(0, 7) ?? '—';
  return (
    <ConfirmModal
      open
      tone="danger"
      title="Rollback sur ce deploy ?"
      body={
        <>
          <p style={{ margin: '0 0 10px' }}>
            Re-alias le custom domain sur{' '}
            <code>{shortHost(deploy.url)}</code> (<code>{sha}</code>).
            L&apos;Edge Config passe à 100% sur ce deploy et{' '}
            <code>deploymentDomainProdPrevious</code> est nettoyé.
          </p>
          <p style={{ margin: 0 }}>
            Toute session sticky en cours sera recalculée au prochain request.
            À n&apos;utiliser que si la prod actuelle est cassée.
          </p>
        </>
      }
      confirmPhrase={sha !== '—' ? sha : 'rollback'}
      confirmLabel="Rollback"
      pending={pendingAction === `rollback-${deploy.uid}`}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function RollbackShadowModal({
  target,
  currentShadowUrl,
  pendingAction,
  onClose,
  onConfirm,
}: {
  target: ShadowHistoryEntry;
  currentShadowUrl: string | undefined;
  pendingAction: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const sha = target.sha?.slice(0, 7);
  return (
    <ConfirmModal
      open
      tone="warn"
      title="Rollback shadow vers ce deploy ?"
      body={
        <>
          <p style={{ margin: '0 0 10px' }}>
            Passe <code>deploymentDomainShadow</code> sur{' '}
            <code>{shortHost(target.url)}</code>
            {sha && (
              <>
                {' '}
                (<code>{sha}</code>)
              </>
            )}
            . L&apos;ancien shadow (
            <code>{shortHost(currentShadowUrl)}</code>) remonte en tête
            d&apos;historique, donc tu pourras y revenir si besoin.
          </p>
          <p style={{ margin: 0 }}>
            Pas de re-alias de domaine (contrairement au rollback prod) — le
            shadow est adressé directement par URL dans le middleware.
            Propagation en ≤ 60s (TTL cache Edge Config).
          </p>
        </>
      }
      confirmPhrase={sha ?? 'rollback-shadow'}
      confirmLabel="Rollback shadow"
      pending={pendingAction === `rollback-shadow-${target.url}`}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
