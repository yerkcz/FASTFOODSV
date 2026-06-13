import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, nextDateCR } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { start, end } = await nextDateCR(0);

    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        id, mesa_numero, cliente_nombre, opened_at, closed_at, total, subtotal,
        pagos ( id, forma_pago, monto, created_at )
      `)
      .eq('estado', 'cerrada')
      .gte('closed_at', start)
      .lte('closed_at', end)
      .order('closed_at', { ascending: false });
    if (error) throw error;

    const orders = (data || []).map((o: any) => {
      const pago = o.pagos?.[0];
      return {
        orden_nu: o.id,
        cliente: o.cliente_nombre,
        mesa: String(o.mesa_numero),
        fecha: o.closed_at || o.opened_at,
        total: Number(o.total || 0),
        forma_pago: pago?.forma_pago || 'N/A',
      };
    });

    const totalDiario = orders.reduce((acc, o) => acc + o.total, 0);

    return NextResponse.json({
      orders,
      total_diario: totalDiario,
    });
  } catch (err) {
    console.error('Error GET /api/admin/closed-orders:', err);
    return NextResponse.json({ orders: [], total_diario: 0 }, { status: 500 });
  }
}
