import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

function clientKey(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

function consumeAttempt(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  if (current.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }
  current.count += 1;
  attempts.set(key, current);
  return { allowed: true, remaining: MAX_ATTEMPTS - current.count };
}

function samePin(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  const gate = consumeAttempt(key);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Esperá 10 minutos.' },
      { status: 429, headers: { 'Retry-After': String(WINDOW_MS / 1000) } }
    );
  }

  let pin = '';
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  if (!pin || pin.length > 32) {
    return NextResponse.json({ error: 'PIN requerido' }, { status: 400 });
  }

  const expected = process.env.ADMIN_API_KEY || process.env.ADMIN_PIN || '0000';
  if (!samePin(pin, expected)) {
    return NextResponse.json(
      { error: 'PIN incorrecto' },
      { status: 401, headers: { 'X-Attempts-Remaining': String(gate.remaining) } }
    );
  }

  attempts.delete(key);
  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  return response;
}
