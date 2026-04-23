import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @vercel/edge-config before importing the module under test.
const getMock = vi.fn();
vi.mock('@vercel/edge-config', () => ({
  get: getMock,
}));

const {
  DEFAULT_CONFIG_KEY,
  resolveConfigKey,
  getShadowConfig,
  clearConfigCache,
} = await import('../edge-config/read.js');

describe('resolveConfigKey', () => {
  beforeEach(() => {
    delete process.env['SHADOW_CANARY_KEY'];
  });

  it('defaults to shadow-configuration', () => {
    expect(resolveConfigKey()).toBe('shadow-configuration');
    expect(DEFAULT_CONFIG_KEY).toBe('shadow-configuration');
  });

  it('reads SHADOW_CANARY_KEY env var when explicit is absent', () => {
    process.env['SHADOW_CANARY_KEY'] = 'shadow-configuration-stargaze';
    expect(resolveConfigKey()).toBe('shadow-configuration-stargaze');
  });

  it('explicit argument beats the env var', () => {
    process.env['SHADOW_CANARY_KEY'] = 'from-env';
    expect(resolveConfigKey('from-arg')).toBe('from-arg');
  });
});

describe('getShadowConfig', () => {
  beforeEach(() => {
    clearConfigCache();
    getMock.mockReset();
    delete process.env['SHADOW_CANARY_KEY'];
  });

  afterEach(() => {
    clearConfigCache();
  });

  it('reads the default key when no argument is passed', async () => {
    getMock.mockResolvedValueOnce({ trafficShadowPercent: 1 });
    await getShadowConfig();
    expect(getMock).toHaveBeenCalledWith('shadow-configuration');
  });

  it('reads the explicit configKey when provided', async () => {
    getMock.mockResolvedValueOnce({ trafficShadowPercent: 2 });
    await getShadowConfig('shadow-configuration-stargaze');
    expect(getMock).toHaveBeenCalledWith('shadow-configuration-stargaze');
  });

  it('reads the env var key when SHADOW_CANARY_KEY is set', async () => {
    process.env['SHADOW_CANARY_KEY'] = 'from-env-key';
    getMock.mockResolvedValueOnce({ trafficShadowPercent: 3 });
    await getShadowConfig();
    expect(getMock).toHaveBeenCalledWith('from-env-key');
  });

  it('caches per-key (separate projects do not cross-contaminate)', async () => {
    getMock
      .mockResolvedValueOnce({ trafficShadowPercent: 10 })
      .mockResolvedValueOnce({ trafficShadowPercent: 20 });

    const a = await getShadowConfig('key-a');
    const b = await getShadowConfig('key-b');
    expect(a).toEqual({ trafficShadowPercent: 10 });
    expect(b).toEqual({ trafficShadowPercent: 20 });
    expect(getMock).toHaveBeenCalledTimes(2);

    // Subsequent reads for the same keys hit the cache
    const aAgain = await getShadowConfig('key-a');
    const bAgain = await getShadowConfig('key-b');
    expect(aAgain).toEqual({ trafficShadowPercent: 10 });
    expect(bAgain).toEqual({ trafficShadowPercent: 20 });
    expect(getMock).toHaveBeenCalledTimes(2); // still 2
  });

  it('returns null when Edge Config has no entry for the key', async () => {
    getMock.mockResolvedValueOnce(undefined);
    const result = await getShadowConfig('missing-key');
    expect(result).toBeNull();
  });
});
