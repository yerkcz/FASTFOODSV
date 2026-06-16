import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

/**
 * POST /api/admin/split-item
 *
 * Divide un orden_item por cantidad: separa N unidades del item original
 * en un nuevo orden_item con la misma orden_id (puede luego reasignarse
 * a otra persona / cobrarse aparte).
 *
 * Body: { itemId: string, cantidadSeparar: number }
 *
 * Lógica:
 *   1. Lee item original (cantidad, precio_unitario)
 *   2. Valida que cantidadSeparar > 0 y < cantidad original
 *   3. UPDATE item original: cantidad -= n, subtotal = precio_unitario * cantidad
 *   4. INSERT nuevo item: cantidad = n, mismos campos restantes
 *   5. El trigger trg_recalcular_total_orden recalcula ordenes.total
 *
 * Respuesta: { success: true, itemOriginal: {...}, itemNuevo: {...} }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const itemId = body.itemId;
    const cantidadSeparar = Number(body.cantidadSeparar);

    if (!itemId || typeof itemId !== 'string') {
      return jsonError('itemId requerido');
    }
    if (!Number.isInteger(cantidadSeparar) || cantidadSeparar <= 0) {
      return jsonError('cantidadSeparar debe ser entero mayor a 0');
    }

    const supabase = getServerSupabase();

    // 1. Leer item original
    const { data: original, error: errRead } = await supabase
      .from('orden_items')
      .select('id, orden_id, producto_id, nombre_producto, precio_unitario, cantidad, notas, estado_kds, listo')
      .eq('id', itemId)
      .single() as { data: any; error: any };

    if (errRead || !original) {
      return jsonError('Item no encontrado', 404);
    }

    const cantidadOriginal = Number(original.cantidad);
    if (cantidadSeparar >= cantidadOriginal) {
      return jsonError(
        `No se puede separar ${cantidadSeparar} unidades de un item con cantidad ${cantidadOriginal}. Debe ser menor.`,
        400
      );
    }

    const cantidadRestante = cantidadOriginal - cantidadSeparar;
    const precioUnit = Number(original.precio_unitario);

    // 2. UPDATE original: reducir cantidad y recalcular subtotal
    const { error: errUpd } = await (supabase.from('orden_items') as any)
      .update({
        cantidad: cantidadRestante,
        subtotal: precioUnit * cantidadRestante,
      })
      .eq('id', itemId);

    if (errUpd) {
      console.error('split-item: error update original', errUpd);
      return jsonError('Error reduciendo cantidad del item original', 500);
    }

    // 3. INSERT nuevo item con cantidad separada
    const { data: nuevo, error: errIns } = await (supabase.from('orden_items') as any)
      .insert({
        orden_id: original.orden_id,
        producto_id: original.producto_id,
        nombre_producto: original.nombre_producto,
        precio_unitario: precioUnit,
        cantidad: cantidadSeparar,
        subtotal: precioUnit * cantidadSeparar,
        notas: original.notas,
        estado_kds: original.estado_kds,
        listo: original.listo,
      })
      .select()
      .single() as { data: any; error: any };

    if (errIns) {
      // Rollback manual del UPDATE para no dejar inconsistencia
      await (supabase.from('orden_items') as any)
        .update({
          cantidad: cantidadOriginal,
          subtotal: precioUnit * cantidadOriginal,
        })
        .eq('id', itemId);
      console.error('split-item: error insert nuevo (rollback ejecutado)', errIns);
      return jsonError('Error creando item separado', 500);
    }

    return jsonOk({
      success: true,
      itemOriginal: {
        id: original.id,
        cantidad: cantidadRestante,
        subtotal: precioUnit * cantidadRestante,
      },
      itemNuevo: {
        id: nuevo.id,
        cantidad: cantidadSeparar,
        subtotal: precioUnit * cantidadSeparar,
      },
    });
  } catch (err) {
    console.error('Error POST /api/admin/split-item:', err);
    return jsonError('Error al dividir item', 500);
  }
}
