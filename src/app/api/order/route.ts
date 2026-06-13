import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';
import { checkOperatingHours, sanitize } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    const opsCheck = checkOperatingHours();
    if (!opsCheck.isOpen) {
      return NextResponse.json(
        { error: 'El restaurante se encuentra fuera de horario.' },
        { status: 403 }
      );
    }

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
    const combinedName = isLlevar
      ? (cliente || 'Para Llevar')
      : (cliente ? `${mesa} - ${cliente}` : mesa);

    const { data: mesaRow } = await supabase
      .from('mesas')
      .select('id')
      .eq('numero', mesaFinal)
      .single() as { data: any; error: any };

    const { data: orden, error: ordenErr } = await (supabase.from('ordenes') as any)
      .insert({
        mesa_id: mesaRow?.id,
        mesa_numero: mesaFinal,
        tipo: isLlevar ? 'llevar' : 'mesa',
        cliente_nombre: combinedName,
        estado: 'abierta',
      })
      .select()
      .single() as { data: any; error: any };
    if (ordenErr) throw ordenErr;

    if (!isLlevar) {
      await (supabase.from('mesas') as any)
        .update({ estado: 'ocupada', orden_actual_id: orden.id })
        .eq('numero', mesaFinal);
    }

    for (const it of items) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, precio, nombre')
        .eq('nombre', it.name)
        .single() as { data: any; error: any };
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
        notas: it.notas || null,
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
