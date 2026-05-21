// Polling interval for the dashboard data refresh (state + deployments +
// bucket info + shadow history). Matches the cron min granularity loosely.
export const REFRESH_INTERVAL_MS = 10_000;

// Wall-clock tick used for relative-time labels. Independent from the data
// refresh so the countdown updates smoothly without network calls.
export const TICK_MS = 1_000;

// Manual canary step controls (% points).
export const STEP_MIN = 1;
export const STEP_MAX = 50;
export const STEP_DEFAULT = 4;

// `canary-ramp.yml` cron period: 15 minutes.
export const SLO_CHECK_PERIOD_MS = 15 * 60_000;

// History caps surfaced by the API routes (purely cosmetic; kept here so the
// "X / 20" / "X / 10" badges stay in sync with the route implementations).
export const SHADOW_HISTORY_CAP = 20;
export const SLO_CHECKS_CAP = 10;
