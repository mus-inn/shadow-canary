import {
  PHASE_LABEL_AFTERNOON,
  PHASE_LABEL_MORNING,
} from '../constants/labels';

// Next :00/:15/:30/:45 UTC tick from `now`. Used as a fallback when no SLO
// check has been recorded yet (we'd otherwise have no anchor to derive
// "expected next check time" from).
export function nextCronFireMs(now: number): number {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  const nextMin = Math.ceil((d.getUTCMinutes() + 0.001) / 15) * 15;
  d.setUTCMinutes(nextMin);
  return d.getTime();
}

export function parisHour(now: number): number {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hour12: false,
  }).format(new Date(now));
  return parseInt(hourStr, 10);
}

export function phaseLabel(hour: number): string {
  if (hour < 12) return PHASE_LABEL_MORNING;
  return PHASE_LABEL_AFTERNOON;
}
