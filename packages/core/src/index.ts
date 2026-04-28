export * from './types.js';
export {
  resolveConfigKey,
  clearConfigCache,
} from './edge-config/read.js';
export { readShadowConfig, patchShadowConfig } from './edge-config/patch.js';
export { listDeployments, getDeploymentByUrl } from './vercel/deployments.js';
export { promoteDeployment } from './vercel/promote.js';
// Middleware function is runtime-agnostic — exported here too so Next.js 16
// `proxy.ts` files (Node runtime) can import without the `/edge` subpath.
export {
  shadowCanaryMiddleware,
  shadowCanaryProxy,
  type ShadowCanaryMiddlewareOptions,
  type ShadowCanaryProxyOptions,
} from './middleware/compose.js';
export {
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from './auth/session.js';
export {
  getBuildInfo,
  getRuntimeBucket,
  formatBuildInfoTag,
  type BuildInfo,
  type RuntimeInfo,
  type ShadowCanarySlot,
  type ShadowCanaryBucket,
  type GetBuildInfoOptions,
} from './runtime/info.js';
