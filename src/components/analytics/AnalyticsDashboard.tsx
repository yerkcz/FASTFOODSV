'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler, LineController, BarController
} from 'chart.js';
import { Line, Bar, Doughnut, Chart } from 'react-chartjs-2';
import { generateReportPDF } from '@/lib/generateReport';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler, LineController, BarController
);

function formatColones(amount: number): string {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

const CHART_COLORS = {
  primary: '#1a73e8',
  success: '#34a853',
  warning: '#fbbc04',
  danger: '#ea4335',
  categoryPalette: [
    '#1a73e8', '#34a853', '#fbbc04', '#ea4335',
    '#9334e6', '#00bcd4', '#ff6d00', '#e91e63',
    '#607d8b', '#795548'
  ],
  barGradient: (ctx: CanvasRenderingContext2D) => {
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, 'rgba(26, 115, 232, 0.8)');
    g.addColorStop(1, 'rgba(26, 115, 232, 0.2)');
    return g;
  }
};

export default function AnalyticsDashboard({ adminKey }: { adminKey: string }) {
  const [periodo, setPeriodo] = useState<string>('mes');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [productsData, setProductsData] = useState<any>(null);
  const [trendsData, setTrendsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trendRef = useRef<any>(null);
  const peakRef = useRef<any>(null);
  const donutRef = useRef<any>(null);
  const paretoRef = useRef<any>(null);

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

      if (!dashRes.ok || !prodRes.ok || !trendRes.ok) throw new Error('Error al cargar datos analíticos');

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

  // Export CSV Action
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
    link.download = `Estadisticas_${periodo}_${new Date().toISOString().slice(0, 10)}.csv`;
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

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#5f6368' }}>Cargando inteligencia de negocios...</div>;
  if (error) return <div style={{ padding: '40px', color: 'red' }}>Error: {error}</div>;
  if (!dashboardData || !trendsData) return null;

  const { kpis, comparativa } = dashboardData;
  
  // -- Gráfico Tendencias
  const trendData = {
    labels: trendsData.timeSeries.map((t: any) => new Date(t.periodo).toLocaleDateString('es-CR', { month: 'short', day: 'numeric'})),
    datasets: [{
      label: 'Ingresos ₡',
      data: trendsData.timeSeries.map((t: any) => t.ingresos),
      borderColor: CHART_COLORS.primary,
      backgroundColor: 'rgba(26, 115, 232, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3
    }]
  };

  // -- Gráfico Categorías (Dona)
  const donutData = {
    labels: productsData.categorias.map((c: any) => c.nombre),
    datasets: [{
      data: productsData.categorias.map((c: any) => c.ingresos),
      backgroundColor: CHART_COLORS.categoryPalette,
      hoverOffset: 4
    }]
  };

  // -- Horas Pico (Barras)
  const peakHoursData = {
    labels: trendsData.goldenHours.map((h: any) => `${h.hora}:00`),
    datasets: [{
      label: 'Ingresos por Hora',
      data: trendsData.goldenHours.map((h: any) => h.ingresos),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 4
    }]
  };

  // -- Top Productos (Bar Horizontal)
  const top10 = productsData.productos.slice(0, 10);
  const topProductsData = {
    labels: top10.map((p: any) => p.producto.length > 25 ? p.producto.slice(0, 25) + '...' : p.producto),
    datasets: [{
      label: 'Ingresos',
      data: top10.map((p: any) => p.ingresos),
      backgroundColor: CHART_COLORS.success,
      borderRadius: 4
    }]
  };

  // -- Pareto (Combo)
  const paretoData = {
    labels: top10.map((p: any) => p.producto.length > 15 ? p.producto.slice(0, 15) + '...' : p.producto),
    datasets: [
      {
        type: 'line' as const,
        label: '% Acumulado',
        data: top10.map((p: any) => p.pct_acumulado),
        borderColor: CHART_COLORS.danger,
        borderWidth: 2,
        yAxisID: 'y1',
        tension: 0.1
      },
      {
        type: 'bar' as const,
        label: 'Ingresos',
        data: top10.map((p: any) => p.ingresos),
        backgroundColor: '#cbd5e1',
        yAxisID: 'y'
      }
    ]
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* HEADER & SELECTOR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, color: '#202124', fontSize: '1.5rem', fontWeight: 600 }}>📊 Inteligencia de Negocios</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['hoy', 'semana', 'mes', 'año', 'todo'].map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              style={{
                padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize',
                background: periodo === p ? CHART_COLORS.primary : '#f1f3f4',
                color: periodo === p ? 'white' : '#5f6368',
                transition: 'all 0.2s'
              }}
            >
              {p}
            </button>
          ))}
          <button onClick={handleExportCSV} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #dadce0', background: 'white', cursor: 'pointer', fontWeight: 600, color: '#1a73e8' }}>
            Descargar CSV
          </button>
          <button onClick={handleExportPDF} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', background: '#e9eef6', cursor: 'pointer', fontWeight: 600, color: '#1a73e8' }}>
            Descargar PDF
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* Card 1: Ingresos */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#5f6368', fontWeight: 600, marginBottom: '8px' }}>INGRESOS TOTALES</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#202124' }}>{formatColones(kpis.ingresos_totales)}</div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px', color: comparativa.pct_cambio_ingresos >= 0 ? CHART_COLORS.success : CHART_COLORS.danger, fontWeight: 600 }}>
            {comparativa.pct_cambio_ingresos >= 0 ? '↑' : '↓'} {Math.abs(comparativa.pct_cambio_ingresos)}% vs anterior
          </div>
        </div>

        {/* Card 2: Órdenes */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#5f6368', fontWeight: 600, marginBottom: '8px' }}>TOTAL ÓRDENES</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#202124' }}>{kpis.total_ordenes}</div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px', color: comparativa.pct_cambio_ordenes >= 0 ? CHART_COLORS.success : CHART_COLORS.danger, fontWeight: 600 }}>
            {comparativa.pct_cambio_ordenes >= 0 ? '↑' : '↓'} {Math.abs(comparativa.pct_cambio_ordenes)}% vs anterior
          </div>
        </div>

        {/* Card 3: Ticket Promedio */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#5f6368', fontWeight: 600, marginBottom: '8px' }}>TICKET PROMEDIO</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#202124' }}>{formatColones(kpis.ticket_promedio)}</div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px', color: comparativa.pct_cambio_ticket >= 0 ? CHART_COLORS.success : CHART_COLORS.danger, fontWeight: 600 }}>
            {comparativa.pct_cambio_ticket >= 0 ? '↑' : '↓'} {Math.abs(comparativa.pct_cambio_ticket)}% vs anterior
          </div>
        </div>

        {/* Card 4: Rotación Diaria */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: '#5f6368', fontWeight: 600, marginBottom: '8px' }}>ÓRDENES / DÍA</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#202124' }}>{kpis.ordenes_por_dia}</div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px', color: '#5f6368' }}>Var. CV: {kpis.coef_variacion}%</div>
        </div>
      </div>

      {/* CHARTS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        
        {/* Tendencia */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed', gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#3c4043' }}>📈 Tendencia de Ingresos</h3>
          <div style={{ height: '300px' }}>
            <Line ref={trendRef} data={trendData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        </div>

        {/* Horas Pico */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#3c4043' }}>⏰ Horas Pico (Gold Hours)</h3>
          <div style={{ height: '250px' }}>
            <Bar ref={peakRef} data={peakHoursData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        </div>

        {/* Categorías */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#3c4043' }}>🍩 Distribución por Categoría</h3>
          <div style={{ height: '250px' }}>
            <Doughnut ref={donutRef} data={donutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }} />
          </div>
        </div>

        {/* Top Productos */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#3c4043' }}>🏆 Top 10 Productos Vitales</h3>
          <div style={{ height: '300px' }}>
            <Bar data={topProductsData} options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false }} />
          </div>
        </div>

        {/* Pareto */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e8eaed' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#3c4043' }}>📊 Curva de Pareto (80/20)</h3>
          <div style={{ height: '300px' }}>
            <Chart ref={paretoRef} type="bar" data={paretoData as any} options={{
              responsive: true, maintainAspectRatio: false,
              scales: {
                y: { type: 'linear', position: 'left' },
                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, max: 100 }
              }
            }} />
          </div>
        </div>

      </div>

    </div>
  );
}
