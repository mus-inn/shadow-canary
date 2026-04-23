import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

// Finish the canary immediately at 100%. Previous URL stays (same semantics
// as the cron reaching 100% naturally), so existing `prod-previous` sessions
// finish there; new visitors land on new prod.
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const config = await patchShadowConfig(
      { trafficProdCanaryPercent: 100, canaryPaused: false },
      { unset: ['canaryStartedAt'] },
    );
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
