import { describe, it, expect, beforeEach } from 'vitest';

// Set env before importing the module so the module-level constants pick them up.
beforeEach(() => {
  process.env['ADMIN_USER'] = 'testuser';
  process.env['ADMIN_PASS'] = 'testpass';
  process.env['ADMIN_SESSION_SECRET'] = 'test-secret-32-chars-long-enough!!';
});

// Dynamic imports so env is set first.
async function getSession() {
  // Vitest does not cache between dynamic imports in the same test process —
  // use vi.resetModules() if you need fresh module state per test.
  const mod = await import('../auth/session.js');
  return mod;
}

describe('session HMAC', () => {
  it('createSessionToken produces a valid token that verifySessionToken accepts', async () => {
    const { createSessionToken, verifySessionToken } = await getSession();
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });

  it('verifySessionToken rejects undefined', async () => {
    const { verifySessionToken } = await getSession();
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it('verifySessionToken rejects empty string', async () => {
    const { verifySessionToken } = await getSession();
    expect(verifySessionToken('')).toBe(false);
  });

  it('verifySessionToken rejects a tampered signature', async () => {
    const { createSessionToken, verifySessionToken } = await getSession();
    const token = createSessionToken();
    // Flip the last char of the signature
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifySessionToken(tampered)).toBe(false);
  });

  it('verifySessionToken rejects a token with tampered payload', async () => {
    const { createSessionToken, verifySessionToken } = await getSession();
    const token = createSessionToken();
    const [, sig] = token.split('.');
    const tampered = `evil.${sig}`;
    expect(verifySessionToken(tampered)).toBe(false);
  });

  it('verifySessionToken rejects a token with no dot separator', async () => {
    const { verifySessionToken } = await getSession();
    expect(verifySessionToken('nodotinhere')).toBe(false);
  });

  it('SESSION_COOKIE is a non-empty string', async () => {
    const { SESSION_COOKIE } = await getSession();
    expect(typeof SESSION_COOKIE).toBe('string');
    expect(SESSION_COOKIE.length).toBeGreaterThan(0);
  });

  it('SESSION_MAX_AGE is a positive number (8 hours)', async () => {
    const { SESSION_MAX_AGE } = await getSession();
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 8);
  });
});

describe('verifyCredentials', () => {
  it('accepts correct credentials', async () => {
    const { verifyCredentials } = await getSession();
    expect(verifyCredentials('testuser', 'testpass')).toBe(true);
  });

  it('rejects wrong password', async () => {
    const { verifyCredentials } = await getSession();
    expect(verifyCredentials('testuser', 'wrongpass')).toBe(false);
  });

  it('rejects wrong username', async () => {
    const { verifyCredentials } = await getSession();
    expect(verifyCredentials('wronguser', 'testpass')).toBe(false);
  });

  it('rejects both wrong', async () => {
    const { verifyCredentials } = await getSession();
    expect(verifyCredentials('bad', 'bad')).toBe(false);
  });
});
