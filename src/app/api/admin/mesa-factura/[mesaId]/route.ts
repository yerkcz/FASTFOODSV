import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/mesa-factura/[mesaId]
 *
 * Devuelve TODOS los comprobantes de las órdenes cerradas de una mesa
 * (hoy o histórica), cada uno con su items_snapshot.
 * Útil para "factura consolidada de mesa" cuando se pidió split.
 *
 * MesaId puede ser "99" (para llevar) o del 1 al 6.
 * Si no hay comprobantes, devuelve array vacío.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const { mesaId } = await params;
    const mesaNum = Number(mesaId);
    if (isNaN(mesaNum)) return jsonError('mesaId debe ser número', 400);

    const { searchParams } = new URL(request.url);
    const fecha = searchParams.get('fecha'); // optional: YYYY-MM-DD, defaults to today CR

    const now = new Date();
    const crNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));
    const today = fecha || `${crNow.getFullYear()}-${String(crNow.getMonth() + 1).padStart(2, '0')}-${String(crNow.getDate()).padStart(2, '0')}`;

    const supabase = getServerSupabase();
    const start = new Date(`${today}T00:00:00-06:00`).toISOString();
    const end = new Date(`${today}T23:59:59.999-06:00`).toISOString();

    const { data: ordenes } = await supabase
      .from('ordenes')
      .select('id, cliente_nombre')
      .eq('mesa_numero', mesaNum)
      .in('estado', ['cerrada', 'abierta']) as { data: any[] | null };

    if (!ordenes || ordenes.length === 0) {
      return jsonOk({ mesa: mesaNum, fecha: today, comprobantes: [] });
    }

    const ordenIds = ordenes.map((o) => o.id);

    const { data: comprobantes } = await supabase
      .from('comprobantes')
      .select(`
        id, numero, orden_id, total, subtotal, descuento,
        pago_id, created_at, items_snapshot
      `)
      .in('orden_id', ordenIds)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }) as { data: any[] | null };

    if (!comprobantes || comprobantes.length === 0) {
      return jsonOk({ mesa: mesaNum, fecha: today, comprobantes: [] });
    }

    const pagoIds = comprobantes.map((c) => c.pago_id).filter(Boolean);
    let pagosById = new Map<string, any>();
    if (pagoIds.length > 0) {
      const { data: pData } = await supabase
        .from('pagos')
        .select('id, forma_pago, monto, monto_recibido, vuelto')
        .in('id', pagoIds) as { data: any[] | null };
      (pData || []).forEach((p: any) => pagosById.set(p.id, p));
    }

    const ordenesById = new Map(ordenes.map((o: any) => [o.id, o]));

    const result = comprobantes.map((c: any) => {
      const pago = pagosById.get(c.pago_id);
      const orden = ordenesById.get(c.orden_id);
      return {
        comprobante_id: c.id,
        numero: c.numero,
        orden_id: c.orden_id,
        cliente: orden?.cliente_nombre || '(sin nombre)',
        total: Number(c.total || 0),
        subtotal: Number(c.subtotal || 0),
        descuento: Number(c.descuento || 0),
        forma_pago: pago?.forma_pago || 'efectivo',
        monto_pagado: pago ? Number(pago.monto || 0) : 0,
        items_snapshot: c.items_snapshot || [],
        created_at: c.created_at,
      };
    });

    const total_consolidado = result.reduce((s, c) => s + c.total, 0);

    return jsonOk({
      mesa: mesaNum,
      fecha: today,
      comprobantes: result,
      personas: result.length,
      total_consolidado,
    });
  } catch (err) {
    console.error('Error GET /api/admin/mesa-factura:', err);
    return jsonError('Error al obtener factura de mesa', 500);
  }
}