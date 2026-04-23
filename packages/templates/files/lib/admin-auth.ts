import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '@dotworld/shadow-canary-core';

// Re-export auth primitives from @dotworld/shadow-canary-core.
export { verifyCredentials, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@dotworld/shadow-canary-core';

// requireAdmin lives here (host-side) because it depends on next/headers,
// which is version-coupled to the host Next.js install.
export async function requireAdmin(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  return !!(token && verifySessionToken(token));
}
