'use client';
// ══════════════════════════════════════════════════════════════════════════
// PanelBalance.tsx — Sub-pestaña "Balance".
//
// Punto 7 de docs/Delissia/PeticionCliente.txt: balance real del negocio,
// consultable de forma diaria, semanal y mensual, considerando las ventas y
// los gastos registrados.
// ══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import { formatColones } from '@/lib/format';
import {
  getDataset, porPeriodo, bucketsBalance, ultimos, resumenVentas,
  type Periodo, type Granularidad,
} from '@/lib/demoStats';
import { KpiCard, PanelCard, TooltipCard, BadgeDemo, Segmentado, Vacio, cssVar } from './panelUI';

const VERDE = '#10b981';
const NARANJA = '#f59e0b';
const AZUL = '#38bdf8';

export default function PanelBalance({ periodo }: { periodo: Periodo }) {
  const [granularidad, setGranularidad] = useState<Granularidad>('dia');
  const ds = useMemo(() => getDataset(), []);
  const ventas = useMemo(() => ds.ventas.filter(porPeriodo(periodo)), [ds, periodo]);
  const gastos = useMemo(() => ds.gastos.filter(porPeriodo(periodo)), [ds, periodo]);

  const buckets = useMemo(
    () => bucketsBalance(ventas, gastos, periodo, granularidad),
    [ventas, gastos, periodo, granularidad],
  );
  const mostrados = useMemo(() => ultimos(buckets, 16), [buckets]);
  const rv = useMemo(() => resumenVentas(ventas), [ventas]);

  const totalVentas = rv.total;
  const totalCobrado = rv.cobrado;
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const balance = totalCobrado - totalGastos;
  const margen = totalCobrado > 0 ? (balance / totalCobrado) * 100 : 0;

  const grid = cssVar('--surface-border', '#1f2a26');

  const data = {
    labels: mostrados.map((b) => b.label),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Cobrado',
        data: mostrados.map((b) => b.cobrado),
        backgroundColor: VERDE,
        borderRadius: 5,
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'Gastos',
        data: mostrados.map((b) => b.gastos),
        backgroundColor: NARANJA,
        borderRadius: 5,
        order: 3,
      },
      {
        type: 'line' as const,
        label: 'Balance',
        data: mostrados.map((b) => b.balance),
        borderColor: AZUL,
        backgroundColor: AZUL,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: mostrados.length > 12 ? 0 : 4,
        pointHoverRadius: 6,
        order: 1,
        yAxisID: 'y',
      },
    ],
  };

  const etiquetaGranularidad = granularidad === 'dia' ? 'de cada día' : granularidad === 'semana' ? 'de cada semana' : 'de cada mes';

  if (buckets.length === 0) {
    return (
      <PanelCard icono="⚖️" titulo="Balance del negocio" subtitulo="Sin movimientos en el período seleccionado.">
        <Vacio texto="Cambiá el filtro de arriba para ver el balance de otro período." />
      </PanelCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
          ⚖️ Balance del negocio
        </h3>
        <BadgeDemo />
      </div>

      {/* ── Selector de granularidad (diario / semanal / mensual) ────── */}
      <PanelCard
        icono="🗓️"
        titulo="¿Cada cuánto querés ver el balance?"
        subtitulo="Elegí si lo querés día a día, por semana o por mes"
        pie={
          <TooltipCard icon="📚" title="Cómo se calcula el balance">
            <strong>Balance = cobrado − gastos.</strong> El &quot;cobrado&quot; es el dinero que realmente entró
            (pedidos pagados + abonos recibidos); lo que está a crédito todavía no cuenta porque aún no está en
            la caja. Los precios del menú <strong>ya incluyen IVA</strong> y no se cobra servicio del 10%,
            así que no hay impuestos que sumar ni restar acá.
          </TooltipCard>
        }
      >
        <Segmentado
          valor={granularidad}
          onChange={setGranularidad}
          opciones={[
            { valor: 'dia', label: '📅 Diario' },
            { valor: 'semana', label: '📆 Semanal' },
            { valor: 'mes', label: '🗓️ Mensual' },
          ]}
        />
        <div style={{
          marginTop: '14px', padding: '14px', borderRadius: '12px',
          background: 'var(--primary-surface)', border: '1px solid var(--surface-border)',
          fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          Balance {etiquetaGranularidad} en este filtro:{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{formatColones(totalVentas)}</strong> vendidos,{' '}
          <strong style={{ color: 'var(--primary)' }}>{formatColones(totalCobrado)}</strong> cobrados,{' '}
          <strong style={{ color: 'var(--accent)' }}>{formatColones(totalGastos)}</strong> de gastos y un resultado de{' '}
          <strong style={{ color: balance >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{formatColones(balance)}</strong>.
        </div>
      </PanelCard>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '14px' }}>
        <KpiCard icono="📥" etiqueta="Ventas del período" valor={formatColones(totalVentas)}
          sub={`De eso ya entró ${formatColones(totalCobrado)} y falta ${formatColones(totalVentas - totalCobrado)}`} />
        <KpiCard icono="📤" etiqueta="Gastos del negocio" valor={formatColones(totalGastos)} tono="accent"
          sub={`${gastos.length} movimientos registrados en el período`} />
        <KpiCard
          icono="⚖️"
          etiqueta="Balance real"
          valor={formatColones(balance)}
          tono={balance >= 0 ? 'primary' : 'danger'}
          sub={balance >= 0 ? 'El negocio dejó plata después de pagar gastos' : 'Los gastos superaron lo cobrado'}
        />
        <KpiCard
          icono="📊"
          etiqueta="Margen"
          valor={`${margen.toFixed(1)}%`}
          tono={margen >= 0 ? 'primary' : 'danger'}
          sub="Qué porcentaje de lo cobrado se queda como utilidad"
        />
      </div>

      {/* ── Gráfica ──────────────────────────────────────────────────── */}
      <PanelCard
        icono="📉"
        titulo={`Ingresos vs. gastos ${etiquetaGranularidad}`}
        subtitulo="Verde: lo que entró · Naranja: lo que salió · Línea azul: lo que quedó"
        pie={
          <TooltipCard icon="💡" title="Cómo leerla">
            Cuando la línea azul (balance) está por encima de 0, ese período dejó utilidad. Si se pone
            negativa, ese período se gastó más de lo que entró: es señal de revisar los gastos o de cobrar
            los pedidos que están a crédito.
          </TooltipCard>
        }
      >
        <div style={{ height: 'clamp(230px, 50vw, 320px)' }}>
          <Chart
            type="bar"
            data={data as unknown as ChartData<'bar'>}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { size: 11 } } } },
              scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                y: {
                  beginAtZero: true,
                  grid: { color: grid },
                  ticks: { callback: (v) => formatColones(Number(v)), maxTicksLimit: 6 },
                },
              },
            }}
          />
        </div>
        {buckets.length > mostrados.length && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
            Mostrando los últimos {mostrados.length} de {buckets.length} períodos.
          </div>
        )}
      </PanelCard>

      {/* ── Tabla detalle ────────────────────────────────────────────── */}
      <PanelCard
        icono="🧾"
        titulo="Detalle del balance"
        subtitulo="Cada fila es un período: ventas, lo cobrado, los gastos y lo que quedó"
        pie={
          <TooltipCard icon="🎯" title="Para qué la usás">
            Es la tabla que la cliente anota a mano hoy. Servicio para el cierre de caja del día y para
            comparar semanas o meses entre sí sin hacer cuentas.
          </TooltipCard>
        }
      >
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--surface)' }}>
                <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Período</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Ventas</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Cobrado</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Gastos</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.clave} style={{ borderBottom: '1px solid var(--surface)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{b.label}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatColones(b.ventas)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>{formatColones(b.cobrado)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{formatColones(b.gastos)}</td>
                  <td style={{
                    padding: '10px 8px', textAlign: 'right', fontWeight: 800,
                    color: b.balance >= 0 ? 'var(--primary)' : 'var(--danger)',
                  }}>
                    {formatColones(b.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </div>
  );
}
