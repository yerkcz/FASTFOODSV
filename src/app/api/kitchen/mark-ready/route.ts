import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;
    const body = (await request.json()) as { itemId?: unknown; listo?: unknown };
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    if (!itemId) return jsonError('itemId requerido');

    const ready = body.listo === undefined ? true : Boolean(body.listo);
    const supabase = getServerSupabase();
    const { data: item } = await supabase
      .from('orden_items')
      .select('id, orden_id')
      .eq('id', itemId)
      .single();
    if (!item) return jsonError('Item no encontrado', 404);

    const { data: order } = await supabase
      .from('ordenes')
      .select('estado')
      .eq('id', item.orden_id)
      .single();
    if (order?.estado !== 'abierta') {
      return jsonError('No se puede modificar una orden cerrada', 400);
    }

    const { error } = await supabase.from('orden_items')
      .update({ listo: ready, estado_kds: ready ? 'listo' : 'pendiente' })
      .eq('id', itemId);
    if (error) throw error;
    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/kitchen/mark-ready:', err);
    return jsonError('Error', 500);
  }
}
