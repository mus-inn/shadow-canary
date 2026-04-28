import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
vi.mock('@vercel/edge-config', () => ({ get: getMock }));

const { getBuildInfo, getRuntimeBucket, formatBuildInfoTag } = await import(
  '../runtime/info.js'
);
const { clearConfigCache } = await import('../edge-config/read.js');

const VERCEL_KEYS = [
  'VERCEL_ENV',
  'VERCEL_REGION',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_MESSAGE',
  'VERCEL_GIT_COMMIT_AUTHOR_NAME',
  'VERCEL_GIT_REPO_SLUG',
  'SHADOW_CANARY_PRODUCTION_BRANCH',
];

function clearVercelEnv(): void {
  for (const k of VERCEL_KEYS) delete process.env[k];
}

describe('getBuildInfo', () => {
  beforeEach(() => {
    clearVercelEnv();
    getMock.mockReset();
    clearConfigCache();
  });

  it('classifies an unset env as development', () => {
    expect(getBuildInfo().slot).toBe('development');
  });

  it('classifies VERCEL_ENV=preview as preview', () => {
    process.env['VERCEL_ENV'] = 'preview';
    expect(getBuildInfo().slot).toBe('preview');
  });

  it('classifies prod-branch deploy as production-track', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    expect(getBuildInfo().slot).toBe('production-track');
  });

  it('classifies non-prod-branch prod deploy as shadow', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'master';
    expect(getBuildInfo().slot).toBe('shadow');
  });

  it('honors a custom productionBranch option', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'main';
    expect(getBuildInfo({ productionBranch: 'main' }).slot).toBe(
      'production-track',
    );
    expect(getBuildInfo({ productionBranch: 'production' }).slot).toBe('shadow');
  });

  it('honors SHADOW_CANARY_PRODUCTION_BRANCH env override', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'main';
    process.env['SHADOW_CANARY_PRODUCTION_BRANCH'] = 'main';
    expect(getBuildInfo().slot).toBe('production-track');
  });

  it('disables branch filter when productionBranch is empty string', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'whatever';
    expect(getBuildInfo({ productionBranch: '' }).slot).toBe(
      'production-track',
    );
  });

  it('truncates commit SHA to 7 chars', () => {
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'abcdef0123456789';
    expect(getBuildInfo().commitShaShort).toBe('abcdef0');
  });

  it('keeps only the first line of the commit message', () => {
    process.env['VERCEL_GIT_COMMIT_MESSAGE'] = 'feat: x\n\nlong body';
    expect(getBuildInfo().commitMessage).toBe('feat: x');
  });

  it('returns null for missing env vars instead of empty string', () => {
    const info = getBuildInfo();
    expect(info.commitSha).toBeNull();
    expect(info.commitShaShort).toBeNull();
    expect(info.region).toBeNull();
  });
});

describe('getRuntimeBucket', () => {
  beforeEach(() => {
    clearVercelEnv();
    process.env['VERCEL_GIT_REPO_SLUG'] = 'demo';
    getMock.mockReset();
    clearConfigCache();
  });

  it('returns shadow without consulting Edge Config', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'master';
    const info = await getRuntimeBucket();
    expect(info.bucket).toBe('shadow');
    expect(info.resolvedFromEdgeConfig).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('returns preview / development without Edge Config', async () => {
    process.env['VERCEL_ENV'] = 'preview';
    expect((await getRuntimeBucket()).bucket).toBe('preview');
    process.env['VERCEL_ENV'] = 'development';
    expect((await getRuntimeBucket()).bucket).toBe('development');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('disambiguates prod-current via Edge Config', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    process.env['VERCEL_URL'] = 'demo-abc.vercel.app';
    getMock.mockResolvedValue({
      deploymentDomainProd: 'https://demo-abc.vercel.app',
      deploymentDomainProdPrevious: 'https://demo-old.vercel.app',
    });
    const info = await getRuntimeBucket();
    expect(info.bucket).toBe('prod-current');
    expect(info.resolvedFromEdgeConfig).toBe(true);
  });

  it('disambiguates prod-previous via Edge Config', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    process.env['VERCEL_URL'] = 'demo-old.vercel.app';
    getMock.mockResolvedValue({
      deploymentDomainProd: 'https://demo-abc.vercel.app',
      deploymentDomainProdPrevious: 'https://demo-old.vercel.app',
    });
    expect((await getRuntimeBucket()).bucket).toBe('prod-previous');
  });

  it('returns unknown when the running deploy matches neither slot', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    process.env['VERCEL_URL'] = 'demo-stale.vercel.app';
    getMock.mockResolvedValue({
      deploymentDomainProd: 'https://demo-abc.vercel.app',
    });
    const info = await getRuntimeBucket();
    expect(info.bucket).toBe('unknown');
    expect(info.resolvedFromEdgeConfig).toBe(true);
  });

  it('falls back to unknown without throwing if Edge Config errors', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    process.env['VERCEL_URL'] = 'demo-abc.vercel.app';
    getMock.mockRejectedValue(new Error('edge config down'));
    const info = await getRuntimeBucket();
    expect(info.bucket).toBe('unknown');
    expect(info.resolvedFromEdgeConfig).toBe(false);
  });
});

describe('formatBuildInfoTag', () => {
  beforeEach(() => clearVercelEnv());

  it('renders all available fields', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'abcdef0123';
    expect(formatBuildInfoTag(getBuildInfo())).toBe(
      '[production-track @ production abcdef0]',
    );
  });

  it('falls back gracefully when only the slot is known', () => {
    expect(formatBuildInfoTag(getBuildInfo())).toBe('[development]');
  });
});
