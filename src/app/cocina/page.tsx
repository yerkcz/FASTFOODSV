"use client";

import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { formatTime, getTimeColor, getElapsedMins, getUrgencyBadge } from "@/lib/timeUtils";
import { isColdDrink, isHotDrink, isKitchenFood } from "@/lib/kdsFilters";

type OrderItem = {
  id: string;
  articulo: string;
  cantidad: number;
  notas: string | null;
  listo: boolean;
  hora_registro: string;
  categoria: string;
  mesa: string;
};

type Order = {
  orden_nu: string;
  cliente: string;
  hora_apertura: string;
  items: OrderItem[];
};

export default function KitchenDisplaySystem() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastOrdersCount, setLastOrdersCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<"Proceso de comandas" | "Bebidas Frías" | "Bebidas Calientes">("Proceso de comandas");
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders");
      if (res.ok) {
        const data = await res.json();
        const newTotalPendingItems = data.orders.reduce((acc: number, o: Order) =>
          acc + o.items.filter(i => !i.listo).length, 0);
        setLastOrdersCount(newTotalPendingItems);
        setOrders(data.orders);
      }
    } catch (err) {
      console.error("Error fetching KDS", err);
    } finally {
      setLoading(false);
    }
  }, [lastOrdersCount]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const toggleItemReady = async (itemId: string) => {
    setOrders(prev => prev.map(order => ({
      ...order,
      items: order.items.filter(item => item.id !== itemId)
    })).filter(order => order.items.length > 0));
    try {
      await fetch("/api/kitchen/mark-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId })
      });
      setTimeout(fetchOrders, 500);
    } catch (err) {
      console.error(err);
      fetchOrders();
    }
  };

  const categoryMatch = (catStr: string | null | undefined, tab: string) => {
    if (tab === "Proceso de comandas") return isKitchenFood(catStr);
    if (tab === "Bebidas Frías")        return isColdDrink(catStr);
    if (tab === "Bebidas Calientes")    return isHotDrink(catStr);
    return true;
  };

  const pendingItemsRaw = orders.flatMap(order =>
    order.items
      .filter(item => !item.listo && categoryMatch(item.categoria, activeTab))
      .map(item => ({ ...item, orderCliente: order.cliente, ordenNu: order.orden_nu }))
  );

  const pendingItemsForTab = customOrder.length > 0
    ? [...pendingItemsRaw].sort((a, b) => {
        const idxA = customOrder.indexOf(a.id);
        const idxB = customOrder.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      })
    : pendingItemsRaw;

  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      setCustomOrder([]);
      prevTabRef.current = activeTab;
    }
  }, [activeTab]);

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const currentIds = pendingItemsForTab.map(i => i.id);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentIds.length) return;
    const reordered = [...currentIds];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setCustomOrder(reordered);
  };

  const tabConfig = [
    { key: "Proceso de comandas" as const, label: "Comandas", icon: "🍳" },
    { key: "Bebidas Frías" as const, label: "Beb. Frías", icon: "🧊" },
    { key: "Bebidas Calientes" as const, label: "Beb. Cal.", icon: "☕" },
  ];

  if (!soundEnabled) {
    return (
      <div className="kds-root">
        <header className="kds-header">
          <div className="kds-header-left">
            <Link href="/inicio" style={{ color: "white", display: "flex", padding: "6px", marginRight: "8px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
            </Link>
            <Image src="/LogoFastF.jpeg" alt="Fast Food San Vicente KDS" width={26} height={26} className="kds-logo" priority />
            <span className="kds-brand">KDS · Cocina</span>
          </div>
        </header>
        <div className="kds-splash">
          <div className="kds-splash-card">
            <div className="kds-splash-icon">👨‍🍳</div>
            <h2 className="kds-splash-title">Monitor de Cocina</h2>
            <p className="kds-splash-sub">Toca para iniciar el tablero en tiempo real.</p>
            <button className="kds-splash-btn" onClick={() => setSoundEnabled(true)}>
              🚀 Iniciar Tablero
            </button>
          </div>
        </div>
        <style dangerouslySetInnerHTML={{ __html: KDS_STYLES }} />
      </div>
    );
  }

  return (
    <div className="kds-root">
      <header className="kds-header">
        <div className="kds-header-left">
          <Link href="/inicio" style={{ color: "white", display: "flex", padding: "6px", marginRight: "8px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </Link>
          <Image src="/LogoFastF.jpeg" alt="Fast Food San Vicente" width={24} height={24} className="kds-logo" priority />
          <span className="kds-brand">KDS · Cocina</span>
        </div>
        <div className="kds-header-right">
          {loading && <div className="kds-dot-loading" />}
          <button onClick={fetchOrders} className="kds-icon-btn" aria-label="Actualizar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
          </button>
          <span className="kds-count-badge">{pendingItemsForTab.length}</span>
        </div>
      </header>

      <div className="kds-body">
        {/* TABS */}
        <div className="kds-tabs">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`kds-tab${activeTab === tab.key ? ' kds-tab-active' : ''}`}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* TABLE */}
        <div className="kds-table-wrap">
          <div className="kds-thead">
            <div>✓</div>
            <div>CANT</div>
            <div>ARTÍCULO</div>
            <div className="kds-col-mesa">MESA</div>
            <div className="kds-col-time">HORA</div>
            <div className="kds-col-reorder">⇅</div>
          </div>

          {pendingItemsForTab.length === 0 && !loading && (
            <div className="kds-empty">
              <div className="kds-empty-icon">✅</div>
              <div className="kds-empty-title">¡Todo al día!</div>
              <div className="kds-empty-sub">Sin pendientes en {activeTab}.</div>
            </div>
          )}

          {pendingItemsForTab.map((item, index) => {
            const elapsed = getElapsedMins(item.hora_registro);
            const timeColor = getTimeColor(item.hora_registro);
            const urgencyBadge = getUrgencyBadge(item.hora_registro);
            const isUrgent = elapsed >= 40;
            const isOld = elapsed >= 25;

            return (
              <div
                key={item.id}
                className={`kds-row${isUrgent ? ' kds-row-urgent' : isOld ? ' kds-row-old' : ''}`}
                style={{ borderLeftColor: isUrgent ? '#ef4444' : isOld ? '#f59e0b' : 'transparent' }}
              >
                {/* LISTO */}
                <div
                  className="kds-check"
                  onClick={() => toggleItemReady(item.id)}
                  role="button"
                  aria-label="Marcar listo"
                >
                  <div className="kds-check-circle" style={{ borderColor: isUrgent ? '#ef4444' : undefined }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? '#ef4444' : 'currentColor'} strokeWidth="3.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                </div>

                {/* CANT */}
                <div className="kds-qty">{item.cantidad}×</div>

                {/* ARTÍCULO */}
                <div className="kds-item-info">
                  <div className="kds-item-name">
                    {item.articulo}
                    {urgencyBadge && (
                      <span className="kds-urgency-badge" style={{ color: timeColor }}>
                        {urgencyBadge}
                      </span>
                    )}
                  </div>
                  {item.notas && (
                    <div className="kds-item-notes">📝 {item.notas}</div>
                  )}
                </div>

                {/* MESA */}
                <div className="kds-col-mesa kds-mesa-text">
                  {item.mesa || item.orderCliente || '—'}
                </div>

                {/* HORA */}
                <div className="kds-col-time kds-time-block">
                  <div style={{ color: timeColor }}>{formatTime(item.hora_registro)}</div>
                  <div className="kds-elapsed" style={{ color: timeColor }}>{elapsed}m</div>
                </div>

                {/* REORDER */}
                <div className="kds-col-reorder kds-reorder-wrap">
                  {pendingItemsForTab.length > 1 && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); moveItem(index, 'up'); }}
                        disabled={index === 0}
                        className="kds-reorder-btn"
                        aria-label="Mover arriba"
                      >▲</button>
                      <button
                        onClick={e => { e.stopPropagation(); moveItem(index, 'down'); }}
                        disabled={index === pendingItemsForTab.length - 1}
                        className="kds-reorder-btn"
                        aria-label="Mover abajo"
                      >▼</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: KDS_STYLES }} />
    </div>
  );
}

const KDS_STYLES = `
  .kds-root {
    min-height: 100dvh;
    background-color: var(--background);
    color: var(--text-primary);
    font-family: 'Roboto', -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  /* ── HEADER ── */
  .kds-header {
    position: sticky;
    top: 0;
    z-index: 100;
    height: 48px;
    background: var(--primary-gradient);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    flex-shrink: 0;
  }
  .kds-header-left { display: flex; align-items: center; gap: 8px; }
  .kds-header-right { display: flex; align-items: center; gap: 8px; }
  .kds-logo { border-radius: 50%; flex-shrink: 0; }
  .kds-brand { font-size: 1rem; font-weight: 700; color: white; letter-spacing: 0.3px; }
  .kds-dot-loading {
    width: 8px; height: 8px; border-radius: 50%;
    background: #fbbf24; animation: kdsPulse 1s infinite;
  }
  @keyframes kdsPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .kds-icon-btn {
    background: rgba(255,255,255,0.18); border: none; border-radius: 50%;
    color: white; cursor: pointer; width: 32px; height: 32px; min-height: auto;
    display: flex; align-items: center; justify-content: center; padding: 0;
  }
  .kds-icon-btn:active { background: rgba(255,255,255,0.3); }
  .kds-count-badge {
    background: rgba(255,255,255,0.22); color: white;
    font-size: 0.85rem; font-weight: 700;
    padding: 3px 10px; border-radius: 12px;
  }

  /* ── SPLASH ── */
  .kds-splash {
    flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .kds-splash-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 16px; padding: 32px 24px;
    max-width: 340px; width: 100%; text-align: center;
    box-shadow: var(--card-shadow);
  }
  .kds-splash-icon { font-size: 3rem; margin-bottom: 14px; }
  .kds-splash-title { font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
  .kds-splash-sub { font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 22px; line-height: 1.5; }
  .kds-splash-btn {
    background: var(--primary-gradient); color: white; border: none;
    border-radius: 10px; padding: 13px 24px; font-size: 0.95rem;
    font-weight: 700; cursor: pointer; width: 100%;
    box-shadow: 0 4px 14px rgba(16,185,129,0.3);
    transition: opacity 0.15s;
  }
  .kds-splash-btn:active { opacity: 0.85; }

  /* ── BODY / TABS ── */
  .kds-body { flex: 1; display: flex; flex-direction: column; }

  .kds-tabs {
    display: flex; background: var(--card-bg);
    border-bottom: 1px solid var(--surface-border);
    position: sticky; top: 48px; z-index: 90;
    overflow-x: auto; scrollbar-width: none;
  }
  .kds-tabs::-webkit-scrollbar { display: none; }

  .kds-tab {
    flex: 1; min-width: 80px; padding: 10px 8px;
    font-size: 0.85rem; font-weight: 600;
    border: none; border-bottom: 3px solid transparent;
    background: transparent; color: var(--text-secondary);
    cursor: pointer; white-space: nowrap;
    transition: all 0.15s; min-height: auto;
    letter-spacing: 0.2px; display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  .kds-tab:active { background: var(--surface); }
  .kds-tab-active {
    color: var(--primary) !important;
    border-bottom-color: var(--primary) !important;
    font-weight: 700 !important;
    background: var(--primary-surface) !important;
  }

  /* ── TABLE ── */
  .kds-table-wrap { flex: 1; }

  .kds-thead, .kds-row {
    display: grid;
    grid-template-columns: 36px 44px 1fr 80px 60px 32px;
    align-items: center;
    padding: 0 10px;
    gap: 6px;
  }

  .kds-thead {
    position: sticky; top: 87px; z-index: 80;
    background: var(--surface);
    border-bottom: 1px solid var(--surface-border);
    padding: 6px 10px;
    font-size: 0.75rem; font-weight: 700;
    color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;
    min-height: 26px;
  }

  .kds-row {
    border-bottom: 1px solid var(--surface-border);
    border-left: 4px solid transparent;
    min-height: 32px;
    transition: background 0.1s;
    background: var(--background);
  }
  .kds-row:nth-child(even) { background: var(--surface); }
  .kds-row:active { background: var(--primary-surface) !important; }
  .kds-row-urgent { background: rgba(239,68,68,0.08) !important; }
  .kds-row-old { background: rgba(245,158,11,0.07) !important; }

  /* ── CELL ELEMENTS ── */
  .kds-check { display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .kds-check-circle {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid var(--surface-border);
    display: flex; align-items: center; justify-content: center;
    color: var(--text-muted);
    transition: all 0.15s;
  }
  .kds-check:active .kds-check-circle { background: var(--primary); border-color: var(--primary); color: white; }

  .kds-qty { font-size: 0.78rem; font-weight: 800; color: var(--primary); }

  .kds-item-info { overflow: hidden; }
  .kds-item-name {
    font-size: 0.78rem; font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.1;
  }
  .kds-item-notes {
    font-size: 0.66rem; color: #ef4444;
    font-style: italic; line-height: 1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .kds-urgency-badge {
    margin-left: 4px; font-size: 0.54rem; font-weight: 800;
    padding: 1px 3px; border-radius: 3px;
    background: rgba(239,68,68,0.15);
  }

  .kds-mesa-text { font-size: 0.68rem; color: var(--text-secondary); font-weight: 600; }

  .kds-time-block { text-align: right; line-height: 1; }
  .kds-time-block > div:first-child { font-size: 0.68rem; font-weight: 800; }
  .kds-elapsed { font-size: 0.6rem; font-weight: 600; }

  .kds-reorder-wrap { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .kds-reorder-btn {
    width: 20px; height: 12px; border: none; border-radius: 3px;
    background: var(--surface); color: var(--primary);
    cursor: pointer; font-size: 0.5rem; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    padding: 0; min-height: auto; transition: all 0.1s;
  }
  .kds-reorder-btn:hover { background: var(--primary-surface); }
  .kds-reorder-btn:active { background: var(--primary); color: white; }
  .kds-reorder-btn:disabled { opacity: 0.3; cursor: default; }

  /* ── HIDE cols on mobile ── */
  .kds-col-mesa { display: none !important; }
  .kds-col-time { }
  .kds-col-reorder { }

  @media (max-width: 600px) {
    .kds-thead, .kds-row {
      grid-template-columns: 28px 34px 1fr 48px 22px;
      min-height: 32px;
      padding: 3px 6px;
    }
    .kds-col-mesa { display: none !important; }
    .kds-item-name { font-size: 0.76rem; }
    .kds-qty { font-size: 0.76rem; }
    .kds-check-circle { width: 20px; height: 20px; }
  }

  @media (min-width: 481px) {
    .kds-col-mesa { display: block !important; }
    .kds-thead, .kds-row {
      grid-template-columns: 36px 44px 1fr 80px 60px 32px;
    }
  }

  /* ── TABLET (601-900px) — ultra compacto ── */
  @media (min-width: 601px) and (max-width: 900px) {
    .kds-header { height: 40px; }
    .kds-brand { font-size: 0.9rem; }
    .kds-tabs { top: 40px; }
    .kds-tab { font-size: 0.8rem; padding: 7px 6px; }
    .kds-thead { top: 75px; font-size: 0.66rem; padding: 4px 10px; min-height: 22px; }
    .kds-thead, .kds-row {
      grid-template-columns: 32px 40px 1fr 76px 54px 28px;
      padding: 4px 10px;
      gap: 6px;
      min-height: 38px;
    }
    .kds-check-circle { width: 24px; height: 24px; }
    .kds-qty { font-size: 0.84rem; }
    .kds-item-name { font-size: 0.83rem; }
    .kds-item-notes { font-size: 0.7rem; }
    .kds-mesa-text { font-size: 0.72rem; }
    .kds-time-block > div:first-child { font-size: 0.72rem; }
    .kds-elapsed { font-size: 0.62rem; }
    .kds-reorder-btn { width: 22px; height: 13px; font-size: 0.55rem; }
  }

  @media (min-width: 901px) {
    .kds-thead, .kds-row {
      grid-template-columns: 36px 44px 1fr 86px 60px 30px;
      min-height: 42px;
      padding: 4px 10px;
    }
    .kds-thead { padding: 5px 10px; }
    .kds-check-circle { width: 26px; height: 26px; }
    .kds-item-name { font-size: 0.88rem; }
    .kds-qty { font-size: 0.88rem; }
    .kds-mesa-text { font-size: 0.76rem; }
    .kds-time-block > div:first-child { font-size: 0.76rem; }
  }

  /* ── EMPTY ── */
  .kds-empty {
    text-align: center; padding: 48px 16px;
  }
  .kds-empty-icon { font-size: 2.5rem; margin-bottom: 8px; }
  .kds-empty-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
  .kds-empty-sub { font-size: 0.88rem; color: var(--text-muted); }

  html, body { overflow-y: auto !important; height: auto !important; }
`;
