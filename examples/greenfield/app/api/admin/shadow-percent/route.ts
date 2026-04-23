import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { value?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const value = Number(body?.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return NextResponse.json(
      { error: 'value must be a number between 0 and 100' },
      { status: 400 },
    );
  }

  try {
    const config = await patchShadowConfig({
      trafficShadowPercent: Math.round(value * 100) / 100, // keep 2 decimals
    });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
