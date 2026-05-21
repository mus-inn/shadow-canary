'use client';

import type { Deployment } from '@/lib/admin-vercel';
import type { ShadowHistoryEntry } from '../types/dashboard';
import { firstLine, prettyTimeAgo, shortHost } from '../utils/format';

type DeployRowView = {
  state: string | null;
  ref: string;
  sha: string;
  msg: string;
  url: string;
  createdAt: number | null;
};

export type DeployRowProps =
  | ({
      variant: 'prod';
      item: Deployment;
      isCurrent: boolean;
      disabled: boolean;
      pending: boolean;
      onRollback: () => void;
      now: number | null;
    })
  | ({
      variant: 'shadow';
      item: ShadowHistoryEntry;
      isCurrent: boolean;
      disabled: boolean;
      pending: boolean;
      onRollback: () => void;
      now: number | null;
    });

function viewOfProd(d: Deployment): DeployRowView {
  return {
    state: d.state ?? null,
    ref: d.meta?.githubCommitRef ?? '—',
    sha: d.meta?.githubCommitSha?.slice(0, 7) ?? '',
    msg: d.meta?.githubCommitMessage ?? d.name,
    url: d.url,
    createdAt: d.createdAt,
  };
}

function viewOfShadow(e: ShadowHistoryEntry): DeployRowView {
  return {
    state: e.state,
    ref: e.ref ?? 'master',
    sha: e.sha?.slice(0, 7) ?? '',
    msg: e.message ?? shortHost(e.url),
    url: e.url,
    createdAt: e.createdAt,
  };
}

function stateClassName(state: string | null): string {
  if (state === 'READY') return 'adm-deploy-state--ready';
  if (state === 'ERROR') return 'adm-deploy-state--error';
  return 'adm-deploy-state--other';
}

export function DeployRow(props: DeployRowProps) {
  const view =
    props.variant === 'prod' ? viewOfProd(props.item) : viewOfShadow(props.item);
  const { isCurrent, disabled, pending, onRollback, now, variant } = props;

  // Shadow row also disables the button when the deploy is in ERROR state —
  // the prod row already gets that via its `disabled` prop from the caller.
  const buttonDisabled =
    disabled || (variant === 'shadow' && view.state === 'ERROR');

  const title =
    variant === 'shadow' && isCurrent
      ? 'Déjà le shadow actuel'
      : variant === 'shadow'
        ? 'Passer deploymentDomainShadow sur ce deploy'
        : undefined;

  return (
    <li className="adm-deploy">
      <span
        aria-hidden="true"
        title={view.state ?? 'unknown'}
        className={`adm-deploy-state ${stateClassName(view.state)}`}
      />
      <div className="adm-deploy-body">
        <div className="adm-deploy-message">
          {firstLine(view.msg)}
          {isCurrent && <span className="adm-deploy-current">current</span>}
        </div>
        <div className="adm-deploy-meta">
          <code>{view.ref}</code>
          {view.sha && <code>{view.sha}</code>}
          {view.createdAt !== null && (
            <span>{prettyTimeAgo(view.createdAt, now)}</span>
          )}
          <code>{shortHost(view.url)}</code>
        </div>
      </div>
      <button
        type="button"
        className={`adm-btn adm-btn--small${pending ? ' adm-btn--pending' : ''}`}
        onClick={onRollback}
        disabled={buttonDisabled}
        title={title}
      >
        {variant === 'shadow' && isCurrent ? 'actuel' : 'Rollback'}
      </button>
    </li>
  );
}
