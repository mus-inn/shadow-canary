import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyCredentials,
} from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData();
  const user = String(form.get('username') ?? '');
  const pass = String(form.get('password') ?? '');

  if (!verifyCredentials(user, pass)) {
    return NextResponse.redirect(new URL('/admin/login?err=1', request.url), 303);
  }

  const res = NextResponse.redirect(new URL('/admin', request.url), 303);
  res.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
