import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey, nextDateCR } from '@/lib/supabase/server-api';
import type { ComprobanteRow, PostgrestError, PagoRow } from '@/types/db';

export const dynamic = 'force-dynamic';

/**
 * Comprobante del día con la orden embebida (`ordenes:orden_id`).
 * El select anidado NO lo tipa supabase (el elemento queda `never`), así que
 * el builder se castea contra este tipo real en vez de quedar sin tipar.
 */
type ComprobanteDelDia = ComprobanteRow & {
  ordenes: {
    mesa_numero: number | null;
    cliente_nombre: string | null;
    tipo: 'mesa' | 'llevar';
  } | null;
};

/**
 * GET /api/admin/closed-orders
 *
 * Lista los comprobantes del día en curso (TZ-CR).
 * Pivot desde `comprobantes` (no `ordenes`) → 1 fila por persona pagada.
 *
 * Cada fila incluye:
 *   - comprobante_id, numero
 *   - orden_id, mesa_numero, cliente_nombre
 *   - forma_pago, monto_pagado
 *   - total (del comprobante, ya con snapshot)
 *   - items_snapshot (para reimprimir)
 *
 * Totales: total_diario = suma de comprobantes.total (coincide con cierre de caja).
 */
export async function GET(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const supabase = getServerSupabase();
    const { start, end } = await nextDateCR(0);

    const { data: comprobantes, error } = (await supabase
      .from('comprobantes')
      .select(`
        id,
        numero,
        orden_id,
        total,
        subtotal,
        descuento,
        created_at,
        pago_id,
        items_snapshot,
        ordenes:orden_id (
          mesa_numero,
          cliente_nombre,
          tipo
        )
      `)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })) as {
      data: ComprobanteDelDia[] | null;
      error: PostgrestError | null;
    };

    if (error) throw error;

    const pagoIds = (comprobantes || [])
      .map((c) => c.pago_id)
      .filter((id): id is string => Boolean(id));
    const pagosById = new Map<string, Pick<PagoRow, 'id' | 'forma_pago' | 'monto' | 'monto_recibido' | 'vuelto'>>();
    if (pagoIds.length > 0) {
      const { data: pagosData } = await supabase
        .from('pagos')
        .select('id, forma_pago, monto, monto_recibido, vuelto')
        .in('id', pagoIds);
      (pagosData || []).forEach((p) => pagosById.set(p.id, p));
    }

    const orders = (comprobantes || []).map((c) => {
      // `pago_id` es nullable; el Map solo tiene claves string, así que un null
      // nunca matchea (mismo resultado que `get(null)` en un Map<string, ...>).
      const pago = c.pago_id ? pagosById.get(c.pago_id) : undefined;
      const orden = Array.isArray(c.ordenes) ? c.ordenes[0] : c.ordenes;
      return {
        comprobante_id: c.id,
        numero: c.numero,
        orden_nu: c.orden_id,
        cliente: orden?.cliente_nombre || '(sin nombre)',
        mesa: orden?.mesa_numero ?? null,
        fecha: c.created_at,
        total: Number(c.total || 0),
        subtotal: Number(c.subtotal || 0),
        descuento: Number(c.descuento || 0),
        forma_pago: pago?.forma_pago || 'efectivo',
        monto_recibido: pago ? Number(pago.monto_recibido || 0) : 0,
        vuelto: pago ? Number(pago.vuelto || 0) : 0,
        items_snapshot: c.items_snapshot || [],
        tipo: orden?.tipo || 'mesa',
      };
    });

    const total_diario = orders.reduce((s, o) => s + o.total, 0);

    return jsonOk({ orders, total_diario });
  } catch (err) {
    console.error('Error GET /api/admin/closed-orders:', err);
    return jsonError('Error al obtener comprobantes', 500);
  }
}