'use client';

import type { CSSProperties } from 'react';
import type { Segment } from '../types/dashboard';
import { firstLine } from '../utils/format';

type Props = {
  segments: Segment[];
};

function segStyle(width: number, color: string): CSSProperties {
  return {
    width: `${width}%`,
    ['--adm-seg-color' as string]: color,
  } as CSSProperties;
}

function dotStyle(color: string): CSSProperties {
  return { ['--adm-seg-color' as string]: color } as CSSProperties;
}

export function TrafficBar({ segments }: Props) {
  const total = segments.reduce((s, x) => s + x.widthValue, 0) || 1;
  return (
    <div>
      <div className="adm-bar" role="img" aria-label="Répartition du trafic">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`adm-bar-seg${s.active ? ' adm-bar-seg--active' : ''}`}
            style={segStyle((s.widthValue / total) * 100, s.color)}
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
              style={dotStyle(s.color)}
            />
            <span className="adm-legend-meta">
              <span className="adm-legend-label-row">
                <span className="adm-legend-label">{s.label}</span>
                <code className="adm-legend-host">{s.host}</code>
              </span>
              {s.info && (s.info.ref || s.info.sha) && (
                <span className="adm-legend-deploy">
                  {s.info.ref && (
                    <code className="adm-legend-ref">{s.info.ref}</code>
                  )}
                  {s.info.sha && (
                    <code className="adm-legend-sha">
                      @{s.info.sha.slice(0, 7)}
                    </code>
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
                <span className="adm-legend-value-unit"> {s.displayUnit}</span>
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
