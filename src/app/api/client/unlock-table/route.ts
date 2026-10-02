import { NextRequest, NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.mesa) return jsonError('mesa requerida');
    return jsonOk({ success: true, message: 'Mesa desbloqueada por 5 minutos' });
  } catch (err) {
    return jsonError('Error', 500);
  }
}
