import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

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
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const { itemId, targetOrdenNu } = body;
    if (!itemId) return jsonError('itemId requerido');
    if (!targetOrdenNu) return jsonError('targetOrdenNu requerido');

    const supabase = getServerSupabase();

    const { data: item, error: errItem } = await supabase
      .from('orden_items')
      .select('id, orden_id')
      .eq('id', itemId)
      .single() as { data: any; error: any };

    if (errItem || !item) return jsonError('Item no encontrado', 404);
    if (item.orden_id === targetOrdenNu) {
      return jsonError('El item ya pertenece a esa orden', 400);
    }

    const { data: ordenOrigen } = await supabase
      .from('ordenes')
      .select('id, estado, mesa_numero')
      .eq('id', item.orden_id)
      .single() as { data: any; error: any };

    const { data: ordenDestino } = await supabase
      .from('ordenes')
      .select('id, estado, mesa_numero')
      .eq('id', targetOrdenNu)
      .single() as { data: any; error: any };

    if (!ordenOrigen || !ordenDestino) {
      return jsonError('Orden origen o destino no existe', 404);
    }
    if (ordenOrigen.estado !== 'abierta' || ordenDestino.estado !== 'abierta') {
      return jsonError('Solo se puede reasignar entre órdenes ABIERTAS', 400);
    }

    const isCrossMesa = ordenOrigen.mesa_numero !== ordenDestino.mesa_numero;

    const { error } = await (supabase.from('orden_items') as any)
      .update({
        orden_id: targetOrdenNu,
        transferido_desde: item.orden_id,
        transferido_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (error) throw error;

    return jsonOk({
      success: true,
      cross_mesa: isCrossMesa,
      mesa_origen: ordenOrigen.mesa_numero,
      mesa_destino: ordenDestino.mesa_numero,
    });
  } catch (err: any) {
    console.error('Error POST /api/admin/reassign-item:', err);
    return jsonError('Error al reasignar', 500);
  }
}