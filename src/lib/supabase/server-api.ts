import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
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

export function isValidAdminKey(headers: Headers): boolean {
  const key = headers.get('x-admin-key');
  if (!key) return false;
  return key === (process.env.ADMIN_API_KEY || '0000');
}


export async function callRpc(name: string, args: Record<string, unknown> = {}) {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw error;
  return data;
}

export async function nextDateCR(offsetDays = 0): Promise<{ start: string; end: string }> {
  const now = new Date();
  const crNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));
  const start = new Date(crNow);
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}
