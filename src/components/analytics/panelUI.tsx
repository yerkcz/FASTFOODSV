'use client';
// ══════════════════════════════════════════════════════════════════════════
// panelUI.tsx — Bloques de construcción de las sub-pestañas de Estadísticas.
//
// Todo se pinta con las variables CSS de globals.css (tema oscuro
// permanente, AGENTS.md regla 5). Nada de colores claros hardcodeados:
// scripts/verify_integridad.mjs sección 13 lo audita.
// ══════════════════════════════════════════════════════════════════════════
import React from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler,
  LineController, BarController, DoughnutController,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
  LineController, BarController, DoughnutController,
);

/** Chart.js no acepta `var(--x)`: necesita el color ya resuelto. */
export function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Paleta acorde a la marca (verde #047857 / naranja #d97706) en tonos claros. */
export const PALETA = [
  '#10b981', '#f59e0b', '#38bdf8', '#a78bfa', '#f472b6',
  '#fb7185', '#34d399', '#fbbf24', '#60a5fa', '#94a3b8',
];

export const TONOS = {
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  danger: 'var(--danger)',
  muted: 'var(--text-muted)',
} as const;

type Tono = keyof typeof TONOS;

/** Card base: un panel con título, subtítulo opcional y contenido. */
export function PanelCard({
  icono, titulo, subtitulo, extra, children, pie,
}: {
  icono?: string;
  titulo: string;
  subtitulo?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  /** Bloque explicativo al pie de la tarjeta. */
  pie?: React.ReactNode;
}) {
  return (
    <section style={{
      background: 'var(--card-bg)', borderRadius: '16px',
      padding: 'clamp(16px, 4vw, 24px)',
      border: '1px solid var(--surface-border)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)', minWidth: 0,
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{
          margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700,
          color: 'var(--text-primary)', display: 'flex', alignItems: 'center',
          gap: '8px', flexWrap: 'wrap',
        }}>
          {icono && <span aria-hidden>{icono}</span>}{titulo}
        </h3>
        {subtitulo && (
          <p style={{ margin: '4px 0 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {subtitulo}
          </p>
        )}
        {extra}
      </div>
      {children}
      {pie}
    </section>
  );
}

/** Tarjeta KPI: etiqueta arriba, número grande y una línea de contexto. */
export function KpiCard({
  icono, etiqueta, valor, sub, tono = 'primary',
}: {
  icono: string;
  etiqueta: string;
  valor: React.ReactNode;
  sub?: React.ReactNode;
  tono?: Tono;
}) {
  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: '16px',
      padding: 'clamp(14px, 3.5vw, 20px)',
      border: '1px solid var(--surface-border)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 'clamp(0.65rem, 2vw, 0.72rem)', color: 'var(--text-secondary)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>{etiqueta}</div>
          <div style={{
            fontSize: 'clamp(1.3rem, 5vw, 1.85rem)', fontWeight: 800,
            color: TONOS[tono], marginTop: '4px', lineHeight: 1.1, wordBreak: 'break-word',
          }}>{valor}</div>
        </div>
        <div style={{ fontSize: '1.35rem', lineHeight: 1 }} aria-hidden>{icono}</div>
      </div>
      {sub && (
        <div style={{ fontSize: 'clamp(0.7rem, 2vw, 0.78rem)', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.45 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/**
 * Tarjeta de explicación — el "para qué sirve esto" que pide la cliente
 * ("EN LAS STATS DESCRIPCIONES PARA SABER QUE" — FIXES_Delicia.md).
 */
export function TooltipCard({
  title, children, icon,
}: { title: string; children: React.ReactNode; icon: string }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--primary-surface) 100%)',
      borderRadius: '8px', padding: '12px',
      border: '1px solid var(--surface-border)', marginTop: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '1rem' }} aria-hidden>{icon}</span>
        <span style={{
          fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>{title}</span>
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

/** Badge que avisa que el número viene del set de demostración. */
export function BadgeDemo() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: 'var(--accent-soft)', color: 'var(--accent)',
      border: '1px solid var(--accent)', borderRadius: '20px',
      padding: '5px 12px', fontSize: 'clamp(0.65rem, 2vw, 0.72rem)',
      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)' }} />
      Datos de demostración
    </span>
  );
}

export function BarraProgreso({ pct, color = 'var(--primary)' }: { pct: number; color?: string }) {
  const ancho = Math.max(3, Math.min(100, pct));
  return (
    <div style={{ background: 'var(--surface)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${ancho}%`, background: color, borderRadius: '5px' }} />
    </div>
  );
}

/** Control segmentado reutilizable (granularidad del balance, etc.). */
export function Segmentado<T extends string>({
  valor, onChange, opciones,
}: {
  valor: T;
  onChange: (v: T) => void;
  opciones: { valor: T; label: string }[];
}) {
  return (
    <div style={{
      display: 'flex', gap: '4px', background: 'var(--surface)',
      borderRadius: '12px', padding: '4px', border: '1px solid var(--surface-border)',
      overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '100%',
    }}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            onClick={() => onChange(o.valor)}
            style={{
              flex: '1 0 auto', minHeight: '44px', padding: '8px 14px',
              borderRadius: '9px', border: 'none', cursor: 'pointer',
              fontSize: 'clamp(0.75rem, 2.4vw, 0.85rem)', fontWeight: 700,
              whiteSpace: 'nowrap', transition: 'all 0.2s',
              background: activo ? 'var(--primary)' : 'transparent',
              color: activo ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Estado vacío amigable (no hay datos en el filtro elegido). */
export function Vacio({ texto }: { texto: string }) {
  return (
    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
      {texto}
    </div>
  );
}

/** Etiqueta de sección dentro de una tarjeta (subtítulo de fila). */
export function Subtitulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 'clamp(0.7rem, 2vw, 0.75rem)', fontWeight: 700,
      color: 'var(--text-secondary)', textTransform: 'uppercase',
      letterSpacing: '0.5px', margin: '0 0 10px 0',
    }}>
      {children}
    </div>
  );
}
