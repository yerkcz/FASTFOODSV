import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  CierreCajaRow,
  ComprobanteRow,
  ComprobanteSnapshot,
  OrdenRow,
  PagoRow,
} from "@/types/db";
import { getCRDateKey, getCRHour, getCRWeekday } from "./analytics";
import { formatColones } from "./format";

type Supabase = SupabaseClient<Database>;

const MS_DAY = 86_400_000;
const MIN_BASKET_FREQ = 2;

export type AnalyticsCore = {
  start: string;
  end: string;
  days: number;
  comps: ComprobanteRow[];
  pagosById: Map<string, Pick<PagoRow, "id" | "forma_pago" | "monto">>;
  ordersById: Map<string, OrdenRow>;
  closedOrders: OrdenRow[];
  productCategory: Map<string, string>;
  /** Catálogo actual: sirve para detectar productos sin ventas. */
  productos: { nombre: string; categoria: string; precio: number; disponible: boolean }[];
  itemsByOrder: Map<string, Map<string, ProductItem>>;
  orderTotals: Map<string, number>;
};

type ProductItem = {
  producto: string;
  categoria: string;
  unidades: number;
  ingresos: number;
};

export type KpiSet = {
  ingresos_totales: number;
  total_ordenes: number;
  total_comprobantes: number;
  ticket_promedio: number;
  ticket_mediano: number;
  ticket_p90: number;
  desviacion_ticket: number;
  coef_variacion: number;
  coef_variacion_ticket: number;
  ordenes_por_dia: number;
  items_por_orden: number;
  total_unidades: number;
  dias_con_ventas: number;
};

export type PeriodTotals = {
  ordenes: number;
  ventas: number;
  ticket_promedio: number;
};

export type SalesTotals = PeriodTotals;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function mean(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / (values.length - 1));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "2026-10-04" → "sáb 4 oct". Se arma en UTC para no correr el día. */
function formatFecha(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const mes = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1] || "";
  return `${DIAS_CORTOS[date.getUTCDay()] || ""} ${d} ${mes}`.trim();
}

function itemName(item: ComprobanteSnapshot): string {
  return String(item.nombre || item.producto_nombre || item.ARTICULO || "Sin nombre");
}

function itemQty(item: ComprobanteSnapshot): number {
  const n = Number(item.cantidad ?? item.CANTIDAD ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function itemRevenue(item: ComprobanteSnapshot): number {
  const qty = itemQty(item);
  const unit = Number(item.precio_unitario ?? item.PRECIO ?? 0);
  const subtotal = Number(item.subtotal ?? unit * qty);
  return Number.isFinite(subtotal) ? subtotal : 0;
}

function snapshotArray(value: unknown): ComprobanteSnapshot[] {
  return Array.isArray(value) ? (value as ComprobanteSnapshot[]) : [];
}

function orderKey(comp: ComprobanteRow): string {
  return comp.orden_id || comp.id;
}

export async function loadAnalyticsCore(
  supabase: Supabase,
  start: string,
  end: string
): Promise<AnalyticsCore> {
  const { data: compsData, error: compsError } = await supabase
    .from("comprobantes")
    .select("id,numero,orden_id,pago_id,total,subtotal,descuento,created_at,items_snapshot")
    .gte("created_at", start)
    .lte("created_at", end);
  if (compsError) throw compsError;
  const comps = (compsData || []) as ComprobanteRow[];

  // Pagos y órdenes se cargan por RANGO, no por lista de ids.
  // Con cientos de comprobantes, un `.in("id", [...])` genera una URL de más
  // de 16 KB y PostgREST/undici la rechaza (HeadersOverflowError 500).
  // El rango se abre 3 días por lado para cubrir órdenes abiertas antes del
  // inicio del período pero cerradas dentro de él (y viceversa).
  const margenMs = 3 * 24 * 60 * 60 * 1000;
  const rango = {
    gte: new Date(new Date(start).getTime() - margenMs).toISOString(),
    lte: new Date(new Date(end).getTime() + margenMs).toISOString(),
  };

  const { data: pagosData, error: pagosError } = await supabase
    .from("pagos")
    .select("id, forma_pago, monto")
    .gte("created_at", rango.gte)
    .lte("created_at", rango.lte);
  if (pagosError) throw pagosError;
  const pagosById = new Map<string, Pick<PagoRow, "id" | "forma_pago" | "monto">>();
  (pagosData || []).forEach((p) => pagosById.set(p.id, p));

  const { data: ordersData, error: ordersError } = await supabase
    .from("ordenes")
    .select("id,mesa_numero,tipo,cliente_nombre,cliente_telefono,opened_at,closed_at,created_at,estado")
    .gte("created_at", rango.gte)
    .lte("created_at", rango.lte);
  if (ordersError) throw ordersError;
  const ordersById = new Map<string, OrdenRow>(
    (ordersData || []).map((o) => [o.id, o as OrdenRow])
  );

  // Órdenes cerradas dentro del período (para rotación de mesas y ticket).
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const closedOrders = (ordersData || []).filter((o) => {
    if (o.estado !== "cerrada" || !o.closed_at) return false;
    const t = new Date(o.closed_at).getTime();
    return t >= startMs && t <= endMs;
  }) as OrdenRow[];

  const { data: productsData } = await supabase
    .from("productos")
    .select("nombre,categoria_id,precio,disponible");
  const { data: catsData } = await supabase
    .from("categorias")
    .select("id,nombre");
  const catMap = new Map((catsData || []).map((c) => [c.id, c.nombre]));
  const productCategory = new Map(
    (productsData || []).map((p) => [p.nombre, catMap.get(p.categoria_id as string) || "Otros"])
  );
  const productos = (productsData || []).map((p) => ({
    nombre: String(p.nombre || ""),
    categoria: catMap.get(p.categoria_id as string) || "Otros",
    precio: Number(p.precio || 0),
    disponible: p.disponible !== false,
  }));

  const itemsByOrder = new Map<string, Map<string, ProductItem>>();
  const orderTotals = new Map<string, number>();

  for (const comp of comps) {
    const key = orderKey(comp);
    orderTotals.set(key, (orderTotals.get(key) || 0) + Number(comp.total || 0));

    let items = itemsByOrder.get(key);
    if (!items) {
      items = new Map();
      itemsByOrder.set(key, items);
    }

    for (const item of snapshotArray(comp.items_snapshot)) {
      const producto = itemName(item);
      const categoria =
        (typeof item.categoria === "string" && item.categoria) ||
        productCategory.get(producto) ||
        "Otros";
      const current = items.get(producto) || {
        producto,
        categoria,
        unidades: 0,
        ingresos: 0,
      };
      current.unidades += itemQty(item);
      current.ingresos += itemRevenue(item);
      items.set(producto, current);
    }
  }

  return {
    start,
    end,
    days: Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / MS_DAY)),
    comps,
    pagosById,
    ordersById,
    closedOrders,
    productCategory,
    productos,
    itemsByOrder,
    orderTotals,
  };
}

export function buildKpis(core: AnalyticsCore): KpiSet {
  const totals = [...core.orderTotals.values()];
  const ventas = sum(totals);
  const ordenes = totals.length;
  const ticket = ordenes ? ventas / ordenes : 0;
  const totalUnidades = [...core.itemsByOrder.values()].reduce(
    (s, items) => s + [...items.values()].reduce((x, i) => x + i.unidades, 0),
    0
  );

  const dailyOrders = new Map<string, Set<string>>();
  for (const comp of core.comps) {
    const day = getCRDateKey(comp.created_at);
    const set = dailyOrders.get(day) || new Set<string>();
    set.add(orderKey(comp));
    dailyOrders.set(day, set);
  }
  const dailyCounts = [...dailyOrders.values()].map((s) => s.size);
  const meanOrders = mean(dailyCounts);

  return {
    ingresos_totales: round2(ventas),
    total_ordenes: ordenes,
    total_comprobantes: core.comps.length,
    ticket_promedio: round2(ticket),
    ticket_mediano: round2(percentile(totals, 0.5)),
    ticket_p90: round2(percentile(totals, 0.9)),
    desviacion_ticket: round2(stddev(totals)),
    coef_variacion: meanOrders > 0 ? Math.round((stddev(dailyCounts) / meanOrders) * 100) : 0,
    coef_variacion_ticket: ticket > 0 ? Math.round((stddev(totals) / ticket) * 100) : 0,
    ordenes_por_dia: round1(ordenes / core.days),
    items_por_orden: ordenes ? round1(totalUnidades / ordenes) : 0,
    total_unidades: totalUnidades,
    dias_con_ventas: dailyOrders.size,
  };
}

export async function fetchSalesTotals(
  supabase: Supabase,
  start: string,
  end: string
): Promise<SalesTotals> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select("orden_id,total")
    .gte("created_at", start)
    .lte("created_at", end);
  if (error) throw error;
  const totals = new Map<string, number>();
  for (const c of data || []) {
    const key = c.orden_id || "sin-orden";
    totals.set(key, (totals.get(key) || 0) + Number(c.total || 0));
  }
  const values = [...totals.values()];
  const ventas = sum(values);
  return {
    ordenes: values.length,
    ventas: round2(ventas),
    ticket_promedio: values.length ? round2(ventas / values.length) : 0,
  };
}

/**
 * Mezcla de productos del período anterior, a partir del snapshot de los
 * comprobantes. Se usa solo para comparar el crecimiento por categoría; no
 * necesita pagos ni órdenes, así que es una única consulta liviana.
 */
export async function fetchPrevCategoryMix(
  supabase: Supabase,
  start: string,
  end: string
): Promise<{ nombre: string; categoria: string | null; ingresos: number }[]> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select("items_snapshot")
    .gte("created_at", start)
    .lte("created_at", end);
  if (error) throw error;

  const map = new Map<string, { nombre: string; categoria: string | null; ingresos: number }>();
  for (const row of data || []) {
    for (const item of snapshotArray(row.items_snapshot)) {
      const nombre = itemName(item);
      const categoria =
        typeof item.categoria === "string" && item.categoria ? item.categoria : null;
      const current = map.get(nombre) || { nombre, categoria, ingresos: 0 };
      current.ingresos += itemRevenue(item);
      if (!current.categoria && categoria) current.categoria = categoria;
      map.set(nombre, current);
    }
  }
  return [...map.values()].map((p) => ({ ...p, ingresos: round2(p.ingresos) }));
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Ingresos y comandas de los últimos `months` meses (incluye el mes en curso).
 * Permite mostrar la estacionalidad sin depender del período seleccionado.
 */
export async function fetchMonthlyHistory(
  supabase: Supabase,
  months = 4
): Promise<{ mes: string; label: string; ingresos: number; ordenes: number }[]> {
  const nowIso = new Date().toISOString();
  const nowKey = getCRDateKey(nowIso);
  const [year, month] = nowKey.split("-").map(Number);
  // Si el mes actual es octubre (10), se arranca en julio (índice 6).
  const from = new Date(Date.UTC(year, month - months, 1, 6, 0, 0));

  const { data, error } = await supabase
    .from("comprobantes")
    .select("orden_id,total,created_at")
    .gte("created_at", from.toISOString())
    .lte("created_at", nowIso);
  if (error) throw error;

  const map = new Map<string, { ingresos: number; ordenes: Set<string> }>();
  for (const row of data || []) {
    const key = getCRDateKey(row.created_at).slice(0, 7);
    const current = map.get(key) || { ingresos: 0, ordenes: new Set<string>() };
    current.ingresos += Number(row.total || 0);
    current.ordenes.add(row.orden_id || "sin-orden");
    map.set(key, current);
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => ({
      mes,
      label: MESES_CORTOS[Number(mes.slice(5, 7)) - 1] || mes,
      ingresos: round2(v.ingresos),
      ordenes: v.ordenes.size,
    }));
}

function buildTimeSeries(core: AnalyticsCore) {
  const daySales = new Map<string, number>();
  const dayOrders = new Map<string, Set<string>>();
  for (const comp of core.comps) {
    const day = getCRDateKey(comp.created_at);
    daySales.set(day, (daySales.get(day) || 0) + Number(comp.total || 0));
    const set = dayOrders.get(day) || new Set<string>();
    set.add(orderKey(comp));
    dayOrders.set(day, set);
  }

  const result: { periodo: string; ingresos: number; ordenes: number }[] = [];
  const cursor = new Date(core.start);
  const end = new Date(core.end);
  while (cursor <= end) {
    const key = getCRDateKey(cursor.toISOString());
    result.push({
      periodo: key,
      ingresos: round2(daySales.get(key) || 0),
      ordenes: dayOrders.get(key)?.size || 0,
    });
    cursor.setTime(cursor.getTime() + MS_DAY);
  }
  return result;
}

function buildHourly(core: AnalyticsCore) {
  const sales = new Map<number, number>();
  const orders = new Map<number, Set<string>>();
  for (const comp of core.comps) {
    const hour = getCRHour(comp.created_at);
    sales.set(hour, (sales.get(hour) || 0) + Number(comp.total || 0));
    const set = orders.get(hour) || new Set<string>();
    set.add(orderKey(comp));
    orders.set(hour, set);
  }
  return [...sales.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hora, ingresos]) => ({
      hora,
      ingresos: round2(ingresos),
      ordenes: orders.get(hora)?.size || 0,
    }));
}

function buildWeekdays(core: AnalyticsCore) {
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const sales = new Map<number, number>();
  const orders = new Map<number, Set<string>>();
  for (const comp of core.comps) {
    const day = getCRWeekday(comp.created_at);
    sales.set(day, (sales.get(day) || 0) + Number(comp.total || 0));
    const set = orders.get(day) || new Set<string>();
    set.add(orderKey(comp));
    orders.set(day, set);
  }
  return DAYS.map((dia, dia_num) => ({
    dia_num,
    dia,
    ingresos: round2(sales.get(dia_num) || 0),
    ordenes: orders.get(dia_num)?.size || 0,
  }));
}

function buildHeatmap(core: AnalyticsCore) {
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const comp of core.comps) {
    const day = getCRWeekday(comp.created_at);
    const hour = getCRHour(comp.created_at);
    matrix[day][hour] = round2(matrix[day][hour] + Number(comp.total || 0));
  }
  return {
    dias: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
    horas: Array.from({ length: 24 }, (_, i) => i),
    matrix,
  };
}

function buildPayments(core: AnalyticsCore) {
  const map = new Map<string, { ingresos: number; pagos: number }>();
  for (const comp of core.comps) {
    const pago = comp.pago_id ? core.pagosById.get(comp.pago_id) : undefined;
    const metodo = pago?.forma_pago || "No registrado";
    const current = map.get(metodo) || { ingresos: 0, pagos: 0 };
    current.ingresos += Number(pago?.monto ?? comp.total ?? 0);
    current.pagos += 1;
    map.set(metodo, current);
  }
  const total = sum([...map.values()].map((p) => p.ingresos));
  return [...map.entries()]
    .map(([metodo, v]) => ({
      metodo,
      ingresos: round2(v.ingresos),
      pagos: v.pagos,
      pct: total > 0 ? round1((v.ingresos / total) * 100) : 0,
    }))
    .sort((a, b) => b.ingresos - a.ingresos);
}

function buildProducts(core: AnalyticsCore) {
  const map = new Map<string, ProductItem>();
  for (const items of core.itemsByOrder.values()) {
    for (const item of items.values()) {
      const current = map.get(item.producto);
      if (current) {
        current.unidades += item.unidades;
        current.ingresos += item.ingresos;
      } else {
        map.set(item.producto, { ...item });
      }
    }
  }

  const totalIngresos = sum([...map.values()].map((p) => p.ingresos));
  const totalUnidades = sum([...map.values()].map((p) => p.unidades));
  const midpoint = new Date(core.start).getTime() + (new Date(core.end).getTime() - new Date(core.start).getTime()) / 2;
  const firstHalf = new Map<string, number>();
  const secondHalf = new Map<string, number>();
  for (const comp of core.comps) {
    const target = new Date(comp.created_at).getTime() <= midpoint ? firstHalf : secondHalf;
    for (const item of snapshotArray(comp.items_snapshot)) {
      const name = itemName(item);
      target.set(name, (target.get(name) || 0) + itemQty(item));
    }
  }

  const diasConVentas = new Set(core.comps.map((c) => getCRDateKey(c.created_at))).size;
  let cumulative = 0;
  const productos = [...map.values()]
    .sort((a, b) => b.ingresos - a.ingresos)
    .map((p) => {
      cumulative += p.ingresos;
      const pctAcum = totalIngresos > 0 ? round1((cumulative / totalIngresos) * 100) : 0;
      const first = firstHalf.get(p.producto) || 0;
      const second = secondHalf.get(p.producto) || 0;
      // Con menos de 3 dias de venta no hay historia comparable: marcar
      // "subiendo" seria ruido, no una tendencia real.
      const tendencia =
        diasConVentas < 3
          ? "sin-datos"
          : first === 0 && second > 0
            ? "subiendo"
            : second === 0 && first > 0
              ? "bajando"
              : first > 0 && second > first * 1.2
                ? "subiendo"
                : first > 0 && second < first * 0.8
                  ? "bajando"
                  : "estable";
      return {
        producto: p.producto,
        categoria: p.categoria,
        unidades_vendidas: p.unidades,
        ingresos: round2(p.ingresos),
        rotacion_diaria: round2(p.unidades / core.days),
        pct_individual: totalIngresos > 0 ? round1((p.ingresos / totalIngresos) * 100) : 0,
        pct_unidades: totalUnidades > 0 ? round1((p.unidades / totalUnidades) * 100) : 0,
        pct_acumulado: pctAcum,
        es_vital: pctAcum <= 80,
        abc: pctAcum <= 80 ? "A" : pctAcum <= 95 ? "B" : "C",
        precio_promedio: p.unidades > 0 ? round2(p.ingresos / p.unidades) : 0,
        tendencia,
        cambio_pct: first > 0 ? round1(((second - first) / first) * 100) : second > 0 ? 100 : 0,
      };
    });

  const catMap = new Map<string, { ingresos: number; unidades: number }>();
  for (const p of map.values()) {
    const current = catMap.get(p.categoria) || { ingresos: 0, unidades: 0 };
    current.ingresos += p.ingresos;
    current.unidades += p.unidades;
    catMap.set(p.categoria, current);
  }
  const categorias = [...catMap.entries()]
    .map(([nombre, v]) => ({
      nombre,
      categoria: nombre,
      ingresos: round2(v.ingresos),
      unidades: v.unidades,
      pct_participacion: totalIngresos > 0 ? round1((v.ingresos / totalIngresos) * 100) : 0,
    }))
    .sort((a, b) => b.ingresos - a.ingresos);

  const top10 = productos.slice(0, 10);
  const top10Pct = totalIngresos > 0 ? round1((sum(top10.map((p) => p.ingresos)) / totalIngresos) * 100) : 0;
  const top3CatPct = round1(sum(categorias.slice(0, 3).map((c) => c.pct_participacion)));

  return {
    productos,
    categorias,
    total_ingresos: round2(totalIngresos),
    total_unidades: totalUnidades,
    dias: core.days,
    concentracion: {
      top10_pct: top10Pct,
      top3_categorias_pct: top3CatPct,
      productos_distintos: productos.length,
    },
  };
}

function buildBasket(core: AnalyticsCore) {
  const productOrders = new Map<string, number>();
  const pairs = new Map<string, number>();
  const totalOrders = core.orderTotals.size;

  for (const items of core.itemsByOrder.values()) {
    const names = [...items.keys()].sort();
    for (const name of names) productOrders.set(name, (productOrders.get(name) || 0) + 1);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const key = `${names[i]}\u0000${names[j]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }

  return [...pairs.entries()]
    .map(([key, frecuencia]) => {
      const [producto_a, producto_b] = key.split("\u0000");
      const countA = productOrders.get(producto_a) || 0;
      const countB = productOrders.get(producto_b) || 0;
      return {
        producto_a,
        producto_b,
        frecuencia,
        soporte: totalOrders > 0 ? round1((frecuencia / totalOrders) * 100) : 0,
        confianza: countA > 0 ? round1((frecuencia / countA) * 100) : 0,
        lift: countA > 0 && countB > 0
          ? round2((frecuencia * totalOrders) / (countA * countB))
          : 0,
      };
    })
    .filter((p) => p.frecuencia >= MIN_BASKET_FREQ)
    .sort((a, b) => b.frecuencia - a.frecuencia || b.lift - a.lift)
    .slice(0, 20);
}

function buildTickets(core: AnalyticsCore) {
  const ranges = [
    { rango: "₡0–₡2.999", min: 0, max: 2999.99 },
    { rango: "₡3.000–₡5.999", min: 3000, max: 5999.99 },
    { rango: "₡6.000–₡9.999", min: 6000, max: 9999.99 },
    { rango: "₡10.000–₡14.999", min: 10000, max: 14999.99 },
    { rango: "₡15.000+", min: 15000, max: Infinity },
  ];
  const totals = [...core.orderTotals.values()];
  return ranges.map((r) => {
    const ordenes = totals.filter((t) => t >= r.min && t <= r.max).length;
    return {
      rango: r.rango,
      ordenes,
      pct_ordenes: totals.length ? round1((ordenes / totals.length) * 100) : 0,
    };
  });
}

function buildTurnover(core: AnalyticsCore) {
  const byTable = new Map<number, number[]>();
  for (const order of core.closedOrders) {
    const mesa = Number(order.mesa_numero);
    if (!Number.isInteger(mesa) || mesa <= 0 || !order.opened_at || !order.closed_at) continue;
    const mins = Math.max(
      0,
      Math.round((new Date(order.closed_at).getTime() - new Date(order.opened_at).getTime()) / 60000)
    );
    if (mins <= 0) continue;
    const arr = byTable.get(mesa) || [];
    arr.push(mins);
    byTable.set(mesa, arr);
  }
  return [...byTable.entries()]
    .map(([mesa, values]) => ({
      mesa,
      mins_promedio: Math.round(mean(values)),
      mediana: Math.round(percentile(values, 0.5)),
      ordenes: values.length,
    }))
    .sort((a, b) => a.mesa - b.mesa);
}

function customerAgg(core: AnalyticsCore) {
  const byCustomer = new Map<string, { ordenes: number; ingresos: number }>();

  for (const [orderId, total] of core.orderTotals) {
    const order = core.ordersById.get(orderId);
    if (!order) continue;
    const rawName = String(order.cliente_nombre || "").trim();
    const afterDash = rawName.match(/\s-\s(.+)$/)?.[1]?.trim();
    const phone = String(order.cliente_telefono || "").trim();
    // Para mostrar, el nombre es más cálido que el teléfono; pero si el
    // nombre es genérico ("Mesa 3", "Para llevar") se usa el teléfono.
    const candidate =
      [afterDash, rawName, phone].find(
        (c) => c && !/^mesa\s+\d+$/i.test(c) && !/^para llevar$/i.test(c)
      ) || "";
    if (!candidate) continue;
    const current = byCustomer.get(candidate) || { ordenes: 0, ingresos: 0 };
    current.ordenes += 1;
    current.ingresos += total;
    byCustomer.set(candidate, current);
  }

  return byCustomer;
}

function buildTopCustomers(core: AnalyticsCore) {
  return [...customerAgg(core).entries()]
    .map(([nombre, v]) => ({
      nombre,
      visitas: v.ordenes,
      ingresos: round2(v.ingresos),
      ticket_promedio: v.ordenes ? round2(v.ingresos / v.ordenes) : 0,
    }))
    .sort((a, b) => b.visitas - a.visitas || b.ingresos - a.ingresos)
    .slice(0, 5);
}

function buildRetention(core: AnalyticsCore) {
  const byCustomer = customerAgg(core);

  const segments = [
    { segmento: "Una visita", test: (n: number) => n === 1 },
    { segmento: "Recurrente", test: (n: number) => n >= 2 && n <= 3 },
    { segmento: "Frecuente", test: (n: number) => n >= 4 },
  ];

  return segments
    .map((s) => {
      const clients = [...byCustomer.values()].filter((c) => s.test(c.ordenes));
      return {
        segmento: s.segmento,
        clientes: clients.length,
        ordenes: sum(clients.map((c) => c.ordenes)),
        ingresos: round2(sum(clients.map((c) => c.ingresos))),
      };
    })
    .filter((s) => s.clientes > 0);
}

function buildShifts(core: AnalyticsCore) {
  const defs = [
    { turno: "Mañana", from: 6, to: 11 },
    { turno: "Tarde", from: 12, to: 17 },
    { turno: "Noche", from: 18, to: 23 },
    { turno: "Madrugada", from: 0, to: 5 },
  ];
  return defs.map((d) => {
    const comps = core.comps.filter((c) => {
      const h = getCRHour(c.created_at);
      return h >= d.from && h <= d.to;
    });
    const orders = new Set(comps.map(orderKey));
    const ventas = sum(comps.map((c) => Number(c.total || 0)));
    return {
      turno: d.turno,
      ordenes: orders.size,
      ingresos: round2(ventas),
      ticket_promedio: orders.size ? round2(ventas / orders.size) : 0,
    };
  }).filter((s) => s.ordenes > 0);
}

function buildSpeed(
  kpis: KpiSet,
  turnover: ReturnType<typeof buildTurnover>,
  diasPeriodo: number
) {
  const allMinutes = turnover.flatMap((t) => Array(t.ordenes).fill(t.mins_promedio));
  return [
    { descripcion: "Comandas por día", metric: "órdenes_día", valor: kpis.ordenes_por_dia },
    { descripcion: "Ventas por día", metric: "ingresos_día", valor: round2(kpis.ingresos_totales / Math.max(1, diasPeriodo)) },
    { descripcion: "Ticket promedio", metric: "ticket_promedio", valor: kpis.ticket_promedio },
    { descripcion: "Ítems por orden", metric: "items_orden", valor: kpis.items_por_orden },
    { descripcion: "Tiempo promedio en mesa", metric: "mesa_min", valor: allMinutes.length ? Math.round(mean(allMinutes)) : 0 },
  ];
}

function buildDataQuality(core: AnalyticsCore) {
  const sinPago = core.comps.filter((c) => !c.pago_id || !core.pagosById.has(c.pago_id)).length;
  const snapshotsVacios = core.comps.filter((c) => snapshotArray(c.items_snapshot).length === 0).length;
  const ordenesMultiples = [...core.orderTotals.entries()].filter(([orderId]) => {
    return core.comps.filter((c) => orderKey(c) === orderId).length > 1;
  }).length;

  return {
    comprobantes: core.comps.length,
    ordenes: core.orderTotals.size,
    comprobantes_sin_pago: sinPago,
    snapshots_vacios: snapshotsVacios,
    ordenes_con_multiples_comprobantes: ordenesMultiples,
    dias_con_ventas: new Set(core.comps.map((c) => getCRDateKey(c.created_at))).size,
    cobertura_pago_pct: core.comps.length
      ? round1(((core.comps.length - sinPago) / core.comps.length) * 100)
      : 0,
  };
}

export type DashboardExtras = {
  periodo?: string;
  prevCategories?: { nombre: string; categoria: string | null; ingresos: number }[];
  monthly?: { mes: string; label: string; ingresos: number; ordenes: number }[];
};

/**
 * Métricas "de portada": récords, proyección, canales, descuentos y clientes.
 * Todo se deriva de la misma carga del período; el período anterior solo
 * aporta la mezcla de categorías para calcular crecimiento.
 */
function buildHighlights(core: AnalyticsCore, prev: SalesTotals, extras: DashboardExtras) {
  const kpis = buildKpis(core);
  const series = buildTimeSeries(core);
  const activeDays = series.filter((d) => d.ingresos > 0);
  const hourly = buildHourly(core).filter((h) => h.ingresos > 0);
  const products = buildProducts(core);
  const topCustomers = buildTopCustomers(core);
  const retention = buildRetention(core);

  const bestDay = activeDays.length
    ? activeDays.reduce((a, b) => (b.ingresos > a.ingresos ? b : a), activeDays[0])
    : null;
  const worstDay =
    activeDays.length > 1
      ? activeDays.reduce((a, b) => (b.ingresos < a.ingresos ? b : a), activeDays[0])
      : null;
  const bestHour = hourly.length
    ? hourly.reduce((a, b) => (b.ingresos > a.ingresos ? b : a), hourly[0])
    : null;

  // La cuenta más alta es la suma de todos los comprobantes de una orden
  // (con split bill, mirar un comprobante suelto daría un monto falso).
  let maxOrderId: string | null = null;
  let maxMonto = 0;
  for (const [id, total] of core.orderTotals) {
    if (total > maxMonto) {
      maxMonto = total;
      maxOrderId = id;
    }
  }
  const maxOrder = maxOrderId ? core.ordersById.get(maxOrderId) : null;

  // Racha más larga de días consecutivos con al menos una venta.
  const days = [...new Set(core.comps.map((c) => getCRDateKey(c.created_at)))].sort();
  let racha = { dias: 0, desde: "", hasta: "" };
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff =
      (new Date(`${days[i]}T12:00:00Z`).getTime() -
        new Date(`${days[i - 1]}T12:00:00Z`).getTime()) /
      MS_DAY;
    if (diff === 1) {
      run += 1;
    } else {
      if (run > racha.dias) racha = { dias: run, desde: days[i - run], hasta: days[i - 1] };
      run = 1;
    }
  }
  if (days.length && run > racha.dias) {
    racha = { dias: run, desde: days[days.length - run], hasta: days[days.length - 1] };
  }

  // Mesa vs. para llevar. Si la orden no aparece (rango incompleto), se
  // separa como "sin clasificar" en vez de mentir con un canal.
  const channel = {
    mesa: { ordenes: new Set<string>(), ingresos: 0 },
    llevar: { ordenes: new Set<string>(), ingresos: 0 },
    sin_clasificar: { ordenes: new Set<string>(), ingresos: 0 },
  };
  for (const comp of core.comps) {
    const key = orderKey(comp);
    const order = core.ordersById.get(key);
    const kind: keyof typeof channel = !order
      ? "sin_clasificar"
      : order.tipo === "llevar" || Number(order.mesa_numero) === 99
        ? "llevar"
        : "mesa";
    channel[kind].ordenes.add(key);
    channel[kind].ingresos += Number(comp.total || 0);
  }
  const totalCanal = sum(Object.values(channel).map((c) => c.ingresos));
  const canales = Object.fromEntries(
    Object.entries(channel).map(([k, v]) => [
      k,
      {
        ordenes: v.ordenes.size,
        ingresos: round2(v.ingresos),
        ticket_promedio: v.ordenes.size ? round2(v.ingresos / v.ordenes.size) : 0,
        pct: totalCanal > 0 ? round1((v.ingresos / totalCanal) * 100) : 0,
      },
    ])
  ) as Record<
    keyof typeof channel,
    { ordenes: number; ingresos: number; ticket_promedio: number; pct: number }
  >;

  let descuento = 0;
  let bruto = 0;
  let conDescuento = 0;
  for (const c of core.comps) {
    const d = Number(c.descuento || 0);
    descuento += d;
    bruto += Number(c.total || 0) + d;
    if (d > 0) conDescuento += 1;
  }

  // Proyección de cierre: solo tiene sentido en el mes calendario.
  let proyeccion: {
    dias_transcurridos: number;
    dias_mes: number;
    promedio_diario: number;
    proyeccion: number;
    restante: number;
  } | null = null;
  if (extras.periodo === "mes") {
    const endKey = getCRDateKey(core.end);
    const [y, m, d] = endKey.split("-").map(Number);
    const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const transcurridos = Math.max(1, Math.min(diasMes, d));
    const promedio = kpis.ingresos_totales / transcurridos;
    proyeccion = {
      dias_transcurridos: transcurridos,
      dias_mes: diasMes,
      promedio_diario: round2(promedio),
      proyeccion: round2(promedio * diasMes),
      restante: round2(promedio * Math.max(0, diasMes - transcurridos)),
    };
  }

  // Meta sugerida: el 60% de los días vendió menos que esto. Es un "buen
  // día típico", no un récord; se compara contra el promedio de días abiertos.
  const metaDiaria = percentile(activeDays.map((d) => d.ingresos), 0.6);
  const promedioDiario = kpis.ingresos_totales / Math.max(1, kpis.dias_con_ventas);
  const meta = {
    diaria: round2(metaDiaria),
    promedio: round2(promedioDiario),
    avance_pct: metaDiaria > 0 ? round1((promedioDiario / metaDiaria) * 100) : 0,
  };

  const prevCat = new Map<string, number>();
  for (const p of extras.prevCategories || []) {
    const cat = p.categoria || core.productCategory.get(p.nombre) || "Otros";
    prevCat.set(cat, (prevCat.get(cat) || 0) + p.ingresos);
  }
  const categorias = products.categorias.slice(0, 8).map((c) => {
    const antes = prevCat.get(c.nombre) || 0;
    return {
      nombre: c.nombre,
      ingresos: c.ingresos,
      pct_participacion: c.pct_participacion,
      crecimiento_pct: antes > 0 ? round1(((c.ingresos - antes) / antes) * 100) : null,
    };
  });

  const ticketPorDia = buildWeekdays(core).map((d) => ({
    ...d,
    ticket: d.ordenes ? round2(d.ingresos / d.ordenes) : 0,
  }));

  const vendidos = new Set(products.productos.map((p) => p.producto));
  const sinVenta = core.productos.filter(
    (p) => p.disponible && p.nombre && !vendidos.has(p.nombre)
  );

  const horasActivas = new Set(
    core.comps.map((c) => `${getCRDateKey(c.created_at)}-${getCRHour(c.created_at)}`)
  );
  const ingresoHoraActiva = {
    promedio: horasActivas.size ? round2(kpis.ingresos_totales / horasActivas.size) : 0,
    horas: horasActivas.size,
  };

  const porMesa = new Map<number, { ingresos: number; ordenes: number }>();
  for (const order of core.closedOrders) {
    const mesa = Number(order.mesa_numero);
    if (!Number.isInteger(mesa) || mesa <= 0) continue;
    const current = porMesa.get(mesa) || { ingresos: 0, ordenes: 0 };
    current.ingresos += core.orderTotals.get(order.id) || 0;
    current.ordenes += 1;
    porMesa.set(mesa, current);
  }
  const totalMesas = sum([...porMesa.values()].map((m) => m.ingresos));
  const ventasPorMesa = [...porMesa.entries()]
    .map(([mesa, v]) => ({
      mesa,
      ingresos: round2(v.ingresos),
      ordenes: v.ordenes,
      pct: totalMesas > 0 ? round1((v.ingresos / totalMesas) * 100) : 0,
    }))
    .sort((a, b) => a.mesa - b.mesa);

  const identificados = sum(retention.map((r) => r.clientes));
  const recurrentes = sum(
    retention.filter((r) => r.segmento !== "Una visita").map((r) => r.clientes)
  );

  // Resumen narrado: frases cortas, sin jerga, listas para leer en voz alta.
  const cambio =
    prev.ventas > 0
      ? round1(((kpis.ingresos_totales - prev.ventas) / prev.ventas) * 100)
      : null;
  const cuando =
    (
      {
        hoy: "hoy",
        semana: "esta semana",
        mes: "este mes",
        anio: "este año",
        "año": "este año",
        todo: "en total",
      } as Record<string, string>
    )[extras.periodo || ""] || "en el período";
  const resumen: string[] = [];
  resumen.push(
    `Vendiste ${formatColones(kpis.ingresos_totales)} ${cuando} con ${kpis.total_ordenes} comandas.` +
      (cambio === null
        ? ` Tu cuenta promedio fue ${formatColones(kpis.ticket_promedio)}.`
        : ` Eso es ${String(Math.abs(cambio)).replace(".", ",")}% ${cambio >= 0 ? "más" : "menos"} que el mismo período anterior.`)
  );
  const estrella = products.productos[0];
  if (estrella) {
    resumen.push(
      `Tu producto estrella fue ${estrella.producto}, con ${estrella.unidades_vendidas} unidades y ${formatColones(estrella.ingresos)}.`
    );
  }
  if (bestDay) {
    resumen.push(
      `El mejor día fue ${formatFecha(bestDay.periodo)}, con ${formatColones(bestDay.ingresos)} en ${bestDay.ordenes} comandas.`
    );
  }
  const catTop = products.categorias[0];
  if (catTop) {
    resumen.push(
      `La categoría ${catTop.nombre} generó el ${catTop.pct_participacion}% de tus ventas.`
    );
  }
  if (identificados > 0) {
    resumen.push(
      `${recurrentes} de ${identificados} clientes identificados volvieron más de una vez${
        topCustomers[0] ? `; el más fiel fue ${topCustomers[0].nombre}` : ""
      }.`
    );
  }
  if (proyeccion) {
    resumen.push(
      `Si mantenés el ritmo, cerrarías el mes en ${formatColones(proyeccion.proyeccion)}.`
    );
  } else if (descuento > 0) {
    resumen.push(
      `Otorgaste ${formatColones(descuento)} en descuentos, un ${
        bruto > 0 ? round1((descuento / bruto) * 100) : 0
      }% de lo vendido.`
    );
  }

  return {
    resumen,
    records: {
      mejor_dia: bestDay,
      peor_dia: worstDay,
      cuenta_maxima:
        maxOrder && maxMonto > 0
          ? {
              monto: round2(maxMonto),
              cliente: maxOrder.cliente_nombre || null,
              mesa: maxOrder.mesa_numero ?? null,
              fecha: getCRDateKey(maxOrder.closed_at || maxOrder.created_at),
            }
          : null,
      producto_estrella: estrella
        ? {
            nombre: estrella.producto,
            unidades: estrella.unidades_vendidas,
            ingresos: estrella.ingresos,
          }
        : null,
      categoria_estrella: catTop
        ? { nombre: catTop.nombre, ingresos: catTop.ingresos, pct: catTop.pct_participacion }
        : null,
      cliente_fiel: topCustomers[0] || null,
      racha: racha.dias > 0 ? racha : null,
      hora_top: bestHour,
    },
    proyeccion,
    meta,
    canales,
    descuentos: {
      monto: round2(descuento),
      bruto: round2(bruto),
      pct: bruto > 0 ? round1((descuento / bruto) * 100) : 0,
      comprobantes: core.comps.length,
      con_descuento: conDescuento,
    },
    top_clientes: topCustomers,
    categorias_crecimiento: categorias,
    ticket_por_dia: ticketPorDia,
    productos_sin_venta: {
      total: sinVenta.length,
      productos: sinVenta.slice(0, 8).map((p) => ({
        nombre: p.nombre,
        categoria: p.categoria,
        precio: p.precio,
      })),
    },
    ingreso_hora_activa: ingresoHoraActiva,
    ventas_por_mesa: ventasPorMesa,
    historial_mensual: extras.monthly || [],
    clientes: {
      identificados,
      recurrentes,
      pct_recurrentes: identificados > 0 ? round1((recurrentes / identificados) * 100) : 0,
    },
  };
}

function buildTrend(core: AnalyticsCore) {
  const series = buildTimeSeries(core);
  const values = series.map((s) => s.ingresos);
  const n = values.length;
  if (n < 2) {
    return { direccion: "sin-datos", pendiente: 0, r2: 0, dias: n };
  }
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i;
    ssTot += (values[i] - yMean) ** 2;
    ssRes += (values[i] - pred) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const threshold = Math.max(1, Math.abs(yMean) * 0.02);
  // Una pendiente con R2 bajo no explica nada: se reporta como estable.
  const direccion =
    r2 < 0.3 ? "estable" : slope > threshold ? "subiendo" : slope < -threshold ? "bajando" : "estable";
  return { direccion, pendiente: round2(slope), r2: round2(r2), dias: n };
}

export function buildTrends(core: AnalyticsCore) {
  const kpis = buildKpis(core);
  const turnover = buildTurnover(core);
  const productStats = buildProducts(core);

  return {
    timeSeries: buildTimeSeries(core),
    goldenHours: buildHourly(core),
    weekdays: buildWeekdays(core),
    heatmap: buildHeatmap(core),
    payments: buildPayments(core),
    tableTurnover: turnover,
    basket: buildBasket(core),
    categories: productStats.categorias,
    products: productStats.productos,
    retention: buildRetention(core),
    tickets: buildTickets(core),
    shifts: buildShifts(core),
    speed: buildSpeed(kpis, turnover, core.days),
    dataQuality: buildDataQuality(core),
    trend: buildTrend(core),
  };
}

export function buildProductsResponse(core: AnalyticsCore) {
  const products = buildProducts(core);
  return {
    ...products,
    // `products` y `categorias` se devuelven con el nombre que ya consume la UI.
    productos: products.productos.map((p) => ({ ...p, categoria: p.categoria })),
    categories: products.categorias,
    products: products.productos,
  };
}

export function buildDashboard(
  core: AnalyticsCore,
  prev: SalesTotals,
  extras: DashboardExtras = {}
) {
  const kpis = buildKpis(core);
  const pct = (actual: number, anterior: number) =>
    anterior > 0 ? round1(((actual - anterior) / anterior) * 100) : 0;

  return {
    kpis,
    comparativa: {
      pct_cambio_ingresos: pct(kpis.ingresos_totales, prev.ventas),
      pct_cambio_ordenes: pct(kpis.total_ordenes, prev.ordenes),
      pct_cambio_ticket: pct(kpis.ticket_promedio, prev.ticket_promedio),
      hay_base: prev.ventas > 0 || prev.ordenes > 0,
    },
    periodo: {
      dias: core.days,
      desde: core.start,
      hasta: core.end,
    },
    dataQuality: buildDataQuality(core),
    highlights: buildHighlights(core, prev, extras),
  };
}

export function cierreRowEsperado(cierre: CierreCajaRow | null): number {
  if (!cierre) return 0;
  return round2(
    Number(cierre.fondo_inicial || 0) +
      Number(cierre.total_efectivo || 0) -
      Number(cierre.gastos_efectivo || 0)
  );
}
