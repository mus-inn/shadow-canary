import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { patchShadowConfig, readShadowConfig } from '@/lib/admin-vercel';
import {
  appendSloCheck,
  decideAction,
  extractPrevOk,
  getParisHour,
  pctAfterTick,
  trimBodyExcerpt,
} from '@/lib/canary/tick';

// Vercel Cron entry point. Registered in vercel.json with `*/15 * * * *`.
// Replaces the GH Actions cron in canary-ramp.yml (kept around for
// workflow_dispatch hand-trigger only). Vercel Cron fires on time with
// guaranteed delivery; the GH Actions schedule was best-effort and could be
// silently cancelled by the deploy-shadow concurrency group.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SLO_FETCH_TIMEOUT_MS = 10_000;

type TickSummary =
  | { skipped: true; reason: 'no-prod' | 'at-100' | 'paused'; pct: number }
  | {
      skipped: false;
      sloOk: boolean;
      sloCode: number;
      action: 'bump' | 'rollback' | 'record-nok';
      pctBefore: number;
      pctAfter: number;
      promoted: boolean;
    };

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get('authorization');
  if (!header) return false;
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const provided = Buffer.from(header, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');
  if (provided.length !== expectedBuf.length) return false;
  return timingSafeEqual(provided, expectedBuf);
}

async function fetchSlo(prodUrl: string): Promise<{ code: number; body: string }> {
  const sloAuth = process.env.SLO_AUTH_TOKEN ?? '';
  const url = prodUrl.startsWith('http') ? prodUrl : `https://${prodUrl}`;
  const sloUrl = `${url.replace(/\/$/, '')}/api/slo`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLO_FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = {
    authorization: `Bearer ${sloAuth}`,
  };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  try {
    const res = await fetch(sloUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    const body = await res.text().catch(() => '');
    return { code: res.status, body };
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : 'unknown';
    return { code: 0, body: `fetch_failed: ${msg}` };
  }
}

async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL_MONITORING_CHANNEL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error('[canary-tick] slack notify failed:', e instanceof Error ? e.message : e);
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.SLO_AUTH_TOKEN) {
    // Fail loudly: missing token would surface as every /api/slo call
    // returning 401 → permanent rollback loop.
    console.error('[canary-tick] SLO_AUTH_TOKEN missing — refusing to tick.');
    return NextResponse.json({ error: 'slo_auth_token_missing' }, { status: 500 });
  }

  let configRaw;
  try {
    configRaw = await readShadowConfig();
  } catch (e) {
    console.error('[canary-tick] readShadowConfig failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'edge_config_unavailable' }, { status: 500 });
  }
  const config = configRaw ?? {};
  const pct = config.trafficProdCanaryPercent ?? 100;
  const paused = config.canaryPaused ?? false;
  const prodUrl = config.deploymentDomainProd;
  const prevOk = extractPrevOk(config.sloChecks, config.canaryStartedAt);

  const preDecision = decideAction({
    pct,
    paused,
    prodUrl,
    sloOk: true, // tentative — only used to short-circuit skip cases
    prevOk,
    hourParis: getParisHour(),
  });
  if (preDecision.kind === 'skip') {
    const summary: TickSummary = { skipped: true, reason: preDecision.reason, pct };
    return NextResponse.json(summary);
  }
  // preDecision !== 'skip' implies prodUrl is set (decideAction skips on
  // undefined prodUrl first). Narrow for TS.
  if (!prodUrl) {
    return NextResponse.json({ skipped: true, reason: 'no-prod', pct });
  }

  const slo = await fetchSlo(prodUrl);
  const sloOk = slo.code === 200;
  const bodyExcerpt = trimBodyExcerpt(slo.body);

  const decision = decideAction({
    pct,
    paused,
    prodUrl,
    sloOk,
    prevOk,
    hourParis: getParisHour(),
  });

  if (decision.kind === 'skip') {
    // Defensive: state may have changed between pre-check and slo call.
    const summary: TickSummary = { skipped: true, reason: decision.reason, pct };
    return NextResponse.json(summary);
  }

  if (decision.kind === 'bump') {
    const patch: Parameters<typeof patchShadowConfig>[0] = {
      trafficProdCanaryPercent: decision.nextPct,
    };
    if (decision.promote) patch.canaryStartedAt = undefined;
    const opts = decision.promote ? { unset: ['canaryStartedAt' as const] } : undefined;
    try {
      await patchShadowConfig(patch, opts);
    } catch (e) {
      console.error('[canary-tick] bump patch failed:', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 'patch_failed' }, { status: 500 });
    }
    if (decision.promote) {
      await notifySlack(
        `:white_check_mark: Canary reached 100% on \`${prodUrl}\` — new users go straight to new prod; in-flight sessions on previous finish there until next deploy.`,
      );
    }
  } else if (decision.kind === 'rollback') {
    try {
      // Pause too so the cron doesn't auto-recover on a transient SLO flake —
      // a human should look at Sentry and Resume via /admin if safe.
      await patchShadowConfig({ trafficProdCanaryPercent: 0, canaryPaused: true });
    } catch (e) {
      console.error('[canary-tick] rollback patch failed:', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 'patch_failed' }, { status: 500 });
    }
    await notifySlack(
      `:rotating_light: Canary rolled back to 0% on \`${prodUrl}\` (was ${pct}%). 2 consecutive SLO failures — all prod traffic back on previous deploy. Check Sentry.`,
    );
  }

  const pctAfter = pctAfterTick(pct, decision);
  const entry = {
    ts: new Date().toISOString(),
    ok: sloOk,
    codes: [slo.code],
    bodyExcerpt,
    pctBefore: pct,
    pctAfter,
  };
  // Re-read so we merge the ring on top of the post-bump value rather than
  // overwriting the pct the previous patch just set.
  let fresh;
  try {
    fresh = await readShadowConfig();
  } catch {
    fresh = null;
  }
  const sloChecks = appendSloCheck(fresh?.sloChecks, entry);
  try {
    await patchShadowConfig({ sloChecks });
  } catch (e) {
    console.error('[canary-tick] sloChecks record failed:', e instanceof Error ? e.message : e);
  }

  const summary: TickSummary = {
    skipped: false,
    sloOk,
    sloCode: slo.code,
    action: decision.kind,
    pctBefore: pct,
    pctAfter,
    promoted: decision.kind === 'bump' && decision.promote,
  };
  return NextResponse.json(summary);
}
