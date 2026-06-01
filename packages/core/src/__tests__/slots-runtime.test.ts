import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
vi.mock('@vercel/edge-config', () => ({ get: getMock }));

const { getSlotInfo, getSlotRuntime, formatSlotTag } = await import(
  '../runtime/slots.js'
);

const VERCEL_KEYS = [
  'VERCEL_ENV',
  'VERCEL_TARGET_ENV',
  'NEXT_PUBLIC_VERCEL_TARGET_ENV',
  'VERCEL_REGION',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_MESSAGE',
  'VERCEL_GIT_COMMIT_AUTHOR_NAME',
  'VERCEL_GIT_REPO_SLUG',
];

function clearVercelEnv(): void {
  for (const k of VERCEL_KEYS) delete process.env[k];
}

describe('getSlotInfo', () => {
  beforeEach(() => {
    clearVercelEnv();
    getMock.mockReset();
  });

  it('classifies an unset env as development', () => {
    expect(getSlotInfo().slot).toBe('development');
  });

  it('classifies each Custom Environment from VERCEL_TARGET_ENV', () => {
    for (const env of ['nightly', 'canary', 'production', 'preview'] as const) {
      process.env['VERCEL_TARGET_ENV'] = env;
      expect(getSlotInfo().slot).toBe(env);
    }
  });

  it('classifies the canary custom env even when VERCEL_ENV reports preview', () => {
    // Custom Environments report VERCEL_ENV=preview but a distinct target env.
    process.env['VERCEL_ENV'] = 'preview';
    process.env['VERCEL_TARGET_ENV'] = 'canary';
    expect(getSlotInfo().slot).toBe('canary');
  });

  it('exposes targetEnv on the build info', () => {
    process.env['VERCEL_TARGET_ENV'] = 'canary';
    expect(getSlotInfo().targetEnv).toBe('canary');
  });

  it('honors a custom targetEnvVar (the NEXT_PUBLIC mirror)', () => {
    process.env['NEXT_PUBLIC_VERCEL_TARGET_ENV'] = 'nightly';
    expect(
      getSlotInfo({ targetEnvVar: 'NEXT_PUBLIC_VERCEL_TARGET_ENV' }).slot,
    ).toBe('nightly');
  });

  it('falls back to VERCEL_ENV when VERCEL_TARGET_ENV is absent', () => {
    process.env['VERCEL_ENV'] = 'production';
    expect(getSlotInfo().slot).toBe('production');
    process.env['VERCEL_ENV'] = 'preview';
    expect(getSlotInfo().slot).toBe('preview');
  });

  it('maps an unrecognized target env to unknown', () => {
    process.env['VERCEL_TARGET_ENV'] = 'staging-xyz';
    expect(getSlotInfo().slot).toBe('unknown');
  });

  it('carries the shared build fields through (commit sha truncation)', () => {
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'abcdef0123456789';
    expect(getSlotInfo().commitShaShort).toBe('abcdef0');
  });

  it('does not read Edge Config', () => {
    process.env['VERCEL_TARGET_ENV'] = 'production';
    getSlotInfo();
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe('getSlotRuntime', () => {
  beforeEach(() => {
    clearVercelEnv();
    getMock.mockReset();
  });

  it('returns the slot as the bucket without consulting Edge Config', async () => {
    process.env['VERCEL_TARGET_ENV'] = 'canary';
    const info = await getSlotRuntime();
    expect(info.bucket).toBe('canary');
    expect(info.resolvedFromEdgeConfig).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe('formatSlotTag', () => {
  beforeEach(() => clearVercelEnv());

  it('renders all available fields', () => {
    process.env['VERCEL_TARGET_ENV'] = 'canary';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'canary';
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'abcdef0123';
    expect(formatSlotTag(getSlotInfo())).toBe('[canary @ canary abcdef0]');
  });

  it('falls back gracefully when only the slot is known', () => {
    expect(formatSlotTag(getSlotInfo())).toBe('[development]');
  });
});
