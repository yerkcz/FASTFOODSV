'use client';
// ══════════════════════════════════════════════════════════════════════════
// PanelVentasPedidos.tsx — Sub-pestaña "Ventas y Pedidos".
//
// Cubre los puntos 1 (registro de ventas: cliente, producto, precio y estado
// del pago), 2 (clientes) y 4 (pedidos con abono del 50% y saldo pendiente)
// de docs/Delissia/PeticionCliente.txt.
// ══════════════════════════════════════════════════════════════════════════
import React, { useMemo } from 'react';
import { Line, Doughnut } from 'react-chartjs-2';
import { formatColones } from '@/lib/format';
import {
  getDataset, porPeriodo, resumenVentas, topClientes, topProductos, serieVentas,
  type Periodo,
} from '@/lib/demoStats';
import { KpiCard, PanelCard, TooltipCard, BadgeDemo, BarraProgreso, Vacio, PALETA, cssVar } from './panelUI';

const VERDE = '#10b981';
const NARANJA = '#f59e0b';
const ROJO = '#e11d48';

const ESTADOS: { key: 'pagado' | 'parcial' | 'pendiente'; label: string; color: string; ayuda: string }[] = [
  { key: 'pagado', label: 'Pagado', color: VERDE, ayuda: 'El cliente cubrió el total del pedido.' },
  { key: 'parcial', label: 'Abonado (50%)', color: NARANJA, ayuda: 'Dejó el abono inicial y debe el resto.' },
  { key: 'pendiente', label: 'Pendiente', color: ROJO, ayuda: 'Todavía no ha pagado nada.' },
];

export default function PanelVentasPedidos({ periodo }: { periodo: Periodo }) {
  const ds = useMemo(() => getDataset(), []);
  const ventas = useMemo(() => ds.ventas.filter(porPeriodo(periodo)), [ds, periodo]);
  const r = useMemo(() => resumenVentas(ventas), [ventas]);
  const serie = useMemo(() => serieVentas(ventas, periodo), [ventas, periodo]);
  const clientes = useMemo(() => topClientes(ventas, 8), [ventas]);
  const productos = useMemo(() => topProductos(ventas, 8), [ventas]);
  const aCredito = useMemo(
    () => ventas.filter((v) => v.saldo > 0).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 8),
    [ventas],
  );

  const grid = cssVar('--surface-border', '#1f2a26');
  const anillo = cssVar('--card-bg', '#11191f');
  const maxProducto = productos[0]?.ingresos || 1;

  if (ventas.length === 0) {
    return (
      <PanelCard icono="🛒" titulo="Ventas y Pedidos" subtitulo="No hay ventas registradas en el período seleccionado.">
        <Vacio texto="Probá con otro filtro de arriba (Hoy, Semana, Mes, Año o Todo)." />
      </PanelCard>
    );
  }

  const lineData = {
    labels: serie.map((p) => p.label),
    datasets: [{
      label: 'Ventas',
      data: serie.map((p) => p.total),
      borderColor: VERDE,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      fill: true,
      tension: 0.35,
      pointRadius: serie.length > 40 ? 0 : 3,
      pointHoverRadius: 5,
      pointBackgroundColor: VERDE,
    }],
  };

  const estadoData = {
    labels: ESTADOS.map((e) => e.label),
    datasets: [{
      data: ESTADOS.map((e) => r.montoEstado[e.key]),
      backgroundColor: ESTADOS.map((e) => e.color),
      borderColor: anillo,
      borderWidth: 2,
      hoverOffset: 8,
    }],
  };

  const pctCobrado = r.total > 0 ? (r.cobrado / r.total) * 100 : 0;
  const totalMetodo = r.metodos.reduce((s, m) => s + m.monto, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
          🛒 Ventas y Pedidos
        </h3>
        <BadgeDemo />
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '14px' }}>
        <KpiCard icono="💰" etiqueta="Ventas del período" valor={formatColones(r.total)}
          sub={`${r.pedidos} pedidos registrados · precios con IVA incluido`} />
        <KpiCard icono="✅" etiqueta="Ya cobrado" valor={formatColones(r.cobrado)}
          tono="primary"
          sub={`${pctCobrado.toFixed(0)}% del total del período ya está en la caja`} />
        <KpiCard icono="⏳" etiqueta="Por cobrar (a crédito)" valor={formatColones(r.porCobrar)}
          tono={r.porCobrar > 0 ? 'accent' : 'primary'}
          sub="Saldo de los pedidos abonados o pendientes de pago" />
        <KpiCard icono="🎯" etiqueta="Ticket promedio" valor={formatColones(r.ticket)}
          sub="Lo que gasta en promedio cada cliente por pedido" />
      </div>

      {/* ── Gráficas ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))', gap: '20px' }}>
        <PanelCard
          icono="📈"
          titulo="Evolución de las ventas"
          subtitulo="Cuánto vendiste en cada día, semana o mes del período"
          pie={
            <TooltipCard icon="💡" title="Cómo leer esta gráfica">
              Cada punto es un día, una semana o un mes (el sistema agrupa solo cuando el filtro es largo,
              para que la línea no se sature). La zona verde sombreada es el total vendido en ese período.
            </TooltipCard>
          }
        >
          <div style={{ height: 'clamp(210px, 45vw, 280px)' }}>
            <Line data={lineData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: grid }, ticks: { callback: (v) => formatColones(Number(v)) } },
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
              },
              interaction: { intersect: false, mode: 'index' },
            }} />
          </div>
        </PanelCard>

        <PanelCard
          icono="💳"
          titulo="Estado del cobro"
          subtitulo="Cuánto dinero hay pagado, abonado y pendiente"
          pie={
            <TooltipCard icon="📚" title="Qué significa cada estado">
              <strong>Pagado:</strong> {ESTADOS[0].ayuda} <strong>Abonado:</strong> {ESTADOS[1].ayuda}{' '}
              <strong>Pendiente:</strong> {ESTADOS[2].ayuda}
            </TooltipCard>
          }
        >
          <div style={{ height: 'clamp(190px, 40vw, 240px)' }}>
            <Doughnut data={estadoData} options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '58%',
              plugins: { legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { size: 11 } } } },
            }} />
          </div>
          <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
            {ESTADOS.map((e) => (
              <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--text-sm)' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>{e.label}</span>
                <strong style={{ color: 'var(--text-primary)' }}>{r.porEstado[e.key]}</strong>
                <span style={{ color: 'var(--text-muted)', minWidth: '82px', textAlign: 'right' }}>
                  {formatColones(r.montoEstado[e.key])}
                </span>
              </div>
            ))}
          </div>
        </PanelCard>

        <PanelCard
          icono="🧾"
          titulo="Formas de pago"
          subtitulo="Cómo prefieren pagar tus clientes"
          pie={
            <TooltipCard icon="💡" title="Para qué sirve">
              Si la mayoría paga en efectivo, necesitás más cambio en la caja; si crece el SINPE, conviene
              tener a mano el número de la cuenta.
            </TooltipCard>
          }
        >
          <div style={{ display: 'grid', gap: '12px' }}>
            {r.metodos.map((m, i) => (
              <div key={m.metodo}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--text-sm)', marginBottom: '5px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{m.metodo}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {Math.round((m.monto / totalMetodo) * 100)}% · {formatColones(m.monto)}
                  </span>
                </div>
                <BarraProgreso pct={(m.monto / totalMetodo) * 100} color={PALETA[i % PALETA.length]} />
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      {/* ── Clientes y productos ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))', gap: '20px' }}>
        <PanelCard
          icono="👥"
          titulo="Tus clientes frecuentes"
          subtitulo="Quién te compra más y cuánto ha dejado"
          pie={
            <TooltipCard icon="📚" title="Qué es esto">
              Los clientes con más pedidos son los que conviene cuidar: un pedido extra de ellos vale más que
              conseguir uno nuevo. &quot;Por cobrar&quot; es lo que aún te deben.
            </TooltipCard>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {clientes.map((c, i) => (
              <div key={c.cliente} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px', background: 'var(--surface)', borderRadius: '10px',
                border: '1px solid var(--surface-border)', flexWrap: 'wrap',
              }}>
                <span style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                  background: i === 0 ? 'var(--accent-soft)' : 'var(--primary-surface)',
                  color: i === 0 ? 'var(--accent)' : 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 800,
                }}>{i + 1}</span>
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.cliente}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {c.pedidos} pedido{c.pedidos !== 1 ? 's' : ''}
                    {c.porCobrar > 0 && <span style={{ color: 'var(--accent)' }}> · debe {formatColones(c.porCobrar)}</span>}
                  </div>
                </div>
                <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--primary)' }}>{formatColones(c.total)}</strong>
              </div>
            ))}
          </div>
        </PanelCard>

        <PanelCard
          icono="🏆"
          titulo="Lo que más se vende"
          subtitulo="Productos por ingresos generados"
          pie={
            <TooltipCard icon="🎯" title="Dato clave">
              Estos son los productos que sostienen el negocio. Si alguno se agota o baja de precio, las
              ventas sienten el golpe primero.
            </TooltipCard>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {productos.map((p, i) => (
              <div key={p.producto}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--text-sm)', marginBottom: '5px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.producto}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {p.unidades} u. · {formatColones(p.ingresos)}
                  </span>
                </div>
                <BarraProgreso pct={(p.ingresos / maxProducto) * 100} color={PALETA[i % PALETA.length]} />
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      {/* ── Pedidos a crédito ────────────────────────────────────────── */}
      <PanelCard
        icono="⏳"
        titulo="Pedidos con saldo pendiente"
        subtitulo="Abonos del 50% y pedidos sin pagar — punto 4 de tu petición"
        pie={
          <TooltipCard icon="📚" title="Cómo funciona el abono">
            Cuando confirmás un pedido grande se registra un <strong>abono inicial del 50%</strong> y el resto
            queda como <strong>saldo pendiente</strong>. Cuando el cliente paga todo, el pedido pasa a
            &quot;Pagado&quot; y desaparece de esta lista.
          </TooltipCard>
        }
      >
        {aCredito.length === 0 ? (
          <Vacio texto="¡Todo cobrado! No hay pedidos con saldo pendiente en este período." />
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {aCredito.map((v) => (
              <div key={v.id} style={{
                display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
                padding: '12px', background: 'var(--surface)', borderRadius: '10px',
                border: '1px solid var(--surface-border)',
              }}>
                <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{v.cliente}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    #{v.id} · {v.fecha} · {v.canal} · {v.metodo}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {v.items.map((it) => `${it.cantidad}× ${it.producto}`).join(', ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 700 }}>
                    Total {formatColones(v.total)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: v.abono > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                    Abono {formatColones(v.abono)}
                  </div>
                  <div style={{
                    fontSize: 'var(--text-sm)', fontWeight: 800,
                    color: v.estado === 'pendiente' ? 'var(--danger)' : 'var(--accent)',
                  }}>
                    Saldo {formatColones(v.saldo)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
