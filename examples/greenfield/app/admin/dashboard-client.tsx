'use client';

import { useCallback, useState } from 'react';
import { BucketForcer } from './bucket-forcer';
import { PhasesDiagram } from './phases-diagram';
import { STEP_DEFAULT } from './constants/config';
import type { DashboardProps } from './types/dashboard';
import { CLOSED_MODAL, type ModalState } from './types/modal';
import { deriveStatus, isCanaryLive, statusToPhase } from './utils/status';
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
import { CanaryModals } from './components/canary-modals';
import { ShadowPercentCard } from './components/shadow-percent-card';
import { ShadowHistoryCard } from './components/shadow-history-card';
import { DeploymentsCard } from './components/deployments-card';

export function AdminDashboard({ initial }: DashboardProps) {
  const { state, refresh } = useDashboardState(initial);
  const { config, deployments, bucketInfo, shadowHistory, error, refreshing } =
    state;

  const [modal, setModal] = useState<ModalState>(CLOSED_MODAL);
  const [stepInput, setStepInput] = useState<string>(String(STEP_DEFAULT));

  const closeModal = useCallback(() => setModal(CLOSED_MODAL), []);

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

      <CanaryModals
        modal={modal}
        canaryPct={canaryPct}
        currentShadowUrl={config?.deploymentDomainShadow}
        pendingAction={pendingAction}
        onClose={closeModal}
        onConfirmCancel={() => void run('cancel', adminApi.cancel)}
        onConfirmPromote={() => void run('promote', adminApi.promote)}
        onConfirmRollback={(deploy) => {
          const deploymentUrl = deploy.url.startsWith('http')
            ? deploy.url
            : `https://${deploy.url}`;
          void run(`rollback-${deploy.uid}`, () =>
            adminApi.rollback(deploy.uid, deploymentUrl),
          );
        }}
        onConfirmRollbackShadow={(target) =>
          void run(`rollback-shadow-${target.url}`, () =>
            adminApi.rollbackShadow(target.url),
          )
        }
      />
    </>
  );
}

/* ========================================================================
   Sub-components
   ======================================================================== */

