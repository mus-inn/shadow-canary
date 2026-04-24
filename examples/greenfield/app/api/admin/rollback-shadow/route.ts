import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { patchShadowConfig, readShadowConfig } from '@/lib/admin-vercel';

export const dynamic = 'force-dynamic';

// Swap the current shadow deploy URL with an older one from history. No
// Vercel promote needed — shadow is addressed by per-deploy URL in the
// middleware rewrite, not via the custom domain alias.
//
// Body: { targetUrl?: string }
// - If `targetUrl` is provided, it must be in `shadowHistory` (or the legacy
//   `deploymentDomainShadowPrevious`). Lets operators rollback further than
//   one step when a few recent shadows are all known-bad.
// - If omitted, defaults to the most recent history entry (previous shadow).
//
// After the swap, the old current URL is prepended to history (deduped) and
// the chosen URL is removed from its old position — so the rollback target
// doesn't appear twice.
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { targetUrl?: string } = {};
  try {
    body = (await request.json().catch(() => ({}))) as { targetUrl?: string };
  } catch {
    // Empty body = use default (most recent previous).
  }

  try {
    const current = await readShadowConfig();
    const cur = current?.deploymentDomainShadow;

    // Union of new shadowHistory and the deprecated deploymentDomainShadowPrevious.
    const history = (current?.shadowHistory ?? []).slice();
    if (
      current?.deploymentDomainShadowPrevious &&
      !history.includes(current.deploymentDomainShadowPrevious)
    ) {
      history.unshift(current.deploymentDomainShadowPrevious);
    }

    const target = body.targetUrl ?? history[0];
    if (!target) {
      return NextResponse.json(
        {
          error:
            'no_history — no previous shadow to swap to. Push a new shadow deploy first.',
        },
        { status: 400 },
      );
    }
    if (body.targetUrl && !history.includes(body.targetUrl)) {
      return NextResponse.json(
        {
          error: `target_not_in_history — ${body.targetUrl} is not in shadowHistory. Refresh and pick an entry from the list.`,
        },
        { status: 400 },
      );
    }
    if (target === cur) {
      return NextResponse.json(
        { error: 'target_is_current — cannot rollback to the active shadow.' },
        { status: 400 },
      );
    }

    // New history: prepend the outgoing (cur), remove target from its old
    // position, dedupe + trim to 20.
    const nextHistory = (() => {
      const pool: string[] = [];
      if (cur) pool.push(cur);
      for (const u of history) if (u !== target) pool.push(u);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const u of pool) {
        if (seen.has(u)) continue;
        seen.add(u);
        out.push(u);
      }
      return out.slice(0, 20);
    })();

    const config = await patchShadowConfig({
      deploymentDomainShadow: target,
      shadowHistory: nextHistory,
      // Deprecated: keep in sync for v0.4.x admin UIs still reading it.
      deploymentDomainShadowPrevious: nextHistory[0] ?? undefined,
    });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
