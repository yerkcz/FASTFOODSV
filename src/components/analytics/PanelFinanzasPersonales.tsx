'use client';
// ══════════════════════════════════════════════════════════════════════════
// PanelFinanzasPersonales.tsx — Sub-pestaña "Finanzas Personales".
//
// Puntos 8 y 9 de docs/Delissia/PeticionCliente.txt: gastos de la casa,
// colegio, supermercado, etc., registrados con la misma facilidad que los
// del negocio, y la visión conjunta separando negocio / personal.
// ══════════════════════════════════════════════════════════════════════════
import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { formatColones } from '@/lib/format';
import {
  getDataset, porPeriodo, resumenPersonal, resumenVentas, resumenGastos,
  type Periodo,
} from '@/lib/demoStats';
import { KpiCard, PanelCard, TooltipCard, BadgeDemo, BarraProgreso, Vacio, PALETA, cssVar } from './panelUI';

export default function PanelFinanzasPersonales({ periodo }: { periodo: Periodo }) {
  const ds = useMemo(() => getDataset(), []);
  const gastosP = useMemo(() => ds.gastosPersonales.filter(porPeriodo(periodo)), [ds, periodo]);
  const ingresosP = useMemo(() => ds.ingresosPersonales.filter(porPeriodo(periodo)), [ds, periodo]);
  const ventas = useMemo(() => ds.ventas.filter(porPeriodo(periodo)), [ds, periodo]);
  const gastosN = useMemo(() => ds.gastos.filter(porPeriodo(periodo)), [ds, periodo]);

  const rp = useMemo(() => resumenPersonal(gastosP), [gastosP]);
  const rv = useMemo(() => resumenVentas(ventas), [ventas]);
  const rg = useMemo(() => resumenGastos(gastosN), [gastosN]);

  const totalIngresosP = ingresosP.reduce((s, i) => s + i.monto, 0);
  const resto = totalIngresosP - rp.total;
  const pctUsado = totalIngresosP > 0 ? (rp.total / totalIngresosP) * 100 : 0;

  const utilidadNegocio = rv.cobrado - rg.total;
  const resultadoGlobal = utilidadNegocio + resto;

  const recientes = useMemo(
    () => [...gastosP].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 8),
    [gastosP],
  );

  const grid = cssVar('--surface-border', '#1f2a26');

  const barData = {
    labels: rp.categorias.map((c) => c.categoria),
    datasets: [{
      label: 'Gasto personal',
      data: rp.categorias.map((c) => c.monto),
      backgroundColor: PALETA,
      borderRadius: 6,
    }],
  };

  if (gastosP.length === 0 && ingresosP.length === 0) {
    return (
      <PanelCard icono="💸" titulo="Finanzas Personales" subtitulo="Sin movimientos personales en el período.">
        <Vacio texto="Probá con otro filtro de arriba (Hoy, Semana, Mes, Año o Todo)." />
      </PanelCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
          💸 Finanzas Personales
        </h3>
        <BadgeDemo />
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '14px' }}>
        <KpiCard icono="🪙" etiqueta="Ingresos personales" valor={formatColones(totalIngresosP)}
          sub="Pensión por los hijos y otros ingresos propios del período" />
        <KpiCard icono="🛒" etiqueta="Gastos personales" valor={formatColones(rp.total)} tono="accent"
          sub={`${gastosP.length} gastos de la casa registrados`} />
        <KpiCard
          icono={resto >= 0 ? '💚' : '⚠️'}
          etiqueta={resto >= 0 ? 'Lo que sobró' : 'Te pasaste'}
          valor={formatColones(Math.abs(resto))}
          tono={resto >= 0 ? 'primary' : 'danger'}
          sub={resto >= 0 ? 'Ingresos personales menos gastos personales' : 'Los gastos personales superaron los ingresos'}
        />
        <KpiCard icono="📊" etiqueta="% del ingreso usado" valor={`${pctUsado.toFixed(0)}%`}
          tono={pctUsado <= 90 ? 'primary' : 'danger'}
          sub="Qué parte de lo que entró ya se gastó en la casa" />
      </div>

      {/* ── Gastos personales ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))', gap: '20px' }}>
        <PanelCard
          icono="🏠"
          titulo="¿En qué se va tu plata personal?"
          subtitulo="Casa, supermercado, colegio, transporte y otros"
          pie={
            <TooltipCard icon="📚" title="Cómo se lee">
              Son los gastos que anotás todos los días aparte del negocio. La pensión de los hijos entra como{' '}
              <strong>ingreso personal</strong> y no se mezcla con las ventas: así el negocio y la casa se ven
              separados pero en la misma pantalla (punto 9 de tu petición).
            </TooltipCard>
          }
        >
          <div style={{ height: 'clamp(210px, 45vw, 270px)' }}>
            <Bar data={barData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: grid }, ticks: { callback: (v) => formatColones(Number(v)), maxTicksLimit: 6 } },
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false } },
              },
            }} />
          </div>
        </PanelCard>

        <PanelCard
          icono="🧾"
          titulo="Últimos gastos personales"
          subtitulo="Los más recientes del período"
          pie={
            <TooltipCard icon="💡" title="Tu hábito" >
              Este es el registro diario que hoy hacés a mano: cada fila es un gasto con su fecha, categoría y
              monto, listo para cerrar el mes sin cuadernos.
            </TooltipCard>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recientes.length === 0 ? (
              <Vacio texto="Sin gastos personales en este período." />
            ) : recientes.map((g, i) => (
              <div key={`${g.fecha}-${i}`} style={{
                display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center',
                padding: '10px 12px', background: 'var(--surface)', borderRadius: '10px',
                border: '1px solid var(--surface-border)', flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0, flex: '1 1 150px' }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{g.concepto}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{g.fecha}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-block', fontSize: '0.68rem', fontWeight: 700,
                    padding: '2px 8px', borderRadius: '6px',
                    background: 'var(--primary-surface)', color: 'var(--primary)',
                    marginBottom: '3px',
                  }}>{g.categoria}</span>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--accent)' }}>
                    {formatColones(g.monto)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      {/* ── Desglose de categorías ───────────────────────────────────── */}
      <PanelCard
        icono="📊"
        titulo="Detalle de tus gastos del hogar"
        subtitulo="Porcentaje y monto de cada categoría"
        pie={
          <TooltipCard icon="🎯" title="Dato clave">
            La categoría con la barra más larga es la que más pesa en tu bolsillo este período.
          </TooltipCard>
        }
      >
        <div style={{ display: 'grid', gap: '14px' }}>
          {rp.categorias.length === 0 ? (
            <Vacio texto="Sin gastos personales en este período." />
          ) : rp.categorias.map((c, i) => (
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

      {/* ── Visión conjunta (negocio + personal) ─────────────────────── */}
      <PanelCard
        icono="🪙"
        titulo="Visión conjunta: negocio + personal"
        subtitulo="Las dos cuentas juntas, pero bien separadas"
        pie={
          <TooltipCard icon="📚" title="Por qué se separan">
            El negocio y la casa son dos carteras distintas: lo que ganás con la pensión no es utilidad del
            negocio, y lo que sacás del negocio para la casa no es gasto del local. El resultado global suma
            las dos diferencias para que veas cuánto te queda de verdad al final del período.
          </TooltipCard>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '16px' }}>
          {/* Negocio */}
          <div style={{
            background: 'var(--primary-surface)', borderRadius: '14px', padding: '16px',
            border: '1px solid var(--surface-border)',
          }}>
            <div style={{
              fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px',
            }}>📈 Finanzas del negocio</div>
            {[
              { l: 'Ventas del período', v: formatColones(rv.total), c: 'var(--text-primary)' },
              { l: 'Lo que ya entró (cobrado)', v: formatColones(rv.cobrado), c: 'var(--primary)' },
              { l: 'Todavía a crédito', v: formatColones(rv.porCobrar), c: 'var(--accent)' },
              { l: 'Gastos del negocio', v: `− ${formatColones(rg.total)}`, c: 'var(--accent)' },
            ].map((row) => (
              <div key={row.l} style={{
                display: 'flex', justifyContent: 'space-between', gap: '8px',
                fontSize: 'var(--text-sm)', padding: '7px 0',
                borderBottom: '1px dashed var(--surface-border)',
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>{row.l}</span>
                <strong style={{ color: row.c, whiteSpace: 'nowrap' }}>{row.v}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--text-base)', paddingTop: '10px' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Utilidad</span>
              <strong style={{ color: utilidadNegocio >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                {formatColones(utilidadNegocio)}
              </strong>
            </div>
          </div>

          {/* Personal */}
          <div style={{
            background: 'var(--accent-soft)', borderRadius: '14px', padding: '16px',
            border: '1px solid var(--surface-border)',
          }}>
            <div style={{
              fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px',
            }}>🏠 Finanzas personales</div>
            {[
              { l: 'Ingresos personales', v: formatColones(totalIngresosP), c: 'var(--text-primary)' },
              { l: 'Pensión y otros', v: ingresosP.length ? `${ingresosP.length} ingresos` : '—', c: 'var(--text-secondary)' },
              { l: 'Gastos de la casa', v: `− ${formatColones(rp.total)}`, c: 'var(--accent)' },
            ].map((row) => (
              <div key={row.l} style={{
                display: 'flex', justifyContent: 'space-between', gap: '8px',
                fontSize: 'var(--text-sm)', padding: '7px 0',
                borderBottom: '1px dashed var(--surface-border)',
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>{row.l}</span>
                <strong style={{ color: row.c, whiteSpace: 'nowrap' }}>{row.v}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--text-base)', paddingTop: '10px' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Lo que sobró</span>
              <strong style={{ color: resto >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                {formatColones(resto)}
              </strong>
            </div>
          </div>
        </div>

        {/* Resultado global */}
        <div style={{
          marginTop: '16px', padding: '16px', borderRadius: '14px',
          background: 'var(--card-bg)', border: '2px solid var(--primary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: '12px', flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              💰 Resultado global del período
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Utilidad del negocio {formatColones(utilidadNegocio)} + lo que sobró en la casa {formatColones(resto)}
            </div>
          </div>
          <div style={{
            fontSize: 'clamp(1.3rem, 5vw, 1.9rem)', fontWeight: 800,
            color: resultadoGlobal >= 0 ? 'var(--primary)' : 'var(--danger)',
          }}>
            {formatColones(resultadoGlobal)}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
