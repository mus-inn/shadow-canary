import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getDeploymentByUrl, readShadowConfig } from '@/lib/admin-vercel';
import type { Deployment } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

type HistoryEntry = {
  url: string;
  sha: string | null;
  ref: string | null;
  message: string | null;
  createdAt: number | null;
  state: string | null;
};

function summarize(url: string, d: Deployment | null): HistoryEntry {
  if (!d)
    return { url, sha: null, ref: null, message: null, createdAt: null, state: null };
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
    // Union of new `shadowHistory` + legacy `deploymentDomainShadowPrevious`.
    // The legacy field will be absent once v0.4.x deploys roll over.
    const urls = (config?.shadowHistory ?? []).slice();
    if (
      config?.deploymentDomainShadowPrevious &&
      !urls.includes(config.deploymentDomainShadowPrevious)
    ) {
      urls.unshift(config.deploymentDomainShadowPrevious);
    }

    const entries = await Promise.all(
      urls.map(async (url) => {
        try {
          const d = await getDeploymentByUrl(url);
          return summarize(url, d);
        } catch {
          return summarize(url, null);
        }
      }),
    );
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
