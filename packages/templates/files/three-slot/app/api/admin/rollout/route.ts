import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig, readShadowConfig } from '@/lib/admin-vercel';

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

  try {
    // Validate the invariant nightly + canary ≤ 100 against the EFFECTIVE
    // config (current stored values merged with this patch), not just the
    // fields sent in this request — a partial patch (`{ nightly: 80 }`) must
    // still account for the stored canary share. production gets the rest.
    const current = (await readShadowConfig()) ?? {};
    const effNightly =
      patch.trafficNightlyPercent ?? current.trafficNightlyPercent ?? 0;
    const effCanary =
      patch.trafficCanaryPercent ?? current.trafficCanaryPercent ?? 0;
    if (effNightly + effCanary > 100) {
      return NextResponse.json(
        {
          error: `nightly (${effNightly}) + canary (${effCanary}) must not exceed 100`,
        },
        { status: 400 },
      );
    }

    const config = await patchShadowConfig(patch);
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
