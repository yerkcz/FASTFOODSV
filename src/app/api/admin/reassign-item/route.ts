import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, targetOrdenNu } = body;
    if (!itemId || !targetOrdenNu) return jsonError('itemId y targetOrdenNu requeridos');

    const supabase = getServerSupabase();
    const { error } = await (supabase.from('orden_items') as any)
      .update({ orden_id: targetOrdenNu })
      .eq('id', itemId);
    if (error) throw error;
    return jsonOk({ success: true });
  } catch (err) {
    return jsonError('Error al reasignar', 500);
  }
}
