"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

type Theme = "light" | "dark";

const STORAGE_THEME = "ffsv_theme";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export default function InicioPortal() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = (typeof window !== "undefined" ? localStorage.getItem(STORAGE_THEME) : null) as Theme | null;
    const initial: Theme = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(STORAGE_THEME, next); } catch {}
  };

  const navButtons = [
    { href: "/mesas", label: "Mesas", desc: "Ver cuentas y Para Llevar", icon: "🍽️", color: "#047857", bg: "#d1fae5" },
    { href: "/nueva-comanda", label: "Nueva Comanda", desc: "Tomar pedido", icon: "📝", color: "#d97706", bg: "#fed7aa" },
    { href: "/cocina", label: "Monitor Cocina", desc: "KDS Comida", icon: "👨‍🍳", color: "#dc2626", bg: "#fecaca" },
    { href: "/bebidas-frias", label: "Bebidas Frías", desc: "KDS Bebidas Frías", icon: "🧊", color: "#0ea5e9", bg: "#bae6fd" },
    { href: "/bebidas-calientes", label: "Beb. Calientes", desc: "KDS Bebidas Calientes", icon: "☕", color: "#c2410c", bg: "#fed7aa" },
    { href: "/entregados", label: "Entregados", desc: "Historial del día", icon: "✅", color: "#16a34a", bg: "#bbf7d0" },
    { href: "/admin", label: "Admin / Facturación", desc: "Cobrar y reportes (PIN 0000)", icon: "📊", color: "#1e3a8a", bg: "#c7d2fe" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--text-primary)", fontFamily: "Roboto, sans-serif" }}>
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "60px",
        background: "var(--primary-gradient)",
        color: "white", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", boxShadow: "0 2px 8px var(--primary-glow)", zIndex: 1000
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Image src="/LogoFastF.jpeg" alt="Fast Food San Vicente" width={36} height={36} style={{ borderRadius: "50%" }} priority />
          <div>
            <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>Fast Food San Vicente</div>
            <div style={{ fontSize: "0.7rem", opacity: 0.85 }}>POS · Régimen Simplificado</div>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          aria-label="Cambiar tema"
          className="theme-toggle"
          style={{ color: "white" }}
        >
          {theme === "dark" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
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
          {navButtons.map((b) => (
            <Link
              key={b.href}
              href={b.href}
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "12px",
                padding: "20px 16px",
                textAlign: "left",
                display: "flex", alignItems: "center", gap: "14px",
                transition: "all 0.15s",
                boxShadow: "var(--card-shadow)",
                textDecoration: "none",
                color: "var(--text-primary)"
              }}
            >
              <div style={{
                width: "48px", height: "48px", borderRadius: "12px",
                background: b.bg, display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: "1.6rem", flexShrink: 0
              }}>
                {b.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>{b.label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{b.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: "24px", padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "10px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text-primary)" }}>Reglas de negocio:</strong> Precio YA incluye IVA · No se cobra servicio 10% · Comprobante interno · 6 mesas fijas (1-6) + Para Llevar (mesa 99)
        </div>
      </div>
    </div>
  );
}
