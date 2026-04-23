'use client';

import { useState } from 'react';

type ActivePhase = 0 | 1 | 2 | 3 | 4; // 0 = none (stable)

const PHASES: { title: string; body: string }[] = [
  {
    title: 'Deploy',
    body: 'Merge master → production. GH Actions build le nouveau deploy, Vercel re-alias le custom domain dessus.',
  },
  {
    title: 'Armed · 0%',
    body: "Edge Config bascule : new = new prod, previous = ancien deploy. Tout le trafic prod (99%) est réécrit vers previous. Le shadow 1% reste inchangé.",
  },
  {
    title: 'Ramp SLO-gated',
    body: 'Cron toutes les 15 min : 2× ping /api/slo (30s d\'intervalle). 2× 200 → +4%. Cap 20% avant midi Paris, puis montée jusqu\'à 100%.',
  },
  {
    title: '100% · sticky tail',
    body: "Nouveaux visiteurs sur new prod. Les sessions déjà assignées à previous (checkout, paiement) finissent leur parcours dessus jusqu'au prochain deploy.",
  },
];

export function PhasesDiagram({ activePhase }: { activePhase: ActivePhase }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="adm-card adm-phases-card">
      <div className="adm-card-header">
        <h2 className="adm-card-title">Cycle de déploiement canary</h2>
        <button
          type="button"
          className="adm-phases-toggle"
          onClick={() => setOpen((x) => !x)}
          aria-expanded={open}
        >
          {open ? 'Masquer' : 'Afficher'}
        </button>
      </div>
      {!open && (
        <p className="adm-card-hint" style={{ marginBottom: 0 }}>
          4 phases, du merge à la fin de rampe. Cliquer « Afficher » pour le
          détail visuel de chaque étape et voir laquelle est en cours.
        </p>
      )}
      {open && (
        <>
          <p className="adm-card-hint">
            Chaque phase représente un état observable dans l&apos;Edge Config.
            Le cron progresse automatiquement de 2 → 3, puis 3 → 4 quand la
            rampe atteint 100%. Les opérateurs peuvent intervenir depuis le
            dashboard à n&apos;importe quel moment.
          </p>
          <ol className="adm-phases" role="list">
            {PHASES.map((p, i) => {
              const phaseNum = (i + 1) as 1 | 2 | 3 | 4;
              const isActive = activePhase === phaseNum;
              const isDone = activePhase > phaseNum;
              return (
                <li
                  key={p.title}
                  className={`adm-phase${isActive ? ' adm-phase--active' : ''}${isDone ? ' adm-phase--done' : ''}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span className="adm-phase-number">Phase {phaseNum}</span>
                  <h3 className="adm-phase-title">{p.title}</h3>
                  <p className="adm-phase-body">{p.body}</p>
                  <span aria-hidden="true" className="adm-phase-connector" />
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
