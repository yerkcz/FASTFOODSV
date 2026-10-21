"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

// ── Iconos SVG line-style (Feather/Lucide) ──────────────────
function IconEdit() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}
function IconTable() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}
function IconKitchen() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  );
}
function IconCold() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="12" y1="2" x2="12" y2="22"/>
      <path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/>
      <path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>
    </svg>
  );
}
function IconHot() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 8h1a4 4 0 0 1 0 8h-1"/>
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
      <line x1="6" y1="2" x2="6" y2="4"/>
      <line x1="10" y1="2" x2="10" y2="4"/>
      <line x1="14" y1="2" x2="14" y2="4"/>
    </svg>
  );
}
function IconAdmin() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10"/>
      <line x1="18" y1="20" x2="18" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="16"/>
      <line x1="3" y1="20" x2="21" y2="20"/>
    </svg>
  );
}

export default function InicioPortal() {
  const router = useRouter();

  const cerrarSesion = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  const navButtons = [
    { href: "/nueva-comanda",    label: "Nueva Comanda",       desc: "Tomar nuevo pedido",            Icon: IconEdit,      tone: "amber"   as const },
    { href: "/mesas",            label: "Mesas",                desc: "Ver estado · Tocar mesa ocupada", Icon: IconTable,   tone: "green"   as const },
    { href: "/cocina",           label: "Monitor Cocina",       desc: "KDS Comida",                    Icon: IconKitchen,   tone: "red"     as const },
    { href: "/bebidas-frias",    label: "Bebidas Frías",        desc: "KDS Bebidas Frías",             Icon: IconCold,      tone: "blue"    as const },
    { href: "/bebidas-calientes",label: "Beb. Calientes",       desc: "KDS Bebidas Calientes",         Icon: IconHot,       tone: "orange"  as const },
    { href: "/admin",            label: "Admin / Facturación",   desc: "Cobrar, cerrar caja y reportes",  Icon: IconAdmin,     tone: "indigo"  as const },
  ];

  const toneStyles: Record<string, { bg: string; color: string }> = {
    amber:  { bg: "rgba(217, 119, 6, 0.14)",  color: "#f59e0b" },
    green:  { bg: "rgba(4, 120, 87, 0.16)",   color: "#10b981" },
    red:    { bg: "rgba(220, 38, 38, 0.14)",  color: "#ef4444" },
    blue:   { bg: "rgba(14, 165, 233, 0.14)", color: "#38bdf8" },
    orange: { bg: "rgba(194, 65, 12, 0.14)",  color: "#fb923c" },
    indigo: { bg: "rgba(67, 56, 202, 0.16)",  color: "#818cf8" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--text-primary)", fontFamily: "var(--font-roboto), Roboto, sans-serif" }}>
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "60px",
        background: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
        color: "white", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)", zIndex: 1000,
        borderBottom: "1px solid rgba(255, 255, 255, 0.04)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Image src="/logo.svg" alt="easystem" width={36} height={36} style={{ borderRadius: "50%" }} priority />
          <div style={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.2px" }}>
            easystem
          </div>
        </div>
        <button
          onClick={cerrarSesion}
          aria-label="Cerrar sesión"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(255,255,255,0.08)', color: 'white',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
            padding: '8px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          SALIR
        </button>
      </header>

      <div style={{ padding: "76px 16px 24px", maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>
          Bienvenida
        </h1>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0 0 20px" }}>
          Seleccioná una opción para empezar
        </p>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px"
        }}>
          {navButtons.map((b) => {
            const tone = toneStyles[b.tone];
            return (
              <Link
                key={b.href}
                href={b.href}
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "12px",
                  padding: "18px 16px",
                  textAlign: "left",
                  display: "flex", alignItems: "center", gap: "14px",
                  transition: "all 0.15s",
                  boxShadow: "var(--card-shadow)",
                  textDecoration: "none",
                  color: "var(--text-primary)"
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: "10px",
                  background: tone.bg, color: tone.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0
                }}>
                  <b.Icon />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>{b.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{b.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
