import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orden_nu, items } = body;
    if (!orden_nu) return jsonError('orden_nu requerido');
    if (!Array.isArray(items)) return jsonError('items requerido');

    const supabase = getServerSupabase();
    for (const it of items) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, precio, nombre')
        .eq('id', it.producto_id)
        .single() as { data: any; error: any };
      const precio = prod ? Number(prod.precio) : Number(it.precio_unitario);
      const nombre = prod?.nombre || it.nombre_producto;
      const cant = Number(it.cantidad) || 1;
      await (supabase.from('orden_items') as any).insert({
        orden_id: orden_nu,
        producto_id: prod?.id || null,
        nombre_producto: nombre,
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
