'use client';

import { useCallback, useState } from 'react';
import { SLO_CHECKS_CAP } from '../constants/config';
import type { SloCheck } from '../types/dashboard';
import { prettyTimeAgo } from '../utils/format';

type Props = {
  checks: SloCheck[];
  now: number | null;
};

export function SloLogCard({ checks, now }: Props) {
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
          {checks.length} / {SLO_CHECKS_CAP}
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
          {checks.map((c, i) => (
            <SloRow
              key={`${c.ts}-${i}`}
              check={c}
              now={now}
              isOpen={expanded.has(i)}
              onToggle={() => toggle(i)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SloRow({
  check,
  now,
  isOpen,
  onToggle,
}: {
  check: SloCheck;
  now: number | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const ts = new Date(check.ts).getTime();
  const ago = prettyTimeAgo(ts, now);
  // Render the full timestamp only after mount — `toLocaleString` without
  // explicit timeZone uses the runtime's default tz, which differs between
  // server (UTC on Vercel) and client (user local), producing different
  // attribute strings → React error #418.
  const fullTs =
    now !== null
      ? new Date(check.ts).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
      : '';
  const codes = check.codes.map((x) => x || '—').join(' / ');
  const isRollback = !check.ok && check.pctAfter === 0;
  const hasBody = Boolean(check.bodyExcerpt);

  return (
    <li
      className={`adm-slo-row ${check.ok ? 'adm-slo-row--ok' : 'adm-slo-row--ko'}${hasBody ? ' adm-slo-row--clickable' : ''}`}
    >
      <button
        type="button"
        className="adm-slo-summary"
        onClick={() => hasBody && onToggle()}
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
          {check.ok ? '✓' : '✗'}
        </span>
        <span className="adm-slo-time" title={fullTs}>
          {ago}
        </span>
        <code className="adm-slo-codes">{codes}</code>
        <span className="adm-slo-pct">
          {check.pctBefore}% → <strong>{check.pctAfter}%</strong>
          {isRollback && <span className="adm-slo-badge">rollback</span>}
        </span>
        {hasBody && (
          <span className="adm-slo-caret" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
        )}
      </button>
      {hasBody && check.bodyExcerpt && (
        <div
          className={`adm-slo-body-wrap${isOpen ? ' adm-slo-body-wrap--open' : ''}`}
        >
          {isOpen ? (
            <pre className="adm-slo-body-full">{check.bodyExcerpt}</pre>
          ) : (
            <code
              className="adm-slo-body-preview"
              title={check.bodyExcerpt}
            >
              {check.bodyExcerpt.length > 80
                ? check.bodyExcerpt.slice(0, 80) + '…'
                : check.bodyExcerpt}
            </code>
          )}
        </div>
      )}
    </li>
  );
}
