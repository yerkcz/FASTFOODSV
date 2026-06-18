import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, listo } = body;
    if (!itemId) return jsonError('itemId requerido');

    const ready = listo === undefined ? true : !!listo;
    const supabase = getServerSupabase();
    const { error } = await (supabase.from('orden_items') as any)
      .update({ listo: ready, estado_kds: ready ? 'listo' : 'pendiente' })
      .eq('id', itemId);
    if (error) throw error;
    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/kitchen/mark-ready:', err);
    return jsonError('Error', 500);
  }
}
