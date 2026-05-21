'use client';

import { useEffect, useState } from 'react';

type Props = {
  current: number;
  pending: boolean;
  disabled: boolean;
  onSave: (value: number) => void;
};

export function ShadowPercentCard({
  current,
  pending,
  disabled,
  onSave,
}: Props) {
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
