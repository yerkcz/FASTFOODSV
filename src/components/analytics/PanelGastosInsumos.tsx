'use client';
// ══════════════════════════════════════════════════════════════════════════
// PanelGastosInsumos.tsx — Sub-pestaña "Gastos e Insumos".
//
// Puntos 5 y 6 de docs/Delissia/PeticionCliente.txt: registrar los gastos
// diarios del negocio y los insumos utilizados/comprados, con la visión de
// cuánto se consume de cada uno.
// ══════════════════════════════════════════════════════════════════════════
import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { formatColones } from '@/lib/format';
import {
  getDataset, porPeriodo, resumenGastos, resumenInsumos, stockInsumos, diasDelPeriodo,
  type Periodo,
} from '@/lib/demoStats';
import { KpiCard, PanelCard, TooltipCard, BadgeDemo, BarraProgreso, Vacio, PALETA, cssVar } from './panelUI';

export default function PanelGastosInsumos({ periodo }: { periodo: Periodo }) {
  const ds = useMemo(() => getDataset(), []);
  const gastos = useMemo(() => ds.gastos.filter(porPeriodo(periodo)), [ds, periodo]);
  const movs = useMemo(() => ds.insumos.filter(porPeriodo(periodo)), [ds, periodo]);
  const r = useMemo(() => resumenGastos(gastos), [gastos]);
  const insumos = useMemo(() => resumenInsumos(movs), [movs]);
  const stock = useMemo(() => stockInsumos(ds.insumos), [ds]);

  const anillo = cssVar('--card-bg', '#11191f');
  const dias = diasDelPeriodo(periodo).length || 1;
  const gastoDiario = r.total / dias;
  const topCategoria = r.categorias[0];
  const valorConsumido = movs.filter((m) => m.tipo === 'uso').reduce((s, m) => s + m.costo, 0);

  const donutData = {
    labels: r.categorias.map((c) => c.categoria),
    datasets: [{
      data: r.categorias.map((c) => c.monto),
      backgroundColor: PALETA,
      borderColor: anillo,
      borderWidth: 2,
      hoverOffset: 8,
    }],
  };

  if (gastos.length === 0 && movs.length === 0) {
    return (
      <PanelCard icono="🧾" titulo="Gastos e Insumos" subtitulo="Sin gastos registrados en el período seleccionado.">
        <Vacio texto="Probá con otro filtro de arriba (Hoy, Semana, Mes, Año o Todo)." />
      </PanelCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
          🧾 Gastos e Insumos
        </h3>
        <BadgeDemo />
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '14px' }}>
        <KpiCard icono="📤" etiqueta="Gastos del negocio" valor={formatColones(r.total)} tono="accent"
          sub={`${gastos.length} gastos registrados en el período`} />
        <KpiCard icono="📅" etiqueta="Gasto diario promedio" valor={formatColones(gastoDiario)}
          sub={`Promedio de ${dias} día${dias !== 1 ? 's' : ''} con el filtro seleccionado`} />
        <KpiCard
          icono="🔴"
          etiqueta="Categoría más pesada"
          valor={topCategoria ? formatColones(topCategoria.monto) : formatColones(0)}
          sub={topCategoria ? `${topCategoria.categoria} · ${topCategoria.pct.toFixed(0)}% de todos los gastos` : 'Sin gastos'}
        />
        <KpiCard icono="📦" etiqueta="Insumos consumidos" valor={formatColones(valorConsumido)}
          sub={`${insumos.length} insumos distintos tocaron las ventas de este período`} />
      </div>

      {/* ── Gastos por categoría ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))', gap: '20px' }}>
        <PanelCard
          icono="🍩"
          titulo="¿En qué se va la plata?"
          subtitulo="Distribución de los gastos por categoría"
          pie={
            <TooltipCard icon="📚" title="Qué es una categoría">
              Cada porción es un tipo de gasto fijo o variable: alquiler, luz y agua, salarios, insumos,
              transporte, mantenimiento y otros. Es el primer lugar donde buscar ahorros cuando el balance
              baja.
            </TooltipCard>
          }
        >
          <div style={{ height: 'clamp(200px, 42vw, 250px)' }}>
            <Doughnut data={donutData} options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '55%',
              plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } } },
            }} />
          </div>
        </PanelCard>

        <PanelCard
          icono="📋"
          titulo="Detalle por categoría"
          subtitulo="Monto y porcentaje de cada tipo de gasto"
          pie={
            <TooltipCard icon="💡" title="Cómo usarlo">
              El color de la barra compara los montos entre sí. Las categorías que casi no se ven (mantenimiento,
              otros) son las variables; alquiler y salarios son fijas y se repiten todos los meses.
            </TooltipCard>
          }
        >
          <div style={{ display: 'grid', gap: '14px' }}>
            {r.categorias.map((c, i) => (
              <div key={c.categoria}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--text-sm)', marginBottom: '5px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{c.categoria}</span>
                  <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {c.pct.toFixed(1)}% · {formatColones(c.monto)}
                  </span>
                </div>
                <BarraProgreso pct={c.pct} color={PALETA[i % PALETA.length]} />
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      {/* ── Insumos ──────────────────────────────────────────────────── */}
      <PanelCard
        icono="📦"
        titulo="Insumos comprados y utilizados"
        subtitulo="Materia prima que entró y que se fue usando en las ventas"
        pie={
          <TooltipCard icon="📚" title="Cómo se lee esta tabla">
            <strong>Comprado</strong> es lo que entró al almacén en el período, <strong>Usado</strong> es lo que
            se consumió preparando pedidos y <strong>Costo</strong> lo que costó esa compra.{' '}
            <strong>Stock</strong> es la diferencia sobre todo el histórico: si queda en rojo, ese insumo se está
            acabando. (El inventario con descuento automático por venta —punto 6 de tu petición— queda previsto
            para una siguiente etapa.)
          </TooltipCard>
        }
      >
        {insumos.length === 0 ? (
          <Vacio texto="No hay movimientos de insumos en este período." />
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--surface)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Insumo</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Comprado</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Usado</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Costo</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 700 }}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((ins) => {
                  const s = stock[ins.nombre] ?? 0;
                  const bajo = s <= 12;
                  return (
                    <tr key={ins.nombre} style={{ borderBottom: '1px solid var(--surface)' }}>
                      <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>{ins.nombre}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {ins.comprado} {ins.unidad}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {ins.usado} {ins.unidad}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>
                        {formatColones(ins.costo)}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800 }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: '6px',
                          background: bajo ? 'var(--danger-soft)' : 'var(--primary-surface)',
                          color: bajo ? 'var(--danger)' : 'var(--primary)',
                        }}>
                          {Math.max(0, Math.round(s))} {ins.unidad}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
