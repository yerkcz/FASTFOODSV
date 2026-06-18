import { NextRequest } from 'next/server';
import { getServerSupabase, jsonOk, jsonError } from '@/lib/supabase/server-api';
import { getPeriodRange, getPrevPeriodRange } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const periodo = request.nextUrl.searchParams.get('periodo') || 'mes';
    const { start, end } = getPeriodRange(periodo);
    const prev = getPrevPeriodRange(periodo);

    const supabase = getServerSupabase();

    const { data: comps } = await supabase
      .from('comprobantes')
      .select('total, created_at')
      .gte('created_at', start)
      .lte('created_at', end);

    const { data: prevComps } = await supabase
      .from('comprobantes')
      .select('total')
      .gte('created_at', prev.start)
      .lte('created_at', prev.end);

    const ventas = (comps || []).reduce((s: number, c: any) => s + Number(c.total || 0), 0);
    const prevVentas = (prevComps || []).reduce((s: number, c: any) => s + Number(c.total || 0), 0);
    const numOrdenes = comps?.length || 0;
    const prevOrdenes = prevComps?.length || 0;
    const ticketProm = numOrdenes > 0 ? ventas / numOrdenes : 0;
    const prevTicketProm = prevOrdenes > 0 ? prevVentas / prevOrdenes : 0;

    const days = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
    const ordenesPorDia = numOrdenes / days;

    const dailyCounts = new Map<string, number>();
    for (const c of (comps || []) as any[]) {
      const day = (c.created_at as string).slice(0, 10);
      dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);
    }
    const counts = Array.from(dailyCounts.values());
    const mean = counts.reduce((s, v) => s + v, 0) / Math.max(1, counts.length);
    const variance = counts.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, counts.length);
    const coefVar = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;

    const kpis = {
      ingresos_totales: ventas,
      total_ordenes: numOrdenes,
      ticket_promedio: ticketProm,
      ordenes_por_dia: ordenesPorDia,
      coef_variacion: Math.round(coefVar),
    };

    const comparativa = {
      pct_cambio_ingresos: prevVentas > 0 ? ((ventas - prevVentas) / prevVentas) * 100 : 0,
      pct_cambio_ordenes: prevOrdenes > 0 ? ((numOrdenes - prevOrdenes) / prevOrdenes) * 100 : 0,
      pct_cambio_ticket: prevTicketProm > 0 ? ((ticketProm - prevTicketProm) / prevTicketProm) * 100 : 0,
    };

    return jsonOk({ kpis, comparativa });
  } catch (err) {
    console.error('Error GET /api/analytics/dashboard:', err);
    return jsonError('Error al cargar dashboard', 500);
  }
}
