import { createHmac, timingSafeEqual } from 'node:crypto';

const ADMIN_USER = process.env['ADMIN_USER'] ?? 'admin';
const ADMIN_PASS = process.env['ADMIN_PASS'] ?? '12345';
const SESSION_SECRET =
  process.env['ADMIN_SESSION_SECRET'] ?? 'dev-only-insecure-change-me';

export const SESSION_COOKIE = 'admin-session';
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

const PAYLOAD = 'admin';

function sign(value: string): string {
  return createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyCredentials(user: string, pass: string): boolean {
  return safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASS);
}

export function createSessionToken(): string {
  return `${PAYLOAD}.${sign(PAYLOAD)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  return safeEqual(sig, sign(payload));
}
