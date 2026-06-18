import { NextRequest } from 'next/server';
import { getServerSupabase, jsonOk, jsonError } from '@/lib/supabase/server-api';
import { getPeriodRange } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const periodo = request.nextUrl.searchParams.get('periodo') || 'mes';
    const { start, end } = getPeriodRange(periodo);

    const supabase = getServerSupabase();

    const { data: comps } = await supabase
      .from('comprobantes')
      .select('total, created_at, pago_id')
      .gte('created_at', start)
      .lte('created_at', end);

    const { data: pagos } = await supabase
      .from('pagos')
      .select('id, forma_pago, monto')
      .gte('created_at', start)
      .lte('created_at', end);

    const { data: ordenes } = await supabase
      .from('ordenes')
      .select('id, mesa_numero, opened_at, created_at')
      .gte('created_at', start)
      .lte('created_at', end);

    // Build payment lookup
    const pagoMap = new Map((pagos || []).map((p: any) => [p.id, p.forma_pago]));

    // ── Time Series ──
    const dayMap = new Map<string, number>();
    for (const c of (comps || []) as any[]) {
      const day = (c.created_at as string).slice(0, 10);
      dayMap.set(day, (dayMap.get(day) || 0) + Number(c.total || 0));
    }
    const timeSeries = Array.from(dayMap.entries())
      .map(([periodo, ingresos]) => ({ periodo, ingresos: Math.round(ingresos * 100) / 100 }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    // ── Golden Hours ──
    const hourMap = new Map<number, number>();
    for (const c of (comps || []) as any[]) {
      const h = new Date(c.created_at).getHours();
      hourMap.set(h, (hourMap.get(h) || 0) + Number(c.total || 0));
    }
    const goldenHours = Array.from(hourMap.entries())
      .map(([hora, ingresos]) => ({ hora, ingresos: Math.round(ingresos * 100) / 100 }))
      .sort((a, b) => b.ingresos - a.ingresos);

    // ── Payments ──
    const payMap = new Map<string, number>();
    for (const c of (comps || []) as any[]) {
      const metodo = pagoMap.get(c.pago_id) || 'No registrado';
      payMap.set(metodo, (payMap.get(metodo) || 0) + Number(c.total || 0));
    }
    const payments = Array.from(payMap.entries())
      .map(([metodo, ingresos]) => ({ metodo, ingresos: Math.round(ingresos * 100) / 100 }))
      .sort((a, b) => b.ingresos - a.ingresos);

    // ── Weekdays ──
    const dayOfWeekMap = new Map<number, number>();
    for (const c of (comps || []) as any[]) {
      const dw = new Date(c.created_at).getDay();
      dayOfWeekMap.set(dw, (dayOfWeekMap.get(dw) || 0) + Number(c.total || 0));
    }
    const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const weekdays = Array.from(dayOfWeekMap.entries())
      .map(([dia_num, ingresos]) => ({ dia_num, dia: DAYS_ES[dia_num], ingresos: Math.round(ingresos * 100) / 100 }))
      .sort((a, b) => a.dia_num - b.dia_num);

    // ── Table Turnover ──
    const tableTurnover = (ordenes || []).map((o: any) => {
      const opened = new Date(o.opened_at || o.created_at).getTime();
      const closed = new Date(o.created_at).getTime();
      const mins = Math.round((closed - opened) / 60000);
      return { mesa: o.mesa_numero, mins_promedio: Math.max(0, mins) };
    }).filter((t: any) => t.mins_promedio > 0);

    // Aggregate by table
    const tableMap = new Map<number, number[]>();
    for (const t of tableTurnover) {
      const arr = tableMap.get(t.mesa) || [];
      arr.push(t.mins_promedio);
      tableMap.set(t.mesa, arr);
    }
    const avgTableTurnover = Array.from(tableMap.entries())
      .map(([mesa, mins]) => ({
        mesa,
        mins_promedio: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length),
      }))
      .sort((a, b) => a.mesa - b.mesa);

    return jsonOk({
      timeSeries,
      goldenHours,
      payments,
      weekdays,
      tableTurnover: avgTableTurnover,
      basket: [],
      categories: [],
      products: [],
      retention: [],
      tickets: [],
      shifts: [],
      speed: [],
    });
  } catch (err) {
    console.error('Error GET /api/analytics/trends:', err);
    return jsonError('Error al cargar tendencias', 500);
  }
}
