"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatTime, getTimeColor, getElapsedMins, getUrgencyBadge } from "@/lib/timeUtils";
import { isHotDrink } from "@/lib/kdsFilters";

type OrderItem = {
  id: string;
  articulo: string;
  cantidad: number;
  notas: string | null;
  listo: boolean;
  hora_registro: string;
  mesa: string;
};

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
            if (!item.listo && isHotDrink(item.categoria)) {
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
    <div className="kds-sub-root">
      {/* Header */}
      <header className="kds-sub-header-bar">
        <Link href="/inicio" className="kds-sub-back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="kds-sub-title">☕ Bebidas Calientes</div>
        <button onClick={fetchItems} className="kds-sub-refresh" aria-label="Actualizar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
        </button>
      </header>

      <div className="kds-sub-container">
        {/* Count chip */}
        <div className="kds-sub-summary">
          <span>Pendientes</span>
          <span className="kds-sub-count">{items.length}</span>
        </div>

        {loading ? (
          <div className="kds-sub-loading">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="kds-sub-empty">
            <div className="kds-sub-empty-icon">☕</div>
            <div>Sin bebidas calientes pendientes</div>
          </div>
        ) : (
          <div className="kds-sub-table">
            {/* Table header */}
            <div className="kds-sub-thead">
              <span>✓</span><span>CANT</span><span>ARTÍCULO</span>
              <span className="kds-sub-col-mesa">MESA</span><span style={{ textAlign: "right" }}>HORA</span>
            </div>
            {items.map(item => {
              const color = getTimeColor(item.hora_registro);
              const badge = getUrgencyBadge(item.hora_registro);
              const elapsed = getElapsedMins(item.hora_registro);
              const isUrgent = elapsed >= 40;
              const isOld = elapsed >= 25;

              return (
                <div key={item.id} className={`kds-sub-row ${isUrgent ? 'kds-sub-row-urgent' : isOld ? 'kds-sub-row-old' : ''}`} style={{
                  borderLeft: `4px solid ${color}`,
                }}>
                  <button
                    onClick={() => markReady(item.id)}
                    disabled={marking === item.id}
                    className="kds-sub-check-btn"
                    style={{ borderColor: isUrgent ? "#ef4444" : "var(--primary)" }}
                  >
                    {marking === item.id ? (
                      <span style={{ fontSize: "0.6rem" }}>...</span>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? "#ef4444" : "currentColor"} strokeWidth="3.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                  <span className="kds-sub-qty">{item.cantidad}×</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="kds-sub-item-name">
                      {item.articulo}
                      {badge && <span className="kds-sub-urgency-badge" style={{ color }}>{badge}</span>}
                    </div>
                    {item.notas && <div className="kds-sub-notes">📝 {item.notas}</div>}
                  </div>
                  <span className="kds-sub-col-mesa kds-sub-mesa-text">{item.mesa || "—"}</span>
                  <div style={{ textAlign: "right", lineHeight: 1.1 }}>
                    <div style={{ fontSize: "0.8rem", color, fontWeight: 800 }}>{formatTime(item.hora_registro)}</div>
                    <div style={{ fontSize: "0.7rem", color, fontWeight: 600 }}>{elapsed}m</div>
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

  .kds-sub-root {
    min-height: 100dvh;
    background-color: var(--background);
    color: var(--text-primary);
    font-family: 'Roboto', -apple-system, sans-serif;
  }

  .kds-sub-header-bar {
    position: fixed; top: 0; left: 0; right: 0; height: 44px;
    background: linear-gradient(135deg, #c2410c 0%, #9a3412 100%);
    color: white; display: flex; align-items: center;
    justify-content: space-between; padding: 0 12px;
    box-shadow: 0 2px 6px rgba(154,52,18,0.3); z-index: 1000;
  }

  .kds-sub-back {
    color: white; display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 50%;
  }
  .kds-sub-back:active { background: rgba(255,255,255,0.2); }

  .kds-sub-title { font-size: 0.95rem; font-weight: 700; letter-spacing: 0.3px; }

  .kds-sub-refresh {
    background: none; border: none; color: white; cursor: pointer;
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  }
  .kds-sub-refresh:active { background: rgba(255,255,255,0.2); }

  .kds-sub-container {
    padding-top: 52px; padding-bottom: 20px; max-width: 900px; margin: 0 auto; padding-left: 8px; padding-right: 8px;
  }

  .kds-sub-summary {
    background: var(--card-bg); border: 1.5px solid var(--card-border);
    border-radius: 10px; padding: 8px 16px; margin-bottom: 8px;
    box-shadow: var(--card-shadow); display: flex; justify-content: space-between; align-items: center;
  }
  .kds-sub-summary > span:first-child { font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; }
  .kds-sub-count { font-size: 1.15rem; fontWeight: 800; color: var(--primary); }

  .kds-sub-loading { text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.9rem; }

  .kds-sub-empty { text-align: center; padding: 48px 16px; color: var(--text-muted); }
  .kds-sub-empty-icon { font-size: 2.5rem; margin-bottom: 8px; }

  .kds-sub-table {
    background: var(--card-bg); border: 1.5px solid var(--card-border);
    border-radius: 12px; box-shadow: var(--card-shadow); overflow: hidden;
  }

  .kds-sub-thead {
    display: grid;
    grid-template-columns: 36px 44px 1fr 80px 60px;
    padding: 8px 12px;
    background: var(--surface);
    border-bottom: 1.5px solid var(--surface-border);
    font-size: 0.72rem; color: var(--text-muted);
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    gap: 6px;
  }

  .kds-sub-row {
    display: grid;
    grid-template-columns: 36px 44px 1fr 80px 60px;
    padding: 4px 12px;
    align-items: center;
    border-bottom: 1px solid var(--surface-border);
    gap: 6px;
    transition: background 0.1s;
    background: var(--card-bg);
    min-height: 32px;
  }
  .kds-sub-row:last-child { border-bottom: none; }
  .kds-sub-row:active { background: var(--primary-surface); }
  .kds-sub-row-urgent { background: rgba(239, 68, 68, 0.08) !important; }
  .kds-sub-row-old { background: rgba(245, 158, 11, 0.06) !important; }

  .kds-sub-check-btn {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid var(--primary);
    background: var(--card-bg); color: var(--text-muted); cursor: pointer;
    display: flex; align-items: center; justify-content: center; padding: 0;
    min-height: auto; transition: all 0.1s;
    touch-action: manipulation;
  }
  .kds-sub-check-btn:active { background: var(--primary); color: white; }

  .kds-sub-qty { font-size: 0.78rem; font-weight: 800; color: var(--primary); }

  .kds-sub-item-name {
    font-size: 0.78rem; color: var(--text-primary); fontWeight: 700;
    line-height: 1.1; word-break: break-word;
  }
  
  .kds-sub-urgency-badge {
    margin-left: 5px; font-size: 0.54rem; font-weight: 800;
    background: rgba(239,68,68,0.15); padding: 1px 3px; border-radius: 3px;
  }

  .kds-sub-notes { font-size: 0.66rem; color: #ef4444; font-style: italic; marginTop: 1px; line-height: 1.05; }

  .kds-sub-mesa-text { font-size: 0.68rem; color: var(--text-secondary); font-weight: 600; }

  /* ========== MOBILE (≤600px) — celular ========== */
  @media (max-width: 600px) {
    .kds-sub-thead, .kds-sub-row {
      grid-template-columns: 28px 32px 1fr 44px;
      gap: 4px;
      padding: 3px 6px;
      min-height: 32px;
    }
    .kds-sub-col-mesa { display: none !important; }
    .kds-sub-item-name { font-size: 0.76rem; }
    .kds-sub-qty { font-size: 0.76rem; }
    .kds-sub-check-btn { width: 20px; height: 20px; }
  }

  /* ========== TABLET (601-900px) — ultra compacto, ≥17 pedidos visibles ========== */
  @media (min-width: 601px) and (max-width: 900px) {
    .kds-sub-container { max-width: 100%; padding-left: 10px; padding-right: 10px; padding-top: 48px; }
    .kds-sub-header-bar { height: 40px; }
    .kds-sub-title { font-size: 0.9rem; }
    .kds-sub-summary { padding: 5px 12px; margin-bottom: 5px; }
    .kds-sub-summary > span:first-child { font-size: 0.78rem; }
    .kds-sub-count { font-size: 1rem; }
    .kds-sub-thead, .kds-sub-row {
      grid-template-columns: 32px 40px 1fr 74px 54px;
      padding: 4px 10px;
      gap: 6px;
      min-height: 38px;
    }
    .kds-sub-thead { font-size: 0.66rem; padding: 4px 10px; }
    .kds-sub-check-btn { width: 26px; height: 26px; }
    .kds-sub-qty { font-size: 0.84rem; }
    .kds-sub-item-name { font-size: 0.82rem; }
    .kds-sub-notes { font-size: 0.7rem; }
    .kds-sub-mesa-text { font-size: 0.72rem; }
  }

  /* ========== DESKTOP / monitor (≥901px) ========== */
  @media (min-width: 901px) {
    .kds-sub-container { max-width: 1100px; padding-left: 12px; padding-right: 12px; padding-top: 50px; }
    .kds-sub-header-bar { height: 42px; }
    .kds-sub-title { font-size: 0.95rem; }
    .kds-sub-thead, .kds-sub-row {
      grid-template-columns: 36px 44px 1fr 92px 62px;
      padding: 5px 12px;
      gap: 8px;
      min-height: 42px;
    }
    .kds-sub-thead { font-size: 0.7rem; padding: 5px 12px; }
    .kds-sub-check-btn { width: 28px; height: 28px; }
    .kds-sub-qty { font-size: 0.88rem; }
    .kds-sub-item-name { font-size: 0.87rem; }
    .kds-sub-notes { font-size: 0.75rem; }
    .kds-sub-mesa-text { font-size: 0.78rem; }
  }
`;
