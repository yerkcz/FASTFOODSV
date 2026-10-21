import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';
import { sanitize } from '@/lib/security';
import type { OrdenItemRow } from '@/types/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;

    const body = (await request.json()) as {
      itemId?: unknown;
      newProductId?: unknown;
      cantidad?: unknown;
      notas?: unknown;
    };
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    const newProductId = typeof body.newProductId === 'string' ? body.newProductId : '';
    if (!itemId) return jsonError('itemId requerido');
    if (!newProductId) return jsonError('newProductId requerido');

    const supabase = getServerSupabase();

    const { data: current, error: currentError } = await supabase
      .from('orden_items')
      .select('id, orden_id, cantidad, precio_unitario')
      .eq('id', itemId)
      .single();
    if (currentError || !current) return jsonError('Item no encontrado', 404);

    const { data: order } = await supabase
      .from('ordenes')
      .select('id, estado')
      .eq('id', current.orden_id)
      .single();
    if (!order) return jsonError('Orden no encontrada', 404);
    if (order.estado !== 'abierta') {
      return jsonError('No se puede modificar una orden cerrada', 400);
    }

    const { data: product, error: productError } = await supabase
      .from('productos')
      .select('id, nombre, precio, disponible')
      .eq('id', newProductId)
      .single();
    if (productError || !product || !product.disponible) {
      return jsonError('Producto no encontrado o desactivado', 400);
    }

    const quantity = Number(body.cantidad ?? current.cantidad);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return jsonError('Cantidad inválida');
    }

    const price = Number(product.precio) || 0;
    const updates: Partial<OrdenItemRow> = {
      producto_id: product.id,
      nombre_producto: product.nombre,
      precio_unitario: price,
      cantidad: quantity,
      subtotal: price * quantity,
    };
    if (body.notas !== undefined) {
      updates.notas = body.notas ? sanitize(String(body.notas), 300) : null;
    }

    const { error } = await supabase
      .from('orden_items')
      .update(updates)
      .eq('id', itemId);
    if (error) throw error;

    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/admin/replace-item:', err);
    return jsonError('Error al reemplazar item', 500);
  }
}
