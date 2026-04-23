import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const config = await patchShadowConfig({ canaryPaused: false });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
