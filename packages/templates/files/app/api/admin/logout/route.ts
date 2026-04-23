import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL('/admin/login', request.url), 303);
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
