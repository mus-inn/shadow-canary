'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Deployment, ShadowConfig } from '@/lib/admin-vercel';
import { BucketForcer } from './bucket-forcer';
import { ConfirmModal } from './confirm-modal';
import { PhasesDiagram } from './phases-diagram';

type Props = {
  initial: {
    config: ShadowConfig | null;
    deployments: Deployment[];
    error: string | null;
  };
};

type BucketInfo = {
  url: string;
  sha: string | null;
  ref: string | null;
  message: string | null;
  createdAt: number | null;
  state: string | null;
} | null;

type BucketInfoMap = {
  shadow: BucketInfo;
  prodNew: BucketInfo;
  prodPrevious: BucketInfo;
};

type Status =
  | 'stable'
  | 'starting'
  | 'ramping'
  | 'paused'
  | 'complete-sticky'
  | 'unknown';

type ModalState =
  | null
  | { kind: 'cancel' }
  | { kind: 'promote' }
  | { kind: 'rollback'; deploy: Deployment };

function deriveStatus(cfg: ShadowConfig | null): Status {
  if (!cfg) return 'unknown';
  const pct = cfg.trafficProdCanaryPercent ?? 100;
  const hasPrev = Boolean(cfg.deploymentDomainProdPrevious);
  if (pct === 100 && !hasPrev) return 'stable';
  if (pct === 100 && hasPrev) return 'complete-sticky';
  if (cfg.canaryPaused) return 'paused';
  if (pct === 0) return 'starting';
  return 'ramping';
}

function statusToPhase(s: Status): 0 | 1 | 2 | 3 | 4 {
  if (s === 'starting') return 2;
  if (s === 'ramping' || s === 'paused') return 3;
  if (s === 'complete-sticky') return 4;
  return 0;
}

function shortHost(url?: string): string {
  if (!url) return '—';
  return url.replace(/^https?:\/\//, '').split('.')[0];
}

function prettyTimeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${(s % 60).toString().padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}m`;
}

function nextCronFireMs(now: number): number {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  const nextMin = Math.ceil((d.getUTCMinutes() + 0.001) / 15) * 15;
  d.setUTCMinutes(nextMin);
  return d.getTime();
}

function parisHour(now: number): number {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hour12: false,
  }).format(new Date(now));
  return parseInt(hourStr, 10);
}

function phaseLabel(hour: number): string {
  if (hour < 12) return 'Matin · cap 20% jusqu’à 12:00 Paris';
  return 'Après-midi · ramp jusqu’à 100% (step +4/15min)';
}

export function AdminDashboard({ initial }: Props) {
  const [config, setConfig] = useState(initial.config);
  const [deployments, setDeployments] = useState(initial.deployments);
  const [bucketInfo, setBucketInfo] = useState<BucketInfoMap | null>(null);
  const [error, setError] = useState(initial.error);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [stateRes, deployRes, bucketRes] = await Promise.all([
        fetch('/api/admin/state', { cache: 'no-store' }),
        fetch('/api/admin/deployments', { cache: 'no-store' }),
        fetch('/api/admin/bucket-info', { cache: 'no-store' }),
      ]);
      if (stateRes.ok) {
        const { config: c } = await stateRes.json();
        setConfig(c);
      }
      if (deployRes.ok) {
        const { deployments: d } = await deployRes.json();
        setDeployments(d);
      }
      if (bucketRes.ok) {
        setBucketInfo((await bucketRes.json()) as BucketInfoMap);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Wall-clock ticker — separate from the 10s data refresh so the countdown
  // ticks smoothly without triggering network calls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const run = useCallback(
    async (id: string, path: string, body?: object) => {
      if (pendingAction) return;
      setActionError(null);
      setPendingAction(id);
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        await refresh();
        setModal(null);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'action failed');
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction, refresh],
  );

  const status = deriveStatus(config);
  const canaryPct = config?.trafficProdCanaryPercent ?? 100;
  const shadowPct = config?.trafficShadowPercent ?? 0;
  const prevHost = config?.deploymentDomainProdPrevious;
  const prodHost = config?.deploymentDomainProd;
  const shadowHost = config?.deploymentDomainShadow;

  const totalProdShare = 100 - shadowPct;
  const newShare = (totalProdShare * canaryPct) / 100;
  const prevShare = prevHost ? totalProdShare - newShare : 0;

  const startedAt = config?.canaryStartedAt
    ? new Date(config.canaryStartedAt).getTime()
    : null;
  const canaryLive =
    status === 'ramping' || status === 'starting' || status === 'paused';
  const elapsed = startedAt ? now - startedAt : null;
  const hour = parisHour(now);
  const msToNext = nextCronFireMs(now) - now;
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
            phase={phaseLabel(hour)}
          />

          <div className="adm-bar-wrap">
            <TrafficBar
              segments={[
                {
                  label: 'shadow (master)',
                  value: shadowPct,
                  color: '#f97316',
                  host: shortHost(shadowHost),
                  active: true,
                  info: bucketInfo?.shadow,
                },
                ...(prevHost
                  ? [
                      {
                        label: 'previous prod',
                        value: prevShare,
                        color: '#6366f1',
                        host: shortHost(prevHost),
                        active: canaryLive,
                        info: bucketInfo?.prodPrevious,
                      },
                    ]
                  : []),
                {
                  label: 'new prod',
                  value: newShare,
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
              onClick={() => void run('pause', '/api/admin/canary/pause')}
            >
              Pause
            </ActionBtn>
            <ActionBtn
              id="resume"
              pendingId={pendingAction}
              disabled={isBusy || !config?.canaryPaused}
              onClick={() => void run('resume', '/api/admin/canary/resume')}
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
            <ActionBtn
              id="step-back"
              pendingId={pendingAction}
              disabled={isBusy || canaryPct <= 0 || !prevHost}
              onClick={() =>
                void run('step-back', '/api/admin/canary/step-back')
              }
            >
              − 4% (step back)
            </ActionBtn>
            <ActionBtn
              id="step-forward"
              pendingId={pendingAction}
              disabled={isBusy || canaryPct >= 100 || !prevHost}
              onClick={() =>
                void run('step-forward', '/api/admin/canary/step-forward')
              }
            >
              + 4% (step forward)
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

        {/* ---------- Bucket forcer (dev test aid) ---------- */}
        <BucketForcer />

        {/* ---------- Shadow percent ---------- */}
        <ShadowPercentCard
          current={shadowPct}
          pending={pendingAction === 'shadow-percent'}
          disabled={isBusy}
          onSave={(value) =>
            void run('shadow-percent', '/api/admin/shadow-percent', { value })
          }
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
        onClose={() => setModal(null)}
        onConfirm={() => void run('cancel', '/api/admin/canary/cancel')}
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
        onClose={() => setModal(null)}
        onConfirm={() => void run('promote', '/api/admin/canary/promote')}
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
        onClose={() => setModal(null)}
        onConfirm={() => {
          if (modal?.kind !== 'rollback') return;
          const d = modal.deploy;
          void run(`rollback-${d.uid}`, '/api/admin/rollback', {
            deploymentId: d.uid,
            deploymentUrl: d.url.startsWith('http') ? d.url : `https://${d.url}`,
          });
        }}
      />
    </>
  );
}

/* ========================================================================
   Sub-components
   ======================================================================== */

function StatusLine({ status, pct }: { status: Status; pct: number }) {
  const label: Record<Status, string> = {
    stable: 'Stable · pas de canary',
    starting: 'Canary armé · en attente du premier check SLO',
    ramping: 'Canary en progression',
    paused: 'Canary en pause',
    'complete-sticky': 'Canary complet · sticky tail en cours',
    unknown: 'État inconnu',
  };
  return (
    <div className="adm-status">
      <span
        className={`adm-status-dot adm-status-dot--${
          status === 'complete-sticky' ? 'complete' : status
        }`}
        aria-hidden="true"
      />
      <span className="adm-status-label">{label[status]}</span>
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
  phase,
}: {
  canaryLive: boolean;
  status: Status;
  elapsed: number | null;
  msToNext: number;
  phase: string;
}) {
  const items: React.ReactNode[] = [phase];
  if (elapsed !== null) {
    items.push(<>Démarré il y a {formatDuration(elapsed)}</>);
  }
  if (status === 'ramping' || status === 'starting') {
    items.push(
      <>
        Prochain check dans{' '}
        <span className="adm-timing-countdown">
          {formatDuration(msToNext)}
        </span>
      </>,
    );
  } else if (status === 'paused') {
    items.push(<>Pause · cron skippé</>);
  }

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

type Segment = {
  label: string;
  value: number;
  color: string;
  host: string;
  active: boolean;
  info?: BucketInfo;
};

function TrafficBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="adm-bar" role="img" aria-label="Répartition du trafic">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`adm-bar-seg${s.active ? ' adm-bar-seg--active' : ''}`}
            style={
              {
                width: `${(s.value / total) * 100}%`,
                ['--adm-seg-color' as string]: s.color,
              } as React.CSSProperties
            }
            title={`${s.label} — ${s.value.toFixed(1)}% (${s.host})`}
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
                      {s.info.message.split('\n')[0].slice(0, 60)}
                      {(s.info.message.split('\n')[0].length > 60) && '…'}
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="adm-legend-value">{s.value.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
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

function DeploymentRow({
  deployment,
  isCurrent,
  onRollback,
  disabled,
  pending,
}: {
  deployment: Deployment;
  isCurrent: boolean;
  onRollback: () => void;
  disabled: boolean;
  pending: boolean;
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
          {msg.split('\n')[0]}
          {isCurrent && <span className="adm-deploy-current">current</span>}
        </div>
        <div className="adm-deploy-meta">
          <code>{ref}</code>
          {sha && <code>{sha}</code>}
          <span>{prettyTimeAgo(deployment.createdAt)}</span>
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
