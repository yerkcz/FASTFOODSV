"use client";

import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge } from "@/lib/timeUtils";
import { useAdaptivePolling } from "@/lib/useAdaptivePolling";
const CHEF_ICON = "M12 3c-1.2 5.4-6 6-6 12h12c0-6-4.8-6.6-6-12zM6 17h12M10 21v-4M14 21v-4";

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
  const API_KEY = process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY || "";
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Sonido desactivado a petición del usuario
    // audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders", { headers: { "x-api-key": API_KEY } });
      if (res.ok) {
        const data = await res.json();
        const newTotalPendingItems = data.orders.reduce((acc: number, o: Order) => 
            acc + o.items.filter(i => !i.listo).length, 0);

        if (soundEnabled && newTotalPendingItems > lastOrdersCount && lastOrdersCount !== 0) {
            // audioRef.current?.play().catch(console.error);
        }
        
        setLastOrdersCount(newTotalPendingItems);
        setOrders(data.orders);
      }
    } catch (err) {
      console.error("Error fetching KDS", err);
    } finally {
      setLoading(false);
    }
  }, [lastOrdersCount, soundEnabled]);

  // Fetch inicial
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const toggleItemReady = async (itemId: string) => {
    // Optimistic update: remove item immediately
    setOrders(prev => prev.map(order => ({
      ...order,
      items: order.items.filter(item => item.id !== itemId)
    })).filter(order => order.items.length > 0));

    try {
        await fetch("/api/kitchen/mark-ready", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
            body: JSON.stringify({ itemId })
        });
        setTimeout(fetchOrders, 500);
    } catch (err) {
        console.error(err);
        fetchOrders();
    }
  };

  // Category matching for tabs (matching AppSheet Slices)
  const categoryMatch = (catStr: string, tab: string) => {
    if (tab === "Proceso de comandas") return catStr?.includes("Cocina") || catStr?.includes("Platos") || catStr?.includes("Acompaña") || catStr?.includes("Panadería") || catStr?.includes("Postres") || !catStr;
    if (tab === "Bebidas Frías") return catStr?.includes("Frias") || catStr?.includes("Frías") || catStr?.includes("Alcoholica") || catStr?.includes("Cerveza");
    if (tab === "Bebidas Calientes") return catStr?.includes("Calientes") || catStr?.includes("Café");
    return true;
  };

  // Filter all pending items for the active tab
  const pendingItemsRaw = orders.flatMap(order => 
    order.items
      .filter(item => !item.listo && categoryMatch(item.categoria, activeTab))
      .map(item => ({ ...item, orderCliente: order.cliente, ordenNu: order.orden_nu }))
  );

  // Polling adaptativo: 5s activo, 15s idle, 30s background
  useAdaptivePolling(fetchOrders, {
    activeIntervalMs: 5000,
    idleIntervalMs: 15000,
    backgroundIntervalMs: 30000,
    hasActiveData: pendingItemsRaw.length > 0,
  });

  // Apply custom order if set
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

  // Reset custom order when tab changes
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
    { key: "Bebidas Calientes" as const, label: "Beb. Calientes", icon: "☕" },
  ];

  if (!soundEnabled) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", fontFamily: 'Roboto, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <header className="kds-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Image src="/logoHide.png" alt="Hideaway KDS" width={24} height={24} style={{ borderRadius: '50%' }} priority />
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>KDS</span>
          </div>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: 'white', padding: '28px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.10)', textAlign: 'center', maxWidth: '340px', width: '100%' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </div>
            <h2 style={{ fontSize: "1.1rem", color: "#202124", fontWeight: 700, marginBottom: '6px' }}>Monitor de Cocina</h2>
            <p style={{ color: "#5f6368", fontSize: "0.85rem", marginBottom: "20px", lineHeight: '1.5' }}>
              Toca para iniciar el tablero en tiempo real.
            </p>
            <button 
              onClick={() => {
                setSoundEnabled(true);
              }}
              style={{ 
                padding: '12px 24px', fontSize: '0.9rem', 
                background: 'linear-gradient(135deg, #1a73e8, #1557b0)',
                color: 'white', border: 'none', borderRadius: '8px', 
                cursor: 'pointer', fontWeight: 700, letterSpacing: '0.5px',
                boxShadow: '0 4px 14px rgba(26,115,232,0.3)',
                width: '100%'
              }}
            >
              🚀 Iniciar Tablero
            </button>
          </div>
        </div>
        <style dangerouslySetInnerHTML={{__html: KDS_STYLES}} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "#f3f4f6", fontFamily: "Roboto, sans-serif", overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {/* TOP APP BAR — ultra-compact */}
      <header className="kds-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Image src="/logoHide.png" alt="Hideaway" width={22} height={22} style={{ borderRadius: '50%' }} priority />
          <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>KDS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loading && (
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fbbc04' }} />
          )}
          <div onClick={fetchOrders} style={{ cursor: 'pointer', padding: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '50%' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
          </div>
          <div style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
            {pendingItemsForTab.length}
          </div>
        </div>
      </header>

      <div style={{ paddingTop: '32px', paddingBottom: '0px' }}>
        
        {/* CATEGORY TABS */}
        <div className="kds-tabs">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`kds-tab${activeTab === tab.key ? ' kds-tab-active' : ''}`}
            >
              <span style={{ marginRight: '4px' }}>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        {/* TABLE VIEW */}
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          
          {/* Table Header */}
          <div className="kds-table-header">
            <div>LISTO</div>
            <div>CANT</div>
            <div>ARTÍCULO</div>
            <div className="kds-col-mesa">MESA</div>
            <div style={{ textAlign: 'right' }}>HORA</div>
            <div className="kds-col-reorder" style={{ textAlign: 'center' }}>⇅</div>
          </div>

          {pendingItemsForTab.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#80868b" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dadce0" strokeWidth="1.5" style={{ marginBottom: '8px', display: 'block', margin: '0 auto 8px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#202124' }}>¡Todo al día!</div>
              <div style={{ fontSize: '0.7rem', marginTop: '2px' }}>Sin pendientes en {activeTab}.</div>
            </div>
          )}

          {/* Table Rows */}
          {pendingItemsForTab.map((item, index) => {
            const elapsed = getElapsedMins(item.hora_registro);
            const timeColor = getTimeColor(item.hora_registro);
            const rowBg = getTimeBg(item.hora_registro);
            const urgencyBadge = getUrgencyBadge(item.hora_registro);
            const isUrgent = elapsed >= 40;

            return (
              <div
                key={item.id}
                className="kds-table-row"
                style={{
                  backgroundColor: rowBg !== 'transparent' ? rowBg : (index % 2 === 0 ? 'white' : '#fafafa'),
                  borderLeft: isUrgent ? '4px solid #d93025' : elapsed >= 35 ? '4px solid #e37400' : '4px solid transparent',
                }}
              >
                {/* LISTO */}
                <div onClick={() => toggleItemReady(item.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${isUrgent ? '#d93025' : '#dadce0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? '#d93025' : '#9aa0a6'} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </div>
                {/* CANT */}
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#1a73e8' }}>{item.cantidad}×</div>

                {/* ARTÍCULO */}
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.62rem', color: '#202124', fontWeight: 600, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.articulo}
                    {urgencyBadge && <span style={{ marginLeft: '2px', fontSize: '0.45rem', fontWeight: 800, background: isUrgent ? '#fce8e6' : '#fef3e2', color: timeColor, padding: '0 2px', borderRadius: '2px' }}>{urgencyBadge}</span>}
                  </div>
                  {item.notas && <div style={{ fontSize: '0.5rem', color: '#d93025', fontStyle: 'italic', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.notas}</div>}
                </div>

                {/* MESA */}
                <div className="kds-col-mesa" style={{ fontSize: '0.55rem', color: '#5f6368', fontWeight: 500 }}>{item.mesa || item.orderCliente || '—'}</div>
                {/* HORA */}
                <div style={{ textAlign: 'right', lineHeight: 1.0 }}>
                  <div style={{ fontSize: '0.55rem', color: timeColor, fontWeight: 800 }}>{formatTime(item.hora_registro)}</div>
                  <div style={{ fontSize: '0.45rem', color: timeColor, fontWeight: 600 }}>{elapsed}m</div>
                </div>

                {/* REORDER ARROWS */}
                <div className="kds-col-reorder" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}>
                  {pendingItemsForTab.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveItem(index, 'up'); }}
                        disabled={index === 0}
                        aria-label="Mover arriba"
                        className="reorder-btn"
                      >▲</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveItem(index, 'down'); }}
                        disabled={index === pendingItemsForTab.length - 1}
                        aria-label="Mover abajo"
                        className="reorder-btn"
                      >▼</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: KDS_STYLES}} />
    </div>
  );
}

// CSS in JS for KDS — using real CSS classes for robust media queries
const KDS_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
  body { margin: 0; background-color: #f3f4f6; }

  /* Header — ultra-compact */
  .kds-header {
    position: fixed; top: 0; left: 0; right: 0; height: 32px;
    background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
    color: white; display: flex; align-items: center; justify-content: space-between;
    padding: 0 8px;
    box-shadow: 0 1px 4px rgba(26,115,232,0.3);
    z-index: 1000;
    font-family: Roboto, sans-serif;
  }

  /* Tabs — minimal */
  .kds-tabs {
    display: flex; overflow-x: auto;
    background: white; border-bottom: 1px solid #e0e0e0;
    position: sticky; top: 32px; z-index: 900;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .kds-tabs::-webkit-scrollbar { display: none; }

  .kds-tab {
    flex: 1; min-width: 60px; padding: 4px 4px;
    font-size: 0.62rem; font-weight: 500;
    border: none; white-space: nowrap; cursor: pointer;
    border-bottom: 2px solid transparent;
    background: white; color: #5f6368;
    transition: all 0.1s;
    text-transform: uppercase; letter-spacing: 0.2px;
    font-family: Roboto, sans-serif;
    min-height: auto;
  }
  .kds-tab:active { background: #f8f9fa; }
  .kds-tab-active {
    border-bottom-color: #1a73e8 !important;
    color: #1a73e8 !important;
    font-weight: 700 !important;
    background: #f0f6ff !important;
  }

  /* ===== TABLE — 6 columns, ultra-dense spreadsheet ===== */

  .kds-table-row {
    display: grid;
    grid-template-columns: 24px 28px 1fr 60px 44px 22px;
    padding: 0px 6px;
    align-items: center;
    border-bottom: 1px solid #f1f3f4;
    transition: background 0.1s;
    font-family: Roboto, sans-serif;
    min-height: 20px;
  }
  .kds-table-row:active { background: #f0f6ff !important; }

  .kds-table-header {
    display: grid;
    grid-template-columns: 24px 28px 1fr 60px 44px 22px;
    padding: 1px 6px;
    background: #f8f9fa;
    border-bottom: 1px solid #e0e0e0;
    font-size: 0.48rem; color: #5f6368;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    position: sticky; top: 56px; z-index: 800;
    font-family: Roboto, sans-serif;
    min-height: 16px;
  }

  /* Reorder buttons — tiny */
  .reorder-btn {
    width: 18px; height: 12px; border: none; border-radius: 2px;
    background-color: #e8f0fe;
    color: #1a73e8;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.45rem; font-weight: 800; padding: 0;
    touch-action: manipulation;
    transition: all 0.1s;
    min-height: auto;
  }
  .reorder-btn:hover { background: #d2e3fc; }
  .reorder-btn:active { background: #1a73e8; color: white; }
  .reorder-btn:disabled {
    background: #f1f3f4;
    color: #bdc1c6;
    cursor: default;
  }

  /* ========== MOBILE / Small Tablet vertical (≤600px) ========== */
  @media (max-width: 600px) {
    .kds-header { height: 32px; }
    .kds-tabs { top: 32px; }
    .kds-table-header { top: 56px; }

    .kds-tab {
      min-width: 48px;
      padding: 3px 3px;
      font-size: 0.58rem;
    }
    .kds-table-header,
    .kds-table-row {
      grid-template-columns: 22px 24px 1fr 38px 20px;
      padding: 0px 3px;
    }
    .kds-col-mesa {
      display: none !important;
    }
    .kds-table-row { min-height: 22px; }
  }

  /* ========== Medium Tablet vertical (601-900px) ========== */
  @media (min-width: 601px) and (max-width: 900px) {
    .kds-table-header,
    .kds-table-row {
      grid-template-columns: 24px 28px 1fr 56px 44px 22px;
    }
  }

  /* ========== Large Desktop / PC monitor (≥901px) ========== */
  @media (min-width: 901px) {
    .kds-table-header,
    .kds-table-row {
      grid-template-columns: 28px 32px 1fr 72px 50px 24px;
      min-height: 22px;
    }
    .kds-table-header { min-height: 18px; }
  }

  /* Ensure full scroll on cocina body */
  html, body {
    overflow-y: auto !important;
    height: auto !important;
    -webkit-overflow-scrolling: touch;
  }
`;
