// Edge-runtime-safe entry point.
// Must not import node:crypto, node:fs, or any Node.js built-in.
export * from './types.js';
export {
  getShadowConfig,
  resolveConfigKey,
  clearConfigCache,
} from './edge-config/read.js';
export {
  shadowCanaryMiddleware,
  type ShadowCanaryMiddlewareOptions,
} from './middleware/compose.js';
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
