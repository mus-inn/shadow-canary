import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { listDeployments } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const deployments = await listDeployments(20);
    return NextResponse.json({ deployments });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
