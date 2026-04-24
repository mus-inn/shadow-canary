export type ShadowConfig = {
  // New prod deploy URL (custom domain aliased to this). Middleware runs here.
  deploymentDomainProd?: string;
  // Previous prod deploy URL, kept during canary so the ramp can route a
  // fraction of prod traffic back to the known-good deploy. Cleared at 100%.
  deploymentDomainProdPrevious?: string;
  // Master branch deploy URL — receives `trafficShadowPercent` of traffic.
  deploymentDomainShadow?: string;
  // Previous master deploy URL. Kept for back-compat with v0.4.x — populated
  // as `shadowHistory[0]?.url` by deploy-shadow.yml. New code should read
  // `shadowHistory` instead; this field will be removed in v0.5.
  /** @deprecated Use `shadowHistory` instead. */
  deploymentDomainShadowPrevious?: string;
  // Ring buffer of the last 20 outgoing shadow deploy URLs (most recent
  // first). Prepended to by deploy-shadow.yml on every push to `master`
  // (only when the incoming URL differs from the current one — no dupes on
  // re-deploys of the same commit). Commit metadata (sha, branch, message,
  // deployedAt) is fetched on-demand from Vercel API via getDeploymentByUrl.
  // Admin UI renders this as a scrollable list with per-entry "Rollback to
  // this" so operators can go further back than one step when the most
  // recent shadow is known-bad.
  shadowHistory?: string[];
  // Static share routed to the master (shadow) deploy. Canary-independent.
  trafficShadowPercent?: number;
  // Share of the prod bucket that stays on the new prod deploy. Ramps 0→100
  // while a canary is in progress. 100 (or absent) means no canary.
  trafficProdCanaryPercent?: number;
  canaryPaused?: boolean;
  canaryStartedAt?: string; // ISO timestamp, set when canary goes active
  shadowForceIPs?: string[];
  // Ring buffer of the last 10 SLO check results written by canary-ramp.yml.
  // Most recent first. Used by the admin UI to surface why the canary isn't
  // advancing (failing checks vs. passing but gated, etc.) without having to
  // dig into GitHub Actions logs.
  sloChecks?: SloCheck[];
};

export type SloCheck = {
  ts: string; // ISO timestamp of when the check finished
  ok: boolean; // true iff both HTTP probes returned 200
  codes: number[]; // HTTP status codes for each of the 2 probes (0 = unreachable)
  bodyExcerpt: string; // first ~80 chars of the last probe's response body
  pctBefore: number; // trafficProdCanaryPercent at the start of the tick
  pctAfter: number; // value written to Edge Config after this check (0 on rollback)
};

export type Deployment = {
  uid: string;
  url: string;
  name: string;
  state: string;
  createdAt: number;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    githubCommitMessage?: string;
  };
};
