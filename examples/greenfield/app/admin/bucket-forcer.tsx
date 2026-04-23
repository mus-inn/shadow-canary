'use client';

import { useCallback, useEffect, useState } from 'react';

type Bucket = 'shadow' | 'prod-new' | 'prod-previous' | null;

const COOKIE = 'shadow-bucket';
const MAX_AGE = 60 * 60 * 24; // 1 day, matches middleware

function readBucket(): Bucket {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)shadow-bucket=([^;]+)/);
  if (!match) return null;
  const v = decodeURIComponent(match[1]);
  if (v === 'shadow' || v === 'prod-new' || v === 'prod-previous') return v;
  return null;
}

function writeBucket(value: Bucket): void {
  if (value === null) {
    document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    document.cookie = `${COOKIE}=${value}; path=/; max-age=${MAX_AGE}; samesite=lax`;
  }
}

type Option = {
  value: Exclude<Bucket, null>;
  label: string;
  desc: string;
  color: string;
};

const OPTIONS: Option[] = [
  {
    value: 'shadow',
    label: 'Shadow',
    desc: 'Deploy master · trafic permanent 1%',
    color: '#f97316',
  },
  {
    value: 'prod-new',
    label: 'Canary',
    desc: 'Nouveau prod · en cours de ramp',
    color: '#22c55e',
  },
  {
    value: 'prod-previous',
    label: 'Control',
    desc: 'Ancien prod · baseline de comparaison',
    color: '#6366f1',
  },
];

export function BucketForcer() {
  const [current, setCurrent] = useState<Bucket>(null);
  const [mounted, setMounted] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(readBucket());
    setMounted(true);
  }, []);

  const apply = useCallback((value: Bucket, label: string | null) => {
    writeBucket(value);
    setCurrent(value);
    setFlash(label ?? 'Cookie effacé');
    window.setTimeout(() => setFlash(null), 1600);
  }, []);

  return (
    <section className="adm-card">
      <div className="adm-card-header">
        <h2 className="adm-card-title">Forcer ton bucket</h2>
        <span style={{ fontSize: '0.78rem', opacity: 0.5 }}>
          cookie <code>shadow-bucket</code>
        </span>
      </div>
      <p className="adm-card-hint">
        Épingle TON navigateur sur un bucket précis pour comparer les trois
        deploys côte à côte. N&apos;affecte que toi — les autres utilisateurs
        continuent à rouler dans le split normal.
      </p>

      <div className="adm-bucket-row">
        {OPTIONS.map((o) => {
          const active = mounted && current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              className={`adm-bucket-option${active ? ' adm-bucket-option--active' : ''}`}
              onClick={() => apply(o.value, o.label)}
              aria-pressed={active}
              style={
                {
                  ['--adm-bucket-color' as string]: o.color,
                } as React.CSSProperties
              }
            >
              <span className="adm-bucket-option-head">
                <span
                  aria-hidden="true"
                  className="adm-bucket-option-dot"
                  style={{ background: o.color }}
                />
                <span className="adm-bucket-option-label">{o.label}</span>
                {active && (
                  <span className="adm-bucket-option-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </span>
              <span className="adm-bucket-option-desc">{o.desc}</span>
              <code className="adm-bucket-option-code">{o.value}</code>
            </button>
          );
        })}
      </div>

      <div className="adm-bucket-footer">
        <button
          type="button"
          className="adm-btn adm-btn--small adm-btn--ghost"
          onClick={() => apply(null, null)}
          disabled={!current}
        >
          Reset (split aléatoire)
        </button>
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="adm-btn adm-btn--small adm-btn--ghost"
        >
          Ouvrir la home ↗
        </a>
        <a
          href="/debug"
          target="_blank"
          rel="noopener"
          className="adm-btn adm-btn--small adm-btn--ghost"
        >
          Page debug ↗
        </a>
        <span className="adm-bucket-footer-spacer" />
        {flash && (
          <span className="adm-bucket-flash" role="status">
            {flash}
          </span>
        )}
      </div>
    </section>
  );
}
