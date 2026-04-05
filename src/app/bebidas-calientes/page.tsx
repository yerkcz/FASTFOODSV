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

export default function BebidasCalientesPage() {
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
            if (!item.listo && (item.categoria?.includes("Caliente") || item.categoria?.includes("Café"))) {
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
        position: "fixed", top: 0, left: 0, right: 0, height: "36px",
        background: "linear-gradient(135deg, #e65100 0%, #bf360c 100%)",
        color: "white", display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 10px",
        boxShadow: "0 1px 4px rgba(230,81,0,0.3)", zIndex: 1000
      }}>
        <Link href="/inicio" style={{ color: "white", display: "flex", padding: "6px", margin: "-6px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>☕ Beb. Calientes</div>
        <button onClick={fetchItems} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "6px", margin: "-6px", minHeight: 'auto' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
        </button>
      </header>

      <div style={{ paddingTop: "44px", paddingBottom: "8px", maxWidth: "900px", margin: "0 auto", padding: "44px 6px 8px" }}>
        {/* Count chip */}
        <div style={{ backgroundColor: "white", borderRadius: "6px", padding: "4px 10px", marginBottom: "6px", boxShadow: "0 1px 2px rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.7rem", color: "#5f6368" }}>Pendientes</span>
          <span style={{ fontSize: "1rem", fontWeight: 700, color: "#e65100" }}>{items.length}</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#80868b", fontSize: "0.75rem" }}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "6px" }}>☕</div>
            <div style={{ color: "#80868b", fontWeight: 500, fontSize: "0.75rem" }}>Sin bebidas calientes pendientes</div>
          </div>
        ) : (
          <div style={{ backgroundColor: "white", borderRadius: "6px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            {/* Table header */}
            <div className="kds-sub-header">
              <span>✓</span><span>CANT</span><span>ARTÍCULO</span>
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
                  borderLeft: `3px solid ${color}`,
                }}>
                  <button
                    onClick={() => markReady(item.id)}
                    disabled={marking === item.id}
                    style={{
                      width: "22px", height: "22px", borderRadius: "50%",
                      border: `2px solid ${isUrgent ? "#d93025" : "#e65100"}`,
                      backgroundColor: "white", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      minHeight: 'auto'
                    }}
                  >
                    {marking === item.id ? (
                      <span style={{ fontSize: "0.5rem" }}>...</span>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? "#d93025" : "#9aa0a6"} strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                  <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#e65100" }}>{item.cantidad}×</span>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "#202124", fontWeight: 600, lineHeight: 1.1 }}>
                      {item.articulo}
                      {badge && <span style={{ marginLeft: "4px", fontSize: "0.5rem", background: isUrgent ? "#fce8e6" : "#fef3e2", color, padding: "0 3px", borderRadius: "2px", fontWeight: 800 }}>{badge}</span>}
                    </div>
                    {item.notas && <div style={{ fontSize: "0.55rem", color: "#d93025", fontStyle: "italic", marginTop: "0px", lineHeight: 1.1 }}>📝 {item.notas}</div>}
                  </div>
                  <span style={{ fontSize: "0.6rem", color: "#5f6368" }}>{item.mesa || "—"}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.58rem", color, fontWeight: 800 }}>{formatTime(item.hora_registro)}</div>
                    <div style={{ fontSize: "0.48rem", color, fontWeight: 600 }}>{elapsed}m</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: KDS_SUB_STYLES }} />
    </div>
  );
}

const KDS_SUB_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;800&display=swap');
  body { margin: 0; }

  .kds-sub-header {
    display: grid;
    grid-template-columns: 28px 32px 1fr 56px 52px;
    padding: 2px 8px;
    background: #f8f9fa;
    border-bottom: 1px solid #e0e0e0;
    font-size: 0.5rem; color: #5f6368;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
    gap: 4px;
    font-family: Roboto, sans-serif;
  }

  .kds-sub-row {
    display: grid;
    grid-template-columns: 28px 32px 1fr 56px 52px;
    padding: 2px 8px;
    align-items: center;
    border-bottom: 1px solid #f1f3f4;
    gap: 4px;
    transition: background 0.1s;
    font-family: Roboto, sans-serif;
    min-height: 26px;
  }
  .kds-sub-row:active { background: #fff3e0 !important; }

  /* ========== MOBILE (≤600px) ========== */
  @media (max-width: 600px) {
    .kds-sub-header, .kds-sub-row {
      grid-template-columns: 28px 28px 1fr 44px 44px;
      gap: 3px;
      padding: 1px 4px;
    }
    .kds-sub-row { min-height: 28px; }
    .kds-sub-row button:first-child {
      width: 28px !important;
      height: 28px !important;
      min-width: 28px;
      min-height: 28px !important;
    }
  }

  /* ========== TABLET (601px - 1024px) ========== */
  @media (min-width: 601px) and (max-width: 1024px) {
    .kds-sub-header, .kds-sub-row {
      grid-template-columns: 36px 44px 1fr 72px 68px;
      gap: 8px;
      padding: 6px 12px;
    }
    .kds-sub-row { min-height: 38px; }
    .kds-sub-row button:first-child {
      width: 32px !important;
      height: 32px !important;
      min-width: 32px;
      min-height: 32px !important;
    }
    .kds-sub-header {
      font-size: 0.65rem;
      padding: 6px 12px;
    }
  }

  /* ========== TABLET/Desktop (≥1025px) ========== */
  @media (min-width: 1025px) {
    .kds-sub-header, .kds-sub-row {
      grid-template-columns: 30px 36px 1fr 64px 60px;
      gap: 6px;
    }
  }
`;
