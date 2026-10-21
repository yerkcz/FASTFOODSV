import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function clearSession() {
  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function POST() {
  return clearSession();
}
