import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';
import { sanitize } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mesa, cliente, items, tipo } = body;

    if (!mesa || typeof mesa !== 'string') {
      return jsonError('Mesa inválida');
    }
    if (!Array.isArray(items) || items.length === 0) {
      return jsonError('Items inválidos');
    }

    const supabase = getServerSupabase();

    const mesaNumero = parseInt(String(mesa).replace(/\D/g, '')) || 99;
    const isLlevar = tipo === 'llevar' || String(mesa).toLowerCase().includes('llevar');
    const mesaFinal = isLlevar ? 99 : mesaNumero;
    // AGENTS.md: toda API sanitiza sus inputs. Este import existia pero NUNCA
    // se uso — `cliente_nombre` y `notas` iban crudos a la DB.
    const combinedName = isLlevar
      ? (cliente ? sanitize(cliente, 120) : 'Para Llevar')
      : (cliente ? `${sanitize(mesa, 20)} - ${sanitize(cliente, 100)}` : sanitize(mesa, 20));

    const { data: mesaRow } = await supabase
      .from('mesas')
      .select('id')
      .eq('numero', mesaFinal)
      .single();

    const { data: orden, error: ordenErr } = await supabase.from('ordenes')
      .insert({
        mesa_id: mesaRow?.id,
        mesa_numero: mesaFinal,
        tipo: isLlevar ? 'llevar' : 'mesa',
        cliente_nombre: combinedName,
        estado: 'abierta',
      })
      .select()
      .single();
    if (ordenErr) throw ordenErr;

    if (!isLlevar) {
      await supabase.from('mesas')
        .update({ estado: 'ocupada', orden_actual_id: orden.id })
        .eq('numero', mesaFinal);
    }

    for (const it of items) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, precio, nombre')
        .eq('nombre', it.name)
        .single();
      if (!prod) continue;
      const precio = Number(prod.precio);
      const cant = Number(it.quantity) || 1;
      await supabase.from('orden_items').insert({
        orden_id: orden.id,
        producto_id: prod.id,
        nombre_producto: prod.nombre,
        precio_unitario: precio,
        cantidad: cant,
        subtotal: precio * cant,
        notas: it.notas ? sanitize(String(it.notas), 300) : null,
      });
    }

    return jsonOk({
      success: true,
      orden_nu: orden.id,
      message: 'Orden recibida correctamente',
    });
  } catch (err) {
    console.error('Error POST /api/order:', err);
    return jsonError('Error procesando la orden', 500);
  }
}
