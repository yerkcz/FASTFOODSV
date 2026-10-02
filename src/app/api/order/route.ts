import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';
import { sanitize } from '@/lib/security';

export const dynamic = 'force-dynamic';

const TIPOS_DESCUENTO = ['monto', 'porcentaje'] as const;

/**
 * POST /api/order — crea una orden y sus líneas.
 *
 * ## Dos caminos conviven a propósito
 *   · `tipo: 'individual'` (o venir sin `mesa`) → pedido suelto SIN mesa:
 *     `mesa_numero = NULL`, sin tocar la tabla `mesas`. Es el modelo nuevo.
 *   · `mesa: '3'` / `'llevar'` → el modelo viejo, intacto, para que lo que ya
 *     corre y las pruebas del gate sigan funcionando igual.
 *
 * Antes de 0011 la columna `mesa_numero` era NOT NULL, así que TODO pedido
 * sin mesa caía en la Mesa 99 con `parseInt(...) || 99`. Con `mesa_numero`
 * anulable eso ya no hace falta.
 *
 * ## Ajustes de venta (pide la cliente)
 *   · `descuento`  → porcentaje o monto fijo. La DB resuelve el monto y lo
 *     recalcula sola en cada cambio de items.
 *   · `extras`     → cargos personalizados. Van como LÍNEA en `orden_items`
 *     (con `tipo_linea='extra'`) para que entren solos en `Σitems` y el
 *     guard de cobro de `close-table` siga cuadrando sin trucos.
 *   · `pago`       → abono inicial (50% de `PeticionCliente` #4). NO se acepta
 *     todavía: `close-table` cobra el total completo y un abono aquí se
 *     cobraría dos veces. Se habilita junto con el saldo pendiente.
 *
 * Régimen Simplificado: sin IVA desglosado, sin servicio 10%.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mesa, cliente, items, tipo, notas, descuento, extras } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return jsonError('Items inválidos');
    }
    // `mesa` solo se exige si la orden va a ser de mesa.
    if (mesa !== undefined && mesa !== null && mesa !== '' && typeof mesa !== 'string') {
      return jsonError('Mesa inválida');
    }

    // Sin `mesa` (o con `tipo:'individual'`) el pedido no tiene mesa.
    const esIndividual = tipo === 'individual' || !mesa;
    if (!esIndividual && !mesa) return jsonError('Mesa inválida');

    const isLlevar = !esIndividual &&
      (tipo === 'llevar' || String(mesa).toLowerCase().includes('llevar'));

    const supabase = getServerSupabase();

    // Solo el camino de mesa resuelve número de mesa; el individual queda en NULL.
    let mesaNumero: number | null = null;
    let mesaRowId: string | null = null;
    if (!esIndividual) {
      mesaNumero = (isLlevar ? 99 : parseInt(String(mesa).replace(/\D/g, '')) || 99);
      const { data: mesaRow } = await supabase
        .from('mesas')
        .select('id')
        .eq('numero', mesaNumero)
        .single();
      mesaRowId = mesaRow?.id ?? null;
    }

    // AGENTS.md: toda API sanitiza sus inputs.
    const nombreLimpio = cliente ? sanitize(String(cliente), 120).trim() : '';
    let combinedName: string;
    if (esIndividual) {
      combinedName = nombreLimpio || 'Mostrador';
    } else if (isLlevar) {
      combinedName = nombreLimpio || 'Para Llevar';
    } else {
      combinedName = nombreLimpio
        ? `${sanitize(String(mesa), 20)} - ${nombreLimpio}`
        : sanitize(String(mesa), 20);
    }

    // ── Descuento: intención capturada, monto lo resuelve la DB ──────────
    const descTipo = (TIPOS_DESCUENTO as readonly string[]).includes(descuento?.tipo)
      ? descuento.tipo
      : 'monto';
    const descValor = Number.isFinite(Number(descuento?.valor))
      ? Math.max(0, Number(descuento.valor))
      : 0;
    const descMotivo = descuento?.motivo
      ? sanitize(String(descuento.motivo), 120)
      : null;

    const { data: orden, error: ordenErr } = await supabase.from('ordenes')
      .insert({
        mesa_id: mesaRowId,
        mesa_numero: mesaNumero,
        tipo: esIndividual ? 'individual' : (isLlevar ? 'llevar' : 'mesa'),
        cliente_nombre: combinedName,
        notas: notas ? sanitize(String(notas), 300) : null,
        descuento_tipo: descTipo,
        descuento_valor: descValor,
        descuento_motivo: descMotivo,
        estado: 'abierta',
      })
      .select()
      .single();
    if (ordenErr) throw ordenErr;

    // El trigger de la DB es quien marca la mesa; solo para el camino viejo.
    if (!esIndividual && !isLlevar && mesaNumero) {
      await supabase.from('mesas')
        .update({ estado: 'ocupada', orden_actual_id: orden.id })
        .eq('numero', mesaNumero);
    }

    for (const it of items) {
      const { data: prod } = await supabase
        .from('productos')
        .select('id, precio, nombre')
        .eq('nombre', it.name)
        .single();
      if (!prod) continue;
      const precio = Number(prod.precio);
      const cant = Math.max(1, Number(it.quantity) || 1);
      await supabase.from('orden_items').insert({
        orden_id: orden.id,
        producto_id: prod.id,
        nombre_producto: prod.nombre,
        precio_unitario: precio,
        cantidad: cant,
        subtotal: precio * cant,
        notas: it.notas ? sanitize(String(it.notas), 300) : null,
        tipo_linea: 'item',
      });
    }

    // ── Extras: línea propia, sin producto y sin pasar por la cocina ──────
    // Al ser una línea más, `Σitems` ya los incluye y `ordenes.total` cuadra
    // sin que el guard de cobro tenga que enterarse de ellos.
    const extrasLista = (Array.isArray(extras) ? extras : []).slice(0, 10);
    let extrasAgregados = 0;
    for (const ex of extrasLista) {
      const nombre = sanitize(String(ex?.nombre ?? ''), 60).trim();
      const monto = Number(ex?.monto);
      if (!nombre || !Number.isFinite(monto) || monto <= 0) continue;
      await supabase.from('orden_items').insert({
        orden_id: orden.id,
        producto_id: null,
        nombre_producto: nombre,
        precio_unitario: Math.round(monto * 100) / 100,
        cantidad: 1,
        subtotal: Math.round(monto * 100) / 100,
        tipo_linea: 'extra',
        // 'entregado' = no hay nada que preparar: no debe aparecer en cocina
        // ni sumar a la cola de la KDS, pero sí sigue contando para el total
        // (el trigger solo excluye 'cancelado').
        estado_kds: 'entregado',
      });
      extrasAgregados++;
    }

    return jsonOk({
      success: true,
      orden_nu: orden.id,
      tipo: esIndividual ? 'individual' : (isLlevar ? 'llevar' : 'mesa'),
      descuento_tipo: descTipo,
      descuento_valor: descValor,
      extras: extrasAgregados,
      message: 'Orden recibida correctamente',
    });
  } catch (err) {
    console.error('Error POST /api/order:', err);
    return jsonError('Error procesando la orden', 500);
  }
}
