import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

// Cancel = full rollback to previous prod. Forces 0% on new and pauses so the
// cron doesn't auto-resume. The Edge Config keeps deploymentDomainProdPrevious
// so all non-shadow traffic keeps routing there; the next deploy-prod run
// will overwrite it as usual.
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const config = await patchShadowConfig({
      trafficProdCanaryPercent: 0,
      canaryPaused: true,
    });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
