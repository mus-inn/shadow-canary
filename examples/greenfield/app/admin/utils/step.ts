import { STEP_MAX, STEP_MIN } from '../constants/config';

// Parses a user-typed step size (% points). Returns null when the draft is
// not a valid integer in [STEP_MIN, STEP_MAX] — the caller decides whether
// to disable the action or fall back to STEP_DEFAULT.
export function stepSize(draft: string): number | null {
  const n = Number(draft);
  if (!Number.isFinite(n) || n < STEP_MIN || n > STEP_MAX) return null;
  return Math.round(n);
}
