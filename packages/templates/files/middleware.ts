import { NextRequest, NextResponse } from 'next/server';
import { shadowCanaryMiddleware } from '@dotworld/shadow-canary-core/edge';

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|admin|.*\\..*).*)',
  ],
};

export async function middleware(req: NextRequest) {
  const result = await shadowCanaryMiddleware(req);
  if (result) return result;
  return NextResponse.next();
}
