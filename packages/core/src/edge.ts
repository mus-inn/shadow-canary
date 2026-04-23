// Edge-runtime-safe entry point.
// Must not import node:crypto, node:fs, or any Node.js built-in.
export * from './types.js';
export {
  getShadowConfig,
  DEFAULT_CONFIG_KEY,
  resolveConfigKey,
  clearConfigCache,
} from './edge-config/read.js';
export {
  shadowCanaryMiddleware,
  type ShadowCanaryMiddlewareOptions,
} from './middleware/compose.js';
