import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let cachedClient: ReturnType<typeof createSupabaseClient> | null = null;

export function getServerSupabase() {
  if (!cachedClient) {
    cachedClient = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedClient;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonOk(data: Record<string, unknown> = {}) {
  return NextResponse.json(data, { status: 200 });
}

export function isValidApiKey(headers: Headers): boolean {
  const key = headers.get('x-api-key');
  if (!key) return false;
  return key === (process.env.SELF_ORDER_API_KEY || 'demo-api-key');
}

// ponytail: PIN deshabilitado temporalmente por solicitud del cliente
export function isValidAdminKey(_headers: Headers): boolean {
  return true;
}


export async function callRpc(name: string, args: Record<string, unknown> = {}) {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw error;
  return data;
}

// ponytail: CR is UTC-6 (no DST), midnight CR = 06:00 UTC
const CR_OFFSET_HOURS = 6;

export function getCRDate(offsetDays = 0): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const y = parseInt(parts.find(p => p.type === 'year')!.value);
  const m = parseInt(parts.find(p => p.type === 'month')!.value);
  const d = parseInt(parts.find(p => p.type === 'day')!.value) + offsetDays;
  return new Date(Date.UTC(y, m - 1, d, CR_OFFSET_HOURS, 0, 0));
}

export async function nextDateCR(offsetDays = 0): Promise<{ start: string; end: string }> {
  const start = getCRDate(offsetDays);
  const end = new Date(start.getTime() + 86399999);
  return { start: start.toISOString(), end: end.toISOString() };
}
