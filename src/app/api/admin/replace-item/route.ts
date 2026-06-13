import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, newProductId, cantidad, notas } = body;
    if (!itemId) return jsonError('itemId requerido');

    const supabase = getServerSupabase();
    const updates: Record<string, unknown> = {};
    if (newProductId) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, nombre, precio')
        .eq('id', newProductId)
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
    if (cantidad !== undefined) {
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
