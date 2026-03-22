"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge } from "@/lib/timeUtils";

type OrderItem = {
  id: string;
  articulo: string;
  cantidad: number;
  notas: string | null;
  listo: boolean;
  hora_registro: string;
  mesa: string;
};

const CHEF_ICON = "M12 3c-1.2 5.4-6 6-6 12h12c0-6-4.8-6.6-6-12zM6 17h12M10 21v-4M14 21v-4";

export default function BebidasFriasPage() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders");
      if (res.ok) {
        const data = await res.json();
        const filtered: OrderItem[] = [];
        data.orders.forEach((order: any) => {
          order.items.forEach((item: any) => {
            if (!item.listo && (item.categoria?.includes("Fría") || item.categoria?.includes("Fria") || item.categoria?.includes("Alcoholica") || item.categoria?.includes("Cerveza"))) {
              filtered.push(item);
            }
          });
        });
        setItems(filtered);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, 8000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  const markReady = async (id: string) => {
    setMarking(id);
    try {
      await fetch("/api/kitchen/mark-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id })
      });
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) { console.error(err); }
    finally { setMarking(null); }
  };

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "#f3f4f6", fontFamily: "Roboto, sans-serif" }}>
      {/* Header */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "56px",
        background: "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)",
        color: "white", display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 16px",
        boxShadow: "0 2px 8px rgba(26,115,232,0.4)", zIndex: 1000
      }}>
        <Link href="/inicio" style={{ color: "white", display: "flex", padding: "10px", margin: "-10px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>🧊 Bebidas Frías</div>
        <button onClick={fetchItems} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "10px", margin: "-10px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
        </button>
      </header>

      <div style={{ paddingTop: "68px", paddingBottom: "68px", maxWidth: "900px", margin: "0 auto", padding: "68px 8px" }}>
        {/* Count chip */}
        <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "10px 16px", marginBottom: "12px", boxShadow: "0 1px 2px rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "#5f6368" }}>Pendientes</span>
          <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1a73e8" }}>{items.length}</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "48px", color: "#80868b" }}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🎉</div>
            <div style={{ color: "#80868b", fontWeight: 500 }}>Sin bebidas frías pendientes</div>
          </div>
        ) : (
          <div style={{ backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            {/* Table header */}
            <div className="kds-sub-header">
              <span>✓</span><span>CANT</span><span>ARTÍCULO</span>
              <span className="kds-sub-col-notas">NOTAS</span>
              <span>MESA</span><span style={{ textAlign: "right" }}>HORA</span>
            </div>
            {items.map(item => {
              const color = getTimeColor(item.hora_registro);
              const bg = getTimeBg(item.hora_registro);
              const badge = getUrgencyBadge(item.hora_registro);
              const elapsed = getElapsedMins(item.hora_registro);
              const isUrgent = elapsed >= 40;
              return (
                <div key={item.id} className="kds-sub-row" style={{
                  backgroundColor: bg !== "transparent" ? bg : undefined,
                  borderLeft: `4px solid ${color}`,
                }}>
                  <button
                    onClick={() => markReady(item.id)}
                    disabled={marking === item.id}
                    style={{
                      width: "32px", height: "32px", borderRadius: "50%",
                      border: `2px solid ${isUrgent ? "#d93025" : "#1a73e8"}`,
                      backgroundColor: "white", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", padding: 0
                    }}
                  >
                    {marking === item.id ? (
                      <span style={{ fontSize: "0.7rem" }}>...</span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? "#d93025" : "#9aa0a6"} strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                  <span style={{ fontSize: "1rem", fontWeight: 800, color: "#1a73e8" }}>{item.cantidad}×</span>
                  <div>
                    <div style={{ fontSize: "0.9rem", color: "#202124", fontWeight: 600 }}>
                      {item.articulo}
                      {badge && <span style={{ marginLeft: "6px", fontSize: "0.68rem", background: isUrgent ? "#fce8e6" : "#fef3e2", color, padding: "1px 5px", borderRadius: "4px", fontWeight: 800 }}>{badge}</span>}
                    </div>
                    {item.notas && <div style={{ fontSize: "0.75rem", color: "#d93025", fontStyle: "italic", marginTop: "2px" }}>📝 {item.notas}</div>}
                  </div>
                  <div className="kds-sub-col-notas" style={{ fontSize: "0.75rem", color: "#d93025", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.notas || "—"}
                  </div>
                  <span style={{ fontSize: "0.85rem", color: "#5f6368" }}>{item.mesa || "—"}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.85rem", color, fontWeight: 800 }}>{formatTime(item.hora_registro)}</div>
                    <div style={{ fontSize: "0.72rem", color, fontWeight: 600 }}>{elapsed} min</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="kds-bottom-nav">
        <Link href="/mesas" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg>
          <span>Mesas</span>
        </Link>
        <Link href="/cocina" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={CHEF_ICON}/></svg>
          <span>Cocina</span>
        </Link>
        <Link href="/inicio" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Inicio</span>
        </Link>
        <div className="kds-nav-item kds-nav-active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v4M12 2v4M6 6h12l-1 14H7L6 6z"/></svg>
          <span>Beb. Frías</span>
        </div>
        <Link href="/entregados" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>
          <span>Entregas</span>
        </Link>
      </nav>

      <style dangerouslySetInnerHTML={{ __html: KDS_SUB_STYLES }} />
    </div>
  );
}

const KDS_SUB_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;800&display=swap');
  body { margin: 0; }

  .kds-sub-header {
    display: grid;
    grid-template-columns: 44px 44px 1fr 100px 72px 72px;
    padding: 8px 12px;
    background: #f8f9fa;
    border-bottom: 2px solid #e0e0e0;
    font-size: 0.65rem; color: #5f6368;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    gap: 4px;
    font-family: Roboto, sans-serif;
  }

  .kds-sub-row {
    display: grid;
    grid-template-columns: 44px 44px 1fr 100px 72px 72px;
    padding: 12px 12px;
    align-items: center;
    border-bottom: 1px solid #f1f3f4;
    gap: 4px;
    transition: background 0.15s;
    font-family: Roboto, sans-serif;
  }
  .kds-sub-row:active { background: #f0f6ff !important; }

  .kds-bottom-nav {
    position: fixed; bottom: 0; left: 0; right: 0;
    height: 60px;
    background: white;
    border-top: 1px solid #e0e0e0;
    display: flex; justify-content: space-around; align-items: center;
    z-index: 1000;
    box-shadow: 0 -1px 6px rgba(0,0,0,0.06);
    padding-bottom: env(safe-area-inset-bottom);
    font-family: Roboto, sans-serif;
  }
  .kds-nav-item {
    display: flex; flex-direction: column; align-items: center;
    color: #5f6368; text-decoration: none;
    font-size: 0.68rem; font-weight: 500; gap: 2px;
    padding: 4px 8px; border-radius: 8px;
    min-width: 44px; min-height: 44px; justify-content: center;
    transition: all 0.15s;
  }
  .kds-nav-active { color: #1a73e8 !important; background: #e8f0fe; }

  /* Mobile: hide notas column */
  @media (max-width: 600px) {
    .kds-sub-header, .kds-sub-row {
      grid-template-columns: 44px 44px 1fr 0 72px 68px;
    }
    .kds-sub-col-notas { display: none !important; }
  }
  @media (min-width: 601px) {
    .kds-sub-header, .kds-sub-row {
      grid-template-columns: 44px 50px 1fr 120px 80px 80px;
    }
  }
`;
