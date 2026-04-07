'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler, LineController, BarController, DoughnutController
} from 'chart.js';
import { Line, Bar, Doughnut, Chart } from 'react-chartjs-2';
import { generateReportPDF } from '@/lib/generateReport';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler, LineController, BarController, DoughnutController
);

function formatColones(amount: number): string {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

const COLORS = {
  primary: '#1a73e8',
  success: '#34a853',
  warning: '#fbbc04',
  danger: '#ea4335',
  purple: '#9334e6',
  teal: '#00bcd4',
  orange: '#ff6d00',
  pink: '#e91e63',
  gray: '#607d8b',
  palette: [
    '#1a73e8', '#34a853', '#fbbc04', '#ea4335',
    '#9334e6', '#00bcd4', '#ff6d00', '#e91e63',
    '#607d8b', '#795548'
  ]
};

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function TooltipCard({ title, children, icon }: { title: string; children: React.ReactNode; icon: string }) {
  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #f8f9fa 0%, #e8f0fe 100%)', 
      borderRadius: '8px', 
      padding: '12px',
      border: '1px solid #dadce0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', color: '#1a73e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#5f6368', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function AnalyticsDashboard({ adminKey }: { adminKey: string }) {
  const [periodo, setPeriodo] = useState<string>('mes');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [productsData, setProductsData] = useState<any>(null);
  const [trendsData, setTrendsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const trendRef = useRef<any>(null);
  const peakRef = useRef<any>(null);
  const donutRef = useRef<any>(null);
  const paretoRef = useRef<any>(null);
  const paymentRef = useRef<any>(null);
  const weekdayRef = useRef<any>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-admin-key': adminKey };
      const params = `periodo=${periodo}`;

      const [dashRes, prodRes, trendRes] = await Promise.all([
        fetch(`/api/analytics/dashboard?${params}`, { headers }),
        fetch(`/api/analytics/products?${params}`, { headers }),
        fetch(`/api/analytics/trends?${params}&granularity=day`, { headers }),
      ]);

      if (!dashRes.ok || !prodRes.ok || !trendRes.ok) throw new Error('Error al cargar datos');

      const [dash, prod, trend] = await Promise.all([
        dashRes.json(), prodRes.json(), trendRes.json()
      ]);

      setDashboardData(dash);
      setProductsData(prod);
      setTrendsData(trend);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [periodo, adminKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleExportCSV = () => {
    if (!productsData?.productos) return;
    const BOM = '\uFEFF';
    let csv = BOM + 'Producto,Categoría,Unidades Vendidas,Ingresos,Rotación Diaria,% del Total\n';
    productsData.productos.forEach((p: any) => {
      csv += `"${p.producto}","${p.categoria}",${p.unidades_vendidas},${p.ingresos},${p.rotacion_diaria},${p.pct_individual}%\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hideaway_Reporte_${periodo}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const refs = {
      trend: trendRef.current?.toBase64Image(),
      peakHours: peakRef.current?.toBase64Image(),
      donut: donutRef.current?.toBase64Image(),
      pareto: paretoRef.current?.toBase64Image(),
    };
    await generateReportPDF(dashboardData, productsData, trendsData, refs);
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
    <div style={{ padding: '60px', textAlign: 'center' }}>
      <div style={{ width: '48px', height: '48px', border: '4px solid #e8f0fe', borderTopColor: '#1a73e8', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
      <p style={{ color: '#5f6368', fontSize: '1rem' }}>Cargando tus estadísticas...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  
  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#d93025', background: '#fce8e6', borderRadius: '12px', margin: '20px' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
      <div style={{ fontWeight: 600 }}>Error al cargar estadísticas</div>
      <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>{error}</div>
    </div>
  );
  
  if (!dashboardData || !trendsData) return null;

  const { kpis, comparativa } = dashboardData;
  const totalIngresos = productsData?.total_ingresos || 0;
  
  // Calcular métricas adicionales
  const peakHour = trendsData.goldenHours?.reduce((max: any, h: any) => h.ingresos > (max?.ingresos || 0) ? h : max, null);
  const bestDay = trendsData.weekdays?.reduce((max: any, d: any) => d.ingresos > (max?.ingresos || 0) ? d : max, null);
  const paymentTotals = trendsData.payments?.reduce((acc: number, p: any) => acc + p.ingresos, 0) || 1;

  // -- NEW: Inteligencia de Negocio & Variables --
  const validTurnovers = trendsData.tableTurnover?.filter((t: any) => t.mesa && t.mins_promedio > 0) || [];
  const turnoverPromedio = validTurnovers.length > 0 ? (validTurnovers.reduce((acc: number, t: any) => acc + t.mins_promedio, 0) / validTurnovers.length) : 0;
  const topCrossSell = trendsData.basket?.[0]; // {producto_a, producto_b, frecuencia}

  // ===================== GRÁFICOS =====================
  
  // Tendencia de Ingresos
  const trendData = {
    labels: trendsData.timeSeries?.map((t: any) => {
      const d = new Date(t.periodo);
      return d.toLocaleDateString('es-CR', { month: 'short', day: 'numeric' });
    }) || [],
    datasets: [{
      label: 'Ingresos Diarios',
      data: trendsData.timeSeries?.map((t: any) => t.ingresos) || [],
      borderColor: COLORS.primary,
      backgroundColor: 'rgba(26, 115, 232, 0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: COLORS.primary
    }]
  };

  // Horas Pico
  const peakHoursData = {
    labels: trendsData.goldenHours?.map((h: any) => `${h.hora}:00`) || [],
    datasets: [{
      label: 'Ingresos',
      data: trendsData.goldenHours?.map((h: any) => h.ingresos) || [],
      backgroundColor: trendsData.goldenHours?.map((h: any, i: number) => {
        if (i === 0) return COLORS.success;
        if (i === 1) return COLORS.warning;
        if (i === 2) return COLORS.orange;
        return COLORS.primary;
      }) || [],
      borderRadius: 6
    }]
  };

  // Categorías (Dona)
  const donutData = {
    labels: productsData.categorias?.map((c: any) => c.nombre) || [],
    datasets: [{
      data: productsData.categorias?.map((c: any) => c.ingresos) || [],
      backgroundColor: COLORS.palette,
      hoverOffset: 8,
      borderWidth: 2,
      borderColor: 'white'
    }]
  };

  // Métodos de Pago
  const paymentData = {
    labels: trendsData.payments?.map((p: any) => p.metodo === 'No registrado' ? 'Sin Registrar' : p.metodo) || [],
    datasets: [{
      data: trendsData.payments?.map((p: any) => p.ingresos) || [],
      backgroundColor: [COLORS.success, COLORS.primary, COLORS.warning, COLORS.gray],
      borderWidth: 0
    }]
  };

  // Días de la Semana
  const weekdayData = {
    labels: trendsData.weekdays?.map((d: any) => DAYS_ES[d.dia_num] || d.dia) || [],
    datasets: [{
      label: 'Ingresos',
      data: trendsData.weekdays?.map((d: any) => d.ingresos) || [],
      backgroundColor: trendsData.weekdays?.map((d: any, i: number) => {
        const max = Math.max(...(trendsData.weekdays?.map((x: any) => x.ingresos) || [0]));
        const intensity = max > 0 ? d.ingresos / max : 0;
        return intensity > 0.8 ? COLORS.success : intensity > 0.5 ? COLORS.teal : COLORS.primary;
      }) || [],
      borderRadius: 6
    }]
  };

  // Top 10 Productos
  const top10 = (productsData.productos || []).slice(0, 10);
  const topProductsData = {
    labels: top10.map((p: any) => p.producto.length > 22 ? p.producto.slice(0, 22) + '...' : p.producto),
    datasets: [{
      label: 'Ingresos',
      data: top10.map((p: any) => p.ingresos),
      backgroundColor: top10.map((p: any, i: number) => 
        p.es_vital ? COLORS.success : COLORS.primary
      ),
      borderRadius: 4
    }]
  };

  // Pareto
  const paretoData = {
    labels: top10.map((p: any) => p.producto.length > 12 ? p.producto.slice(0, 12) + '..' : p.producto),
    datasets: [
      {
        type: 'line' as const,
        label: '% Acumulado',
        data: top10.map((p: any) => p.pct_acumulado),
        borderColor: COLORS.danger,
        borderWidth: 3,
        yAxisID: 'y1',
        tension: 0.1,
        pointRadius: 3
      },
      {
        type: 'bar' as const,
        label: 'Ingresos',
        data: top10.map((p: any) => p.ingresos),
        backgroundColor: top10.map((p: any) => p.es_vital ? COLORS.success : '#cbd5e1'),
        yAxisID: 'y'
      }
    ]
  };

  // Render
  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', background: '#f8f9fa', minHeight: '100vh' }}>
      
      {/* ===================== HEADER ===================== */}
      <div style={{ 
        background: 'linear-gradient(135deg, #1a3d2a 0%, #2d5a3f 50%, #137333 100%)', 
        borderRadius: '16px', padding: '24px', marginBottom: '20px', color: 'white',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                  color: periodo === p ? '#137333' : 'white',
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

      {/* ===================== SMART INSIGHTS ===================== */}
      <div style={{ background: 'linear-gradient(135deg, #fef7e1 0%, #fffbf0 100%)', padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #fce8b2', boxShadow: '0 4px 12px rgba(251,188,4,0.15)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#e37400', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🧠</span> Inteligencia Analítica
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          
          <div style={{ background: 'white', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #34a853', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#34a853', textTransform: 'uppercase', marginBottom: '4px' }}>Rotación Operativa</div>
            <div style={{ fontSize: '0.95rem', color: '#202124' }}>
              {turnoverPromedio > 0 
                ? <>En promedio cada mesa tarda <strong>{Math.round(turnoverPromedio)} minutos</strong>. {turnoverPromedio > 90 ? ' Considera agilizar el servicio en turnos fuertes.' : ' ¡Excelente ritmo de atención!'}</>
                : 'Todavía no hay suficientes datos para medir la velocidad de las mesas.'}
            </div>
          </div>

          <div style={{ background: 'white', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #1a73e8', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1a73e8', textTransform: 'uppercase', marginBottom: '4px' }}>Mejores Oportunidades</div>
            <div style={{ fontSize: '0.95rem', color: '#202124' }}>
              Tu pico de ventas ocurre a las <strong>{peakHour ? peakHour.hora : '00'}:00</strong>. Asegúrate de tener al staff preparado a esa hora.
              {bestDay && <> Tu mejor día históricamente ha sido el <strong>{DAYS_ES[bestDay.dia_num] || bestDay.dia}</strong>.</>}
            </div>
          </div>

          {topCrossSell && (
            <div style={{ background: 'white', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #9334e6', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9334e6', textTransform: 'uppercase', marginBottom: '4px' }}>Potencial de Combo</div>
              <div style={{ fontSize: '0.95rem', color: '#202124' }}>El <strong>{topCrossSell.producto_a.substring(0,25)}</strong> se vende mucho junto con <strong>{topCrossSell.producto_b.substring(0,25)}</strong>. ¡Anima a los meseros a ofrecerlos juntos!</div>
            </div>
          )}
        </div>
      </div>

      {/* ===================== KPI CARDS ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Ventas Totales</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#137333', marginTop: '4px' }}>{formatColones(kpis.ingresos_totales)}</div>
            </div>
            <div style={{ 
              background: comparativa.pct_cambio_ingresos >= 0 ? '#e6f4ea' : '#fce8e6',
              color: comparativa.pct_cambio_ingresos >= 0 ? '#137333' : '#d93025',
              padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700
            }}>
              {comparativa.pct_cambio_ingresos >= 0 ? '↑' : '↓'} {Math.abs(comparativa.pct_cambio_ingresos)}%
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#80868b', marginTop: '8px' }}>vs. período anterior</div>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🧾 Total de Comandas</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1a73e8', marginTop: '4px' }}>{kpis.total_ordenes}</div>
            </div>
            <div style={{ 
              background: comparativa.pct_cambio_ordenes >= 0 ? '#e6f4ea' : '#fce8e6',
              color: comparativa.pct_cambio_ordenes >= 0 ? '#137333' : '#d93025',
              padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700
            }}>
              {comparativa.pct_cambio_ordenes >= 0 ? '↑' : '↓'} {Math.abs(comparativa.pct_cambio_ordenes)}%
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#80868b', marginTop: '8px' }}>clientes atendidos</div>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎯 Cuenta Promedio</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#9334e6', marginTop: '4px' }}>{formatColones(kpis.ticket_promedio)}</div>
            </div>
            <div style={{ 
              background: comparativa.pct_cambio_ticket >= 0 ? '#e6f4ea' : '#fce8e6',
              color: comparativa.pct_cambio_ticket >= 0 ? '#137333' : '#d93025',
              padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700
            }}>
              {comparativa.pct_cambio_ticket >= 0 ? '↑' : '↓'} {Math.abs(comparativa.pct_cambio_ticket)}%
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#80868b', marginTop: '8px' }}>por cliente</div>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚡ Velocidad</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#e37400', marginTop: '4px' }}>{kpis.ordenes_por_dia}</div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#80868b', marginTop: '8px' }}>
            comandas/día <span style={{ color: kpis.coef_variacion > 50 ? COLORS.danger : COLORS.success, fontWeight: 600 }}>
              (variación: {kpis.coef_variacion}%)
            </span>
          </div>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>⏱️ Tiempo en Mesa</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#00bcd4', marginTop: '4px' }}>{Math.round(turnoverPromedio)}<span style={{fontSize: '1rem'}}>'</span></div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#80868b', marginTop: '8px' }}>
            promedio general de min.
          </div>
        </div>
      </div>

      {/* ===================== SECCIÓN: TENDENCIA ===================== */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#202124', fontWeight: 700 }}>📈 Evolución de tus Ingresos</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#5f6368' }}>Muestra cómo han cambiado tus ventas día a día</p>
          </div>
        </div>
        <div style={{ height: '280px' }}>
          <Line ref={trendRef} data={trendData} options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: '#f1f3f4' } },
              x: { grid: { display: false } }
            },
            interaction: { intersect: false, mode: 'index' }
          }} />
        </div>
      </div>

      {/* ===================== GRID 2 COLUMNAS ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        
        {/* HORAS PICO */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#202124', fontWeight: 700 }}>⏰ Horas de Mayor Movimiento</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#5f6368' }}>Aprovechá estos horarios</p>
            </div>
            {peakHour && (
              <div style={{ background: '#fef3e2', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#e37400', fontWeight: 600, textTransform: 'uppercase' }}>Mejor hora</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e37400' }}>{peakHour.hora}:00</div>
              </div>
            )}
          </div>
          <div style={{ height: '220px' }}>
            <Bar ref={peakRef} data={peakHoursData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, grid: { color: '#f1f3f4' } }, x: { grid: { display: false } } }
            }} />
          </div>
          <TooltipCard icon="💡" title="Consejo">
            Reforzá tu equipo en las horas pico (las barras más altas) para dar mejor servicio.
          </TooltipCard>
        </div>

        {/* DÍAS DE LA SEMANA */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#202124', fontWeight: 700 }}>📅 Desempeño por Día</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#5f6368' }}>Qué días van mejor</p>
            </div>
            {bestDay && (
              <div style={{ background: '#e6f4ea', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#137333', fontWeight: 600, textTransform: 'uppercase' }}>Mejor día</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#137333' }}>{DAYS_ES[bestDay.dia_num] || bestDay.dia}</div>
              </div>
            )}
          </div>
          <div style={{ height: '220px' }}>
            <Bar ref={weekdayRef} data={weekdayData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, grid: { color: '#f1f3f4' } }, x: { grid: { display: false } } }
            }} />
          </div>
          <TooltipCard icon="💡" title="Consejo">
            Los días con más ventas (en verde) son ideales para promociones especiales.
          </TooltipCard>
        </div>

        {/* MÉTODOS DE PAGO */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#202124', fontWeight: 700, marginBottom: '4px' }}>💳 Cómo Pagan tus Clientes</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#5f6368' }}>Distribución de formas de pago</p>
          <div style={{ height: '200px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut ref={paymentRef} data={paymentData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { 
                legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } }
              },
              cutout: '60%'
            }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
            {trendsData.payments?.map((p: any, i: number) => (
              <div key={p.metodo} style={{ 
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#f8f9fa', padding: '6px 12px', borderRadius: '20px',
                fontSize: '0.75rem', fontWeight: 600
              }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: [COLORS.success, COLORS.primary, COLORS.warning, COLORS.gray][i] }}></div>
                {p.metodo === 'No registrado' ? 'Sin registrar' : p.metodo}: {Math.round(p.ingresos / paymentTotals * 100)}%
              </div>
            ))}
          </div>
        </div>

        {/* CATEGORÍAS */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#202124', fontWeight: 700, marginBottom: '4px' }}>🍽️ Qué se Vende Más</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#5f6368' }}>Por categoría de producto</p>
          <div style={{ height: '200px' }}>
            <Doughnut ref={donutRef} data={donutData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'right', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } } },
              cutout: '55%'
            }} />
          </div>
          <TooltipCard icon="🎯" title="Dato Clave">
            Tu categoría estrella genera el {productsData.categorias?.[0] ? Math.round(productsData.categorias[0].ingresos / totalIngresos * 100) : 0}% de las ventas.
          </TooltipCard>
        </div>
      </div>

      {/* ===================== TOP PRODUCTOS ===================== */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#202124', fontWeight: 700 }}>🏆 Tus Productos Estrella</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#5f6368' }}>Los 10 productos que más generan ingresos</p>
          </div>
          <div style={{ background: '#e6f4ea', padding: '8px 16px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#137333', fontWeight: 600 }}>10 productos = {Math.round(top10.reduce((s: number, p: any) => s + p.pct_individual, 0))}% de ventas</span>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          <div style={{ height: '320px' }}>
            <Bar data={topProductsData} options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { x: { beginAtZero: true, grid: { color: '#f1f3f4' } }, y: { grid: { display: false } } }
            }} />
          </div>
          
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f3f4' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: '#5f6368', fontWeight: 600 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: '#5f6368', fontWeight: 600 }}>Producto</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: '#5f6368', fontWeight: 600 }}>Vendidos</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: '#5f6368', fontWeight: 600 }}>Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((p: any, i: number) => (
                  <tr key={p.producto} style={{ borderBottom: '1px solid #f1f3f4' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 700, color: p.es_vital ? '#137333' : '#5f6368' }}>{i + 1}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ fontWeight: 600, color: '#202124' }}>{p.producto}</span>
                      {p.es_vital && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: '#e6f4ea', color: '#137333', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>VITAL</span>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#5f6368' }}>{p.unidades_vendidas}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#137333' }}>{formatColones(p.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===================== PARETO ===================== */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#202124', fontWeight: 700 }}>📊 Análisis 80/20 (Pareto)</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#5f6368' }}>
              ¿Cuántos productos generan la mayoría de tus ingresos?
            </p>
          </div>
          <TooltipCard icon="📚" title="Qué es esto?">
            La regla 80/20 dice que ~20% de tus productos generan ~80% de tus ventas. 
            Identificalos y asegurate de siempre tenerlos disponibles.
          </TooltipCard>
        </div>
        <div style={{ height: '300px' }}>
          <Chart ref={paretoRef} type="bar" data={paretoData as any} options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
              legend: { display: true, position: 'top' }
            },
            scales: {
              y: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: '#f1f3f4' } },
              y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, min: 0, max: 100 }
            }
          }} />
        </div>
      </div>

      {/* ===================== NEW SECTIONS: Market Basket & Table Turnover ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        
        {/* CROSS-SELLING (MARKET BASKET) */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#202124', fontWeight: 700 }}>🛒 Productos Comprados Juntos</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#5f6368' }}>Los "Combos Naturales" de tus clientes</p>
            </div>
            <TooltipCard icon="💡" title="Upselling">
              Entrena a tus meseros para ofrecer mágicamente el Segundo cuando el cliente pide el Primero.
            </TooltipCard>
          </div>
          {trendsData.basket?.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#80868b' }}>Aún no hay suficientes datos históricos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
              {trendsData.basket?.slice(0,8).map((b: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #f1f3f4' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: '#1a73e8', fontSize: '0.85rem' }}>{b.producto_a.length > 22 ? b.producto_a.substring(0,20)+'..' : b.producto_a}</div>
                    <div style={{ background: '#e8f0fe', padding: '4px', borderRadius: '50%', color: '#1a73e8', display: 'flex', flexShrink: 0 }}>
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, color: '#1a73e8', fontSize: '0.85rem' }}>{b.producto_b.length > 22 ? b.producto_b.substring(0,20)+'..' : b.producto_b}</div>
                  </div>
                  <div style={{ marginLeft: '16px', background: 'white', border: '1px solid #dadce0', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, color: '#5f6368', flexShrink: 0 }}>
                    {b.frecuencia} veces
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TIEMPOS DE MESA (TABLE TURNOVER) */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#202124', fontWeight: 700 }}>⏳ Rapidez por Mesa</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#5f6368' }}>Minutos desde la creación hasta el Check-out</p>
            </div>
          </div>
          {validTurnovers.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#80868b' }}>No hay registros de tiempo en mesa.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {validTurnovers.map((t: any, i: number) => {
                const maxMins = Math.max(...validTurnovers.map((x: any) => x.mins_promedio));
                const pct = Math.max(8, Math.round((t.mins_promedio / (maxMins || 1)) * 100));
                const isSlow = t.mins_promedio > turnoverPromedio * 1.35;
                const isFast = t.mins_promedio < turnoverPromedio * 0.65;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '70px', fontSize: '0.85rem', fontWeight: 700, color: '#5f6368' }}>Mesa {t.mesa}</div>
                    <div style={{ flex: 1, background: '#f1f3f4', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', width: `${pct}%`, 
                        background: isSlow ? COLORS.danger : (isFast ? COLORS.success : COLORS.primary),
                        borderRadius: '4px'
                      }}></div>
                    </div>
                    <div style={{ width: '60px', textAlign: 'right', fontSize: '0.9rem', fontWeight: 800, color: isSlow ? COLORS.danger : '#202124' }}>
                      {t.mins_promedio}m
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ===================== BOTONES EXPORT ===================== */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px', paddingBottom: '40px' }}>
        <button onClick={handleExportCSV} style={{ 
          padding: '14px 28px', borderRadius: '12px', border: '2px solid #1a73e8', 
          background: 'white', cursor: 'pointer', fontWeight: 700, color: '#1a73e8',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem'
        }}>
          📥 Exportar Excel
        </button>
        <button onClick={handleExportPDF} style={{ 
          padding: '14px 28px', borderRadius: '12px', border: 'none', 
          background: 'linear-gradient(135deg, #1a73e8, #1557b0)', cursor: 'pointer', fontWeight: 700, color: 'white',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem',
          boxShadow: '0 4px 12px rgba(26,115,232,0.3)'
        }}>
          📄 Generar Reporte PDF
        </button>
      </div>

    </div>
  );
}
