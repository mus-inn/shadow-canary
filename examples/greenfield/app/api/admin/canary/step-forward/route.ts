import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig, readShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

const STEP = 4;

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const current = (await readShadowConfig()) ?? {};
    const pct = current.trafficProdCanaryPercent ?? 100;
    if (pct >= 100) {
      return NextResponse.json({ error: 'already_at_100' }, { status: 409 });
    }
    const next = Math.min(100, pct + STEP);
    const config = await patchShadowConfig({ trafficProdCanaryPercent: next });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
