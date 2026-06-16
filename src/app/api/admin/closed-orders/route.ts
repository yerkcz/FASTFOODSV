import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey, nextDateCR } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const supabase = getServerSupabase();
    const { start, end } = await nextDateCR(0);

    const { data: ordenes } = await supabase
      .from('ordenes')
      .select('id, mesa_numero, cliente_nombre, closed_at, total, tipo')
      .eq('estado', 'cerrada')
      .gte('closed_at', start)
      .lte('closed_at', end)
      .order('closed_at', { ascending: false }) as { data: any[]; error: any };

    if (!ordenes) return jsonOk({ orders: [], total_diario: 0 });

    const orders = await Promise.all(ordenes.map(async (o: any) => {
      const { data: pagos } = await supabase
        .from('pagos')
        .select('forma_pago')
        .eq('orden_id', o.id)
        .limit(1) as { data: any[]; error: any };
      return {
        orden_nu: o.id,
        cliente: o.cliente_nombre,
        mesa: o.mesa_numero,
        fecha: o.closed_at,
        total: Number(o.total || 0),
        forma_pago: pagos?.[0]?.forma_pago || 'efectivo',
        tipo: o.tipo,
      };
    }));

    const total = orders.reduce((s, o) => s + o.total, 0);
    return jsonOk({ orders, total_diario: total });
  } catch (err) {
    console.error('Error GET /api/admin/closed-orders:', err);
    return jsonError('Error al obtener órdenes cerradas', 500);
  }
}
