import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
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
        .eq('estado', 'abierta') as { data: any[]; error: any };
      if (ordenes) ordenesACerrar = ordenes.map((o: any) => o.id);
    } else {
      const ordenNu = body.orden_nu || body.ordenNu;
      if (!ordenNu) return jsonError('orden_nu requerido');
      ordenesACerrar = [ordenNu];
    }

    if (ordenesACerrar.length === 0) return jsonError('No hay órdenes abiertas para cerrar');

    const formaPagoRaw = (body.forma_pago || body.pagos?.[0]?.forma_pago || 'Efectivo').toLowerCase();
    const FORMAS_VALIDAS = ['efectivo', 'tarjeta', 'sinpe', 'mixto'];
    if (!FORMAS_VALIDAS.includes(formaPagoRaw)) {
      return jsonError(`forma_pago inválida: '${formaPagoRaw}'. Válidas: ${FORMAS_VALIDAS.join(', ')}`);
    }
    const formaPago = formaPagoRaw;
    const pagosArray = body.pagos || [];
    const montoRecibido = body.recibido ? Number(body.recibido) : 0;

    if (montoRecibido < 0 || Number.isNaN(montoRecibido)) {
      return jsonError('recibido debe ser número positivo');
    }

    const getNextNum = async (): Promise<number> => {
      try {
        const { data: rpcNum } = await supabase.rpc('get_siguiente_numero_comprobante');
        if (typeof rpcNum === 'number') return rpcNum;
      } catch {}
      return 1;
    };

    const closeOrden = async (ordenId: string) => {
      await (supabase.from('ordenes') as any)
        .update({ estado: 'cerrada', closed_at: new Date().toISOString() })
        .eq('id', ordenId);
    };

    if (itemIds.length > 0) {
      const { data: paidItems } = await supabase
        .from('orden_items')
        .select('id, orden_id, subtotal')
        .in('id', itemIds) as { data: any[]; error: any };

      if (!paidItems || paidItems.length === 0) {
        return jsonError('Ninguno de los items seleccionados existe en la base de datos', 404);
      }
      if (paidItems.length !== itemIds.length) {
        console.warn(`close-table: se solicitaron ${itemIds.length} items pero solo existen ${paidItems.length} en DB`);
      }

      const { data: allItems } = await supabase
        .from('orden_items')
        .select('id, orden_id')
        .in('orden_id', ordenesACerrar) as { data: any[]; error: any };

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

      const montoTotalPagado = (paidItems || []).reduce((s: number, i: any) => s + Number(i.subtotal || 0), 0);
      const recibidoRestante = montoRecibido > montoTotalPagado ? montoRecibido : 0;
      const ordenesConPago = ordenesACerrar.filter(oid => (itemsByOrden[oid]?.length || 0) > 0);
      const ordenesQuedanCerradas: string[] = [];

      for (const ordenId of ordenesConPago) {
        const items = itemsByOrden[ordenId];
        const montoOrden = items.reduce((s, i) => s + i.subtotal, 0);
        const isUltimaConPago = ordenId === ordenesConPago[ordenesConPago.length - 1];
        const recibidoOrden = isUltimaConPago ? recibidoRestante : 0;
        const vueltoOrden = recibidoOrden > montoOrden ? recibidoOrden - montoOrden : 0;

        const { data: pagoRow, error: pagoErr } = await (supabase.from('pagos') as any)
          .insert({
            orden_id: ordenId,
            forma_pago: formaPago,
            monto: montoOrden,
            monto_recibido: recibidoOrden > 0 ? recibidoOrden : null,
            vuelto: vueltoOrden,
          })
          .select()
          .single() as { data: any; error: any };
        if (pagoErr) throw pagoErr;

        const nextNum = await getNextNum();
        await (supabase.from('comprobantes') as any).insert({
          numero: nextNum,
          orden_id: ordenId,
          pago_id: pagoRow.id,
          total: montoOrden,
          subtotal: montoOrden,
        });

        const pagadosOrden = items.length;
        const totalesOrden = allItemsCountByOrden[ordenId] || 0;
        if (pagadosOrden >= totalesOrden) {
          ordenesQuedanCerradas.push(ordenId);
        }
      }

      await (supabase.from('orden_items') as any).delete().in('id', itemIds);

      for (const ordenId of ordenesQuedanCerradas) {
        await closeOrden(ordenId);
      }

      const stillOpen = ordenesACerrar.filter(oid => !ordenesQuedanCerradas.includes(oid));
      if (stillOpen.length > 0) {
        return jsonOk({ success: true, split: true });
      }
    } else if (pagosArray.length > 0) {
      const ordenPrincipal = ordenesACerrar[0];
      for (const pago of pagosArray) {
        const { data: pagoRow, error: pagoErr } = await (supabase.from('pagos') as any)
          .insert({
            orden_id: ordenPrincipal,
            forma_pago: pago.forma_pago?.toLowerCase() || 'efectivo',
            monto: Number(pago.monto),
            monto_recibido: pago.monto_recibido ? Number(pago.monto_recibido) : null,
            vuelto: pago.vuelto ? Number(pago.vuelto) : 0,
          })
          .select()
          .single() as { data: any; error: any };
        if (pagoErr) throw pagoErr;

        const nextNum = await getNextNum();
        await (supabase.from('comprobantes') as any).insert({
          numero: nextNum,
          orden_id: ordenPrincipal,
          pago_id: pagoRow.id,
          total: Number(pago.monto),
          subtotal: Number(pago.monto),
        });
      }

      for (const ordenId of ordenesACerrar) {
        await closeOrden(ordenId);
      }
    } else {
      const { data: ordenesData } = await supabase
        .from('ordenes')
        .select('id, total')
        .in('id', ordenesACerrar) as { data: any[]; error: any };

      const totalMesa = (ordenesData || []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      const recibidoRestante = montoRecibido > totalMesa ? montoRecibido : 0;
      const lista = ordenesData || [];

      for (let idx = 0; idx < lista.length; idx++) {
        const orden = lista[idx];
        const ordenId = String(orden.id);
        const monto = Number(orden.total || 0);
        const isUltima = idx === lista.length - 1;
        const recibidoOrden = isUltima ? recibidoRestante : 0;
        const vueltoOrden = recibidoOrden > monto ? recibidoOrden - monto : 0;

        const { data: pagoRow, error: pagoErr } = await (supabase.from('pagos') as any)
          .insert({
            orden_id: ordenId,
            forma_pago: formaPago,
            monto,
            monto_recibido: recibidoOrden > 0 ? recibidoOrden : null,
            vuelto: vueltoOrden,
          })
          .select()
          .single() as { data: any; error: any };
        if (pagoErr) throw pagoErr;

        const nextNum = await getNextNum();
        await (supabase.from('comprobantes') as any).insert({
          numero: nextNum,
          orden_id: ordenId,
          pago_id: pagoRow.id,
          total: monto,
          subtotal: monto,
        });

        await closeOrden(ordenId);
      }
    }

    const ordenRef = ordenesACerrar[0];
    const { data: orden } = await supabase
      .from('ordenes')
      .select('mesa_numero, tipo')
      .eq('id', ordenRef)
      .single() as { data: any; error: any };

    if (orden?.tipo === 'mesa' && orden.mesa_numero) {
      const { count } = await supabase
        .from('ordenes')
        .select('id', { count: 'exact', head: true })
        .eq('mesa_numero', orden.mesa_numero)
        .eq('estado', 'abierta') as { count: number | null; error: any };

      if (!count || count === 0) {
        await (supabase.from('mesas') as any)
          .update({ estado: 'libre', orden_actual_id: null })
          .eq('numero', orden.mesa_numero);
      }
    }

    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/admin/close-table:', err);
    return jsonError('Error al cerrar mesa', 500);
  }
}
