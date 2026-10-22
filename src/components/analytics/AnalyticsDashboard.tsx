'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler, LineController, BarController, DoughnutController
} from 'chart.js';
import type { ChartData } from 'chart.js';
import { Bar, Doughnut, Chart } from 'react-chartjs-2';
import { generateReportPDF } from '@/lib/generateReport';
import { formatColones } from '@/lib/format';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler, LineController, BarController, DoughnutController
);

// Paleta de marca: verde SANVÍ + naranja de acento. Antes era el azul de
// Google, que no tenía relación con el logo ni con el resto de la app.
const COLORS = {
  primary: '#10b981',
  success: '#047857',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  teal: '#14b8a6',
  orange: '#d97706',
  pink: '#ec4899',
  gray: '#64748b',
  // Orden alternado a propósito: dos verdes o dos naranjas seguidos se
  // confunden en una dona. Así cada porción vecina tiene un tono distinto.
  palette: [
    '#047857', '#f59e0b', '#0e7490', '#84cc16',
    '#8b5cf6', '#d97706', '#14b8a6', '#ec4899',
    '#0891b2', '#a3e635', '#f97316', '#7c3aed',
    '#db2777', '#64748b', '#065f46', '#fbbf24'
  ]
};

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const STATS_NAV = [
  { id: 'stats-resumen', label: '✨ Resumen' },
  { id: 'stats-ventas', label: '💰 Ventas' },
  { id: 'stats-productos', label: '🍽️ Productos' },
  { id: 'stats-clientes', label: '👥 Clientes' },
  { id: 'stats-operacion', label: '⚙️ Operación' },
];

// ── Tipos de las respuestas de /api/analytics/* ──────────────────────────
type DashboardData = {
  kpis: {
    ingresos_totales: number;
    total_ordenes: number;
    total_comprobantes?: number;
    ticket_promedio: number;
    ticket_mediano?: number;
    ticket_p90?: number;
    desviacion_ticket?: number;
    ordenes_por_dia: number;
    coef_variacion: number;
    coef_variacion_ticket?: number;
    items_por_orden?: number;
    total_unidades?: number;
    dias_con_ventas?: number;
  };
  comparativa: {
    pct_cambio_ingresos: number;
    pct_cambio_ordenes: number;
    pct_cambio_ticket: number;
    hay_base?: boolean;
  };
  periodo?: { label: string; dias: number; desde: string; hasta: string };
  dataQuality?: DataQuality;
  highlights?: Highlights;
};

type HighlightDay = { periodo: string; ingresos: number; ordenes: number };

type Highlights = {
  resumen: string[];
  records: {
    mejor_dia: HighlightDay | null;
    peor_dia: HighlightDay | null;
    cuenta_maxima: { monto: number; cliente: string | null; mesa: number | null; fecha: string } | null;
    producto_estrella: { nombre: string; unidades: number; ingresos: number } | null;
    categoria_estrella: { nombre: string; ingresos: number; pct: number } | null;
    cliente_fiel: { nombre: string; visitas: number; ingresos: number; ticket_promedio: number } | null;
    racha: { dias: number; desde: string; hasta: string } | null;
    hora_top: { hora: number; ingresos: number; ordenes: number } | null;
  };
  proyeccion: {
    dias_transcurridos: number;
    dias_mes: number;
    promedio_diario: number;
    proyeccion: number;
    restante: number;
  } | null;
  meta: { diaria: number; promedio: number; avance_pct: number } | null;
  canales: Record<
    'mesa' | 'llevar' | 'sin_clasificar',
    { ordenes: number; ingresos: number; ticket_promedio: number; pct: number }
  >;
  descuentos: {
    monto: number;
    bruto: number;
    pct: number;
    comprobantes: number;
    con_descuento: number;
  };
  top_clientes: { nombre: string; visitas: number; ingresos: number; ticket_promedio: number }[];
  categorias_crecimiento: {
    nombre: string;
    ingresos: number;
    pct_participacion: number;
    crecimiento_pct: number | null;
  }[];
  ticket_por_dia: { dia: string; dia_num: number; ticket: number; ordenes: number; ingresos: number }[];
  productos_sin_venta: {
    total: number;
    productos: { nombre: string; categoria: string; precio: number }[];
  };
  ingreso_hora_activa: { promedio: number; horas: number };
  ventas_por_mesa: { mesa: number; ingresos: number; ordenes: number; pct: number }[];
  historial_mensual: { mes: string; label: string; ingresos: number; ordenes: number }[];
  clientes: { identificados: number; recurrentes: number; pct_recurrentes: number };
};

type DataQuality = {
  comprobantes: number;
  ordenes: number;
  comprobantes_sin_pago: number;
  snapshots_vacios: number;
  ordenes_con_multiples_comprobantes: number;
  dias_con_ventas: number;
  cobertura_pago_pct: number;
};

type ProductoStat = {
  producto: string;
  categoria: string;
  unidades_vendidas: number;
  ingresos: number;
  rotacion_diaria: number;
  pct_individual: number;
  pct_unidades?: number;
  pct_acumulado?: number;
  es_vital?: boolean;
  abc?: "A" | "B" | "C";
  precio_promedio?: number;
  tendencia?: "subiendo" | "bajando" | "estable";
  cambio_pct?: number;
};

type ProductsData = {
  productos: ProductoStat[];
  categorias: { nombre: string; ingresos: number; unidades?: number; pct_participacion?: number }[];
  total_ingresos: number;
  total_unidades?: number;
  dias?: number;
  concentracion?: {
    top10_pct: number;
    top3_categorias_pct: number;
    productos_distintos: number;
  };
};

type GoldenHour = { hora: number; ingresos: number; ordenes?: number };
type WeekdayStat = { dia_num: number; dia: string; ingresos: number; ordenes?: number };
type PaymentStat = { metodo: string; ingresos: number; pagos?: number; pct?: number };
type TimeSeriesPoint = { periodo: string; ingresos: number; ordenes?: number };
type TurnoverStat = { mesa: number | null; mins_promedio: number; mediana?: number; ordenes?: number };
type BasketPair = {
  producto_a: string;
  producto_b: string;
  frecuencia: number;
  soporte?: number;
  confianza?: number;
  lift?: number;
};
type CategoryStat = { categoria: string; ingresos: number; unidades?: number; pct_participacion?: number };
type ProductTrend = {
  producto?: string;
  categoria?: string;
  unidades?: number;
  unidades_vendidas?: number;
  ingresos: number;
  tendencia: string;
  cambio_pct?: number;
  abc?: "A" | "B" | "C";
};
type RetentionSegment = { segmento: string; clientes: number; ordenes: number; ingresos: number };
type TicketRange = { rango: string; ordenes: number; pct_ordenes: number };
type SpeedMetric = { descripcion: string; metric: string; valor: number };
type ShiftStat = { turno: string; ordenes: number; ingresos: number; ticket_promedio: number };

type TrendsData = {
  timeSeries?: TimeSeriesPoint[];
  goldenHours?: GoldenHour[];
  payments?: PaymentStat[];
  weekdays?: WeekdayStat[];
  tableTurnover?: TurnoverStat[];
  basket?: BasketPair[];
  categories?: CategoryStat[];
  products?: ProductTrend[];
  retention?: RetentionSegment[];
  tickets?: TicketRange[];
  shifts?: ShiftStat[];
  speed?: SpeedMetric[];
  dataQuality?: DataQuality;
  trend?: { direccion: string; pendiente: number; r2: number; dias: number };
  heatmap?: { dias: string[]; horas: number[]; matrix: number[][] };
};

/** Argumentos que exige `generateReportPDF` (su firma vive en otro módulo). */
type ReportArgs = Parameters<typeof generateReportPDF>;

/**
 * Chart.js no acepta `var(--x)`: necesita el color resuelto para pintar en
 * canvas. El resto del componente si usa variables CSS; solo las graficas
 * pasan por aqui.
 */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** "2026-10-04" → "sáb 4 oct". Se arma en UTC para no correr el día. */
function formatFechaKey(key?: string | null): string {
  if (!key) return '—';
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return `${DIAS_CORTOS[date.getUTCDay()] || ''} ${d} ${MESES_CORTOS[m - 1] || ''}`.trim();
}

/** Porcentajes con coma decimal, como se escribe en Costa Rica. */
function formatPct(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Para ejes: ₡1.250.000 → ₡1,25M. Los tooltips muestran el monto completo. */
function formatCompactColones(value: number): string {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(n) >= 1_000) return `₡${Math.round(n / 1_000)}k`;
  return `₡${Math.round(n)}`;
}

/** Reduce una serie larga a ~24 puntos para que un sparkline siga siendo legible. */
function downsample(values: number[], max = 24): number[] {
  if (values.length <= max) return values;
  const step = values.length / max;
  return Array.from({ length: max }, (_, i) => values[Math.floor(i * step)]);
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 92;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Explicación en dos capas: qué se está viendo y qué conviene hacer. */
function Note({ what, todo }: { what: React.ReactNode; todo?: React.ReactNode }) {
  return (
    <div style={{ marginTop: '14px', display: 'grid', gap: '6px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-primary)' }}>¿Qué significa?</strong>{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{what}</span>
      </div>
      {todo && (
        <div style={{ background: 'var(--primary-surface)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--primary)' }}>¿Qué hacer?</strong>{' '}
          <span style={{ color: 'var(--text-secondary)' }}>{todo}</span>
        </div>
      )}
    </div>
  );
}

type MedalData = { icon: string; label: string; value: string; sub: string; color: string };

function Medal({ data }: { data: MedalData }) {
  return (
    <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '14px', border: '1px solid var(--surface-border)', borderTop: `3px solid ${data.color}`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontSize: '1.05rem' }}>{data.icon}</span>
        <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{data.label}</span>
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={data.value}>{data.value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>{data.sub}</div>
    </div>
  );
}

function TooltipCard({ title, children, icon }: { title: string; children: React.ReactNode; icon: string }) {
  return (
    <div style={{ 
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--primary-surface) 100%)', 
      borderRadius: '8px', 
      padding: '12px',
      border: '1px solid var(--surface-border)',
      minWidth: 0,
      maxWidth: '100%',
      flex: '1 1 220px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [periodo, setPeriodo] = useState<string>('mes');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [productsData, setProductsData] = useState<ProductsData | null>(null);
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // El reporte PDF es un documento en papel blanco (texto #0d1117). Las
  // graficas se pintan en tema oscuro, asi que al exportar hay que volver a
  // pintarlas en claro o el PDF sale con 4 rectangulos negros.
  const [pdfLight, setPdfLight] = useState(false);
  // Detalle de la celda tocada en el mapa de calor (en móvil no hay hover).
  const [heatCell, setHeatCell] = useState<{ dia: string; hora: number; valor: number } | null>(null);
  const chartGrid = pdfLight ? '#e8eaed' : cssVar('--surface-border', '#1f2a26');
  const chartRing = pdfLight ? '#ffffff' : cssVar('--card-bg', '#11191f');

  // TData es el tipo del ARRAY `data` (ChartDatasetProperties.data: TData) y
  // TLabel el de `labels`; se declaran iguales a los de cada grafica para que
  // la inferencia del `ref` y la del `data` no entren en conflicto.
  const trendRef = useRef<ChartJS<'bar'> | null>(null);
  const peakRef = useRef<ChartJS<'bar', number[], string> | null>(null);
  const donutRef = useRef<ChartJS<'doughnut', number[], string> | null>(null);
  const paretoRef = useRef<ChartJS<'bar'> | null>(null);
  const paymentRef = useRef<ChartJS<'doughnut', number[], string> | null>(null);
  const weekdayRef = useRef<ChartJS<'bar', number[], string> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = `periodo=${periodo}`;

      const [dashRes, prodRes, trendRes] = await Promise.all([
        fetch(`/api/analytics/dashboard?${params}`),
        fetch(`/api/analytics/products?${params}`),
        fetch(`/api/analytics/trends?${params}&granularity=day`),
      ]);

      if (!dashRes.ok || !prodRes.ok || !trendRes.ok) throw new Error('Error al cargar datos');

      const [dash, prod, trend] = await Promise.all([
        dashRes.json(), prodRes.json(), trendRes.json()
      ]);

      setDashboardData(dash);
      setProductsData(prod);
      setTrendsData(trend);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Chart.js trae su propio tema CLARO (texto #666, bordes #e0e0e0). Sobre las
  // tarjetas oscuras los ejes y las leyendas se pierden. Los defaults se leen
  // del tema activo, asi que si algun dia hay tema claro, tambien funciona.
  useEffect(() => {
    ChartJS.defaults.color = pdfLight ? '#5f6368' : cssVar('--text-secondary', '#9ca3af');
    ChartJS.defaults.borderColor = pdfLight ? '#e8eaed' : cssVar('--surface-border', '#1f2a26');
    // Las graficas ya montadas no leen los defaults: hay que redibujarlas.
    [trendRef, peakRef, weekdayRef, paymentRef, donutRef, paretoRef]
      .forEach(r => r.current?.update());
  }, [dashboardData, pdfLight]);

  const handleExportCSV = () => {
    if (!productsData?.productos) return;
    const BOM = '\uFEFF';
    let csv = BOM + 'Producto,Categoría,Unidades Vendidas,Ingresos,Rotación Diaria,% del Total\n';
    productsData.productos.forEach((p) => {
      csv += `"${p.producto}","${p.categoria}",${p.unidades_vendidas},${p.ingresos},${p.rotacion_diaria},${p.pct_individual}%\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `easystem_Reporte_${periodo}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    // Un frame para que React aplique pdfLight y Chart.js re-pinte.
    const settle = () => new Promise(r => setTimeout(r, 250));
    setPdfLight(true);
    await settle();
    const refs = {
      trend: trendRef.current?.toBase64Image() as string,
      peakHours: peakRef.current?.toBase64Image() as string,
      donut: donutRef.current?.toBase64Image() as string,
      pareto: paretoRef.current?.toBase64Image() as string,
    };
    setPdfLight(false);
    await settle();
    // El estado es `T | null`, pero este handler solo corre tras el guard de
    // arriba; el cast es solo de tipos (se borra en compilación).
    await generateReportPDF(
      { ...dashboardData, periodo: { label: periodoLabel } } as unknown as ReportArgs[0],
      productsData as unknown as ReportArgs[1],
      trendsData,
      refs
    );
  };

  const periodoLabel = useMemo(() => {
    const labels: Record<string, string> = {
      'hoy': 'Hoy',
      'semana': 'Esta Semana',
      'mes': 'Este Mes',
      'año': 'Este Año',
      'todo': 'Todo el Tiempo'
    };
    return labels[periodo] || periodo;
  }, [periodo]);

  if (loading) return (
    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
      <div style={{ width: '48px', height: '48px', border: '4px solid var(--primary-surface)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Cargando tus estadísticas...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  
  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)', background: 'var(--danger-soft)', borderRadius: '12px', margin: '20px' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
      <div style={{ fontWeight: 600 }}>Error al cargar estadísticas</div>
      <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>{error}</div>
    </div>
  );
  
  if (!dashboardData || !productsData || !trendsData) return null;

  const { kpis, comparativa } = dashboardData;
  const highlights = dashboardData.highlights;
  const totalIngresos = productsData.total_ingresos || 0;
  const totalComprobantes = kpis.total_comprobantes ?? trendsData.dataQuality?.comprobantes ?? 0;
  const ticketMediano = kpis.ticket_mediano ?? kpis.ticket_promedio;
  const ticketP90 = kpis.ticket_p90 ?? kpis.ticket_promedio;
  const itemsPorOrden = kpis.items_por_orden ?? 0;
  const dataQuality = trendsData.dataQuality || dashboardData.dataQuality;

  // Calcular métricas adicionales. Solo consideramos días/horas con ventas:
  // un día cerrado no debe "ganar" el ranking por tener todo en cero.
  const activeHours = (trendsData.goldenHours || []).filter((h) => h.ingresos > 0);
  const peakHour = activeHours.length
    ? activeHours.reduce((max, h) => (h.ingresos > max.ingresos ? h : max), activeHours[0])
    : null;
  const activeDays = (trendsData.weekdays || []).filter((d) => d.ingresos > 0);
  const bestDay = activeDays.length
    ? activeDays.reduce((max, d) => (d.ingresos > max.ingresos ? d : max), activeDays[0])
    : null;
  const paymentTotals = trendsData.payments?.reduce((acc: number, p) => acc + p.ingresos, 0) || 1;
  const heatmapMax = Math.max(...(trendsData.heatmap?.matrix.flat() || [0]), 1);

  // Sparklines de las KPI principales: la misma serie diaria, comprimida.
  const timeSeries = trendsData.timeSeries || [];
  const sparkRevenue = downsample(timeSeries.map((t) => t.ingresos));
  const sparkOrders = downsample(timeSeries.map((t) => t.ordenes || 0));
  const sparkTicket = downsample(
    timeSeries.map((t) => (t.ordenes ? t.ingresos / t.ordenes : 0))
  );

  // -- Inteligencia de negocio --
  const validTurnovers = trendsData.tableTurnover?.filter((t) => t.mesa && t.mins_promedio > 0) || [];
  const turnoverOrders = validTurnovers.reduce((acc, t) => acc + (t.ordenes || 1), 0);
  const turnoverPromedio = turnoverOrders > 0
    ? validTurnovers.reduce((acc, t) => acc + t.mins_promedio * (t.ordenes || 1), 0) / turnoverOrders
    : 0;
  const topCrossSell = trendsData.basket?.[0];

  // Secciones de análisis
  const categoryData: CategoryStat[] = trendsData.categories?.length
    ? trendsData.categories
    : (productsData.categorias || []).map((c) => ({
        categoria: c.nombre,
        ingresos: c.ingresos,
        unidades: c.unidades,
        pct_participacion: c.pct_participacion,
      }));
  const productTrends: ProductTrend[] = trendsData.products?.length
    ? trendsData.products
    : (productsData.productos || []).map((p) => ({
        producto: p.producto,
        categoria: p.categoria,
        unidades: p.unidades_vendidas,
        ingresos: p.ingresos,
        tendencia: p.tendencia || "estable",
        cambio_pct: p.cambio_pct,
        abc: p.abc,
      }));
  const retentionData = trendsData.retention || [];
  const ticketDist = trendsData.tickets || [];
  const speedMetrics = trendsData.speed || [];
  const shiftData = trendsData.shifts || [];
  const maxCategoryIngresos = Math.max(...categoryData.map((c) => c.ingresos), 1);

  // ===================== GRÁFICOS =====================
  
  // Evolución: barras de ingresos + línea de comandas (dos escalas).
  const trendData = {
    labels: trendsData.timeSeries?.map((t) => {
      const d = new Date(t.periodo);
      return d.toLocaleDateString('es-CR', { month: 'short', day: 'numeric' });
    }) || [],
    datasets: [
      {
        type: 'bar' as const,
        label: 'Ingresos',
        data: trendsData.timeSeries?.map((t) => t.ingresos) || [],
        backgroundColor: 'rgba(16, 185, 129, 0.55)',
        borderColor: COLORS.primary,
        borderWidth: 1,
        borderRadius: 6,
        yAxisID: 'y',
        order: 2
      },
      {
        type: 'line' as const,
        label: 'Comandas',
        data: trendsData.timeSeries?.map((t) => t.ordenes || 0) || [],
        borderColor: COLORS.orange,
        backgroundColor: 'rgba(217, 119, 6, 0.12)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: COLORS.orange,
        fill: false,
        yAxisID: 'y1',
        order: 1
      }
    ]
  };

  // Horas Pico
  const peakHoursData = {
    labels: trendsData.goldenHours?.map((h) => `${h.hora}:00`) || [],
    datasets: [{
      label: 'Ingresos',
      data: trendsData.goldenHours?.map((h) => h.ingresos) || [],
      backgroundColor: trendsData.goldenHours?.map((h) =>
        h.hora === peakHour?.hora ? COLORS.success : COLORS.primary
      ) || [],
      borderRadius: 6
    }]
  };

  // Categorías (Dona): las más chicas se agrupan en "Otras" para que la
  // leyenda siga siendo legible en un móvil.
  const allCategories = productsData!.categorias || [];
  const topCategories = allCategories.slice(0, 7);
  const othersTotal = allCategories.slice(7).reduce((s, c) => s + c.ingresos, 0);
  const donutData = {
    labels: [
      ...topCategories.map((c) => c.nombre),
      ...(othersTotal > 0 ? ['Otras'] : []),
    ],
    datasets: [{
      data: [
        ...topCategories.map((c) => c.ingresos),
        ...(othersTotal > 0 ? [othersTotal] : []),
      ],
      backgroundColor: COLORS.palette,
      hoverOffset: 8,
      borderWidth: 2,
      borderColor: chartRing
    }]
  };

  // Métodos de Pago
  const paymentData = {
    labels: trendsData.payments?.map((p) => p.metodo === 'No registrado' ? 'Sin Registrar' : p.metodo) || [],
    datasets: [{
      data: trendsData.payments?.map((p) => p.ingresos) || [],
      backgroundColor: COLORS.palette,
      borderWidth: 0
    }]
  };

  // Días de la Semana
  const weekdayData = {
    labels: trendsData.weekdays?.map((d) => DAYS_ES[d.dia_num] || d.dia) || [],
    datasets: [{
      label: 'Ingresos',
      data: trendsData.weekdays?.map((d) => d.ingresos) || [],
      backgroundColor: trendsData.weekdays?.map((d) => {
        const max = Math.max(...(trendsData.weekdays?.map((x) => x.ingresos) || [0]));
        const intensity = max > 0 ? d.ingresos / max : 0;
        return intensity > 0.8 ? COLORS.success : intensity > 0.5 ? COLORS.teal : COLORS.primary;
      }) || [],
      borderRadius: 6
    }]
  };

  // Top 10 Productos
  const top10 = (productsData!.productos || []).slice(0, 10);
  const topProductsData = {
    labels: top10.map((p) => p.producto.length > 16 ? p.producto.slice(0, 16) + '…' : p.producto),
    datasets: [{
      label: 'Ingresos',
      data: top10.map((p) => p.ingresos),
      backgroundColor: top10.map((p) =>
        p.es_vital ? COLORS.success : COLORS.primary
      ),
      borderRadius: 4
    }]
  };

  // Pareto
  const paretoData = {
    labels: top10.map((p) => p.producto.length > 12 ? p.producto.slice(0, 12) + '..' : p.producto),
    datasets: [
      {
        type: 'line' as const,
        label: '% Acumulado',
        data: top10.map((p) => p.pct_acumulado),
        borderColor: COLORS.danger,
        borderWidth: 3,
        yAxisID: 'y1',
        tension: 0.1,
        pointRadius: 3
      },
      {
        type: 'bar' as const,
        label: 'Ingresos',
        data: top10.map((p) => p.ingresos),
        backgroundColor: top10.map((p) => p.es_vital ? COLORS.success : COLORS.gray),
        yAxisID: 'y'
      }
    ]
  };

  // ===================== STATS 2.0 =====================
  // Récords en tarjetas: se arman acá para que el JSX quede legible.
  const medals: MedalData[] = [];
  if (highlights) {
    const r = highlights.records;
    if (r.mejor_dia) {
      medals.push({
        icon: '🏆',
        label: 'Mejor día',
        value: formatFechaKey(r.mejor_dia.periodo),
        sub: `${formatColones(r.mejor_dia.ingresos)} · ${r.mejor_dia.ordenes} comandas`,
        color: COLORS.success,
      });
    }
    if (r.cuenta_maxima) {
      const cliente = r.cuenta_maxima.cliente && !/^para llevar$/i.test(r.cuenta_maxima.cliente)
        ? r.cuenta_maxima.cliente
        : '';
      const canal = r.cuenta_maxima.mesa === 99
        ? 'Para llevar'
        : r.cuenta_maxima.mesa
          ? `Mesa ${r.cuenta_maxima.mesa}`
          : '';
      medals.push({
        icon: '💎',
        label: 'Cuenta más alta',
        value: formatColones(r.cuenta_maxima.monto),
        sub: [cliente, canal].filter(Boolean).join(' · ') || 'Sin identificar',
        color: COLORS.orange,
      });
    }
    if (r.producto_estrella) {
      medals.push({
        icon: '⭐',
        label: 'Producto estrella',
        value: r.producto_estrella.nombre,
        sub: `${r.producto_estrella.unidades} unidades · ${formatColones(r.producto_estrella.ingresos)}`,
        color: COLORS.primary,
      });
    }
    if (r.cliente_fiel) {
      medals.push({
        icon: '❤️',
        label: 'Cliente más fiel',
        value: r.cliente_fiel.nombre,
        sub: `${r.cliente_fiel.visitas} visitas · ${formatColones(r.cliente_fiel.ingresos)}`,
        color: COLORS.pink,
      });
    }
    if (r.racha && r.racha.dias > 1) {
      medals.push({
        icon: '🔥',
        label: 'Racha de ventas',
        value: `${r.racha.dias} días seguidos`,
        sub: `${formatFechaKey(r.racha.desde)} → ${formatFechaKey(r.racha.hasta)}`,
        color: COLORS.warning,
      });
    }
    if (r.hora_top) {
      medals.push({
        icon: '⏰',
        label: 'Hora más rentable',
        value: `${r.hora_top.hora}:00`,
        sub: `${formatColones(r.hora_top.ingresos)} · ${r.hora_top.ordenes} comandas`,
        color: COLORS.teal,
      });
    }
    if (r.peor_dia) {
      medals.push({
        icon: '📉',
        label: 'Día más flojo',
        value: formatFechaKey(r.peor_dia.periodo),
        sub: `${formatColones(r.peor_dia.ingresos)} · oportunidad de promo`,
        color: COLORS.gray,
      });
    }
  }

  const canalEntries = highlights
    ? (['mesa', 'llevar', 'sin_clasificar'] as const)
        .map((key) => ({ key, ...highlights.canales[key] }))
        .filter((c) => c.ingresos > 0)
    : [];
  const canalData = {
    labels: canalEntries.map((c) =>
      c.key === 'mesa' ? 'En mesa' : c.key === 'llevar' ? 'Para llevar' : 'Sin clasificar'
    ),
    datasets: [
      {
        data: canalEntries.map((c) => c.ingresos),
        backgroundColor: canalEntries.map((c) =>
          c.key === 'mesa' ? COLORS.primary : c.key === 'llevar' ? COLORS.orange : COLORS.gray
        ),
        borderWidth: 2,
        borderColor: chartRing,
        hoverOffset: 8,
      },
    ],
  };

  const growth = highlights?.categorias_crecimiento || [];
  // Los nombres largos ("Cócteles y Tragos — Tequila...") se cortan justo
  // después del guion para que no queden dos etiquetas idénticas.
  const shortCategory = (name: string) =>
    name.includes('—') ? name.split('—').pop()!.trim() : name;
  const growthData = {
    labels: growth.map((g) => {
      const short = shortCategory(g.nombre);
      return short.length > 24 ? `${short.slice(0, 24)}...` : short;
    }),
    datasets: [
      {
        label: 'Crecimiento',
        data: growth.map((g) => g.crecimiento_pct ?? 0),
        backgroundColor: growth.map((g) =>
          g.crecimiento_pct === null
            ? COLORS.gray
            : g.crecimiento_pct >= 0
              ? COLORS.primary
              : COLORS.danger
        ),
        borderRadius: 4,
      },
    ],
  };

  // Los días cerrados no tienen ticket: mostrarlos en cero confunde.
  const ticketDay = (highlights?.ticket_por_dia || []).filter((d) => d.ordenes > 0);
  const maxTicketDay = Math.max(...ticketDay.map((d) => d.ticket), 1);
  const ticketDayData = {
    labels: ticketDay.map((d) => DAYS_ES[d.dia_num]?.slice(0, 3) || d.dia.slice(0, 3)),
    datasets: [
      {
        label: 'Ticket promedio',
        data: ticketDay.map((d) => d.ticket),
        backgroundColor: ticketDay.map((d) =>
          d.ticket >= maxTicketDay ? COLORS.orange : COLORS.primary
        ),
        borderRadius: 6,
      },
    ],
  };

  const monthly = highlights?.historial_mensual || [];
  const monthlyData = {
    labels: monthly.map((m) => m.label),
    datasets: [
      {
        label: 'Ingresos',
        data: monthly.map((m) => m.ingresos),
        backgroundColor: monthly.map((_, i) =>
          i === monthly.length - 1 ? COLORS.orange : COLORS.primary
        ),
        borderRadius: 6,
      },
    ],
  };

  const gaugePct = Math.max(0, Math.min(100, Math.round(highlights?.meta?.avance_pct || 0)));
  const gaugeData = {
    labels: ['Avance', 'Falta'],
    datasets: [
      {
        data: [gaugePct, 100 - gaugePct],
        backgroundColor: [
          gaugePct >= 100 ? COLORS.success : COLORS.primary,
          'rgba(148, 163, 184, 0.18)',
        ],
        borderWidth: 0,
      },
    ],
  };

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Render
  // El admin ya inyecta 16px laterales y minHeight/fondo: duplicarlos aquí dejaba
  // solo 296px de contenido en un móvil de 360px y sumaba una pantalla extra de
  // scroll. Por eso sin padding horizontal, sin minHeight y sin background propio
  // (evita costura de color). Sin fontFamily hereda Roboto como el resto del admin.
  return (
    <div style={{ padding: '16px 0', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* ===================== HEADER ===================== */}
      <div style={{ 
        background: 'var(--primary-gradient)',
        borderRadius: '16px', padding: '24px', marginBottom: '20px', color: 'white',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.15rem, 5vw, 1.8rem)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
              📊 Resumen de tu Restaurante
            </h2>
            <p style={{ margin: '8px 0 0 0', opacity: 0.9, fontSize: '0.95rem' }}>
              Aquí ves cómo está funcionando tu negocio en <strong>{periodoLabel}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['hoy', 'semana', 'mes', 'año', 'todo'].map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                style={{
                  padding: '10px 20px', borderRadius: '24px', border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.85rem', textTransform: 'capitalize',
                  background: periodo === p ? 'white' : 'rgba(255,255,255,0.15)',
                  color: periodo === p ? 'var(--primary)' : 'white',
                  transition: 'all 0.2s',
                  boxShadow: periodo === p ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 640px) { .stats-nav { position: static !important; } }`}</style>

      {/* ===================== NAVEGACIÓN POR ANCLAS ===================== */}
      <div
        className="stats-nav"
        style={{
          position: 'sticky',
          top: '108px',
          zIndex: 1000,
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          padding: '8px 2px',
          marginBottom: '16px',
          background: 'var(--background)',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none'
        }}
      >
        {STATS_NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => goTo(item.id)}
            style={{
              flex: '0 0 auto',
              padding: '10px 14px',
              minHeight: '44px',
              borderRadius: '999px',
              border: '1px solid var(--surface-border)',
              background: 'var(--card-bg)',
              color: 'var(--text-secondary)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ===================== RESUMEN EJECUTIVO ===================== */}
      <div id="stats-resumen" style={{ scrollMarginTop: '170px', marginBottom: '20px' }}>
        <div style={{ background: 'linear-gradient(135deg, var(--primary-surface) 0%, var(--card-bg) 65%)', border: '1px solid var(--primary)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 800 }}>✨ Tu negocio en pocas palabras</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Lo que dicen los números de <strong>{periodoLabel}</strong>, explicado sin tecnicismos.
              </p>
            </div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '8px 12px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {kpis.total_ordenes} comandas · {kpis.dias_con_ventas ?? 0} días con ventas
            </div>
          </div>

          {highlights?.resumen?.length ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              {highlights.resumen.map((frase, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'var(--card-bg)', borderRadius: '10px', padding: '10px 12px', border: '1px solid var(--surface-border)' }}>
                  <div style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%', background: 'var(--primary-surface)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>{i + 1}</div>
                  <div style={{ fontSize: '0.86rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>{frase}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Todavía no hay suficientes ventas en este período para armar el resumen.
            </div>
          )}

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '12px' }}>
            Se calcula solo con los comprobantes del período. Si un dato no aparece, es porque aún no hay suficientes ventas para medirlo.
          </div>
        </div>
      </div>

      {/* ===================== RÉCORDS DEL PERÍODO ===================== */}
      {medals.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 800 }}>🏅 Récords de {periodoLabel}</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Los hitos que valen la pena contar</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
            {medals.map((m, i) => <Medal key={i} data={m} />)}
          </div>
        </div>
      )}

      {/* ===================== SMART INSIGHTS ===================== */}
      <div style={{ background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--accent-soft) 100%)', padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid var(--accent-soft)', boxShadow: '0 4px 12px rgba(217,119,6,0.15)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🧠</span> Inteligencia Analítica
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px' }}>
          
          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--primary)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px' }}>Rotación Operativa</div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              {turnoverPromedio > 0 
                ? <>En promedio cada mesa tarda <strong>{Math.round(turnoverPromedio)} minutos</strong>. {turnoverPromedio > 90 ? ' Considera agilizar el servicio en turnos fuertes.' : ' ¡Excelente ritmo de atención!'}</>
                : 'Todavía no hay suficientes datos para medir la velocidad de las mesas.'}
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--primary)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px' }}>Mejores Oportunidades</div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              Tu pico de ventas ocurre a las <strong>{peakHour ? peakHour.hora : '00'}:00</strong>. Asegúrate de tener al staff preparado a esa hora.
              {bestDay && <> Tu mejor día históricamente ha sido el <strong>{DAYS_ES[bestDay.dia_num] || bestDay.dia}</strong>.</>}
            </div>
          </div>

          {topCrossSell && (
            <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--accent)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '4px' }}>Potencial de Combo</div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>El <strong>{topCrossSell.producto_a.substring(0,25)}</strong> se vende mucho junto con <strong>{topCrossSell.producto_b.substring(0,25)}</strong>. ¡Anima a los meseros a ofrecerlos juntos!</div>
            </div>
          )}
        </div>
      </div>

      {/* ===================== KPI CARDS ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Ventas Totales</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{formatColones(kpis.ingresos_totales)}</div>
            </div>
            <div style={{ 
              background: comparativa.pct_cambio_ingresos >= 0 ? 'var(--primary-surface)' : 'var(--danger-soft)',
              color: comparativa.pct_cambio_ingresos >= 0 ? 'var(--primary)' : 'var(--danger)',
              padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700
            }}>
              {comparativa.pct_cambio_ingresos >= 0 ? '↑' : '↓'} {formatPct(Math.abs(comparativa.pct_cambio_ingresos))}%
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>vs. mismo período anterior</div>
            <Sparkline values={sparkRevenue} color={COLORS.success} />
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🧾 Total de Comandas</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{kpis.total_ordenes}</div>
            </div>
            <div style={{ 
              background: comparativa.pct_cambio_ordenes >= 0 ? 'var(--primary-surface)' : 'var(--danger-soft)',
              color: comparativa.pct_cambio_ordenes >= 0 ? 'var(--primary)' : 'var(--danger)',
              padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700
            }}>
              {comparativa.pct_cambio_ordenes >= 0 ? '↑' : '↓'} {formatPct(Math.abs(comparativa.pct_cambio_ordenes))}%
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>clientes atendidos</div>
            <Sparkline values={sparkOrders} color={COLORS.primary} />
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎯 Cuenta Promedio</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{formatColones(kpis.ticket_promedio)}</div>
            </div>
            <div style={{ 
              background: comparativa.pct_cambio_ticket >= 0 ? 'var(--primary-surface)' : 'var(--danger-soft)',
              color: comparativa.pct_cambio_ticket >= 0 ? 'var(--primary)' : 'var(--danger)',
              padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700
            }}>
              {comparativa.pct_cambio_ticket >= 0 ? '↑' : '↓'} {formatPct(Math.abs(comparativa.pct_cambio_ticket))}%
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>por cliente</div>
            <Sparkline values={sparkTicket} color={COLORS.orange} />
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚡ Velocidad</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>{kpis.ordenes_por_dia}</div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            comandas/día <span style={{ color: kpis.coef_variacion > 50 ? COLORS.danger : COLORS.success, fontWeight: 600 }}>
              (variación: {kpis.coef_variacion}%)
            </span>
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>⏱️ Tiempo en Mesa</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>{Math.round(turnoverPromedio)}<span style={{fontSize: '1rem'}}>&apos;</span></div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            promedio general de min.
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🧾 Comprobantes</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{totalComprobantes}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            pagos emitidos. Una comanda con split bill puede tener varios.
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📊 Ticket Mediano</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{formatColones(ticketMediano)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            La mitad de las comandas costó menos que esto. Es más estable si hay cuentas muy altas.
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎯 Ticket P90</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>{formatColones(ticketP90)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            10% de las comandas supera este monto. Sirve para detectar cuentas grandes.
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🍽️ Ítems por Comanda</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{itemsPorOrden}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Promedio de unidades por orden. Más ítems suele significar más venta por mesa.
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📅 Días con Ventas</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{kpis.dias_con_ventas ?? dataQuality?.dias_con_ventas ?? 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Días con al menos una comanda en el período seleccionado.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', margin: '-8px 0 24px', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: '10px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span><strong>Comanda</strong> = una orden atendida.</span>
        <span><strong>Comprobante</strong> = un pago emitido.</span>
        <span><strong>Split bill</strong> puede generar varios comprobantes para una sola comanda.</span>
      </div>

      {dataQuality && (dataQuality.comprobantes_sin_pago > 0 || dataQuality.snapshots_vacios > 0) && (
        <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', background: 'var(--warning-soft, #3a2a08)', border: '1px solid var(--warning, #d97706)', color: 'var(--text-primary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
          <strong>Revisión de datos:</strong>{' '}
          {dataQuality.comprobantes_sin_pago > 0 && `${dataQuality.comprobantes_sin_pago} comprobante(s) no tienen pago asociado. `}
          {dataQuality.snapshots_vacios > 0 && `${dataQuality.snapshots_vacios} comprobante(s) no tienen detalle de productos. `}
          Esto puede hacer que los totales de venta y producto no coincidan. Revisá esos cierres antes de tomar decisiones.
        </div>
      )}

      {/* ===================== PROYECCIÓN Y META ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>🎯 ¿Cómo va a cerrar el mes?</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Proyección al ritmo de los días transcurridos</p>

          {highlights?.proyeccion ? (
            <>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--primary)', marginTop: '14px', lineHeight: 1.1 }}>
                {formatColones(highlights.proyeccion.proyeccion)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>cierre estimado del mes</div>

              <div style={{ display: 'grid', gap: '8px', marginTop: '16px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Ritmo actual</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatColones(highlights.proyeccion.promedio_diario)}/día</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Días transcurridos</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{highlights.proyeccion.dias_transcurridos} de {highlights.proyeccion.dias_mes}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Falta por vender (estimado)</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatColones(highlights.proyeccion.restante)}</strong>
                </div>
              </div>

              <div style={{ height: '8px', background: 'var(--surface)', borderRadius: '4px', marginTop: '14px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.round((highlights.proyeccion.dias_transcurridos / highlights.proyeccion.dias_mes) * 100))}%`, background: COLORS.primary, borderRadius: '4px' }} />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                {Math.round((highlights.proyeccion.dias_transcurridos / highlights.proyeccion.dias_mes) * 100)}% del mes transcurrido
              </div>

              <Note
                what="La proyección multiplica tu promedio diario por los días del mes. No es una promesa: es el ritmo que llevás hoy."
                todo="Si querés cerrar más arriba, empujá los días flojos y las categorías con más salida."
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              La proyección aparece cuando elegís el período <strong>Mes</strong>. En otros períodos no hay un cierre de mes que estimar.
            </div>
          )}
        </div>

        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>🚀 Meta diaria sugerida</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Una meta realista, basada en un buen día típico</p>

          {highlights?.meta?.diaria ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
                <div style={{ position: 'relative', height: '170px' }}>
                  <Doughnut
                    data={gaugeData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      rotation: -90,
                      circumference: 180,
                      cutout: '72%',
                      plugins: { legend: { display: false }, tooltip: { enabled: false } }
                    }}
                  />
                  <div style={{ position: 'absolute', top: '42%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: gaugePct >= 100 ? COLORS.success : 'var(--primary)', lineHeight: 1 }}>{gaugePct}%</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>de la meta</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{formatColones(highlights.meta.diaria)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>meta por día</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '12px' }}>
                    Vas a <strong style={{ color: 'var(--text-primary)' }}>{formatColones(highlights.meta.promedio)}</strong> por día con ventas.
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    {highlights.meta.avance_pct >= 100
                      ? '¡Vas por encima de la meta!'
                      : `Te faltan ${formatColones(Math.max(0, highlights.meta.diaria - highlights.meta.promedio))} por día para alcanzarla.`}
                  </div>
                </div>
              </div>
              <Note
                what="La meta es el monto de un buen día típico: 6 de cada 10 días vendieron menos que eso."
                todo={highlights.meta.avance_pct >= 100 ? 'Sostené el ritmo y usá los días flojos para promociones puntuales.' : 'Elegí un producto de margen alto y ofrecelo como extra en cada cuenta.'}
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Necesitás al menos un día con ventas para calcular la meta.
            </div>
          )}
        </div>
      </div>

      {/* ===================== SECCIÓN: TENDENCIA ===================== */}
      <div id="stats-ventas" style={{ scrollMarginTop: '170px', background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>📈 Evolución de tus Ingresos</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Barras verdes: lo que vendiste. Línea naranja: cuántas comandas atendiste.</p>
          </div>
        </div>
        <div style={{ height: '300px' }}>
          <Chart
            ref={trendRef}
            type="bar"
            data={trendData as unknown as ChartData<'bar'>}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index' },
              plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const value = Number(ctx.parsed.y || 0);
                      return ctx.dataset.label === 'Comandas'
                        ? `${value} comandas`
                        : `${ctx.dataset.label}: ${formatColones(value)}`;
                    }
                  }
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  grid: { color: chartGrid },
                  ticks: { callback: (value) => formatCompactColones(Number(value)) }
                },
                y1: {
                  position: 'right',
                  beginAtZero: true,
                  grid: { drawOnChartArea: false },
                  ticks: { precision: 0 }
                },
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7, autoSkip: true } }
              }
            }}
          />
        </div>
        <Note
          what="Cada barra es un día. La altura muestra los ingresos y la línea naranja las comandas: un día puede vender mucho con pocas cuentas grandes, o vender parecido con muchas cuentas chicas."
          todo="Compará los días altos con los bajos: fijate qué pasó (clima, promo, día de la semana) y repetí lo que funcionó."
        />
      </div>

      {/* ===================== GRID 2 COLUMNAS ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(350px, 100%), 1fr))', gap: '20px', marginBottom: '20px' }}>
        
        {/* HORAS PICO */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>⏰ Horas de Mayor Movimiento</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aprovechá estos horarios</p>
            </div>
            {peakHour && (
              <div style={{ background: 'var(--accent-soft)', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase' }}>Mejor hora</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>{peakHour.hora}:00</div>
              </div>
            )}
          </div>
          <div style={{ height: '220px' }}>
            <Bar ref={peakRef} data={peakHoursData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const item = trendsData.goldenHours?.[ctx.dataIndex];
                      return `${formatColones(Number(ctx.parsed.y || 0))} · ${item?.ordenes || 0} comandas`;
                    }
                  }
                }
              },
              scales: { y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { callback: (value) => formatCompactColones(Number(value)) } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8, autoSkip: true } } }
            }} />
          </div>
          <TooltipCard icon="💡" title="Consejo">
            Reforzá tu equipo en las horas pico (las barras más altas) para dar mejor servicio.
          </TooltipCard>
        </div>

        {/* DÍAS DE LA SEMANA */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>📅 Desempeño por Día</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Qué días van mejor</p>
            </div>
            {bestDay && (
              <div style={{ background: 'var(--primary-surface)', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase' }}>Mejor día</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>{DAYS_ES[bestDay.dia_num] || bestDay.dia}</div>
              </div>
            )}
          </div>
          <div style={{ height: '220px' }}>
            <Bar ref={weekdayRef} data={weekdayData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const item = trendsData.weekdays?.[ctx.dataIndex];
                      return `${formatColones(Number(ctx.parsed.y || 0))} · ${item?.ordenes || 0} comandas`;
                    }
                  }
                }
              },
              scales: { y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { callback: (value) => formatCompactColones(Number(value)) } }, x: { grid: { display: false } } }
            }} />
          </div>
          <TooltipCard icon="💡" title="Consejo">
            Los días con más ventas (en verde) son ideales para promociones especiales.
          </TooltipCard>
        </div>

        {/* MÉTODOS DE PAGO */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '4px' }}>💳 Cómo Pagan tus Clientes</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Distribución de formas de pago</p>
          <div style={{ height: '200px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut ref={paymentRef} data={paymentData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { 
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.label}: ${formatColones(Number(ctx.raw))}`
                  }
                }
              },
              cutout: '60%'
            }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
            {trendsData.payments?.map((p, i) => (
              <div key={p.metodo} style={{ 
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'var(--surface)', padding: '6px 12px', borderRadius: '20px',
                fontSize: '0.75rem', fontWeight: 600
              }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: COLORS.palette[i % COLORS.palette.length] }}></div>
                {p.metodo === 'No registrado' ? 'Sin registrar' : p.metodo}: {p.pct ?? Math.round(p.ingresos / paymentTotals * 100)}%
              </div>
            ))}
          </div>
        </div>

        {/* CATEGORÍAS */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '4px' }}>🍽️ Qué se Vende Más</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Por categoría de producto</p>
          <div style={{ height: '260px' }}>
            <Doughnut ref={donutRef} data={donutData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { padding: 8, usePointStyle: true, boxWidth: 8, font: { size: 10 } } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.label}: ${formatColones(Number(ctx.raw))}`
                  }
                }
              },
              cutout: '55%'
            }} />
          </div>
          <TooltipCard icon="🎯" title="Dato Clave">
            Tu categoría estrella genera el {productsData!.categorias?.[0] ? Math.round(productsData!.categorias[0].ingresos / totalIngresos * 100) : 0}% de las ventas.
          </TooltipCard>
        </div>
      </div>

      {/* ===================== CANALES, DESCUENTOS Y HORA ACTIVA ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>🍽️ Mesa vs. Para Llevar</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>De dónde viene tu venta</p>

          {canalEntries.length > 0 ? (
            <>
              <div style={{ position: 'relative', height: '180px', marginTop: '8px' }}>
                <Doughnut
                  data={canalData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => `${ctx.label}: ${formatColones(Number(ctx.raw))}`
                        }
                      }
                    }
                  }}
                />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatColones(kpis.ingresos_totales)}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ventas</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                {canalEntries.map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: c.key === 'mesa' ? COLORS.primary : c.key === 'llevar' ? COLORS.orange : COLORS.gray, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{c.key === 'mesa' ? 'En mesa' : c.key === 'llevar' ? 'Para llevar' : 'Sin clasificar'}</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatPct(c.pct)}%</strong>
                    <span style={{ color: 'var(--text-muted)', width: '72px', textAlign: 'right' }}>{formatColones(c.ingresos)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Cuenta promedio: mesa {formatColones(highlights!.canales.mesa.ticket_promedio)} · llevar {formatColones(highlights!.canales.llevar.ticket_promedio)}
              </div>
              <Note
                what="Mesa y para llevar son dos negocios distintos: distinto ticket, distinto tiempo y distinto personal."
                todo="Si el para llevar crece, prepará un punto de empaque y una fila rápida para no frenar el salón."
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin ventas clasificadas en este período.</div>
          )}
        </div>

        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>🏷️ Descuentos Otorgados</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cuánto estás regalando</p>

          {highlights ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: highlights.descuentos.pct > 10 ? COLORS.danger : COLORS.orange }}>{formatColones(highlights.descuentos.monto)}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{formatPct(highlights.descuentos.pct)}% de lo vendido</div>
              </div>
              <div style={{ height: '10px', background: 'var(--surface)', borderRadius: '5px', marginTop: '12px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, highlights.descuentos.pct)}%`, background: highlights.descuentos.pct > 10 ? COLORS.danger : COLORS.orange, borderRadius: '5px' }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '12px', lineHeight: 1.6 }}>
                De cada <strong>₡100</strong> que entraron, <strong>₡{formatPct(highlights.descuentos.pct)}</strong> fueron descuento.
                <br />
                {highlights.descuentos.con_descuento} de {highlights.descuentos.comprobantes} comprobantes llevaron descuento.
              </div>
              <Note
                what="Un descuento no es una venta perdida: es una venta con menos margen. Lo importante es cuánto pesa sobre el total."
                todo={highlights.descuentos.pct > 10 ? 'Revisá los motivos y poné un tope por cuenta: más de 10% ya es mucho para un negocio de comida.' : 'Mantené el control: si superás el 10%, revisá qué promociones están comiendo el margen.'}
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin datos de descuentos.</div>
          )}
        </div>

        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>⚡ Ingreso por Hora Activa</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Lo que genera cada hora con movimiento</p>

          {highlights?.ingreso_hora_activa?.horas ? (
            <>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '18px' }}>{formatColones(highlights.ingreso_hora_activa.promedio)}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                en {highlights.ingreso_hora_activa.horas} horas con al menos una venta
              </div>
              <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '12px', marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Equivale a <strong style={{ color: 'var(--text-primary)' }}>{(highlights.ingreso_hora_activa.promedio / Math.max(1, kpis.ticket_promedio)).toFixed(1)} cuentas promedio</strong> por hora.
                {highlights.records.hora_top && <> Tu hora más fuerte es a las <strong style={{ color: 'var(--text-primary)' }}>{highlights.records.hora_top.hora}:00</strong>.</>}
              </div>
              <Note
                what="No todas las horas abiertas venden igual. Este número muestra el valor real de una hora con movimiento."
                todo="Concentrá promociones y personal en las horas que sí generan; las horas muertas cuestan igual."
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin horas con ventas.</div>
          )}
        </div>
      </div>

      {/* ===================== TOP PRODUCTOS ===================== */}
      <div id="stats-productos" style={{ scrollMarginTop: '170px', background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🏆 Tus Productos Estrella</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Los 10 productos que más generan ingresos</p>
          </div>
          <div style={{ background: 'var(--primary-surface)', padding: '8px 16px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>{top10.length} productos = {Math.round(top10.reduce((s: number, p) => s + p.pct_individual, 0))}% de ventas</span>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '24px' }}>
          <div style={{ height: '320px' }}>
            <Bar data={topProductsData} options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const item = top10[ctx.dataIndex];
                      return `${formatColones(Number(ctx.parsed.x || 0))} · ${item?.unidades_vendidas || 0} vendidos`;
                    }
                  }
                }
              },
              scales: {
                x: { beginAtZero: true, grid: { color: chartGrid }, ticks: { callback: (value) => formatCompactColones(Number(value)) } },
                y: { grid: { display: false } }
              }
            }} />
          </div>
          
          <div style={{ minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--surface)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Producto</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Vendidos</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((p, i) => (
                  <tr key={p.producto} style={{ borderBottom: '1px solid var(--surface)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 700, color: p.es_vital ? 'var(--primary)' : 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.producto}</span>
                      {p.es_vital && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: 'var(--primary-surface)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>VITAL</span>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{p.unidades_vendidas}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatColones(p.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Note
          what="Los productos marcados como VITAL (A) son los que sostienen la caja: si faltan, se nota de inmediato. Los C son los que menos aportan."
          todo="Asegurá stock de los A y revisá si los C valen la pena o conviene reemplazarlos por algo con más salida."
        />
      </div>

      {/* ===================== PARETO ===================== */}
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>📊 Análisis 80/20 (Pareto)</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              ¿Cuántos productos generan la mayoría de tus ingresos?
            </p>
          </div>
          <TooltipCard icon="📚" title="Qué es esto?">
            La regla 80/20 dice que ~20% de tus productos generan ~80% de tus ventas. 
            Identificalos y asegurate de siempre tenerlos disponibles.
          </TooltipCard>
        </div>
        <div style={{ height: '300px' }}>
          <Chart ref={paretoRef} type="bar" data={paretoData as unknown as ChartData<'bar'>} options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: true, position: 'top' },
              tooltip: {
                callbacks: {
                  label: (ctx) =>
                    ctx.dataset.label === '% Acumulado'
                      ? `${Number(ctx.parsed.y || 0)}% acumulado`
                      : formatColones(Number(ctx.parsed.y || 0))
                }
              }
            },
            scales: {
              y: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: chartGrid }, ticks: { callback: (value) => formatCompactColones(Number(value)) } },
              y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, min: 0, max: 100 }
            }
          }} />
        </div>
        <Note
          what="El 80/20 dice que pocos productos generan la mayor parte de la venta. La línea roja muestra cómo se acumula ese porcentaje."
          todo="Concentrá compras y stock en los productos que llegan rápido al 80%. Si un producto C ocupa espacio, cuestioná su lugar."
        />
      </div>

      {/* ===================== CRECIMIENTO Y TICKET POR DÍA ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(350px, 100%), 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>📈 Qué Categoría Creció</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Comparado con el mismo período anterior</p>
          {growth.length > 0 ? (
            <>
              <div style={{ height: '300px', marginTop: '8px' }}>
                <Bar
                  data={growthData}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const item = growth[ctx.dataIndex];
                            if (!item || item.crecimiento_pct === null) return `${formatColones(item?.ingresos || 0)} · sin base anterior`;
                            return `${item.crecimiento_pct > 0 ? '+' : ''}${formatPct(item.crecimiento_pct)}% · ${formatColones(item.ingresos)} este período`;
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        grid: { color: chartGrid },
                        ticks: { callback: (value) => `${Number(value) > 0 ? '+' : ''}${Number(value)}%` }
                      },
                      y: { grid: { display: false } }
                    }
                  }}
                />
              </div>
              <Note
                what="Verde es una categoría que vendió más que antes; rojo, una que vendió menos. La barra gris es una categoría nueva, sin base para comparar."
                todo="Duplicá la visibilidad de las que suben y revisá precio, promoción o disponibilidad de las que bajan."
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin categorías para comparar.</div>
          )}
        </div>

        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>💳 Ticket Promedio por Día</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Qué día gastan más por cuenta</p>
          {ticketDay.length > 0 ? (
            <>
              <div style={{ height: '300px', marginTop: '8px' }}>
                <Bar
                  data={ticketDayData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const item = ticketDay[ctx.dataIndex];
                            return `${formatColones(Number(ctx.parsed.y || 0))} por cuenta · ${item?.ordenes || 0} comandas`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: chartGrid },
                        ticks: { callback: (value) => formatCompactColones(Number(value)) }
                      },
                      x: { grid: { display: false } }
                    }
                  }}
                />
              </div>
              <Note
                what="No es lo mismo vender mucho que vender caro. Este gráfico muestra cuánto gasta en promedio cada mesa según el día."
                todo="El día con ticket más alto es el mejor para sugerir postres, extras o combos; el más bajo, para promociones de entrada."
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin días con ventas.</div>
          )}
        </div>
      </div>

      {/* ===================== NEW SECTIONS: Market Basket & Table Turnover ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: '20px', marginBottom: '20px' }}>
        
        {/* CROSS-SELLING (MARKET BASKET) */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🛒 Productos Comprados Juntos</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Los &quot;Combos Naturales&quot; de tus clientes</p>
            </div>
            <TooltipCard icon="💡" title="Upselling">
              Entrena a tus meseros para ofrecer mágicamente el Segundo cuando el cliente pide el Primero.
            </TooltipCard>
          </div>
          {trendsData.basket?.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay suficientes datos históricos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
              {trendsData.basket?.slice(0,8).map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--surface)' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>{b.producto_a.length > 22 ? b.producto_a.substring(0,20)+'..' : b.producto_a}</div>
                    <div style={{ background: 'var(--primary-surface)', padding: '4px', borderRadius: '50%', color: 'var(--primary)', display: 'flex', flexShrink: 0 }}>
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>{b.producto_b.length > 22 ? b.producto_b.substring(0,20)+'..' : b.producto_b}</div>
                  </div>
                  <div style={{ marginLeft: '16px', background: 'var(--card-bg)', border: '1px solid var(--surface-border)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {b.frecuencia} veces
                  </div>
                </div>
              ))}
            </div>
          )}
          <Note
            what="Son los pares que más se piden juntos. Si alguien pide uno, hay buena chance de que también quiera el otro."
            todo="Entrená al personal para ofrecer el segundo producto justo cuando piden el primero. Es la venta más fácil."
          />
        </div>

        {/* TIEMPOS DE MESA (TABLE TURNOVER) */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>⏳ Rapidez por Mesa</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Minutos desde la creación hasta el Check-out</p>
            </div>
          </div>
          {validTurnovers.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay registros de tiempo en mesa.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {validTurnovers.map((t, i) => {
                const maxMins = Math.max(...validTurnovers.map((x) => x.mins_promedio));
                const pct = Math.max(8, Math.round((t.mins_promedio / (maxMins || 1)) * 100));
                const isSlow = t.mins_promedio > turnoverPromedio * 1.35;
                const isFast = t.mins_promedio < turnoverPromedio * 0.65;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '70px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Mesa {t.mesa}</div>
                    <div style={{ flex: 1, background: 'var(--surface)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', width: `${pct}%`, 
                        background: isSlow ? COLORS.danger : (isFast ? COLORS.success : COLORS.primary),
                        borderRadius: '4px'
                      }}></div>
                    </div>
                    <div style={{ width: '60px', textAlign: 'right', fontSize: '0.9rem', fontWeight: 800, color: isSlow ? COLORS.danger : 'var(--text-primary)' }}>
                      {t.mins_promedio}m
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===================== ANÁLISIS POR CATEGORÍA ===================== */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>📊 Desglose por Categoría</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Participación de ingresos por categoría</p>
          </div>
          {categoryData.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin datos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categoryData.slice(0, 8).map((cat, i) => {
                const pct = Math.min(100, Math.round((cat.ingresos / maxCategoryIngresos) * 100));
                const share = cat.pct_participacion ?? (totalIngresos > 0 ? (cat.ingresos / totalIngresos) * 100 : 0);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '96px', minWidth: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cat.categoria}>{cat.categoria}</div>
                    <div style={{ flex: 1, minWidth: '30px', background: 'var(--surface)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: COLORS.palette[i % COLORS.palette.length], borderRadius: '6px' }}></div>
                    </div>
                    <div style={{ width: '54px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 700 }}>{share.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===================== DISTRIBUCIÓN DE TICKET ===================== */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>💵 Distribución de Ticket</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Rangos de consumo por orden</p>
          </div>
          {ticketDist.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin datos</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: '12px' }}>
              {ticketDist.map((t, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '16px', background: 'var(--surface)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: COLORS.palette[i % COLORS.palette.length] }}>{t.rango}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{t.ordenes}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>órdenes ({t.pct_ordenes}%)</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===================== RETENCIÓN DE CLIENTES ===================== */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🔄 Clientes Identificados <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>(beta)</span></h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Frecuencia de compra de clientes con nombre o teléfono</p>
          </div>
          {retentionData.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Aún no hay clientes identificados. Para activarlo, anotá el nombre o teléfono al crear la comanda.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {retentionData.map((r, i) => {
                const colors = [COLORS.success, COLORS.primary, COLORS.warning, COLORS.gray];
                return (
                  <div key={i} style={{ 
                    padding: '16px 24px', 
                    background: `${colors[i % colors.length]}15`,
                    border: `2px solid ${colors[i % colors.length]}`,
                    borderRadius: '12px',
                    textAlign: 'center',
                    minWidth: '140px'
                  }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: colors[i % colors.length], textTransform: 'uppercase' }}>{r.segmento}</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{r.clientes}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.ordenes} órdenes · {formatColones(r.ingresos)}</div>
                  </div>
                );
              })}
            </div>
          )}
          <Note
            what="'Una visita' son clientes que vinieron una vez. 'Recurrente' y 'Frecuente' son los que ya volvieron: son la base del negocio."
            todo="Cuidá a los recurrentes: un saludo, su mesa preferida o un detalle cuestan poco y valen mucho."
          />
        </div>

        {/* ===================== CLIENTES VIP ===================== */}
        <div id="stats-clientes" style={{ scrollMarginTop: '170px', background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>💛 Tus Clientes VIP</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Los que más vuelven y más gastan</p>
          </div>
          {highlights?.top_clientes?.length ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {highlights.top_clientes.map((c, i) => (
                  <div key={`${c.nombre}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--surface)', borderRadius: '8px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: i === 0 ? COLORS.orange : 'var(--primary-surface)', color: i === 0 ? 'white' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.nombre}>{c.nombre}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.visitas} visitas · {formatColones(c.ticket_promedio)} por visita</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--primary)' }}>{formatColones(c.ingresos)}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>acumulado</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '12px', background: 'var(--primary-surface)', borderRadius: '8px', padding: '8px 10px' }}>
                {highlights.clientes.recurrentes} de {highlights.clientes.identificados} clientes identificados volvieron más de una vez ({formatPct(highlights.clientes.pct_recurrentes)}%).
              </div>
              <Note
                what="Un cliente frecuente ya confía en el negocio: cuesta mucho menos que conseguir uno nuevo."
                todo="Reconocelos, guardá su preferencia y dales un trato especial. Un cliente VIP bien atendido trae a otros."
              />
            </>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Todavía no hay clientes identificados. Anotá nombre o teléfono al crear la comanda y empezá a medirlos.
            </div>
          )}
        </div>

        {/* ===================== TENDENCIAS DE PRODUCTOS ===================== */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>📈 Productos en Tendencia</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Análisis de comportamiento de ventas</p>
          </div>
          {productTrends.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin datos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {productTrends.slice(0, 10).map((p, i) => {
                const tendenciaColor = p.tendencia === 'subiendo' ? COLORS.success : (p.tendencia === 'bajando' ? COLORS.danger : COLORS.gray);
                const tendenciaIcon = p.tendencia === 'subiendo' ? '📈' : (p.tendencia === 'bajando' ? '📉' : '➡️');
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: 'var(--surface)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{tendenciaIcon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.producto}>{p.producto}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {p.categoria || 'Sin categoría'} · {p.unidades ?? p.unidades_vendidas ?? 0} unidades
                        {p.abc ? ` · ABC ${p.abc}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>{formatColones(p.ingresos)}</div>
                      <div style={{ fontSize: '0.7rem', color: tendenciaColor, fontWeight: 600 }}>
                        {p.tendencia.toUpperCase()}{typeof p.cambio_pct === 'number' && p.cambio_pct !== 0 ? ` ${p.cambio_pct > 0 ? '+' : ''}${p.cambio_pct}%` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {trendsData.heatmap && trendsData.heatmap.matrix.some((row) => row.some((v) => v > 0)) && (
          <div id="stats-operacion" style={{ scrollMarginTop: '170px', background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🗓️ Mapa de Calor: Día y Hora</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cuándo se concentran las ventas (cada cuadro es una hora del día)</p>
            </div>
            {(() => {
              const hm = trendsData.heatmap!;
              const maxValor = heatmapMax;
              return (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(24, 20px)', gap: '2px', minWidth: '540px' }}>
                    <div />
                    {hm.horas.map((h) => (
                      <div key={`h${h}`} style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        {h % 3 === 0 ? h : ''}
                      </div>
                    ))}
                    {hm.matrix.map((row, diaIdx) => (
                      <React.Fragment key={`row${diaIdx}`}>
                        <div key={`d${diaIdx}`} style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                          {hm.dias[diaIdx]}
                        </div>
                        {row.map((valor, horaIdx) => {
                          const intensidad = valor / maxValor;
                          const seleccionada =
                            heatCell?.dia === hm.dias[diaIdx] && heatCell?.hora === hm.horas[horaIdx];
                          return (
                            <div
                              key={`c${diaIdx}-${horaIdx}`}
                              title={`${hm.dias[diaIdx]} ${hm.horas[horaIdx]}:00 — ${formatColones(valor)}`}
                              onClick={() =>
                                setHeatCell({ dia: hm.dias[diaIdx], hora: hm.horas[horaIdx], valor })
                              }
                              style={{
                                height: '20px',
                                width: '100%',
                                borderRadius: '3px',
                                cursor: valor > 0 ? 'pointer' : 'default',
                                background: valor > 0
                                  ? `rgba(4, 120, 87, ${0.15 + intensidad * 0.85})`
                                  : 'var(--surface)',
                                border: seleccionada ? '2px solid var(--accent)' : '1px solid var(--surface-border)',
                              }}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })()}
            {heatCell && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px', background: 'var(--primary-surface)', border: '1px solid var(--primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{heatCell.dia} a las {heatCell.hora}:00</strong>
                <span style={{ color: 'var(--text-secondary)' }}>{formatColones(heatCell.valor)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{Math.round((heatCell.valor / heatmapMax) * 100)}% del pico</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span>Menos ventas</span>
              {[0.12, 0.3, 0.5, 0.7, 0.9].map((n) => (
                <span key={n} style={{ width: '18px', height: '12px', borderRadius: '2px', background: `rgba(4, 120, 87, ${n})`, border: '1px solid var(--surface-border)' }} />
              ))}
              <span>Más ventas</span>
              <span style={{ marginLeft: 'auto' }}>Pico: {formatColones(heatmapMax)}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Verde intenso = más ventas en esa franja. Tocá un cuadro para ver el monto exacto. Usalo para programar al personal extra.
            </div>
          </div>
        )}

        {shiftData.length > 0 && (
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🕐 Ventas por Turno</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Dónde se concentra la operación durante el día</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {shiftData.map((s, i) => {
                const maxShift = Math.max(...shiftData.map((x) => x.ingresos), 1);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '78px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{s.turno}</div>
                    <div style={{ flex: 1, background: 'var(--surface)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(4, Math.round((s.ingresos / maxShift) * 100))}%`, background: COLORS.palette[i % COLORS.palette.length], borderRadius: '5px' }}></div>
                    </div>
                    <div style={{ width: '104px', textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{formatColones(s.ingresos)}</strong><br />{s.ordenes} órdenes
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== PRODUCTOS SIN VENTA ===================== */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🧊 Productos sin Ventas</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Los que están en el menú pero no se movieron</p>
          </div>
          {highlights ? (
            highlights.productos_sin_venta.total > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: COLORS.orange }}>{highlights.productos_sin_venta.total}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>productos sin una sola venta</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                  {highlights.productos_sin_venta.productos.map((p, i) => (
                    <div key={`${p.nombre}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--surface)', borderRadius: '8px', fontSize: '0.8rem' }}>
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nombre}>{p.nombre}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', flexShrink: 0 }}>{p.categoria}</span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 700, flexShrink: 0 }}>{formatColones(p.precio)}</span>
                    </div>
                  ))}
                  {highlights.productos_sin_venta.total > highlights.productos_sin_venta.productos.length && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      +{highlights.productos_sin_venta.total - highlights.productos_sin_venta.productos.length} productos más en el menú.
                    </div>
                  )}
                </div>
                <Note
                  what="Tener un producto en el menú también cuesta: ocupa espacio, confunde y puede echarse a perder."
                  todo="Probalo como especial del día, cambiale el nombre o sacalo del menú. Un menú corto vende más."
                />
              </>
            ) : (
              <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                ¡Todo el menú se movió en este período! No hay productos dormidos.
              </div>
            )
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin datos del menú.</div>
          )}
        </div>

        {/* ===================== HISTORIAL MENSUAL ===================== */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🗓️ Así Viene Tu Negocio</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Últimos meses · el mes en curso va en naranja</p>
          </div>
          {monthly.length > 0 ? (
            <>
              <div style={{ height: '220px' }}>
                <Bar
                  data={monthlyData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const item = monthly[ctx.dataIndex];
                            return `${formatColones(Number(ctx.parsed.y || 0))} · ${item?.ordenes || 0} comandas`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: chartGrid },
                        ticks: { callback: (value) => formatCompactColones(Number(value)) }
                      },
                      x: { grid: { display: false } }
                    }
                  }}
                />
              </div>
              <Note
                what="Cada barra es un mes completo. El mes en curso todavía no terminó, así que su barra puede quedar más baja."
                todo="Compará meses para saber si estás creciendo de verdad o si un mes bueno fue solo casualidad."
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin historial suficiente.</div>
          )}
        </div>

        {/* ===================== VENTAS POR MESA ===================== */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--surface-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 700 }}>🪑 Ventas por Mesa</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cuánto aporta cada mesa al total</p>
          </div>
          {highlights?.ventas_por_mesa?.length ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {highlights.ventas_por_mesa.map((v) => {
                  const maxMesa = Math.max(...highlights.ventas_por_mesa.map((x) => x.ingresos), 1);
                  return (
                    <div key={v.mesa} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '64px', fontSize: '0.78rem', fontWeight: 700, color: v.mesa === 99 ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}>
                        {v.mesa === 99 ? 'Llevar' : `Mesa ${v.mesa}`}
                      </div>
                      <div style={{ flex: 1, minWidth: '30px', background: 'var(--surface)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(4, Math.round((v.ingresos / maxMesa) * 100))}%`, background: v.mesa === 99 ? COLORS.orange : COLORS.primary, borderRadius: '5px' }} />
                      </div>
                      <div style={{ width: '92px', textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatColones(v.ingresos)}</div>
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{formatPct(v.pct)}% · {v.ordenes} comandas</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Note
                what="Las mesas 1 a 6 son salón; la 99 es para llevar. Este reparto muestra dónde se concentra la facturación."
                todo="Si una mesa factura mucho más, revisá si conviene reservarla o sumar otra en la misma zona."
              />
            </>
          ) : (
            <div style={{ padding: '20px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin mesas cerradas en este período.</div>
          )}
        </div>

        {/* ===================== MÉTRICAS DE VELOCIDAD ===================== */}
        {speedMetrics.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, var(--primary-surface) 0%, var(--primary-glow) 100%)', borderRadius: '16px', padding: '24px', border: '1px solid var(--primary)', boxShadow: '0 4px 12px rgba(52,168,83,0.15)' }}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 700 }}>⚡ Métricas de Rendimiento</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>KPIs operativos del período</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '16px' }}>
              {speedMetrics.map((m, i) => (
                <div key={i} style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{m.descripcion}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                    {m.metric === 'ingresos_día' || m.metric === 'ticket_promedio'
                      ? formatColones(m.valor)
                      : Math.round(m.valor)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ===================== BOTONES EXPORT ===================== */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '20px', paddingBottom: '40px' }}>
        <button onClick={handleExportCSV} style={{ 
          padding: '14px 20px', borderRadius: '12px', border: '2px solid var(--primary)', 
          background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 700, color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', minHeight: '44px',
          flex: '1 1 150px', maxWidth: '280px'
        }}>
          📥 Exportar Excel
        </button>
        <button onClick={handleExportPDF} style={{ 
          padding: '14px 20px', borderRadius: '12px', border: 'none', 
          background: 'var(--primary-gradient)', cursor: 'pointer', fontWeight: 700, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', minHeight: '44px',
          boxShadow: '0 4px 12px rgba(4,120,87,0.3)',
          flex: '1 1 150px', maxWidth: '280px'
        }}>
          📄 Generar Reporte PDF
        </button>
      </div>

    </div>
  );
}
