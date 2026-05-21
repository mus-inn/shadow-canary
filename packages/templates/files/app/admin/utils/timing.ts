import type { ShadowConfig } from '@/lib/admin-vercel';
import { SLO_CHECK_PERIOD_MS } from '../constants/config';
import { nextCronFireMs } from './time';

export type Timing = {
  startedAt: number | null;
  elapsed: number | null;
  expectedNextTs: number | null;
  msToNext: number | null;
  overdue: boolean;
};

// "Next check" is anchored on the last recorded SLO check + 15min when one
// exists (what actually happened) rather than the theoretical cron schedule.
// GH Actions cron has multi-minute latency and can fire at :03 instead of
// :00 — using the theoretical next :00/:15/:30/:45 would drift from reality
// by that margin. When no SLO check has run yet, fall back to the cron grid.
export function computeTiming(
  cfg: ShadowConfig | null,
  now: number | null,
): Timing {
  const startedAt = cfg?.canaryStartedAt
    ? new Date(cfg.canaryStartedAt).getTime()
    : null;
  const elapsed = startedAt !== null && now !== null ? now - startedAt : null;

  const lastSloTs = cfg?.sloChecks?.[0]?.ts
    ? new Date(cfg.sloChecks[0].ts).getTime()
    : null;
  const expectedNextTs =
    lastSloTs !== null
      ? lastSloTs + SLO_CHECK_PERIOD_MS
      : now !== null
        ? nextCronFireMs(now)
        : null;

  // Signed: positive = still to come, negative = overdue (cron is late).
  const msToNext =
    expectedNextTs !== null && now !== null ? expectedNextTs - now : null;
  const overdue = msToNext !== null && msToNext < 0;

  return { startedAt, elapsed, expectedNextTs, msToNext, overdue };
}
