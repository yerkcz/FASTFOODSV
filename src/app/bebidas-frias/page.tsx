"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge } from "@/lib/timeUtils";
import { useAdaptivePolling } from "@/lib/useAdaptivePolling";

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
  const API_KEY = process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY || "";

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders", { headers: { "x-api-key": API_KEY } });
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

  // Polling adaptativo: 8s activo, 20s idle, 30s background
  useAdaptivePolling(fetchItems, {
    activeIntervalMs: 8000,
    idleIntervalMs: 20000,
    backgroundIntervalMs: 30000,
    hasActiveData: items.length > 0,
  });

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const markReady = async (id: string) => {
    setMarking(id);
    try {
      await fetch("/api/kitchen/mark-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ itemId: id })
      });
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) { console.error(err); }
    finally { setMarking(null); }
  };

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "#f3f4f6", fontFamily: "Roboto, sans-serif" }}>
      {/* Header */}
      <header className="bar-header bar-header--cold">
        <Link href="/inicio" style={{ color: "white", display: "flex", padding: "8px", margin: "-8px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="bar-header__title">🧊 Bebidas Frías</div>
        <button onClick={fetchItems} className="bar-header__refresh">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
        </button>
      </header>

      <div className="bar-content">
        {/* Count chip */}
        <div className="bar-count-chip">
          <span className="bar-count-label">Pendientes</span>
          <span className="bar-count-value bar-count-value--cold">{items.length}</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#80868b", fontSize: "1rem" }}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🎉</div>
            <div style={{ color: "#80868b", fontWeight: 500, fontSize: "1rem" }}>Sin bebidas frías pendientes</div>
          </div>
        ) : (
          <div className="bar-table">
            {/* Table header */}
            <div className="bar-table-header">
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
                <div key={item.id} className="bar-table-row" style={{
                  backgroundColor: bg !== "transparent" ? bg : undefined,
                  borderLeft: `4px solid ${color}`,
                }}>
                  <button
                    onClick={() => markReady(item.id)}
                    disabled={marking === item.id}
                    className="bar-check-btn bar-check-btn--cold"
                    style={{
                      borderColor: isUrgent ? "#d93025" : "#1a73e8",
                    }}
                  >
                    {marking === item.id ? (
                      <span style={{ fontSize: "0.7rem" }}>...</span>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? "#d93025" : "#9aa0a6"} strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                  <span className="bar-cant bar-cant--cold">{item.cantidad}×</span>
                  <div>
                    <div className="bar-articulo">
                      {item.articulo}
                      {badge && <span className="bar-badge" style={{ background: isUrgent ? "#fce8e6" : "#fef3e2", color }}>{badge}</span>}
                    </div>
                    {item.notas && <div className="bar-notas">📝 {item.notas}</div>}
                  </div>
                  <span className="bar-mesa">{item.mesa || "—"}</span>
                  <div style={{ textAlign: "right" }}>
                    <div className="bar-hora" style={{ color }}>{formatTime(item.hora_registro)}</div>
                    <div className="bar-elapsed" style={{ color }}>{elapsed}m</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: BAR_STYLES }} />
    </div>
  );
}

const BAR_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;800&display=swap');
  body { margin: 0; }

  /* ====== HEADER ====== */
  .bar-header {
    position: fixed; top: 0; left: 0; right: 0;
    height: 48px;
    color: white; display: flex; align-items: center;
    justify-content: space-between; padding: 0 14px;
    z-index: 1000;
    font-family: Roboto, sans-serif;
  }
  .bar-header--cold {
    background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
    box-shadow: 0 2px 8px rgba(26,115,232,0.3);
  }
  .bar-header__title {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .bar-header__refresh {
    background: none; border: none; color: white;
    cursor: pointer; padding: 8px; margin: -8px;
    min-height: auto;
  }

  /* ====== CONTENT ====== */
  .bar-content {
    padding-top: 56px;
    padding-bottom: 16px;
    max-width: 960px;
    margin: 0 auto;
    padding-left: 10px;
    padding-right: 10px;
  }

  /* ====== COUNT CHIP ====== */
  .bar-count-chip {
    background: white; border-radius: 8px;
    padding: 8px 14px; margin-bottom: 10px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    display: flex; justify-content: space-between; align-items: center;
  }
  .bar-count-label { font-size: 0.9rem; color: #5f6368; }
  .bar-count-value { font-size: 1.3rem; font-weight: 700; }
  .bar-count-value--cold { color: #1a73e8; }

  /* ====== TABLE ====== */
  .bar-table {
    background: white; border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    overflow: hidden;
  }

  .bar-table-header {
    display: grid;
    grid-template-columns: 44px 48px 1fr 72px 68px;
    padding: 8px 12px;
    background: #f8f9fa;
    border-bottom: 2px solid #e0e0e0;
    font-size: 0.75rem; color: #5f6368;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    gap: 8px;
    font-family: Roboto, sans-serif;
  }

  .bar-table-row {
    display: grid;
    grid-template-columns: 44px 48px 1fr 72px 68px;
    padding: 8px 12px;
    align-items: center;
    border-bottom: 1px solid #f1f3f4;
    gap: 8px;
    transition: background 0.1s;
    font-family: Roboto, sans-serif;
    min-height: 48px;
  }
  .bar-table-row:active { background: #e8f0fe !important; }

  /* ====== CHECK BUTTON ====== */
  .bar-check-btn {
    width: 36px; height: 36px; border-radius: 50%;
    border: 2.5px solid #1a73e8;
    background: white; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 0; min-height: auto;
    transition: transform 0.1s;
  }
  .bar-check-btn--cold { border-color: #1a73e8; }
  .bar-check-btn:active { transform: scale(0.9); }

  /* ====== TEXT ELEMENTS ====== */
  .bar-cant { font-size: 1rem; font-weight: 800; }
  .bar-cant--cold { color: #1a73e8; }

  .bar-articulo {
    font-size: 0.95rem; color: #202124;
    font-weight: 600; line-height: 1.2;
  }
  .bar-badge {
    margin-left: 6px; font-size: 0.7rem;
    padding: 1px 5px; border-radius: 3px; font-weight: 800;
  }
  .bar-notas {
    font-size: 0.8rem; color: #d93025;
    font-style: italic; margin-top: 2px; line-height: 1.2;
  }
  .bar-mesa { font-size: 0.85rem; color: #5f6368; }
  .bar-hora { font-size: 0.85rem; font-weight: 800; }
  .bar-elapsed { font-size: 0.7rem; font-weight: 600; }

  /* ========== MOBILE (≤600px) ========== */
  @media (max-width: 600px) {
    .bar-header { height: 44px; }
    .bar-header__title { font-size: 1rem; }
    .bar-content { padding-top: 52px; padding-left: 6px; padding-right: 6px; }

    .bar-table-header, .bar-table-row {
      grid-template-columns: 40px 40px 1fr 52px 52px;
      gap: 6px;
      padding: 6px 8px;
    }
    .bar-table-row { min-height: 44px; }
    .bar-check-btn {
      width: 34px; height: 34px;
      min-width: 34px; min-height: 34px !important;
    }
    .bar-articulo { font-size: 0.88rem; }
    .bar-notas { font-size: 0.75rem; }
    .bar-cant { font-size: 0.9rem; }
    .bar-mesa { font-size: 0.78rem; }
    .bar-hora { font-size: 0.78rem; }
    .bar-elapsed { font-size: 0.65rem; }
  }

  /* ========== TABLET (601px - 1024px) ========== */
  @media (min-width: 601px) and (max-width: 1024px) {
    .bar-header { height: 52px; }
    .bar-header__title { font-size: 1.2rem; }
    .bar-content { padding-top: 60px; padding-left: 16px; padding-right: 16px; }

    .bar-table-header, .bar-table-row {
      grid-template-columns: 52px 56px 1fr 88px 80px;
      gap: 10px;
      padding: 10px 16px;
    }
    .bar-table-header {
      font-size: 0.85rem;
      padding: 10px 16px;
    }
    .bar-table-row { min-height: 56px; }
    .bar-check-btn {
      width: 42px; height: 42px;
      min-width: 42px; min-height: 42px !important;
    }
    .bar-check-btn svg { width: 20px; height: 20px; }
    .bar-articulo { font-size: 1.05rem; }
    .bar-badge { font-size: 0.8rem; }
    .bar-notas { font-size: 0.9rem; }
    .bar-cant { font-size: 1.15rem; }
    .bar-mesa { font-size: 0.95rem; }
    .bar-hora { font-size: 0.95rem; }
    .bar-elapsed { font-size: 0.8rem; }
    .bar-count-chip { padding: 12px 18px; }
    .bar-count-label { font-size: 1rem; }
    .bar-count-value { font-size: 1.5rem; }
  }

  /* ========== Desktop (≥1025px) ========== */
  @media (min-width: 1025px) {
    .bar-table-header, .bar-table-row {
      grid-template-columns: 48px 52px 1fr 80px 76px;
      gap: 10px;
    }
    .bar-table-row { min-height: 48px; }
    .bar-check-btn {
      width: 38px; height: 38px;
      min-width: 38px; min-height: 38px !important;
    }
  }
`;
