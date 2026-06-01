import { NextRequest, NextResponse } from 'next/server';
import { slotCanaryProxy } from '@dotworld/shadow-canary-core';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|admin|.*\\..*).*)'],
};

// Fixed 3-slot routing. Only the production Custom Environment (which holds the
// public domain) runs the split; nightly / canary / preview deploys pass
// through and serve their own content. The slot is identified by
// VERCEL_TARGET_ENV inside the lib — no caller config needed.
export async function proxy(req: NextRequest) {
  const res = await slotCanaryProxy(req);
  return res ?? NextResponse.next();
}
