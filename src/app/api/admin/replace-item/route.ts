import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const { itemId, newProductId, newArticulo, cantidad, notas } = body;
    if (!itemId) return jsonError('itemId requerido');

    const supabase = getServerSupabase();
    const updates: Record<string, unknown> = {};

    let productId = newProductId;
    if (!productId && newArticulo) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id')
        .eq('nombre', newArticulo)
        .maybeSingle() as { data: any; error: any };
      if (prod) productId = prod.id;
    }

    if (productId) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, nombre, precio')
        .eq('id', productId)
        .single() as { data: any; error: any };
      if (prod) {
        updates.producto_id = prod.id;
        updates.nombre_producto = prod.nombre;
        updates.precio_unitario = Number(prod.precio);
        const cant = Number(cantidad) || 1;
        updates.cantidad = cant;
        updates.subtotal = Number(prod.precio) * cant;
      }
    }
    if (cantidad !== undefined && !productId) {
      const cant = Number(cantidad) || 1;
      updates.cantidad = cant;
      const { data: cur } = await supabase.from('orden_items').select('precio_unitario').eq('id', itemId).single() as { data: any; error: any };
      if (cur) updates.subtotal = Number(cur.precio_unitario) * cant;
    }
    if (notas !== undefined) updates.notas = notas;

    if (Object.keys(updates).length > 0) {
      const { error } = await (supabase.from('orden_items') as any).update(updates).eq('id', itemId);
      if (error) throw error;
    }
    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/admin/replace-item:', err);
    return jsonError('Error al reemplazar item', 500);
  }
}
