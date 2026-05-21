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
import { firstLine, formatDuration, prettyTimeAgo, shortHost } from './utils/format';
import { parisHour, phaseLabel } from './utils/time';
import { stepSize } from './utils/step';
import { computeTrafficShares } from './utils/traffic';
import { computeTiming } from './utils/timing';
import { adminApi } from './api/admin-client';
import { useWallClock } from './hooks/use-wall-clock';
import { usePollRefresh } from './hooks/use-poll-refresh';
import { useDashboardState } from './hooks/use-dashboard-state';
import { useActionRunner } from './hooks/use-action-runner';

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
  const { canaryPct, shadowPct, newShare, prevShare } =
    computeTrafficShares(config);
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
        {error && (
          <div className="adm-banner adm-banner--error" role="alert">
            <span className="adm-banner-icon">⚠</span>
            <span>Backend : {error}</span>
          </div>
        )}
        {actionError && (
          <div className="adm-banner adm-banner--error" role="alert">
            <span className="adm-banner-icon">⚠</span>
            <span>Action : {actionError}</span>
          </div>
        )}

        {/* ---------- Canary state ---------- */}
        <section className="adm-card adm-card--emphasis">
          <div className="adm-card-header">
            <h2 className="adm-card-title">État du canary</h2>
            <button
              type="button"
              className="adm-refresh"
              onClick={() => void refresh()}
              aria-label="Rafraîchir"
            >
              {refreshing ? (
                <span className="adm-refresh-spin" aria-hidden="true" />
              ) : null}
              {refreshing ? 'Sync…' : 'Refresh'}
            </button>
          </div>

          <StatusLine status={status} pct={canaryPct} />
          <TimingLine
            canaryLive={canaryLive}
            status={status}
            elapsed={elapsed}
            msToNext={msToNext}
            overdue={nextCheckOverdue}
            phase={hour !== null ? phaseLabel(hour) : null}
          />

          <div className="adm-bar-wrap">
            <TrafficBar
              segments={[
                {
                  label: 'shadow (master)',
                  widthValue: shadowPct,
                  displayPct: shadowPct,
                  displayUnit: 'du total',
                  color: '#f97316',
                  host: shortHost(shadowHost),
                  active: true,
                  info: bucketInfo?.shadow,
                },
                ...(prevHost
                  ? [
                      {
                        label: 'previous prod',
                        widthValue: prevShare,
                        displayPct: 100 - canaryPct,
                        displayUnit: 'du prod',
                        // Only surface the "actual traffic share" line when
                        // shadow is consuming enough to push the numbers
                        // apart (≥ 0.5 pt difference). Keeps the legend
                        // clean when shadow is 0.
                        effectiveHint:
                          Math.abs(prevShare - (100 - canaryPct)) >= 0.5
                            ? `${prevShare.toFixed(1)}% du trafic total`
                            : undefined,
                        color: '#6366f1',
                        host: shortHost(prevHost),
                        active: canaryLive,
                        info: bucketInfo?.prodPrevious,
                      },
                    ]
                  : []),
                {
                  label: 'new prod',
                  widthValue: newShare,
                  displayPct: canaryPct,
                  displayUnit: 'du prod',
                  effectiveHint:
                    Math.abs(newShare - canaryPct) >= 0.5
                      ? `${newShare.toFixed(1)}% du trafic total`
                      : undefined,
                  color: '#22c55e',
                  host: shortHost(prodHost),
                  active:
                    status === 'ramping' ||
                    status === 'complete-sticky' ||
                    status === 'stable',
                  info: bucketInfo?.prodNew,
                },
              ]}
            />
          </div>

          <div className="adm-actions">
            <ActionBtn
              id="pause"
              pendingId={pendingAction}
              disabled={
                isBusy ||
                status === 'stable' ||
                status === 'paused' ||
                status === 'complete-sticky' ||
                !prevHost
              }
              onClick={() => void run('pause', adminApi.pause)}
            >
              Pause
            </ActionBtn>
            <ActionBtn
              id="resume"
              pendingId={pendingAction}
              disabled={isBusy || !config?.canaryPaused}
              onClick={() => void run('resume', adminApi.resume)}
            >
              Resume
            </ActionBtn>
            <ActionBtn
              id="cancel"
              variant="danger"
              pendingId={pendingAction}
              disabled={isBusy || status === 'stable' || !prevHost}
              onClick={() => setModal({ kind: 'cancel' })}
            >
              Cancel canary
            </ActionBtn>
            <span className="adm-actions-spacer" />
          </div>

          <div className="adm-actions adm-actions--secondary">
            <span className="adm-actions-label">Manuel</span>
            <span className="adm-step-input-wrap">
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={stepInput}
                onChange={(e) => setStepInput(e.target.value)}
                aria-label="Taille du pas (en points de %)"
                className="adm-input adm-step-input"
                disabled={isBusy}
              />
            </span>
            <ActionBtn
              id="step-back"
              pendingId={pendingAction}
              disabled={
                isBusy ||
                canaryPct <= 0 ||
                !prevHost ||
                !stepSize(stepInput)
              }
              onClick={() =>
                void run('step-back', () =>
                  adminApi.stepBack(stepSize(stepInput) ?? STEP_DEFAULT),
                )
              }
            >
              − {stepSize(stepInput) ?? 4}% (step back)
            </ActionBtn>
            <ActionBtn
              id="step-forward"
              pendingId={pendingAction}
              disabled={
                isBusy ||
                canaryPct >= 100 ||
                !prevHost ||
                !stepSize(stepInput)
              }
              onClick={() =>
                void run('step-forward', () =>
                  adminApi.stepForward(stepSize(stepInput) ?? STEP_DEFAULT),
                )
              }
            >
              + {stepSize(stepInput) ?? 4}% (step forward)
            </ActionBtn>
            <ActionBtn
              id="promote"
              variant="primary"
              pendingId={pendingAction}
              disabled={isBusy || canaryPct >= 100 || !prevHost}
              onClick={() => setModal({ kind: 'promote' })}
            >
              Promote à 100%
            </ActionBtn>
          </div>
        </section>

        {/* ---------- SLO check log ---------- */}
        <SloLog checks={config?.sloChecks ?? []} now={now} />

        {/* ---------- Bucket forcer (dev test aid) ---------- */}
        <BucketForcer />

        {/* ---------- Shadow percent ---------- */}
        <ShadowPercentCard
          current={shadowPct}
          pending={pendingAction === 'shadow-percent'}
          disabled={isBusy}
          onSave={(value) =>
            void run('shadow-percent', () => adminApi.setShadowPercent(value))
          }
        />

        {/* ---------- Shadow history ---------- */}
        <ShadowHistorySection
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
            Les 20 derniers deploys de la branche <code>production</code>.
            Cliquer « Rollback » re-alias le custom domain sur ce deploy et
            remet <code>trafficProdCanaryPercent</code> à 100 — les sessions
            sticky continuent sur leur deploy assigné jusqu&apos;à expiration.
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
                  <DeploymentRow
                    key={d.uid}
                    deployment={d}
                    isCurrent={isCurrent}
                    disabled={isBusy || isCurrent || d.state !== 'READY'}
                    pending={pendingAction === `rollback-${d.uid}`}
                    onRollback={() => setModal({ kind: 'rollback', deploy: d })}
                    now={now}
                  />
                );
              })}
            </ul>
          )}
        </section>
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

function StatusLine({ status, pct }: { status: Status; pct: number }) {
  return (
    <div className="adm-status">
      <span
        className={`adm-status-dot adm-status-dot--${
          status === 'complete-sticky' ? 'complete' : status
        }`}
        aria-hidden="true"
      />
      <span className="adm-status-label">{STATUS_LABEL[status]}</span>
      {status !== 'stable' && status !== 'unknown' && (
        <span className="adm-status-pct">{pct}%</span>
      )}
    </div>
  );
}

function TimingLine({
  canaryLive,
  status,
  elapsed,
  msToNext,
  overdue,
  phase,
}: {
  canaryLive: boolean;
  status: Status;
  elapsed: number | null;
  msToNext: number | null;
  overdue: boolean;
  phase: string | null;
}) {
  const items: React.ReactNode[] = [];
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

function TrafficBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.widthValue, 0) || 1;
  return (
    <div>
      <div className="adm-bar" role="img" aria-label="Répartition du trafic">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`adm-bar-seg${s.active ? ' adm-bar-seg--active' : ''}`}
            style={
              {
                width: `${(s.widthValue / total) * 100}%`,
                ['--adm-seg-color' as string]: s.color,
              } as React.CSSProperties
            }
            title={`${s.label} — ${s.displayPct}% ${s.displayUnit} (${s.widthValue.toFixed(1)}% du trafic, ${s.host})`}
          />
        ))}
      </div>
      <ul className="adm-legend" role="list">
        {segments.map((s, i) => (
          <li key={i} className="adm-legend-row">
            <span
              aria-hidden="true"
              className="adm-legend-dot"
              style={
                { ['--adm-seg-color' as string]: s.color } as React.CSSProperties
              }
            />
            <span className="adm-legend-meta">
              <span className="adm-legend-label-row">
                <span className="adm-legend-label">{s.label}</span>
                <code className="adm-legend-host">{s.host}</code>
              </span>
              {s.info && (s.info.ref || s.info.sha) && (
                <span className="adm-legend-deploy">
                  {s.info.ref && <code className="adm-legend-ref">{s.info.ref}</code>}
                  {s.info.sha && (
                    <code className="adm-legend-sha">@{s.info.sha.slice(0, 7)}</code>
                  )}
                  {s.info.message && (
                    <span className="adm-legend-commit" title={s.info.message}>
                      {firstLine(s.info.message).slice(0, 60)}
                      {firstLine(s.info.message).length > 60 && '…'}
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="adm-legend-value">
              <span>
                {s.displayPct}%
                <span className="adm-legend-value-unit">
                  {' '}
                  {s.displayUnit}
                </span>
              </span>
              {s.effectiveHint && (
                <span className="adm-legend-value-hint">{s.effectiveHint}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SloLog({
  checks,
  now,
}: {
  checks: SloCheck[];
  now: number | null;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = useCallback((i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  return (
    <section className="adm-card">
      <div className="adm-card-header">
        <h2 className="adm-card-title">Historique SLO (canary ramp)</h2>
        <span
          style={{
            fontSize: '0.72rem',
            opacity: 0.4,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {checks.length} / 10
        </span>
      </div>
      <p className="adm-card-hint">
        Les derniers checks exécutés par <code>canary-ramp.yml</code> (toutes
        les 15 min quand un canary est en cours). Pratique pour comprendre
        pourquoi le canary n&apos;avance pas : si la liste est vide, la cron
        ne tourne pas ; si elle est pleine de{' '}
        <span className="adm-slo-ok-inline">✓</span>, le ramp avance ; des{' '}
        <span className="adm-slo-ko-inline">✗</span> indiquent un SLO qui a
        rollback. Clique sur une ligne pour voir le body complet du dernier
        probe.
      </p>
      {checks.length === 0 ? (
        <p style={{ opacity: 0.5, fontSize: '0.9rem', margin: 0 }}>
          Aucun check SLO enregistré — vérifier que le workflow{' '}
          <code>canary-ramp.yml</code> existe et tourne sur la default branch.
        </p>
      ) : (
        <ul className="adm-slo-list" role="list">
          {checks.map((c, i) => {
            const ts = new Date(c.ts).getTime();
            const ago = prettyTimeAgo(ts, now);
            // Render the full timestamp only after mount — `toLocaleString`
            // without explicit timeZone uses the runtime's default tz, which
            // differs between server (UTC on Vercel) and client (user local),
            // producing different attribute strings → React error #418.
            const fullTs =
              now !== null
                ? new Date(c.ts).toLocaleString('fr-FR', {
                    timeZone: 'Europe/Paris',
                  })
                : '';
            const codes = c.codes.map((x) => x || '—').join(' / ');
            const isRollback = !c.ok && c.pctAfter === 0;
            const isOpen = expanded.has(i);
            const hasBody = Boolean(c.bodyExcerpt);
            return (
              <li
                key={`${c.ts}-${i}`}
                className={`adm-slo-row ${c.ok ? 'adm-slo-row--ok' : 'adm-slo-row--ko'}${hasBody ? ' adm-slo-row--clickable' : ''}`}
              >
                <button
                  type="button"
                  className="adm-slo-summary"
                  onClick={() => hasBody && toggle(i)}
                  disabled={!hasBody}
                  aria-expanded={isOpen}
                  aria-label={
                    hasBody
                      ? isOpen
                        ? 'Masquer le body complet'
                        : 'Afficher le body complet'
                      : 'Aucun body enregistré'
                  }
                >
                  <span className="adm-slo-icon" aria-hidden="true">
                    {c.ok ? '✓' : '✗'}
                  </span>
                  <span className="adm-slo-time" title={fullTs}>
                    {ago}
                  </span>
                  <code className="adm-slo-codes">{codes}</code>
                  <span className="adm-slo-pct">
                    {c.pctBefore}% →{' '}
                    <strong>{c.pctAfter}%</strong>
                    {isRollback && (
                      <span className="adm-slo-badge">rollback</span>
                    )}
                  </span>
                  {hasBody && (
                    <span
                      className="adm-slo-caret"
                      aria-hidden="true"
                    >
                      {isOpen ? '▾' : '▸'}
                    </span>
                  )}
                </button>
                {hasBody && (
                  <div
                    className={`adm-slo-body-wrap${isOpen ? ' adm-slo-body-wrap--open' : ''}`}
                  >
                    {isOpen ? (
                      <pre className="adm-slo-body-full">{c.bodyExcerpt}</pre>
                    ) : (
                      <code
                        className="adm-slo-body-preview"
                        title={c.bodyExcerpt}
                      >
                        {c.bodyExcerpt.length > 80
                          ? c.bodyExcerpt.slice(0, 80) + '…'
                          : c.bodyExcerpt}
                      </code>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ActionBtn({
  id,
  children,
  onClick,
  disabled,
  pendingId,
  variant = 'default',
}: {
  id: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pendingId: string | null;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const isPending = pendingId === id;
  const className = [
    'adm-btn',
    variant === 'primary' && 'adm-btn--primary',
    variant === 'danger' && 'adm-btn--danger',
    isPending && 'adm-btn--pending',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function ShadowPercentCard({
  current,
  pending,
  disabled,
  onSave,
}: {
  current: number;
  pending: boolean;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(current));

  useEffect(() => {
    setDraft(String(current));
  }, [current]);

  const parsed = Number(draft);
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
  const changed = valid && parsed !== current;

  return (
    <section className="adm-card">
      <div className="adm-card-header">
        <h2 className="adm-card-title">Shadow traffic</h2>
        <span style={{ fontSize: '0.78rem', opacity: 0.5 }}>
          actuel <code>{current}%</code>
        </span>
      </div>
      <p className="adm-card-hint">
        Pourcentage de trafic routé vers le deploy <code>master</code> (shadow).
        Indépendant du canary. <code>0</code> = kill-switch (plus de trafic
        shadow), <code>1</code> = nominal. Temporairement plus haut si tu veux
        stabiliser une mesure (par ex. observer des erreurs rares).
      </p>
      <div className="adm-shadow-row">
        <span className="adm-shadow-input-wrap">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={!valid || undefined}
            aria-label="Nouveau pourcentage shadow"
            className="adm-input adm-shadow-input"
          />
        </span>
        <button
          type="button"
          className={`adm-btn${pending ? ' adm-btn--pending' : ''}`}
          onClick={() => onSave(parsed)}
          disabled={disabled || !changed}
        >
          Enregistrer
        </button>
        {!valid && (
          <span style={{ color: '#fca5a5', fontSize: '0.8rem' }}>
            0 – 100 uniquement
          </span>
        )}
      </div>
    </section>
  );
}

function ShadowHistorySection({
  entries,
  currentShadowUrl,
  pendingAction,
  disabled,
  onRollback,
  now,
}: {
  entries: ShadowHistoryEntry[];
  currentShadowUrl?: string;
  pendingAction: string | null;
  disabled: boolean;
  onRollback: (entry: ShadowHistoryEntry) => void;
  now: number | null;
}) {
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
          {entries.length} / 20
        </span>
      </div>
      <p className="adm-card-hint">
        Les 20 derniers deploys de la branche <code>master</code>. Chaque push
        sur <code>master</code> empile l&apos;ancien URL ici avant d&apos;être
        remplacé. Cliquer « Rollback » passe <code>deploymentDomainShadow</code>{' '}
        sur ce deploy — pas de re-alias de domaine, propagation ≤ 60s.
      </p>
      {entries.length === 0 ? (
        <p style={{ opacity: 0.5, fontSize: '0.9rem', margin: 0 }}>
          Aucun shadow précédent — le premier apparaîtra ici après le prochain
          push sur <code>master</code>.
        </p>
      ) : (
        <ul className="adm-deploys" role="list">
          {entries.map((e) => (
            <ShadowHistoryRow
              key={e.url}
              entry={e}
              isCurrent={Boolean(
                currentShadowUrl && currentShadowUrl === e.url,
              )}
              disabled={disabled}
              pending={pendingAction === `rollback-shadow-${e.url}`}
              onRollback={() => onRollback(e)}
              now={now}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ShadowHistoryRow({
  entry,
  isCurrent,
  onRollback,
  disabled,
  pending,
  now,
}: {
  entry: ShadowHistoryEntry;
  isCurrent: boolean;
  onRollback: () => void;
  disabled: boolean;
  pending: boolean;
  now: number | null;
}) {
  const ref = entry.ref ?? 'master';
  const sha = entry.sha?.slice(0, 7) ?? '';
  const msg = entry.message ?? shortHost(entry.url);
  const state = entry.state;
  const stateClass =
    state === 'READY'
      ? 'adm-deploy-state--ready'
      : state === 'ERROR'
        ? 'adm-deploy-state--error'
        : 'adm-deploy-state--other';

  return (
    <li className="adm-deploy">
      <span
        aria-hidden="true"
        title={state ?? 'unknown'}
        className={`adm-deploy-state ${stateClass}`}
      />
      <div className="adm-deploy-body">
        <div className="adm-deploy-message">
          {firstLine(msg)}
          {isCurrent && <span className="adm-deploy-current">current</span>}
        </div>
        <div className="adm-deploy-meta">
          <code>{ref}</code>
          {sha && <code>{sha}</code>}
          {entry.createdAt && <span>{prettyTimeAgo(entry.createdAt, now)}</span>}
          <code>{shortHost(entry.url)}</code>
        </div>
      </div>
      <button
        type="button"
        className={`adm-btn adm-btn--small${pending ? ' adm-btn--pending' : ''}`}
        onClick={onRollback}
        disabled={disabled || isCurrent || state === 'ERROR'}
        title={
          isCurrent
            ? 'Déjà le shadow actuel'
            : 'Passer deploymentDomainShadow sur ce deploy'
        }
      >
        {isCurrent ? 'actuel' : 'Rollback'}
      </button>
    </li>
  );
}

function DeploymentRow({
  deployment,
  isCurrent,
  onRollback,
  disabled,
  pending,
  now,
}: {
  deployment: Deployment;
  isCurrent: boolean;
  onRollback: () => void;
  disabled: boolean;
  pending: boolean;
  now: number | null;
}) {
  const ref = deployment.meta?.githubCommitRef ?? '—';
  const sha = deployment.meta?.githubCommitSha?.slice(0, 7) ?? '';
  const msg = deployment.meta?.githubCommitMessage ?? deployment.name;
  const state = deployment.state;
  const stateClass =
    state === 'READY'
      ? 'adm-deploy-state--ready'
      : state === 'ERROR'
        ? 'adm-deploy-state--error'
        : 'adm-deploy-state--other';

  return (
    <li className="adm-deploy">
      <span
        aria-hidden="true"
        title={state}
        className={`adm-deploy-state ${stateClass}`}
      />
      <div className="adm-deploy-body">
        <div className="adm-deploy-message">
          {firstLine(msg)}
          {isCurrent && <span className="adm-deploy-current">current</span>}
        </div>
        <div className="adm-deploy-meta">
          <code>{ref}</code>
          {sha && <code>{sha}</code>}
          <span>{prettyTimeAgo(deployment.createdAt, now)}</span>
          <code>{shortHost(deployment.url)}</code>
        </div>
      </div>
      <button
        type="button"
        className={`adm-btn adm-btn--small${pending ? ' adm-btn--pending' : ''}`}
        onClick={onRollback}
        disabled={disabled}
      >
        Rollback
      </button>
    </li>
  );
}
