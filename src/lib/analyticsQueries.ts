import { getServerSupabase } from '@/lib/supabase/server-api';

const TIMEZONE = 'America/Costa_Rica';

function getCRDateRange(periodo: string, desde?: string, hasta?: string) {
  const now = new Date();
  const crNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const end = new Date(crNow);
  end.setHours(23, 59, 59, 999);
  let start: Date;
  switch (periodo) {
    case 'hoy':
      start = new Date(crNow);
      start.setHours(0, 0, 0, 0);
      break;
    case 'semana':
      start = new Date(crNow);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'mes':
      start = new Date(crNow.getFullYear(), crNow.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'rango':
      start = desde ? new Date(desde) : new Date(crNow);
      start.setHours(0, 0, 0, 0);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        return { start: start.toISOString(), end: h.toISOString() };
      }
      break;
    default:
      start = new Date(crNow);
      start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export interface KPIResult {
  total_ordenes: number;
  ingresos_totales: number;
  ticket_promedio: number;
  desv_estandar: number;
  dias_operativos: number;
  ordenes_por_dia: number;
  ingresos_por_dia: number;
  coef_variacion: number;
}

export interface ProductRow {
  producto: string;
  categoria: string;
  precio_unitario: number;
  unidades_vendidas: number;
  ingresos: number;
  ordenes_con_producto: number;
  rotacion_diaria: number;
}

export interface TimeSeriesRow {
  periodo: string;
  ordenes: number;
  ingresos: number;
  ticket_promedio: number;
}

export interface GoldenHourRow {
  hora: number;
  ordenes: number;
  ingresos: number;
}

export interface WeekdayRow {
  dia: string;
  dia_num: number;
  ordenes: number;
  ingresos: number;
}

export interface PaymentMethodRow {
  metodo: string;
  cantidad: number;
  ingresos: number;
  ticket_promedio: number;
}

export interface TableTurnoverRow {
  mesa: string;
  mins_promedio: number;
  total_ordenes: number;
}

export interface MarketBasketRow {
  producto_a: string;
  producto_b: string;
  frecuencia: number;
}

export interface ComparativaResult {
  ingresos_actual: number;
  ingresos_anterior: number;
  ordenes_actual: number;
  ordenes_anterior: number;
  ticket_actual: number;
  ticket_anterior: number;
  pct_cambio_ingresos: number;
  pct_cambio_ordenes: number;
  pct_cambio_ticket: number;
}

export async function getKPIs(desde: string, hasta: string): Promise<KPIResult> {
  const supabase = getServerSupabase();
  const { data: ordenes, error } = await (supabase.from('ordenes') as any)
    .select('id, total, closed_at')
    .eq('estado', 'cerrada')
    .gte('closed_at', desde)
    .lte('closed_at', hasta);
  if (error) throw error;
  const arr = (ordenes || []) as any[];
  const total = arr.length;
  const ingresos = arr.reduce((acc, o) => acc + Number(o.total || 0), 0);
  const promedio = total > 0 ? ingresos / total : 0;
  const varianza = total > 0
    ? arr.reduce((acc, o) => acc + Math.pow(Number(o.total || 0) - promedio, 2), 0) / total
    : 0;
  const std = Math.sqrt(varianza);
  const cv = promedio > 0 ? std / promedio : 0;
  return {
    total_ordenes: total,
    ingresos_totales: ingresos,
    ticket_promedio: promedio,
    desv_estandar: std,
    dias_operativos: 1,
    ordenes_por_dia: total,
    ingresos_por_dia: ingresos,
    coef_variacion: cv,
  };
}

export async function getTopProductos(desde: string, hasta: string, limit = 20): Promise<ProductRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.from('orden_items') as any)
    .select('cantidad, subtotal, nombre_producto, orden_id, ordenes!inner(closed_at, estado)')
    .eq('ordenes.estado', 'cerrada')
    .gte('ordenes.closed_at', desde)
    .lte('ordenes.closed_at', hasta);
  if (error) throw error;
  const map = new Map<string, { unidades: number; ingresos: number; ordenes: Set<string> }>();
  for (const it of (data || []) as any[]) {
    const nombre = it.nombre_producto;
    const ex = map.get(nombre) || { unidades: 0, ingresos: 0, ordenes: new Set() };
    ex.unidades += Number(it.cantidad || 0);
    ex.ingresos += Number(it.subtotal || 0);
    ex.ordenes.add(it.orden_id);
    map.set(nombre, ex);
  }
  return Array.from(map.entries())
    .map(([producto, v]) => ({
      producto,
      categoria: '',
      precio_unitario: v.unidades > 0 ? v.ingresos / v.unidades : 0,
      unidades_vendidas: v.unidades,
      ingresos: v.ingresos,
      ordenes_con_producto: v.ordenes.size,
      rotacion_diaria: v.unidades,
    }))
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, limit);
}

export async function getTimeSeries(desde: string, hasta: string, _granularity = 'day'): Promise<TimeSeriesRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.from('ordenes') as any)
    .select('total, closed_at')
    .eq('estado', 'cerrada')
    .gte('closed_at', desde)
    .lte('closed_at', hasta)
    .order('closed_at');
  if (error) throw error;
  const map = new Map<string, { ordenes: number; ingresos: number }>();
  for (const o of (data || []) as any[]) {
    const fecha = new Date(o.closed_at).toISOString().split('T')[0];
    const ex = map.get(fecha) || { ordenes: 0, ingresos: 0 };
    ex.ordenes += 1;
    ex.ingresos += Number(o.total || 0);
    map.set(fecha, ex);
  }
  return Array.from(map.entries()).map(([periodo, v]) => ({
    periodo,
    ordenes: v.ordenes,
    ingresos: v.ingresos,
    ticket_promedio: v.ordenes > 0 ? v.ingresos / v.ordenes : 0,
  }));
}

export async function getGoldenHours(desde: string, hasta: string): Promise<GoldenHourRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.from('ordenes') as any)
    .select('total, closed_at')
    .eq('estado', 'cerrada')
    .gte('closed_at', desde)
    .lte('closed_at', hasta);
  if (error) throw error;
  const map = new Map<number, { ordenes: number; ingresos: number }>();
  for (let h = 0; h < 24; h++) map.set(h, { ordenes: 0, ingresos: 0 });
  for (const o of (data || []) as any[]) {
    const hora = parseInt(
      new Date(o.closed_at).toLocaleString('en-US', { timeZone: TIMEZONE, hour: 'numeric', hour12: false }),
      10
    );
    const ex = map.get(hora) || { ordenes: 0, ingresos: 0 };
    ex.ordenes += 1;
    ex.ingresos += Number(o.total || 0);
    map.set(hora, ex);
  }
  return Array.from(map.entries()).map(([hora, v]) => ({ hora, ...v })).sort((a, b) => b.ingresos - a.ingresos);
}

export async function getWeekdayStats(desde: string, hasta: string): Promise<WeekdayRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.from('ordenes') as any)
    .select('total, closed_at')
    .eq('estado', 'cerrada')
    .gte('closed_at', desde)
    .lte('closed_at', hasta);
  if (error) throw error;
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const map = new Map<number, { ordenes: number; ingresos: number }>();
  for (let d = 0; d < 7; d++) map.set(d, { ordenes: 0, ingresos: 0 });
  for (const o of (data || []) as any[]) {
    const d = new Date(o.closed_at).toLocaleString('en-US', { timeZone: TIMEZONE, weekday: 'short' });
    const dnum = dias.findIndex((x) => x.startsWith(d));
    if (dnum >= 0) {
      const ex = map.get(dnum)!;
      ex.ordenes += 1;
      ex.ingresos += Number(o.total || 0);
    }
  }
  return Array.from(map.entries()).map(([dnum, v]) => ({ dia: dias[dnum], dia_num: dnum, ...v }));
}

export async function getMetodosPago(desde: string, hasta: string): Promise<PaymentMethodRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.from('pagos') as any)
    .select('forma_pago, monto, created_at')
    .gte('created_at', desde)
    .lte('created_at', hasta);
  if (error) throw error;
  const map = new Map<string, { cantidad: number; ingresos: number }>();
  for (const p of (data || []) as any[]) {
    const ex = map.get(p.forma_pago) || { cantidad: 0, ingresos: 0 };
    ex.cantidad += 1;
    ex.ingresos += Number(p.monto || 0);
    map.set(p.forma_pago, ex);
  }
  return Array.from(map.entries()).map(([metodo, v]) => ({
    metodo,
    cantidad: v.cantidad,
    ingresos: v.ingresos,
    ticket_promedio: v.cantidad > 0 ? v.ingresos / v.cantidad : 0,
  }));
}

export async function getTableTurnover(desde: string, hasta: string): Promise<TableTurnoverRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.from('ordenes') as any)
    .select('mesa_numero, opened_at, closed_at')
    .eq('estado', 'cerrada')
    .gte('closed_at', desde)
    .lte('closed_at', hasta);
  if (error) throw error;
  const map = new Map<number, { mins: number[]; total: number }>();
  for (const o of (data || []) as any[]) {
    if (!o.closed_at || !o.opened_at) continue;
    const mins = (new Date(o.closed_at).getTime() - new Date(o.opened_at).getTime()) / 60000;
    const ex = map.get(Number(o.mesa_numero)) || { mins: [], total: 0 };
    ex.mins.push(mins);
    ex.total += 1;
    map.set(Number(o.mesa_numero), ex);
  }
  return Array.from(map.entries()).map(([mesa, v]) => ({
    mesa: String(mesa),
    mins_promedio: v.mins.length > 0 ? v.mins.reduce((a, b) => a + b, 0) / v.mins.length : 0,
    total_ordenes: v.total,
  }));
}

export async function getMarketBasket(desde: string, hasta: string, limit = 20): Promise<MarketBasketRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await (supabase.from('orden_items') as any)
    .select('nombre_producto, orden_id, ordenes!inner(closed_at, estado)')
    .eq('ordenes.estado', 'cerrada')
    .gte('ordenes.closed_at', desde)
    .lte('ordenes.closed_at', hasta);
  if (error) throw error;
  const ordenesMap = new Map<string, Set<string>>();
  for (const it of (data || []) as any[]) {
    const set = ordenesMap.get(it.orden_id) || new Set<string>();
    set.add(it.nombre_producto);
    ordenesMap.set(it.orden_id, set);
  }
  const pairs = new Map<string, number>();
  for (const prods of ordenesMap.values()) {
    const arr = Array.from(prods);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i] < arr[j] ? arr[i] : arr[j];
        const b = arr[i] < arr[j] ? arr[j] : arr[i];
        const key = `${a}||${b}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  return Array.from(pairs.entries())
    .filter(([_, f]) => f >= 2)
    .map(([key, frecuencia]) => {
      const [a, b] = key.split('||');
      return { producto_a: a, producto_b: b, frecuencia };
    })
    .sort((a, b) => b.frecuencia - a.frecuencia)
    .slice(0, limit);
}

export async function getComparativa(desde: string, hasta: string): Promise<ComparativaResult> {
  const actual = await getKPIs(desde, hasta);
  let prevDesde: string | undefined;
  let prevHasta: string | undefined;
  if (desde && hasta) {
    const d = new Date(desde);
    const h = new Date(hasta);
    const diff = h.getTime() - d.getTime();
    prevHasta = new Date(d.getTime() - 1).toISOString();
    prevDesde = new Date(d.getTime() - diff - 1).toISOString();
  } else {
    prevDesde = desde;
    prevHasta = hasta;
  }
  const anterior = await getKPIs(prevDesde!, prevHasta!);
  const p = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
  return {
    ingresos_actual: actual.ingresos_totales,
    ingresos_anterior: anterior.ingresos_totales,
    ordenes_actual: actual.total_ordenes,
    ordenes_anterior: anterior.total_ordenes,
    ticket_actual: actual.ticket_promedio,
    ticket_anterior: anterior.ticket_promedio,
    pct_cambio_ingresos: p(actual.ingresos_totales, anterior.ingresos_totales),
    pct_cambio_ordenes: p(actual.total_ordenes, anterior.total_ordenes),
    pct_cambio_ticket: p(actual.ticket_promedio, anterior.ticket_promedio),
  };
}

export function buildDateRange(periodo: string, desde?: string, hasta?: string) {
  return getCRDateRange(periodo, desde, hasta);
}
