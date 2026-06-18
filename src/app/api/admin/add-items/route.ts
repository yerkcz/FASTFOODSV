import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const { orden_nu, items } = body;
    if (!orden_nu) return jsonError('orden_nu requerido');
    if (!Array.isArray(items) || items.length === 0) return jsonError('items requerido');

    const supabase = getServerSupabase();

    const { data: orden, error: errOrden } = await supabase
      .from('ordenes')
      .select('id, estado')
      .eq('id', orden_nu)
      .single() as { data: any; error: any };

    if (errOrden || !orden) return jsonError('Orden no encontrada', 404);
    if (orden.estado !== 'abierta') {
      return jsonError(`No se pueden agregar items a una orden ${orden.estado}`, 400);
    }

    for (const it of items) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, precio, nombre')
        .eq('nombre', it.name)
        .maybeSingle() as { data: any; error: any };
      if (!prod) continue;
      const precio = Number(prod.precio);
      const cant = Number(it.quantity) || 1;
      await (supabase.from('orden_items') as any).insert({
        orden_id: orden_nu,
        producto_id: prod.id,
        nombre_producto: prod.nombre,
        precio_unitario: precio,
        cantidad: cant,
        subtotal: precio * cant,
        notas: it.notas || null,
      });
    }

    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/admin/add-items:', err);
    return jsonError('Error al agregar items', 500);
  }
}
