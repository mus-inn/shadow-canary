import type { Status } from '../types/dashboard';

export const STATUS_LABEL: Record<Status, string> = {
  stable: 'Stable · pas de canary',
  starting: 'Canary armé · en attente du premier check SLO',
  ramping: 'Canary en progression',
  paused: 'Canary en pause',
  'complete-sticky': 'Canary complet · sticky tail en cours',
  unknown: 'État inconnu',
};

export const PHASE_LABEL_MORNING = 'Matin · cap 20% jusqu’à 12:00 Paris';
export const PHASE_LABEL_AFTERNOON =
  'Après-midi · ramp jusqu’à 100% (step +4/15min)';
