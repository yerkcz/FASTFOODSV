import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const { mesa, cliente, tipo, items, notas } = body;
    if (!Array.isArray(items) || items.length === 0) return jsonError('items requerido');

    const supabase = getServerSupabase();
    const isLlevar = tipo === 'Llevar' || tipo === 'llevar';
    const mesaNumero = isLlevar ? 99 : (Number(mesa) || 99);
    const clienteNombre = isLlevar ? (cliente || 'Para Llevar') : (cliente ? `${mesa} - ${cliente}` : `Mesa ${mesa}`);

    const { data: mesaRow } = await supabase
      .from('mesas')
      .select('id')
      .eq('numero', mesaNumero)
      .single() as { data: any; error: any };

    const { data: orden, error: ordenErr } = await (supabase.from('ordenes') as any)
      .insert({
        mesa_id: mesaRow?.id,
        mesa_numero: mesaNumero,
        tipo: isLlevar ? 'llevar' : 'mesa',
        cliente_nombre: clienteNombre,
        notas: notas || null,
        estado: 'abierta',
      })
      .select()
      .single() as { data: any; error: any };
    if (ordenErr) throw ordenErr;

    if (!isLlevar) {
      await (supabase.from('mesas') as any)
        .update({ estado: 'ocupada', orden_actual_id: orden.id })
        .eq('numero', mesaNumero);
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
        orden_id: orden.id,
        producto_id: prod.id,
        nombre_producto: prod.nombre,
        precio_unitario: precio,
        cantidad: cant,
        subtotal: precio * cant,
        notas: it.notes || it.notas || null,
      });
    }

    return jsonOk({ success: true, orden_nu: orden.id });
  } catch (err) {
    console.error('Error POST /api/admin/create-order:', err);
    return jsonError('Error creando orden', 500);
  }
}
