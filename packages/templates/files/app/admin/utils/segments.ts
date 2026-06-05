import type { BucketInfoMap, Segment, Status } from '../types/dashboard';
import type { TrafficShares } from './traffic';
import { shortHost } from './format';

type BuildOptions = {
  shares: TrafficShares;
  status: Status;
  canaryLive: boolean;
  prodHost: string | undefined;
  prevHost: string | undefined;
  shadowHost: string | undefined;
  bucketInfo: BucketInfoMap | null;
};

// Whether the difference between the canary knob value and the actual traffic
// share is large enough to warrant displaying both numbers. Anything under
// 0.5pt is hidden to keep the legend uncluttered when shadow is 0.
const EFFECTIVE_HINT_THRESHOLD = 0.5;

function effectiveHint(actual: number, knob: number): string | undefined {
  return Math.abs(actual - knob) >= EFFECTIVE_HINT_THRESHOLD
    ? `${actual.toFixed(1)}% du trafic total`
    : undefined;
}

export function buildTrafficSegments(opts: BuildOptions): Segment[] {
  const {
    shares: { shadowPct, canaryPct, newShare, prevShare },
    status,
    canaryLive,
    prodHost,
    prevHost,
    shadowHost,
    bucketInfo,
  } = opts;

  const segments: Segment[] = [
    {
      label: 'shadow (master)',
      widthValue: shadowPct,
      displayPct: shadowPct,
      displayUnit: 'du total',
      color: '#f97316',
      host: shortHost(shadowHost),
      active: true,
      info: bucketInfo?.shadow,
    },
  ];

  if (prevHost) {
    segments.push({
      label: 'previous prod',
      widthValue: prevShare,
      displayPct: 100 - canaryPct,
      displayUnit: 'du prod',
      effectiveHint: effectiveHint(prevShare, 100 - canaryPct),
      color: '#6366f1',
      host: shortHost(prevHost),
      active: canaryLive,
      info: bucketInfo?.prodPrevious,
    });
  }

  segments.push({
    label: 'new prod',
    widthValue: newShare,
    displayPct: canaryPct,
    displayUnit: 'du prod',
    effectiveHint: effectiveHint(newShare, canaryPct),
    color: '#22c55e',
    host: shortHost(prodHost),
    active:
      status === 'ramping' || status === 'complete-sticky' || status === 'stable',
    info: bucketInfo?.prodNew,
  });

  return segments;
}
