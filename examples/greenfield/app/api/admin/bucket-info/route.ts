import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getDeploymentByUrl, readShadowConfig } from '@/lib/admin-vercel';
import type { Deployment } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

type BucketInfo = {
  url: string | null;
  sha: string | null;
  ref: string | null;
  message: string | null;
  createdAt: number | null;
  state: string | null;
} | null;

function summarize(d: Deployment | null, url: string | undefined): BucketInfo {
  if (!url) return null;
  if (!d) return { url, sha: null, ref: null, message: null, createdAt: null, state: null };
  return {
    url,
    sha: d.meta?.githubCommitSha ?? null,
    ref: d.meta?.githubCommitRef ?? null,
    message: d.meta?.githubCommitMessage ?? null,
    createdAt: d.createdAt ?? null,
    state: d.state ?? null,
  };
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const config = await readShadowConfig();
    if (!config) return NextResponse.json({ shadow: null, prodNew: null, prodPrevious: null });

    const [shadowDep, prodNewDep, prodPrevDep] = await Promise.all([
      getDeploymentByUrl(config.deploymentDomainShadow),
      getDeploymentByUrl(config.deploymentDomainProd),
      getDeploymentByUrl(config.deploymentDomainProdPrevious),
    ]);

    return NextResponse.json({
      shadow: summarize(shadowDep, config.deploymentDomainShadow),
      prodNew: summarize(prodNewDep, config.deploymentDomainProd),
      prodPrevious: summarize(prodPrevDep, config.deploymentDomainProdPrevious),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
