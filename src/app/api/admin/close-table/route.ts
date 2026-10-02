import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey, getCRDate } from '@/lib/supabase/server-api';
import type { Database } from '@/types/database';

/** Item tal como se persiste en `comprobantes.items_snapshot`. */
type ItemSnapshot = {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string | null;
};

async function fetchItemsSnapshot(
  supabase: SupabaseClient<Database>,
  ordenId: string,
  restrictToIds?: string[]
): Promise<ItemSnapshot[]> {
  // Si hay restrictToIds, leer SOLO por id (los items reasignados ya viven
  // en la orden destino — leer por orden_id filtraría incorrectamente).
  let q = supabase
    .from('orden_items')
    .select('nombre_producto, cantidad, precio_unitario, subtotal, notas, hora_registro')
    .order('hora_registro', { ascending: true });
  if (restrictToIds && restrictToIds.length > 0) {
    q = q.in('id', restrictToIds);
  } else {
    q = q.eq('orden_id', ordenId);
  }
  const { data } = await q;
  return (data || []).map((i) => ({
    nombre: i.nombre_producto,
    cantidad: Number(i.cantidad),
    precio_unitario: Number(i.precio_unitario),
    subtotal: Number(i.subtotal),
    notas: i.notas || null,
  }));
}

/**
 * Suma REAL de los items de una orden, replicando exactamente el filtro del
 * trigger `recalcular_total_orden`: `estado_kds != 'cancelado'`.
 *
 * Es el bruto SIN descuento. El guard de abajo le resta `ordenes.descuento`
 * para reconstruir `ordenes.total`; con `descuento = 0` (que era siempre)
 * ambas formas dan el mismo numero.
 *
 * Ojo con el NULL: en SQL `NULL != 'cancelado'` evalua NULL, y una fila que no
 * cumple la condicion NO se suma. Por eso aca tambien se descartan los null,
 * no solo los 'cancelado'. Si este helper no replica eso, el guard de abajo
 * daria 409 en ordenes perfectamente sanas.
 */
async function sumaRealOrden(supabase: SupabaseClient<Database>, ordenId: string): Promise<number> {
  const { data } = await supabase
    .from('orden_items')
    .select('subtotal, estado_kds')
    .eq('orden_id', ordenId);
  return (data || [])
    .filter((i) => i.estado_kds !== 'cancelado' && i.estado_kds != null)
    .reduce((s, i) => s + Number(i.subtotal || 0), 0);
}

/**
 * Deshace pagos/comprobantes insertados en este request. El flujo de cobro
 * hace varios inserts sin transaccion (Supabase REST no las soporta aqui);
 * sin esto un fallo a medio camino deja dinero cobrado sin comprobante.
 */
async function rollback(supabase: SupabaseClient<Database>, pagos: string[], comprobantes: string[]) {
  if (comprobantes.length > 0) {
    await supabase.from('comprobantes').delete().in('id', comprobantes);
  }
  if (pagos.length > 0) {
    await supabase.from('pagos').delete().in('id', pagos);
  }
}

export async function POST(request: NextRequest) {
  // Rollback manual: si algo falla DESPUES de insertar pagos, se deshace todo lo
  // insertado. Sin esto un fallo a medio camino deja pagos sin comprobante
  // (dinero cobrado sin receipt) o comprobantes sin items.
  const pagosInsertados: string[] = [];
  const comprobantesInsertados: string[] = [];

  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const supabase = getServerSupabase();

    let ordenesACerrar: string[] = [];
    const itemIds: string[] = body.item_ids || [];

    if (body.close_all_mesa) {
      const mesaNum = Number(body.close_all_mesa);
      const { data: ordenes } = await supabase
        .from('ordenes')
        .select('id')
        .eq('mesa_numero', mesaNum)
        .eq('estado', 'abierta');
      if (ordenes) ordenesACerrar = ordenes.map((o) => o.id);
    } else {
      const ordenNu = body.orden_nu || body.ordenNu;
      if (!ordenNu) return jsonError('orden_nu requerido');
      ordenesACerrar = [ordenNu];
    }

    if (ordenesACerrar.length === 0) return jsonError('No hay órdenes abiertas para cerrar');

    // Idempotencia: nunca re-cobrar una orden ya cerrada. Sin esto, un doble
    // tap o un retry del fetch generaba un segundo pago por la misma orden.
    const { data: estadoOrdenes, error: errEstado } = await supabase
      .from('ordenes')
      .select('id, estado, total, descuento')
      .in('id', ordenesACerrar);
    if (errEstado) throw errEstado;

    const noEncontradas = ordenesACerrar.filter(
      (id) => !estadoOrdenes?.some((o) => o.id === id)
    );
    if (noEncontradas.length > 0) return jsonError('La orden no existe', 404);

    const yaCerradas = ordenesACerrar.filter(
      (id) => estadoOrdenes?.find((o) => o.id === id)?.estado !== 'abierta'
    );
    if (yaCerradas.length > 0) return jsonError('La orden ya fue cobrada', 409);

    const formaPagoRaw = (body.forma_pago || 'Efectivo').toLowerCase();
    const FORMAS_VALIDAS = ['efectivo', 'tarjeta', 'sinpe', 'mixto'];
    if (!FORMAS_VALIDAS.includes(formaPagoRaw)) {
      return jsonError(`forma_pago inválida: '${formaPagoRaw}'. Válidas: ${FORMAS_VALIDAS.join(', ')}`);
    }
    const formaPago = formaPagoRaw;
    const montoRecibido = body.recibido ? Number(body.recibido) : 0;

    if (montoRecibido < 0 || Number.isNaN(montoRecibido)) {
      return jsonError('recibido debe ser número positivo');
    }

    /**
     * GUARD DE COHERENCIA — antes de tocar un colón.
     *
     * `ordenes.total` lo mantiene el trigger de la DB, no este código. Si se
     * desincroniza de sus propios items, la caja cobra una cifra vieja con
     * toda confianza: el cajero pide ₡7,800, el cliente debe ₡6,000, y la
     * diferencia se nota hasta el cierre del día.
     *
     * Por eso el monto se deriva SIEMPRE de los items (verdad de terreno) y
     * `ordenes.total` solo se usa para compararse. Si no cuadran, se RECHAZA
     * con 409: preferimos bloquear un cobro que la dueña resuelva en 5
     * segundos, antes que cobrar de más en silencio.
     *
     * Cubre las dos ramas (cierre completo y cobro parcial) porque va antes
     * del `if (itemIds...)`.
     */
    const montosReales: Record<string, number> = {};
    const desviados: string[] = [];
    for (const ordenId of ordenesACerrar) {
      const itemsSuma = await sumaRealOrden(supabase, ordenId);
      // El trigger calcula `total = Σitems − descuento`. El `descuento` se lee
      // de la DB ya RESUELTO (porcentaje -> monto) y ya limitado al subtotal
      // por la propia DB, asi que restarlo aca reproduce exactamente la cifra
      // que guarda `ordenes.total`: no hay dos formas de calcularlo.
      const descuento = Number(
        estadoOrdenes?.find((o) => o.id === ordenId)?.descuento ?? 0
      );
      const suma = itemsSuma - descuento;
      montosReales[ordenId] = suma;
      const guardado = Number(estadoOrdenes?.find((o) => o.id === ordenId)?.total ?? 0);
      if (Math.abs(suma - guardado) > 0.01) {
        desviados.push(ordenId);
        console.error(
          `close-table BLOQUEADO: orden ${ordenId} tiene total=${guardado} ` +
          `pero sus items (−descuento ${descuento}) suman ${suma}. ` +
          `No se cobra un numero desincronizado.`
        );
      }
    }
    if (desviados.length > 0) {
      const detalle = desviados
        .map((id) => {
          const guardado = Number(estadoOrdenes?.find((o) => o.id === id)?.total ?? 0);
          return `${id.slice(0, 8)}: total ₡${guardado} vs a cobrar ₡${montosReales[id]}`;
        })
        .join(' | ');
      return jsonError(
        `Total de la orden no coincide con sus items (${detalle}). ` +
        `Revisar la mesa antes de cobrar.`,
        409
      );
    }

    console.log(
      `close-table: item_ids=${JSON.stringify(itemIds)} ` +
      `ordenes=${JSON.stringify(ordenesACerrar)} ` +
      `montos=${JSON.stringify(montosReales)} recibido=${montoRecibido}`
    );

    /**
     * Siguiente consecutivo del día EN COSTA RICA (fecha + numero).
     *
     * El RPC usa `current_date` = fecha del SERVIDOR (UTC). Entre 6pm y medianoche
     * CR eso ya es el día siguiente, así que la numeración reiniciaba a las 6pm.
     * Además `comprobantes.fecha` también defaultea a `current_date` (UTC): si
     * solo se arregla el RPC, el INSERT cae en el bucket equivocado y choca con
     * `unique (fecha, numero)`. Por eso se pasan LAS DOS fechas en CR.
     *
     * Falla loudly: el fallback anterior `return 1` colisionaba en silencio y
     * dejaba pagos insertados sin comprobante.
     */
    const getNextComprobante = async (): Promise<{ fecha: string; numero: number }> => {
      const fecha = getCRDate().toISOString().slice(0, 10);
      // ponytail: `supabase.rpc` no tiene tipos generados para esta DB, casteo.
      const { data, error } = await supabase.rpc('get_siguiente_numero_comprobante', {
        p_fecha: fecha,
      });
      if (error) {
        throw new Error(`No se pudo generar el consecutivo del comprobante: ${error.message}`);
      }
      if (typeof data !== 'number') {
        throw new Error(`El RPC devolvió un consecutivo inválido: ${JSON.stringify(data)}`);
      }
      return { fecha, numero: data };
    };

    const closeOrden = async (ordenId: string) => {
      const { error } = await supabase.from('ordenes')
        .update({ estado: 'cerrada', closed_at: new Date().toISOString() })
        .eq('id', ordenId);
      if (error) throw new Error(`No se pudo cerrar la orden ${ordenId}: ${error.message}`);
    };

    if (itemIds.length > 0) {
      // DIVIDIR UNA CUENTA CON DESCUENTO NO CUADRA, y se prefiere parar a
      // cobrar mal. El split cobra la suma BRUTA de los items seleccionados
      // (`montoOrden` de más abajo), mientras que el descuento pertenece a la
      // orden COMPLETA: aplicarlo a cada trozo lo cobraría dos veces y no
      // aplicarlo le cobraría al cliente el importe que debió ahorrarse.
      // La cajera quita el descuento o cobra la orden entera — mismo
      // criterio que el guard de 409 de arriba: bloquear un cobro se
      // resuelve en 5 segundos, cobrar de más en silencio no.
      const conDescuento = ordenesACerrar.filter(
        (id) => Number(estadoOrdenes?.find((o) => o.id === id)?.descuento ?? 0) > 0
      );
      if (conDescuento.length > 0) {
        return jsonError(
          'Esta orden tiene descuento aplicado, así que no se puede dividir en partes. ' +
          'Quita el descuento o cobra la orden completa.',
          409,
        );
      }

      const { data: paidItems } = await supabase
        .from('orden_items')
        .select('id, orden_id, subtotal')
        .in('id', itemIds);

      if (!paidItems || paidItems.length === 0) {
        return jsonError('Ninguno de los items seleccionados existe en la base de datos', 404);
      }
      if (paidItems.length !== itemIds.length) {
        console.warn(`close-table: se solicitaron ${itemIds.length} items pero solo existen ${paidItems.length} en DB`);
      }

      // item_ids viene del cliente. Sin este filtro, mandar ids de otra mesa
      // borraria esos items SIN generar pago ni comprobante.
      const fueraDeAlcance = (paidItems || []).filter(
        (it) => !ordenesACerrar.includes(String(it.orden_id))
      );
      if (fueraDeAlcance.length > 0) {
        return jsonError('Items seleccionados no pertenecen a la mesa u orden indicada', 400);
      }

      const { data: allItems } = await supabase
        .from('orden_items')
        .select('id, orden_id')
        .in('orden_id', ordenesACerrar);

      const itemsByOrden: Record<string, { id: string; subtotal: number }[]> = {};
      for (const it of paidItems || []) {
        const oid = String(it.orden_id);
        if (!itemsByOrden[oid]) itemsByOrden[oid] = [];
        itemsByOrden[oid].push({ id: String(it.id), subtotal: Number(it.subtotal || 0) });
      }

      const allItemsCountByOrden: Record<string, number> = {};
      for (const it of allItems || []) {
        const oid = String(it.orden_id);
        allItemsCountByOrden[oid] = (allItemsCountByOrden[oid] || 0) + 1;
      }

      const montoTotalPagado = (paidItems || []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
      const cambioGlobal = montoRecibido > montoTotalPagado ? montoRecibido - montoTotalPagado : 0;
      const ordenesConPago = ordenesACerrar.filter(oid => (itemsByOrden[oid]?.length || 0) > 0);
      const ordenesQuedanCerradas: string[] = [];

      for (const ordenId of ordenesConPago) {
        const items = itemsByOrden[ordenId];
        const montoOrden = items.reduce((s, i) => s + i.subtotal, 0);
        const isUltimaConPago = ordenId === ordenesConPago[ordenesConPago.length - 1];
        const recibidoOrden = isUltimaConPago && montoRecibido > 0 ? montoRecibido : null;
        const vueltoOrden = isUltimaConPago ? cambioGlobal : 0;

        const { data: pagoRow, error: pagoErr } = await supabase.from('pagos')
          .insert({
            orden_id: ordenId,
            forma_pago: formaPago,
            monto: montoOrden,
            monto_recibido: (recibidoOrden ?? 0) > 0 ? recibidoOrden : null,
            vuelto: vueltoOrden,
          })
          .select()
          .single();
        if (pagoErr) throw pagoErr;
        pagosInsertados.push(pagoRow.id);

        const snapshot = await fetchItemsSnapshot(supabase, ordenId, items.map((i) => i.id));
        const comp = await getNextComprobante();
        const { data: compRow, error: compErr } = await supabase.from('comprobantes')
          .insert({
            numero: comp.numero,
            fecha: comp.fecha,
            orden_id: ordenId,
            pago_id: pagoRow.id,
            total: montoOrden,
            subtotal: montoOrden,
            items_snapshot: snapshot,
          })
          .select('id')
          .single();
        if (compErr) {
          await rollback(supabase, pagosInsertados, comprobantesInsertados);
          return jsonError(`Error guardando el comprobante: ${compErr.message}`, 500);
        }
        comprobantesInsertados.push(compRow.id);

        const pagadosOrden = items.length;
        const totalesOrden = allItemsCountByOrden[ordenId] || 0;
        if (pagadosOrden >= totalesOrden) {
          ordenesQuedanCerradas.push(ordenId);
        }
      }

      const { error: errDelete } = await supabase.from('orden_items')
        .delete()
        .in('id', itemIds);
      if (errDelete) {
        await rollback(supabase, pagosInsertados, comprobantesInsertados);
        return jsonError(`Error limpiando los items cobrados: ${errDelete.message}`, 500);
      }

      for (const ordenId of ordenesQuedanCerradas) {
        await closeOrden(ordenId);
      }

      const stillOpen = ordenesACerrar.filter(oid => !ordenesQuedanCerradas.includes(oid));
      if (stillOpen.length > 0) {
        return jsonOk({ success: true, split: true });
      }
    } else {
      // El monto sale de los ITEMS, no de ordenes.total. El guard de arriba ya
      // garantiza que coinciden, pero cobrar la suma real deja el cobro atado a
      // la verdad de terreno y no a un campo que mantiene la DB por su cuenta.
      // `descuento` viaja junto al total para poder volcarlo al comprobante:
      // `cierreCaja` suma `comprobantes.descuento` para el renglón de
      // descuentos del día, y sin esto el reporte daba ₡0 siempre.
      const lista = ordenesACerrar.map((id) => ({
        id,
        total: montosReales[id] ?? 0,
        descuento: Number(estadoOrdenes?.find((o) => o.id === id)?.descuento ?? 0),
      }));

      const totalMesa = lista.reduce((s, o) => s + Number(o.total || 0), 0);
      const cambioGlobal = montoRecibido > totalMesa ? montoRecibido - totalMesa : 0;

      const ordenesConTotal = lista.filter((o) => Number(o.total || 0) > 0);
      const ordenesVacias = lista.filter((o) => Number(o.total || 0) <= 0);
      for (const orden of ordenesVacias) {
        await closeOrden(String(orden.id));
      }
      for (let idx = 0; idx < ordenesConTotal.length; idx++) {
        const orden = ordenesConTotal[idx];
        const ordenId = String(orden.id);
        const monto = Number(orden.total || 0);
        const isUltima = idx === ordenesConTotal.length - 1;
        const recibidoOrden = isUltima && montoRecibido > 0 ? montoRecibido : null;
        const vueltoOrden = isUltima ? cambioGlobal : 0;

        const { data: pagoRow, error: pagoErr } = await supabase.from('pagos')
          .insert({
            orden_id: ordenId,
            forma_pago: formaPago,
            monto,
            monto_recibido: (recibidoOrden ?? 0) > 0 ? recibidoOrden : null,
            vuelto: vueltoOrden,
          })
          .select()
          .single();
        if (pagoErr) throw pagoErr;
        pagosInsertados.push(pagoRow.id);

        const comp = await getNextComprobante();
        const { data: compRow, error: compErr } = await supabase.from('comprobantes')
          .insert({
            numero: comp.numero,
            fecha: comp.fecha,
            orden_id: ordenId,
            pago_id: pagoRow.id,
            total: monto,
            // `subtotal` = BRUTO antes del descuento. Como `monto` ya es
            // `Σitems − descuento`, sumar el descuento de vuelta da
            // exactamente `Σitems` y el `items_snapshot` de al lado cuadra
            // con el renglón de la izquierda (antes decía ₡4.500 mientras
            // los ítems sumaban ₡5.000, sin explicación para el cliente).
            subtotal: Math.round((monto + orden.descuento) * 100) / 100,
            descuento: orden.descuento,
            items_snapshot: await fetchItemsSnapshot(supabase, ordenId),
          })
          .select('id')
          .single();
        if (compErr) {
          await rollback(supabase, pagosInsertados, comprobantesInsertados);
          return jsonError(`Error guardando el comprobante: ${compErr.message}`, 500);
        }
        comprobantesInsertados.push(compRow.id);

        await closeOrden(ordenId);
      }
    }

    const ordenRef = ordenesACerrar[0];
    const { data: orden } = await supabase
      .from('ordenes')
      .select('mesa_numero, tipo')
      .eq('id', ordenRef)
      .single();

    if (orden?.tipo === 'mesa' && orden.mesa_numero) {
      const { count } = await supabase
        .from('ordenes')
        .select('id', { count: 'exact', head: true })
        .eq('mesa_numero', orden.mesa_numero)
        .eq('estado', 'abierta');

      if (!count || count === 0) {
        await supabase.from('mesas')
          .update({ estado: 'libre', orden_actual_id: null })
          .eq('numero', orden.mesa_numero);
      }
    }

    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/admin/close-table:', err);
    // No dejar pagos/comprobantes huerfanos si algo lanzo una excepcion.
    try {
      await rollback(getServerSupabase(), pagosInsertados, comprobantesInsertados);
    } catch (rollbackErr) {
      console.error('Rollback fallido en close-table:', rollbackErr);
    }
    return jsonError('Error al cerrar mesa', 500);
  }
}
