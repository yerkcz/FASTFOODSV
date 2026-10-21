import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

/**
 * POST /api/admin/reassign-item
 *
 * Mueve un orden_item de una orden a otra.
 * - Ambas órdenes deben estar ABIERTAS.
 * - Cross-mesa permitido (la UI muestra advertencia).
 * - Auditoría: transferido_desde y transferido_at se persisten.
 *
 * Body: { itemId: string, targetOrdenNu: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authError = requireStaff(request);

    if (authError) return authError;

    const body = await request.json();
    const { itemId, targetOrdenNu } = body;
    if (!itemId) return jsonError('itemId requerido');
    if (!targetOrdenNu) return jsonError('targetOrdenNu requerido');

    const supabase = getServerSupabase();

    const { data: item, error: errItem } = await supabase
      .from('orden_items')
      .select('id, orden_id')
      .eq('id', itemId)
      .single();

    if (errItem || !item) return jsonError('Item no encontrado', 404);
    if (item.orden_id === targetOrdenNu) {
      return jsonError('El item ya pertenece a esa orden', 400);
    }

    const { data: ordenOrigen } = await supabase
      .from('ordenes')
      .select('id, estado, mesa_numero, tipo')
      .eq('id', item.orden_id)
      .single();

    const { data: ordenDestino } = await supabase
      .from('ordenes')
      .select('id, estado, mesa_numero')
      .eq('id', targetOrdenNu)
      .single();

    if (!ordenOrigen || !ordenDestino) {
      return jsonError('Orden origen o destino no existe', 404);
    }
    if (ordenOrigen.estado !== 'abierta' || ordenDestino.estado !== 'abierta') {
      return jsonError('Solo se puede reasignar entre órdenes ABIERTAS', 400);
    }

    const isCrossMesa = ordenOrigen.mesa_numero !== ordenDestino.mesa_numero;

    const { error } = await supabase.from('orden_items')
      .update({
        orden_id: targetOrdenNu,
        transferido_desde: item.orden_id,
        transferido_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (error) throw error;

    const { count: remaining } = await supabase
      .from('orden_items')
      .select('id', { count: 'exact', head: true })
      .eq('orden_id', item.orden_id);

    if (remaining === 0) {
      await supabase.from('ordenes').update({ estado: 'cerrada', closed_at: new Date().toISOString() }).eq('id', item.orden_id);

      if (ordenOrigen.tipo === 'mesa' && ordenOrigen.mesa_numero) {
        const { count: stillOpen } = await supabase
          .from('ordenes')
          .select('id', { count: 'exact', head: true })
          .eq('mesa_numero', ordenOrigen.mesa_numero)
          .eq('estado', 'abierta');
        if (!stillOpen) {
          await supabase
            .from('mesas')
            .update({ estado: 'libre', orden_actual_id: null })
            .eq('numero', ordenOrigen.mesa_numero);
        }
      }
    }

    return jsonOk({
      success: true,
      cross_mesa: isCrossMesa,
      mesa_origen: ordenOrigen.mesa_numero,
      mesa_destino: ordenDestino.mesa_numero,
    });
  } catch (err: unknown) {
    console.error('Error POST /api/admin/reassign-item:', err);
    return jsonError('Error al reasignar', 500);
  }
}