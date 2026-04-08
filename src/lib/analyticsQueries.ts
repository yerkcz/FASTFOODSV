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

// ─────────────────────────────────────────────
// QUERY 10: ANÁLISIS POR CATEGORÍA
// ─────────────────────────────────────────────

export interface CategoryRow {
  categoria: string;
  ordenes: number;
  unidades: number;
  ingresos: number;
  pct_participacion: number;
}

export async function getCategoryBreakdown(desde: string, hasta: string): Promise<CategoryRow[]> {
  const res = await query(`
    SELECT
      COALESCE(m."CATEGORIA", 'Sin categoría') AS categoria,
      COUNT(DISTINCT p."Orden_Nu")::int AS ordenes,
      SUM(p."CANTIDAD")::int AS unidades,
      SUM(p."TOTAL")::float AS ingresos,
      ROUND(
        SUM(p."TOTAL")::numeric / 
        NULLIF(SUM(SUM(p."TOTAL")) OVER(), 0) * 100
      , 1)::float AS pct_participacion
    FROM "PEDIDOS" p
    LEFT JOIN "MENU" m ON p."ARTICULO" = m."ARTICULO"
    JOIN "CLIENTES" c ON p."Orden_Nu" = c."Orden_Nu"
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp AND c."Fecha" <= $2::timestamp
    GROUP BY m."CATEGORIA"
    ORDER BY ingresos DESC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 11: TOP PRODUCTOS CON TENDENCIA
// ─────────────────────────────────────────────

export interface ProductTrendRow {
  producto: string;
  categoria: string;
  unidades: number;
  ingresos: number;
  ticket_promedio: number;
  tendencia: string; // 'subiendo', 'estable', 'bajando'
}

export async function getProductTrends(desde: string, hasta: string): Promise<ProductTrendRow[]> {
  const res = await query(`
    WITH productos AS (
      SELECT
        p."ARTICULO",
        COALESCE(m."CATEGORIA", 'Sin categoría') AS categoria,
        SUM(p."CANTIDAD")::int AS unidades,
        SUM(p."TOTAL")::float AS ingresos,
        COUNT(DISTINCT p."Orden_Nu")::int AS ordenes,
        ROUND(AVG(p."TOTAL")::numeric, 0)::float AS ticket_promedio,
        EXTRACT(DAY FROM MAX(c."Fecha"))::int AS dia_ultimo,
        EXTRACT(DAY FROM MIN(c."Fecha"))::int AS dia_primero
      FROM "PEDIDOS" p
      LEFT JOIN "MENU" m ON p."ARTICULO" = m."ARTICULO"
      JOIN "CLIENTES" c ON p."Orden_Nu" = c."Orden_Nu"
      WHERE c."Estado" = 'Cerrada'
        AND c."Fecha" >= $1::timestamp AND c."Fecha" <= $2::timestamp
      GROUP BY p."ARTICULO", m."CATEGORIA"
    )
    SELECT
      "ARTICULO" AS producto,
      categoria,
      unidades,
      ingresos,
      ticket_promedio,
      CASE
        WHEN (dia_ultimo - dia_primero) > 5 AND unidades > 10 THEN 'subiendo'
        WHEN (dia_ultimo - dia_primero) < 3 AND unidades > 5 THEN 'bajando'
        ELSE 'estable'
      END AS tendencia
    FROM productos
    ORDER BY ingresos DESC
    LIMIT 20
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 12: ANÁLISIS DE RETENCIÓN (CLIENTES RECURRENTES)
// ─────────────────────────────────────────────

export interface RetentionRow {
  segmento: string;
  clientes: number;
  ordenes: number;
  ingresos: number;
  pct_clientes: number;
}

export async function getRetentionAnalysis(desde: string, hasta: string): Promise<RetentionRow[]> {
  const res = await query(`
    WITH clientes AS (
      SELECT
        "Nombre_Cliente",
        COUNT(*)::int AS visitas,
        SUM("Total")::float AS total_gastado
      FROM "CLIENTES"
      WHERE "Estado" = 'Cerrada'
        AND "Fecha" >= $1::timestamp AND "Fecha" <= $2::timestamp
        AND "Nombre_Cliente" IS NOT NULL
        AND "Nombre_Cliente" != ''
      GROUP BY "Nombre_Cliente"
    )
    SELECT
      CASE
        WHEN visitas >= 5 THEN 'Frecuentes (5+)'
        WHEN visitas >= 3 THEN 'Regulares (3-4)'
        WHEN visitas >= 2 THEN 'Ocasionales (2)'
        ELSE 'Primera vez'
      END AS segmento,
      COUNT(*)::int AS clientes,
      SUM(visitas)::int AS ordenes,
      SUM(total_gastado)::float AS ingresos,
      ROUND(
        COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100
      , 1)::float AS pct_clientes
    FROM clientes
    GROUP BY segmento
    ORDER BY clientes DESC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 13: DISTRIBUCIÓN DE TICKET (BINNING)
// ─────────────────────────────────────────────

export interface TicketDistRow {
  rango: string;
  ordenes: number;
  ingresos: number;
  pct_ordenes: number;
}

export async function getTicketDistribution(desde: string, hasta: string): Promise<TicketDistRow[]> {
  const res = await query(`
    SELECT
      CASE
        WHEN "Total" >= 50000 THEN '₡50,000+'
        WHEN "Total" >= 30000 THEN '₡30,000-50,000'
        WHEN "Total" >= 20000 THEN '₡20,000-30,000'
        WHEN "Total" >= 10000 THEN '₡10,000-20,000'
        WHEN "Total" >= 5000 THEN '₡5,000-10,000'
        ELSE 'Menos de ₡5,000'
      END AS rango,
      COUNT(*)::int AS ordenes,
      SUM("Total")::float AS ingresos,
      ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 1)::float AS pct_ordenes
    FROM "CLIENTES"
    WHERE "Estado" = 'Cerrada'
      AND "Fecha" >= $1::timestamp AND "Fecha" <= $2::timestamp
    GROUP BY rango
    ORDER BY MIN("Total") DESC
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 14: PRODUCTOS MAS VENDIDOS POR TURNO
// ─────────────────────────────────────────────

export interface ShiftProductRow {
  turno: string;
  producto: string;
  unidades: number;
}

export async function getProductsByShift(desde: string, hasta: string): Promise<ShiftProductRow[]> {
  const res = await query(`
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM c."Fecha" AT TIME ZONE 'America/Costa_Rica') BETWEEN 6 AND 11 THEN 'Desayuno'
        WHEN EXTRACT(HOUR FROM c."Fecha" AT TIME ZONE 'America/Costa_Rica') BETWEEN 12 AND 15 THEN 'Almuerzo'
        WHEN EXTRACT(HOUR FROM c."Fecha" AT TIME ZONE 'America/Costa_Rica') BETWEEN 16 AND 20 THEN 'Cena'
        ELSE 'Noche'
      END AS turno,
      p."ARTICULO" AS producto,
      SUM(p."CANTIDAD")::int AS unidades
    FROM "PEDIDOS" p
    JOIN "CLIENTES" c ON p."Orden_Nu" = c."Orden_Nu"
    WHERE c."Estado" = 'Cerrada'
      AND c."Fecha" >= $1::timestamp AND c."Fecha" <= $2::timestamp
    GROUP BY turno, p."ARTICULO"
    HAVING SUM(p."CANTIDAD") >= 3
  `, [desde, hasta]);

  return res.rows || [];
}

// ─────────────────────────────────────────────
// QUERY 15: MÉTRICAS DE VELOCIDAD (TIEMPO PROMEDIO)
// ─────────────────────────────────────────────

export interface SpeedMetricsRow {
  metric: string;
  valor: number;
  descripcion: string;
}

export async function getSpeedMetrics(desde: string, hasta: string): Promise<SpeedMetricsRow[]> {
  const res = await query(`
    WITH metricas AS (
      SELECT
        COUNT(DISTINCT "Orden_Nu")::int AS ordenes,
        SUM("Total")::float AS ingresos,
        COUNT(*)::int AS dias_operativos,
        MIN("Fecha")::date AS primer_dia,
        MAX("Fecha")::date AS ultimo_dia
      FROM "CLIENTES"
      WHERE "Estado" = 'Cerrada'
        AND "Fecha" >= $1::timestamp AND "Fecha" <= $2::timestamp
    )
    SELECT
      'órdenes_día' AS metric,
      ROUND(ordenes::numeric / NULLIF(dias_operativos, 0), 1)::float AS valor,
      'Órdenes promedio por día' AS descripcion
    FROM metricas
    UNION ALL
    SELECT
      'ingresos_día',
      ROUND(ingresos::numeric / NULLIF(dias_operativos, 0), 0)::float,
      'Ingresos promedio por día'
    FROM metricas
    UNION ALL
    SELECT
      'ticket_promedio',
      ROUND(ingresos::numeric / NULLIF(ordenes, 0), 0)::float,
      'Ticket promedio por orden'
    FROM metricas
    UNION ALL
    SELECT
      'dias_operativos',
      dias_operativos::float,
      'Días operativos en el período'
    FROM metricas
  `, [desde, hasta]);

  return res.rows || [];
}
