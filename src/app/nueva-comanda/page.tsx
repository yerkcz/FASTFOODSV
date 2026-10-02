"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TipoOrden = "mesa" | "llevar";

export default function NuevaComandaPage() {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoOrden>("mesa");
  const [mesaSeleccionada, setMesaSeleccionada] = useState<number | null>(null);
  const [nombreCliente, setNombreCliente] = useState("");
  const [mostrarLibre, setMostrarLibre] = useState(false);
  const [mesaLibre, setMesaLibre] = useState("");

  const MESAS_FIJAS = [1, 2, 3, 4, 5, 6];

  const handleContinuarMesa = () => {
    if (!mesaSeleccionada && !mesaLibre.trim()) return;
    const mesa = mesaLibre.trim() ? mesaLibre.trim() : String(mesaSeleccionada);
    const name = nombreCliente.trim();
    const base = `/?mesa=${encodeURIComponent(mesa)}&waiter_mode=true`;
    router.push(name ? `${base}&nombre=${encodeURIComponent(name)}` : base);
  };

  const handleContinuarLlevar = () => {
    if (!nombreCliente.trim()) return;
    router.push(`/?llevar=${encodeURIComponent(nombreCliente.trim())}&waiter_mode=true`);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--text-primary)", fontFamily: "Roboto, sans-serif" }}>
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "60px",
        background: "var(--primary-gradient)",
        color: "white", display: "flex", alignItems: "center", padding: "0 16px", gap: "12px",
        boxShadow: "0 2px 8px var(--primary-glow)", zIndex: 1000
      }}>
        <button
          onClick={() => router.push("/inicio")}
          aria-label="Volver"
          style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "8px", display: "flex" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>Nueva Comanda</div>
      </header>

      <div style={{ padding: "80px 16px 24px", maxWidth: "500px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "12px", color: "var(--text-primary)" }}>
          ¿En qué mesa o para llevar?
        </h2>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button
            onClick={() => { setTipo("mesa"); setMostrarLibre(false); }}
            style={{
              flex: 1, padding: "12px", fontSize: "0.9rem", fontWeight: 700,
              background: tipo === "mesa" ? "var(--primary)" : "var(--surface)",
              color: tipo === "mesa" ? "white" : "var(--text-primary)",
              border: "1px solid " + (tipo === "mesa" ? "var(--primary)" : "var(--surface-border)"),
              borderRadius: "10px", cursor: "pointer"
            }}
          >
            🍽️ En mesa
          </button>
          <button
            onClick={() => setTipo("llevar")}
            style={{
              flex: 1, padding: "12px", fontSize: "0.9rem", fontWeight: 700,
              background: tipo === "llevar" ? "var(--accent)" : "var(--surface)",
              color: tipo === "llevar" ? "white" : "var(--text-primary)",
              border: "1px solid " + (tipo === "llevar" ? "var(--accent)" : "var(--surface-border)"),
              borderRadius: "10px", cursor: "pointer"
            }}
          >
            🛍️ Para llevar
          </button>
        </div>

        {tipo === "mesa" ? (
          <>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "10px", fontWeight: 600 }}>
              Seleccionar mesa
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px"
            }}>
              {MESAS_FIJAS.map((n) => (
                <button
                  key={n}
                  onClick={() => { setMesaSeleccionada(n); setMostrarLibre(false); setMesaLibre(""); }}
                  style={{
                    background: mesaSeleccionada === n ? "var(--primary)" : "var(--card-bg)",
                    color: mesaSeleccionada === n ? "white" : "var(--text-primary)",
                    border: "2px solid " + (mesaSeleccionada === n ? "var(--primary)" : "var(--card-border)"),
                    borderRadius: "12px", padding: "20px 8px", cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s"
                  }}
                >
                  <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{n}</div>
                  <div style={{ fontSize: "0.65rem", opacity: 0.85, marginTop: "2px" }}>Mesa {n}</div>
                </button>
              ))}
            </div>

            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "10px", fontWeight: 600 }}>
              Nombre del cliente (opcional)
            </div>
            <input
              type="text"
              placeholder="Ej: Juan, María..."
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              style={{
                width: "100%", padding: "14px", fontSize: "1.05rem",
                background: "var(--surface)", color: "var(--text-primary)",
                border: "1px solid var(--primary)", borderRadius: "10px",
                outline: "none", boxSizing: "border-box", marginBottom: "16px"
              }}
            />

            <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "16px", marginTop: "8px" }}>
              <button
                onClick={() => { setMostrarLibre(!mostrarLibre); setMesaSeleccionada(null); }}
                style={{
                  background: "none", border: "none", color: "var(--primary)",
                  fontSize: "0.85rem", cursor: "pointer", padding: 0, fontWeight: 600
                }}
              >
                {mostrarLibre ? "− Ocultar" : "+"} Otra mesa (número libre)
              </button>
              {mostrarLibre && (
                <div style={{ marginTop: "10px" }}>
                  <input
                    type="text"
                    placeholder="Ej: 7, Barra, VIP..."
                    value={mesaLibre}
                    onChange={(e) => setMesaLibre(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%", padding: "12px", fontSize: "1rem",
                      background: "var(--surface)", color: "var(--text-primary)",
                      border: "1px solid var(--surface-border)", borderRadius: "10px",
                      outline: "none", boxSizing: "border-box", marginBottom: "12px"
                    }}
                  />
                  <button
                    onClick={handleContinuarMesa}
                    disabled={!mesaLibre.trim()}
                    style={{
                      width: "100%", padding: "14px",
                      background: mesaLibre.trim() ? "var(--primary)" : "var(--surface-border)",
                      color: "white", border: "none", borderRadius: "10px",
                      fontSize: "1rem", fontWeight: 700,
                      cursor: mesaLibre.trim() ? "pointer" : "not-allowed"
                    }}
                  >
                    Continuar →
                  </button>
                </div>
              )}
            </div>

            {mesaSeleccionada && (
              <button
                onClick={handleContinuarMesa}
                style={{
                  width: "100%", marginTop: "20px", padding: "14px",
                  background: "var(--primary)", color: "white",
                  border: "none", borderRadius: "10px",
                  fontSize: "1rem", fontWeight: 700, cursor: "pointer"
                }}
              >
                Continuar a Mesa {mesaSeleccionada} →
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "10px", fontWeight: 600 }}>
              Nombre del cliente
            </div>
            <input
              type="text"
              placeholder="Ej: Juan, María..."
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              autoFocus
              style={{
                width: "100%", padding: "14px", fontSize: "1.05rem",
                background: "var(--surface)", color: "var(--text-primary)",
                border: "1px solid var(--accent)", borderRadius: "10px",
                outline: "none", boxSizing: "border-box", marginBottom: "16px"
              }}
            />
            <button
              onClick={handleContinuarLlevar}
              disabled={!nombreCliente.trim()}
              style={{
                width: "100%", padding: "14px",
                background: nombreCliente.trim() ? "var(--accent)" : "var(--surface-border)",
                color: "white", border: "none", borderRadius: "10px",
                fontSize: "1rem", fontWeight: 700,
                cursor: nombreCliente.trim() ? "pointer" : "not-allowed"
              }}
            >
              Continuar →
            </button>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "12px", textAlign: "center" }}>
              La orden irá a la cinta de Para Llevar
            </p>
          </>
        )}
      </div>
    </div>
  );
}
