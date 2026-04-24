import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig, readShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

const DEFAULT_STEP = 4;
const MAX_STEP = 50;

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let step = DEFAULT_STEP;
  try {
    const body = (await request.json().catch(() => ({}))) as { step?: unknown };
    if (body.step !== undefined) {
      const n = Number(body.step);
      if (!Number.isFinite(n) || n < 1 || n > MAX_STEP) {
        return NextResponse.json(
          { error: `invalid_step — must be a number in [1, ${MAX_STEP}]` },
          { status: 400 },
        );
      }
      step = Math.round(n);
    }
  } catch {
    // fall through to default
  }

  try {
    const current = (await readShadowConfig()) ?? {};
    const pct = current.trafficProdCanaryPercent ?? 100;
    if (pct <= 0) {
      return NextResponse.json({ error: 'already_at_0' }, { status: 409 });
    }
    const next = Math.max(0, pct - step);
    const config = await patchShadowConfig({ trafficProdCanaryPercent: next });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
