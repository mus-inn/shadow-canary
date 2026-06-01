import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

// Fixed 3-slot rollout editor. Sets the nightly / canary traffic shares
// (production = the remainder). Replaces the legacy `shadow-percent` +
// canary-ramp controls. Either or both percentages may be supplied.
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { nightly?: number; canary?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const patch: { trafficNightlyPercent?: number; trafficCanaryPercent?: number } =
    {};
  for (const [key, field] of [
    ['nightly', 'trafficNightlyPercent'],
    ['canary', 'trafficCanaryPercent'],
  ] as const) {
    if (body[key] === undefined) continue;
    const v = Number(body[key]);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return NextResponse.json(
        { error: `${key} must be a number between 0 and 100` },
        { status: 400 },
      );
    }
    patch[field] = Math.round(v * 100) / 100;
  }

  // Guard the invariant nightly + canary ≤ 100 (production gets the rest).
  const next = { ...patch };
  if (
    (next.trafficNightlyPercent ?? 0) + (next.trafficCanaryPercent ?? 0) >
    100
  ) {
    return NextResponse.json(
      { error: 'nightly + canary must not exceed 100' },
      { status: 400 },
    );
  }

  try {
    const config = await patchShadowConfig(patch);
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
