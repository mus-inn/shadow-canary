import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig, promoteDeployment } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

// Roll back (or forward) the custom domain to an arbitrary existing deployment.
// Vercel re-aliases the domain, then Edge Config is updated so middleware on
// the promoted deploy knows it's the current prod.
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { deploymentId?: string; deploymentUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { deploymentId, deploymentUrl } = body;
  if (!deploymentId || !deploymentUrl) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  try {
    await promoteDeployment(deploymentId);
    const config = await patchShadowConfig(
      {
        deploymentDomainProd: deploymentUrl,
        trafficProdCanaryPercent: 100,
        canaryPaused: false,
      },
      { unset: ['deploymentDomainProdPrevious'] },
    );
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
