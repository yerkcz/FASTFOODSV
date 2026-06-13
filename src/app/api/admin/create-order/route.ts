import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mesa_numero, cliente_nombre, tipo, items } = body;
    if (!mesa_numero) return jsonError('mesa_numero requerido');
    if (!Array.isArray(items) || items.length === 0) return jsonError('items requerido');

    const supabase = getServerSupabase();
    const { data: mesaRow } = await supabase
      .from('mesas')
      .select('id')
      .eq('numero', mesa_numero)
      .single() as { data: any; error: any };

    const { data: orden, error: ordenErr } = await (supabase.from('ordenes') as any)
      .insert({
        mesa_id: mesaRow?.id,
        mesa_numero,
        tipo: tipo || 'mesa',
        cliente_nombre: cliente_nombre || null,
        estado: 'abierta',
      })
      .select()
      .single() as { data: any; error: any };
    if (ordenErr) throw ordenErr;

    if (tipo === 'mesa') {
      await (supabase.from('mesas') as any)
        .update({ estado: 'ocupada', orden_actual_id: orden.id })
        .eq('numero', mesa_numero);
    }

    for (const it of items) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, precio, nombre')
        .eq('id', it.producto_id)
        .single() as { data: any; error: any };
      const precio = prod ? Number(prod.precio) : Number(it.precio_unitario);
      const nombre = prod?.nombre || it.nombre_producto;
      await (supabase.from('orden_items') as any).insert({
        orden_id: orden.id,
        producto_id: prod?.id || null,
        nombre_producto: nombre,
        precio_unitario: precio,
        cantidad: Number(it.cantidad) || 1,
        subtotal: precio * (Number(it.cantidad) || 1),
        notas: it.notas || null,
      });
    }

    return jsonOk({ success: true, orden_nu: orden.id });
  } catch (err) {
    console.error('Error POST /api/admin/create-order:', err);
    return jsonError('Error al crear orden', 500);
  }
}
