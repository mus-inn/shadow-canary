import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for Skew Protection: appends ?dpl=<deployment-id> to static asset
  // URLs so cross-deploy rewrites (shadow/canary) resolve assets to the correct
  // deployment. Must NOT use --prebuilt in CI (see .github/workflows/).
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
};

export default nextConfig;
