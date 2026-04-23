// Server-only helpers for talking to Vercel REST API and patching Edge Config.
// Never import from client components.
// Re-exports from @shadow-canary/core — thin shim for host projects.
export { readShadowConfig, patchShadowConfig, listDeployments, promoteDeployment } from '@shadow-canary/core';
export type { ShadowConfig, Deployment } from '@shadow-canary/core';
