import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;

    const body = (await request.json()) as { itemId?: unknown };
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    if (!itemId) return jsonError('itemId requerido');

    const supabase = getServerSupabase();

    const { data: item } = await supabase
      .from('orden_items')
      .select('id, orden_id')
      .eq('id', itemId)
      .single();
    if (!item) return jsonError('Item no encontrado', 404);

    const { data: order } = await supabase
      .from('ordenes')
      .select('id, estado, mesa_numero, tipo')
      .eq('id', item.orden_id)
      .single();
    if (!order) return jsonError('Orden no encontrada', 404);
    if (order.estado !== 'abierta') {
      return jsonError('No se puede modificar una orden cerrada', 400);
    }

    const { error } = await supabase.from('orden_items').delete().eq('id', itemId);
    if (error) throw error;

    // Si era el último ítem, cerrar la orden vacía y liberar la mesa. Si no,
    // quedaría una orden de ₡0 abierta e invisible en el panel de cobro.
    const { count: remaining } = await supabase
      .from('orden_items')
      .select('id', { count: 'exact', head: true })
      .eq('orden_id', item.orden_id);

    if (remaining === 0) {
      await supabase
        .from('ordenes')
        .update({ estado: 'cerrada', closed_at: new Date().toISOString() })
        .eq('id', item.orden_id);

      if (order.tipo === 'mesa' && order.mesa_numero) {
        const { count: stillOpen } = await supabase
          .from('ordenes')
          .select('id', { count: 'exact', head: true })
          .eq('mesa_numero', order.mesa_numero)
          .eq('estado', 'abierta');
        if (!stillOpen) {
          await supabase
            .from('mesas')
            .update({ estado: 'libre', orden_actual_id: null })
            .eq('numero', order.mesa_numero);
        }
      }
    }

    return jsonOk({ success: true, order_closed: remaining === 0 });
  } catch (err) {
    console.error('Error POST /api/admin/delete-item:', err);
    return jsonError('Error al eliminar', 500);
  }
}
