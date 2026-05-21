'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Deployment } from '@/lib/admin-vercel';
import { BucketForcer } from './bucket-forcer';
import { ConfirmModal } from './confirm-modal';
import { PhasesDiagram } from './phases-diagram';
import { STEP_DEFAULT } from './constants/config';
import { STATUS_LABEL } from './constants/labels';
import type {
  BucketInfo,
  DashboardProps,
  Segment,
  ShadowHistoryEntry,
  SloCheck,
  Status,
} from './types/dashboard';
import type { ModalState } from './types/modal';
import { deriveStatus, isCanaryLive, statusToPhase } from './utils/status';
import { firstLine, prettyTimeAgo, shortHost } from './utils/format';
import { parisHour, phaseLabel } from './utils/time';
import { computeTrafficShares } from './utils/traffic';
import { computeTiming } from './utils/timing';
import { adminApi } from './api/admin-client';
import { useWallClock } from './hooks/use-wall-clock';
import { usePollRefresh } from './hooks/use-poll-refresh';
import { useDashboardState } from './hooks/use-dashboard-state';
import { useActionRunner } from './hooks/use-action-runner';
import { StateBanners } from './components/state-banners';
import { SloLogCard } from './components/slo-log-card';
import { CanaryStateCard } from './components/canary-state-card';
import { ShadowPercentCard } from './components/shadow-percent-card';
import { ShadowHistoryCard } from './components/shadow-history-card';
import { DeploymentsCard } from './components/deployments-card';

export function AdminDashboard({ initial }: DashboardProps) {
  const { state, refresh } = useDashboardState(initial);
  const { config, deployments, bucketInfo, shadowHistory, error, refreshing } =
    state;

  const [modal, setModal] = useState<ModalState>(null);
  const [stepInput, setStepInput] = useState<string>(String(STEP_DEFAULT));

  const closeModal = useCallback(() => setModal(null), []);

  const { pendingAction, actionError, run } = useActionRunner({
    onSuccess: useCallback(async () => {
      await refresh();
      closeModal();
    }, [refresh, closeModal]),
  });

  usePollRefresh(refresh);
  const now = useWallClock();

  const status = deriveStatus(config);
  const shares = computeTrafficShares(config);
  const { canaryPct } = shares;
  const prevHost = config?.deploymentDomainProdPrevious;
  const prodHost = config?.deploymentDomainProd;
  const shadowHost = config?.deploymentDomainShadow;

  const canaryLive = isCanaryLive(status);
  const { elapsed, msToNext, overdue: nextCheckOverdue } = computeTiming(
    config,
    now,
  );
  const hour = now !== null ? parisHour(now) : null;
  const activePhase = statusToPhase(status);

  const isBusy = pendingAction !== null;

  return (
    <>
      <div className="adm-stack">
        <StateBanners error={error} actionError={actionError} />

        {/* ---------- Canary state ---------- */}
        <CanaryStateCard
          status={status}
          shares={shares}
          canaryLive={canaryLive}
          canaryPaused={Boolean(config?.canaryPaused)}
          prodHost={prodHost}
          prevHost={prevHost}
          shadowHost={shadowHost}
          bucketInfo={bucketInfo}
          elapsed={elapsed}
          msToNext={msToNext}
          overdue={nextCheckOverdue}
          phase={hour !== null ? phaseLabel(hour) : null}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          isBusy={isBusy}
          pendingAction={pendingAction}
          onPause={() => void run('pause', adminApi.pause)}
          onResume={() => void run('resume', adminApi.resume)}
          onCancel={() => setModal({ kind: 'cancel' })}
          onStepBack={(step) =>
            void run('step-back', () => adminApi.stepBack(step))
          }
          onStepForward={(step) =>
            void run('step-forward', () => adminApi.stepForward(step))
          }
          onPromote={() => setModal({ kind: 'promote' })}
          stepInput={stepInput}
          setStepInput={setStepInput}
        />

        {/* ---------- SLO check log ---------- */}
        <SloLogCard checks={config?.sloChecks ?? []} now={now} />

        {/* ---------- Bucket forcer (dev test aid) ---------- */}
        <BucketForcer />

        {/* ---------- Shadow percent ---------- */}
        <ShadowPercentCard
          current={shares.shadowPct}
          pending={pendingAction === 'shadow-percent'}
          disabled={isBusy}
          onSave={(value) =>
            void run('shadow-percent', () => adminApi.setShadowPercent(value))
          }
        />

        {/* ---------- Shadow history ---------- */}
        <ShadowHistoryCard
          entries={shadowHistory}
          currentShadowUrl={config?.deploymentDomainShadow}
          pendingAction={pendingAction}
          disabled={isBusy}
          onRollback={(entry) =>
            setModal({ kind: 'rollback-shadow', target: entry })
          }
          now={now}
        />

        {/* ---------- Phases diagram ---------- */}
        <PhasesDiagram activePhase={activePhase} />

        {/* ---------- Deployments ---------- */}
        <DeploymentsCard
          deployments={deployments}
          prodHost={prodHost}
          pendingAction={pendingAction}
          disabled={isBusy}
          onRollback={(deploy) => setModal({ kind: 'rollback', deploy })}
          now={now}
        />
      </div>

      {/* ---------- Modals ---------- */}
      <ConfirmModal
        open={modal?.kind === 'cancel'}
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
        onClose={closeModal}
        onConfirm={() => void run('cancel', adminApi.cancel)}
      />

      <ConfirmModal
        open={modal?.kind === 'promote'}
        tone="warn"
        title="Promote à 100% maintenant ?"
        body={
          <>
            <p style={{ margin: '0 0 10px' }}>
              Skip la rampe restante (<code>{canaryPct}%</code> → <code>100%</code>) et
              le gate SLO. Les nouveaux visiteurs iront directement sur new prod.
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
        onClose={closeModal}
        onConfirm={() => void run('promote', adminApi.promote)}
      />

      <ConfirmModal
        open={modal?.kind === 'rollback'}
        tone="danger"
        title="Rollback sur ce deploy ?"
        body={
          modal?.kind === 'rollback' ? (
            <>
              <p style={{ margin: '0 0 10px' }}>
                Re-alias le custom domain sur{' '}
                <code>{shortHost(modal.deploy.url)}</code> (
                <code>
                  {modal.deploy.meta?.githubCommitSha?.slice(0, 7) ?? '—'}
                </code>
                ). L&apos;Edge Config passe à 100% sur ce deploy et{' '}
                <code>deploymentDomainProdPrevious</code> est nettoyé.
              </p>
              <p style={{ margin: 0 }}>
                Toute session sticky en cours sera recalculée au prochain
                request. À n&apos;utiliser que si la prod actuelle est cassée.
              </p>
            </>
          ) : null
        }
        confirmPhrase={
          modal?.kind === 'rollback'
            ? (modal.deploy.meta?.githubCommitSha?.slice(0, 7) ?? 'rollback')
            : undefined
        }
        confirmLabel="Rollback"
        pending={
          modal?.kind === 'rollback' &&
          pendingAction === `rollback-${modal.deploy.uid}`
        }
        onClose={closeModal}
        onConfirm={() => {
          if (modal?.kind !== 'rollback') return;
          const d = modal.deploy;
          const deploymentUrl = d.url.startsWith('http')
            ? d.url
            : `https://${d.url}`;
          void run(`rollback-${d.uid}`, () =>
            adminApi.rollback(d.uid, deploymentUrl),
          );
        }}
      />

      <ConfirmModal
        open={modal?.kind === 'rollback-shadow'}
        tone="warn"
        title="Rollback shadow vers ce deploy ?"
        body={
          modal?.kind === 'rollback-shadow' ? (
            <>
              <p style={{ margin: '0 0 10px' }}>
                Passe <code>deploymentDomainShadow</code> sur{' '}
                <code>{shortHost(modal.target.url)}</code>
                {modal.target.sha && (
                  <>
                    {' '}
                    (<code>{modal.target.sha.slice(0, 7)}</code>)
                  </>
                )}
                . L&apos;ancien shadow (
                <code>{shortHost(config?.deploymentDomainShadow)}</code>)
                remonte en tête d&apos;historique, donc tu pourras y revenir
                si besoin.
              </p>
              <p style={{ margin: 0 }}>
                Pas de re-alias de domaine (contrairement au rollback prod) —
                le shadow est adressé directement par URL dans le middleware.
                Propagation en ≤ 60s (TTL cache Edge Config).
              </p>
            </>
          ) : null
        }
        confirmPhrase={
          modal?.kind === 'rollback-shadow'
            ? (modal.target.sha?.slice(0, 7) ?? 'rollback-shadow')
            : undefined
        }
        confirmLabel="Rollback shadow"
        pending={
          modal?.kind === 'rollback-shadow' &&
          pendingAction === `rollback-shadow-${modal.target.url}`
        }
        onClose={closeModal}
        onConfirm={() => {
          if (modal?.kind !== 'rollback-shadow') return;
          void run(`rollback-shadow-${modal.target.url}`, () =>
            adminApi.rollbackShadow(modal.target.url),
          );
        }}
      />
    </>
  );
}

/* ========================================================================
   Sub-components
   ======================================================================== */

