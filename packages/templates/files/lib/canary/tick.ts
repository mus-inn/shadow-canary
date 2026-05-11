import type { ShadowConfig, SloCheck } from '@dotworld/shadow-canary-core';

export const CANARY_STEP_DEFAULT = 4;
export const CANARY_RING_BUFFER_SIZE = 10;
export const CANARY_BODY_EXCERPT_MAX = 500;

export type CanaryDecisionInput = {
  pct: number;
  paused: boolean;
  prodUrl: string | undefined;
  sloOk: boolean;
  prevOk: boolean | null;
  hourParis: number;
  step?: number;
};

export type CanaryDecision =
  | { kind: 'skip'; reason: 'no-prod' | 'at-100' | 'paused' }
  | { kind: 'bump'; nextPct: number; cap: number; promote: boolean }
  | { kind: 'rollback' }
  | { kind: 'record-nok' };

// Cap follows Europe/Paris wall-clock: before 12h soft-start at 20%, otherwise
// ramp up to 100%. Matches the original bash workflow.
export function parisHourCap(hour: number): number {
  return hour < 12 ? 20 : 100;
}

export function getParisHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const h = Number.parseInt(hourPart, 10);
  // Intl returns '24' at midnight on some ICU builds — normalize to 0.
  return h === 24 ? 0 : h;
}

// Most recent SLO tick belonging to THIS canary. Filter sloChecks by
// ts > canaryStartedAt so a stale NOK from the previous canary cannot trip
// the new canary's first tick. Returns null when no prior tick exists
// (cannot rollback yet).
export function extractPrevOk(
  sloChecks: SloCheck[] | undefined,
  canaryStartedAt: string | undefined,
): boolean | null {
  if (!sloChecks || sloChecks.length === 0) return null;
  const eligible = canaryStartedAt ? sloChecks.filter((c) => c.ts > canaryStartedAt) : sloChecks;
  const first = eligible[0];
  if (!first) return null;
  return first.ok;
}

export function decideAction(input: CanaryDecisionInput): CanaryDecision {
  const { pct, paused, prodUrl, sloOk, prevOk, hourParis } = input;
  const step = input.step ?? CANARY_STEP_DEFAULT;

  if (!prodUrl) return { kind: 'skip', reason: 'no-prod' };
  if (pct >= 100) return { kind: 'skip', reason: 'at-100' };
  if (paused) return { kind: 'skip', reason: 'paused' };

  if (!sloOk) {
    if (prevOk === false) return { kind: 'rollback' };
    return { kind: 'record-nok' };
  }

  const cap = parisHourCap(hourParis);
  const nextPct = Math.min(pct + step, cap);
  return { kind: 'bump', nextPct, cap, promote: nextPct >= 100 };
}

// Build the next sloChecks ring buffer. Newest entry first, capped to
// CANARY_RING_BUFFER_SIZE. The 500-char excerpt cap + 10-entry size keeps
// the value well under Edge Config's 8 KB per-item limit.
export function appendSloCheck(existing: SloCheck[] | undefined, entry: SloCheck): SloCheck[] {
  const prior = existing ?? [];
  const next = [entry, ...prior];
  return next.slice(0, CANARY_RING_BUFFER_SIZE);
}

// Compute the post-tick exposure pct for sloCheck recording. Rollback → 0,
// bump → nextPct, single-NOK-no-rollback / skip → unchanged.
export function pctAfterTick(pctBefore: number, decision: CanaryDecision): number {
  if (decision.kind === 'rollback') return 0;
  if (decision.kind === 'bump') return decision.nextPct;
  return pctBefore;
}

export function trimBodyExcerpt(body: string): string {
  return body.slice(0, CANARY_BODY_EXCERPT_MAX).replace(/[\r\n]+/g, ' ');
}

// Re-export for callers that build the patch payload off ShadowConfig directly.
export type { ShadowConfig };
