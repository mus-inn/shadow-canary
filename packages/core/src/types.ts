export type ShadowConfig = {
  // New prod deploy URL (custom domain aliased to this). Middleware runs here.
  deploymentDomainProd?: string;
  // Previous prod deploy URL, kept during canary so the ramp can route a
  // fraction of prod traffic back to the known-good deploy. Cleared at 100%.
  deploymentDomainProdPrevious?: string;
  // Master branch deploy URL — receives `trafficShadowPercent` of traffic.
  deploymentDomainShadow?: string;
  // Static share routed to the master (shadow) deploy. Canary-independent.
  trafficShadowPercent?: number;
  // Share of the prod bucket that stays on the new prod deploy. Ramps 0→100
  // while a canary is in progress. 100 (or absent) means no canary.
  trafficProdCanaryPercent?: number;
  canaryPaused?: boolean;
  canaryStartedAt?: string; // ISO timestamp, set when canary goes active
  shadowForceIPs?: string[];
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
