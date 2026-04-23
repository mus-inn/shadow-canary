export const dynamic = 'force-dynamic';

// Canary health endpoint. Hit during canary ramp by .github/workflows/canary-ramp.yml
// against the new prod deploy URL. 200 = OK (bump allowed), non-200 = NOK (rollback).
//
// TODO: wire Sentry API. Query issue stats for this deployment over the last
// 15 min, compare 500 rate vs baseline, return 500 if rate exceeds threshold.
//
// For now: 200 unless forced to fail via SLO_FORCE_FAIL=1 (env) or ?fail=1 (query).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceFail =
    process.env.SLO_FORCE_FAIL === '1' || url.searchParams.get('fail') === '1';

  if (forceFail) {
    return Response.json(
      { ok: false, reason: 'simulated_failure' },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  });
}
