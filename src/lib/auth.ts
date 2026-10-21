import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'eas_staff_session';
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 horas

/**
 * Secreto de firma de la cookie de staff.
 *
 * `AUTH_SECRET` es el valor recomendado. Si no existe se usa la service role
 * key para no romper instalaciones existentes (`.env.local` no se modifica
 * automáticamente). En producción conviene definir `AUTH_SECRET`.
 */
const SESSION_SECRET =
  process.env.AUTH_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  'easystem-dev-only-secret';

type StaffSession = {
  role: 'staff';
  iat: number;
  exp: number;
};

function sign(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const session: StaffSession = {
    role: 'staff',
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;

  try {
    const session = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as Partial<StaffSession>;
    return (
      session.role === 'staff' &&
      typeof session.exp === 'number' &&
      session.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

export function isStaffRequest(request: NextRequest): boolean {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

/** Devuelve una respuesta 401 si la request no tiene sesión válida. */
export function requireStaff(request: NextRequest): NextResponse | null {
  if (isStaffRequest(request)) return null;
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}
