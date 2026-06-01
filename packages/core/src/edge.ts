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
  shadowCanaryProxy,
  type ShadowCanaryMiddlewareOptions,
  type ShadowCanaryProxyOptions,
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
// Fixed 3-slot model (v0.8+) — additive, opt-in. See `runtime/slots.ts`.
export {
  getSlotInfo,
  getSlotRuntime,
  formatSlotTag,
  type FixedSlot,
  type SlotBuildInfo,
  type SlotRuntimeInfo,
  type GetSlotInfoOptions,
} from './runtime/slots.js';
export {
  slotCanaryMiddleware,
  slotCanaryProxy,
  type SlotMiddlewareOptions,
  type SlotProxyOptions,
} from './middleware/slots.js';
