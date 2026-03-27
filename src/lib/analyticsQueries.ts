import { query } from '@/lib/db';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// HELPER: Rango de fechas por periodo
// ─────────────────────────────────────────────

export function buildDateRange(periodo: string, desde?: string, hasta?: string) {
  const now = new Date();
  // Convertir a Costa Rica timezone
  const crNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));

  let start: Date;
  let end: Date = new Date(crNow);
  end.setHours(23, 59, 59, 999);

  switch (periodo) {
    case 'hoy':
      start = new Date(crNow);
      start.setHours(0, 0, 0, 0);
      break;
    case 'semana':
      start = new Date(crNow);
      start.setDate(start.getDate() - start.getDay()); // domingo
      start.setHours(0, 0, 0, 0);
      break;
    case 'mes':
      start = new Date(crNow.getFullYear(), crNow.getMonth(), 1);
      break;
    case 'año':
      start = new Date(crNow.getFullYear(), 0, 1);
      break;
    case 'custom':
      if (!desde || !hasta) throw new Error('Custom requiere desde y hasta');
      start = new Date(desde);
      end = new Date(hasta);
      end.setHours(23, 59, 59, 999);
      break;
    default: // 'todo'
      start = new Date('2024-01-01');
      break;
  }

  return { desde: start.toISOString(), hasta: end.toISOString() };
}

/**
 * Calcula el periodo anterior equivalente para comparativas.
 * Ejemplo: si el periodo actual es "7 días", el anterior es "los 7 días antes".
 */
export function buildPreviousPeriod(desde: string, hasta: string) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const diffMs = h.getTime() - d.getTime();

  const prevHasta = new Date(d.getTime() - 1); // 1ms antes del inicio actual
  const prevDesde = new Date(prevHasta.getTime() - diffMs);

  return { desde: prevDesde.toISOString(), hasta: prevHasta.toISOString() };
}

// ─────────────────────────────────────────────
// QUERY 1: KPIs PRINCIPALES
// ─────────────────────────────────────────────

export async function getKPIs(desde: string, hasta: string): Promise<KPIResult> {
  const res = await query(`
    SELECT
      COUNT(DISTINCT c."Orden_Nu")::int AS total_ordenes,
      COALESCE(SUM(c."Total"), 0)::float AS ingresos_totales,
      COALESCE(ROUND(AVG(c."Total")::numeric, 0), 0)::float AS ticket_promedio,
      COALESCE(ROUND(STDDEV(c."Total")::numeric, 0), 0)::float AS desv_estandar,
      COUNT(DISTINCT DATE(c."Fecha" AT TIME ZONE 'America/Costa_Rica'))::int AS dias_operativos
    FROM "CLIENTES" c
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp
      AND c."Fecha" <= $2::timestamp
  `, [desde, hasta]);

  const row = res.rows?.[0] || {};
  const total_ordenes = row.total_ordenes || 0;
  const ingresos_totales = row.ingresos_totales || 0;
  const ticket_promedio = row.ticket_promedio || 0;
  const desv_estandar = row.desv_estandar || 0;
  const dias_operativos = row.dias_operativos || 1; // evitar div/0

  return {
    total_ordenes,
    ingresos_totales,
    ticket_promedio,
    desv_estandar,
    dias_operativos,
    ordenes_por_dia: Math.round(total_ordenes / dias_operativos * 10) / 10,
    ingresos_por_dia: Math.round(ingresos_totales / dias_operativos),
    coef_variacion: ticket_promedio > 0
      ? Math.round((desv_estandar / ticket_promedio) * 1000) / 10
      : 0,
  };
}

// ─────────────────────────────────────────────
// QUERY 2: ANÁLISIS POR PRODUCTO
// ─────────────────────────────────────────────

export async function getProductAnalysis(desde: string, hasta: string): Promise<ProductRow[]> {
  const res = await query(`
    SELECT
      p."ARTICULO" AS producto,
      COALESCE(m."CATEGORIA", 'Sin Categoría') AS categoria,
      COALESCE(m."PRECIO", 0)::float AS precio_unitario,
      COALESCE(SUM(p."CANTIDAD"), 0)::int AS unidades_vendidas,
      COALESCE(SUM(p."TOTAL"), 0)::float AS ingresos,
      COUNT(DISTINCT p."Orden_Nu")::int AS ordenes_con_producto,
      ROUND(
        COALESCE(SUM(p."CANTIDAD"), 0)::numeric /
        NULLIF(COUNT(DISTINCT DATE(c."Fecha" AT TIME ZONE 'America/Costa_Rica')), 0)::numeric
      , 1)::float AS rotacion_diaria
    FROM "PEDIDOS" p
    JOIN "CLIENTES" c ON c."Orden_Nu" = p."Orden_Nu"
    LEFT JOIN "MENU" m ON m."ARTICULO" = p."ARTICULO"
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp
      AND c."Fecha" <= $2::timestamp
    GROUP BY p."ARTICULO", m."CATEGORIA", m."PRECIO"
    ORDER BY ingresos DESC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 3: SERIES TEMPORALES
// ─────────────────────────────────────────────

export async function getTimeSeries(
  desde: string,
  hasta: string,
  granularity: 'day' | 'week' | 'month' | 'year'
): Promise<TimeSeriesRow[]> {
  const validGranularities = ['day', 'week', 'month', 'year'];
  if (!validGranularities.includes(granularity)) {
    throw new Error(`Granularity inválida: ${granularity}`);
  }

  const res = await query(`
    SELECT
      DATE_TRUNC('${granularity}', c."Fecha" AT TIME ZONE 'America/Costa_Rica')::text AS periodo,
      COUNT(DISTINCT c."Orden_Nu")::int AS ordenes,
      COALESCE(SUM(c."Total"), 0)::float AS ingresos,
      COALESCE(ROUND(AVG(c."Total")::numeric, 0), 0)::float AS ticket_promedio
    FROM "CLIENTES" c
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp
      AND c."Fecha" <= $2::timestamp
    GROUP BY periodo
    ORDER BY periodo ASC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 4: GOLDEN HOURS (Horas Pico)
// ─────────────────────────────────────────────

export async function getGoldenHours(desde: string, hasta: string): Promise<GoldenHourRow[]> {
  const res = await query(`
    SELECT
      EXTRACT(HOUR FROM c."Fecha" AT TIME ZONE 'America/Costa_Rica')::int AS hora,
      COUNT(DISTINCT c."Orden_Nu")::int AS ordenes,
      COALESCE(SUM(c."Total"), 0)::float AS ingresos
    FROM "CLIENTES" c
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp
      AND c."Fecha" <= $2::timestamp
    GROUP BY hora
    ORDER BY hora ASC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 5: DESGLOSE POR DÍA DE SEMANA
// ─────────────────────────────────────────────

export async function getWeekdayBreakdown(desde: string, hasta: string): Promise<WeekdayRow[]> {
  const res = await query(`
    SELECT
      TRIM(TO_CHAR(c."Fecha" AT TIME ZONE 'America/Costa_Rica', 'Day')) AS dia,
      EXTRACT(DOW FROM c."Fecha" AT TIME ZONE 'America/Costa_Rica')::int AS dia_num,
      COUNT(DISTINCT c."Orden_Nu")::int AS ordenes,
      COALESCE(SUM(c."Total"), 0)::float AS ingresos
    FROM "CLIENTES" c
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp
      AND c."Fecha" <= $2::timestamp
    GROUP BY dia, dia_num
    ORDER BY dia_num ASC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 6: DISTRIBUCIÓN POR FORMA DE PAGO
// ─────────────────────────────────────────────

export async function getPaymentMethods(desde: string, hasta: string): Promise<PaymentMethodRow[]> {
  const res = await query(`
    SELECT
      COALESCE("Forma_Pago", 'No registrado') AS metodo,
      COUNT(*)::int AS cantidad,
      COALESCE(SUM("Total"), 0)::float AS ingresos,
      COALESCE(ROUND(AVG("Total")::numeric, 0), 0)::float AS ticket_promedio
    FROM "CLIENTES"
    WHERE "Estado" = 'Cerrada'
      AND "Fecha" >= $1::timestamp AND "Fecha" <= $2::timestamp
    GROUP BY "Forma_Pago"
    ORDER BY ingresos DESC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 7: TABLE TURNOVER (Velocidad de Mesa)
// ─────────────────────────────────────────────

export async function getTableTurnover(desde: string, hasta: string): Promise<TableTurnoverRow[]> {
  const res = await query(`
    SELECT
      "Mesa" AS mesa,
      ROUND(AVG(
        EXTRACT(EPOCH FROM (
          COALESCE("Ultima_Actividad", "Fecha") - "Fecha"
        )) / 60
      )::numeric, 0)::int AS mins_promedio,
      COUNT(*)::int AS total_ordenes
    FROM "CLIENTES"
    WHERE "Estado" = 'Cerrada'
      AND "Mesa" IS NOT NULL
      AND "Mesa" != ''
      AND "Fecha" >= $1::timestamp AND "Fecha" <= $2::timestamp
    GROUP BY "Mesa"
    ORDER BY mins_promedio DESC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 8: MARKET BASKET ANALYSIS (Simplificado)
// ─────────────────────────────────────────────

export async function getMarketBasket(desde: string, hasta: string): Promise<MarketBasketRow[]> {
  const res = await query(`
    SELECT
      p1."ARTICULO" AS producto_a,
      p2."ARTICULO" AS producto_b,
      COUNT(*)::int AS frecuencia
    FROM "PEDIDOS" p1
    JOIN "PEDIDOS" p2
      ON p1."Orden_Nu" = p2."Orden_Nu"
      AND p1."ARTICULO" < p2."ARTICULO"
    JOIN "CLIENTES" c ON c."Orden_Nu" = p1."Orden_Nu"
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp AND c."Fecha" <= $2::timestamp
    GROUP BY p1."ARTICULO", p2."ARTICULO"
    HAVING COUNT(*) >= 5
    ORDER BY frecuencia DESC
    LIMIT 20
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 9: COMPARATIVA CON PERIODO ANTERIOR
// ─────────────────────────────────────────────

export async function getComparativa(
  desdeActual: string, hastaActual: string,
  desdeAnterior: string, hastaAnterior: string
): Promise<ComparativaResult> {
  const res = await query(`
    WITH actual AS (
      SELECT
        COUNT(DISTINCT "Orden_Nu")::int AS ordenes,
        COALESCE(SUM("Total"), 0)::float AS ingresos,
        COALESCE(ROUND(AVG("Total")::numeric, 0), 0)::float AS ticket
      FROM "CLIENTES"
      WHERE "Estado" = 'Cerrada'
        AND "Fecha" >= $1::timestamp AND "Fecha" <= $2::timestamp
    ),
    anterior AS (
      SELECT
        COUNT(DISTINCT "Orden_Nu")::int AS ordenes,
        COALESCE(SUM("Total"), 0)::float AS ingresos,
        COALESCE(ROUND(AVG("Total")::numeric, 0), 0)::float AS ticket
      FROM "CLIENTES"
      WHERE "Estado" = 'Cerrada'
        AND "Fecha" >= $3::timestamp AND "Fecha" <= $4::timestamp
    )
    SELECT
      a.ingresos AS ingresos_actual,
      p.ingresos AS ingresos_anterior,
      a.ordenes AS ordenes_actual,
      p.ordenes AS ordenes_anterior,
      a.ticket AS ticket_actual,
      p.ticket AS ticket_anterior,
      ROUND(((a.ingresos - p.ingresos) / NULLIF(p.ingresos, 0) * 100)::numeric, 1)::float AS pct_cambio_ingresos,
      ROUND(((a.ordenes - p.ordenes)::numeric / NULLIF(p.ordenes, 0) * 100)::numeric, 1)::float AS pct_cambio_ordenes,
      ROUND(((a.ticket - p.ticket) / NULLIF(p.ticket, 0) * 100)::numeric, 1)::float AS pct_cambio_ticket
    FROM actual a, anterior p
  `, [desdeActual, hastaActual, desdeAnterior, hastaAnterior]);

  const row = res.rows?.[0] || {};
  return {
    ingresos_actual: row.ingresos_actual || 0,
    ingresos_anterior: row.ingresos_anterior || 0,
    ordenes_actual: row.ordenes_actual || 0,
    ordenes_anterior: row.ordenes_anterior || 0,
    ticket_actual: row.ticket_actual || 0,
    ticket_anterior: row.ticket_anterior || 0,
    pct_cambio_ingresos: row.pct_cambio_ingresos || 0,
    pct_cambio_ordenes: row.pct_cambio_ordenes || 0,
    pct_cambio_ticket: row.pct_cambio_ticket || 0,
  };
}
