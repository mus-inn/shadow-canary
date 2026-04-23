import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @vercel/edge-config before importing the module under test.
const getMock = vi.fn();
vi.mock('@vercel/edge-config', () => ({
  get: getMock,
}));

const { resolveConfigKey, getShadowConfig, clearConfigCache } = await import(
  '../edge-config/read.js'
);

describe('resolveConfigKey', () => {
  beforeEach(() => {
    delete process.env['VERCEL_GIT_REPO_SLUG'];
    delete process.env['SHADOW_CANARY_KEY'];
  });

  it('derives the key as shadow-<slug>-canary from VERCEL_GIT_REPO_SLUG', () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = 'my-app';
    expect(resolveConfigKey()).toBe('shadow-my-app-canary');
  });

  it('throws when VERCEL_GIT_REPO_SLUG is missing, with actionable remediation', () => {
    expect(() => resolveConfigKey()).toThrow(/VERCEL_GIT_REPO_SLUG/);
    // The `vercel env pull` hint is load-bearing UX — pin it so a future edit
    // can't silently strip the remediation guidance.
    expect(() => resolveConfigKey()).toThrow(/vercel env pull/);
  });

  it('throws when VERCEL_GIT_REPO_SLUG is whitespace-only', () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = '   ';
    expect(() => resolveConfigKey()).toThrow(/VERCEL_GIT_REPO_SLUG/);
  });

  it('throws when VERCEL_GIT_REPO_SLUG contains invalid characters', () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = '../other-app';
    expect(() => resolveConfigKey()).toThrow(/valid repo slug/);
  });

  it('accepts dots, underscores, and hyphens in slug', () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = 'my.cool_app-v2';
    expect(resolveConfigKey()).toBe('shadow-my.cool_app-v2-canary');
  });

  it('trims leading/trailing whitespace', () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = '  my-app  ';
    expect(resolveConfigKey()).toBe('shadow-my-app-canary');
  });

  it('ignores the legacy SHADOW_CANARY_KEY env var (key is not configurable)', () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = 'my-app';
    process.env['SHADOW_CANARY_KEY'] = 'legacy-override';
    expect(resolveConfigKey()).toBe('shadow-my-app-canary');
  });
});

describe('getShadowConfig', () => {
  beforeEach(() => {
    clearConfigCache();
    getMock.mockReset();
    delete process.env['VERCEL_GIT_REPO_SLUG'];
  });

  afterEach(() => {
    clearConfigCache();
  });

  it('reads the derived key', async () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = 'stargaze';
    getMock.mockResolvedValueOnce({ trafficShadowPercent: 1 });
    await getShadowConfig();
    expect(getMock).toHaveBeenCalledWith('shadow-stargaze-canary');
  });

  it('caches per-slug (separate projects do not cross-contaminate)', async () => {
    getMock
      .mockResolvedValueOnce({ trafficShadowPercent: 10 })
      .mockResolvedValueOnce({ trafficShadowPercent: 20 });

    process.env['VERCEL_GIT_REPO_SLUG'] = 'app-a';
    const a = await getShadowConfig();
    process.env['VERCEL_GIT_REPO_SLUG'] = 'app-b';
    const b = await getShadowConfig();
    expect(a).toEqual({ trafficShadowPercent: 10 });
    expect(b).toEqual({ trafficShadowPercent: 20 });
    expect(getMock).toHaveBeenCalledTimes(2);

    // Subsequent reads for the same slugs hit the cache
    process.env['VERCEL_GIT_REPO_SLUG'] = 'app-a';
    const aAgain = await getShadowConfig();
    process.env['VERCEL_GIT_REPO_SLUG'] = 'app-b';
    const bAgain = await getShadowConfig();
    expect(aAgain).toEqual({ trafficShadowPercent: 10 });
    expect(bAgain).toEqual({ trafficShadowPercent: 20 });
    expect(getMock).toHaveBeenCalledTimes(2); // still 2
  });

  it('returns null when Edge Config has no entry for the derived key', async () => {
    process.env['VERCEL_GIT_REPO_SLUG'] = 'empty-app';
    getMock.mockResolvedValueOnce(undefined);
    const result = await getShadowConfig();
    expect(result).toBeNull();
  });

  it('warns once per missing key (so Vercel runtime logs surface the silent bail)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getMock.mockResolvedValue(undefined);

    process.env['VERCEL_GIT_REPO_SLUG'] = 'app-a';
    await getShadowConfig();
    await getShadowConfig(); // second call must NOT re-warn
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/shadow-app-a-canary/);
    expect(warn.mock.calls[0]?.[0]).toMatch(/VERCEL_GIT_REPO_SLUG/);

    // A different slug earns its own warn
    process.env['VERCEL_GIT_REPO_SLUG'] = 'app-b';
    await getShadowConfig();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toMatch(/shadow-app-b-canary/);

    warn.mockRestore();
  });

  it('throws when VERCEL_GIT_REPO_SLUG is missing', async () => {
    await expect(getShadowConfig()).rejects.toThrow(/VERCEL_GIT_REPO_SLUG/);
  });
});
