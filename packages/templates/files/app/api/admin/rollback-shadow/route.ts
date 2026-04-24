import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig, readShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

// Swap the current shadow deploy URL with the previous one saved by
// deploy-shadow.yml. Symmetric to the prod rollback, but no Vercel promote
// needed — shadow is addressed by per-deploy URL in the middleware rewrite,
// not via the custom domain alias. The current shadow URL moves into
// `deploymentDomainShadowPrevious` so the operator can toggle back if the
// rollback itself was a mistake.
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const current = await readShadowConfig();
    const prev = current?.deploymentDomainShadowPrevious;
    const cur = current?.deploymentDomainShadow;

    if (!prev) {
      return NextResponse.json(
        {
          error:
            'no_previous_shadow — there is no deploymentDomainShadowPrevious to swap to. Push a new shadow deploy first.',
        },
        { status: 400 },
      );
    }

    const config = await patchShadowConfig({
      deploymentDomainShadow: prev,
      deploymentDomainShadowPrevious: cur, // keep the "rolled-back" URL so we can toggle back
    });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
