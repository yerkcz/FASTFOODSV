"use client";

import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge } from "@/lib/timeUtils";
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
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Sonido desactivado a petición del usuario
    // audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders");
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

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
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
            headers: { "Content-Type": "application/json" },
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
  const pendingItemsForTab = orders.flatMap(order => 
    order.items
      .filter(item => !item.listo && categoryMatch(item.categoria, activeTab))
      .map(item => ({ ...item, orderCliente: order.cliente, ordenNu: order.orden_nu }))
  );

  const tabConfig = [
    { key: "Proceso de comandas" as const, label: "Comandas", icon: "🍳" },
    { key: "Bebidas Frías" as const, label: "Beb. Frías", icon: "🧊" },
    { key: "Bebidas Calientes" as const, label: "Beb. Calientes", icon: "☕" },
  ];

  if (!soundEnabled) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", fontFamily: 'Roboto, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <header className="kds-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Image src="/logoHide.png" alt="Hideaway KDS" width={32} height={32} style={{ borderRadius: '50%' }} priority />
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Monitor KDS</span>
          </div>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: 'white', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.10)', textAlign: 'center', maxWidth: '380px', width: '100%' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </div>
            <h2 style={{ fontSize: "1.25rem", color: "#202124", fontWeight: 700, marginBottom: '8px' }}>Monitor de Cocina</h2>
            <p style={{ color: "#5f6368", fontSize: "0.9rem", marginBottom: "28px", lineHeight: '1.6' }}>
              Toca el botón para iniciar el tablero en tiempo real y activar las alertas de nuevos pedidos.
            </p>
            <button 
              onClick={() => {
                setSoundEnabled(true);
                // audioRef.current?.play().catch(() => {});
              }}
              style={{ 
                padding: '14px 32px', fontSize: '0.95rem', 
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
    <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", fontFamily: "Roboto, sans-serif" }}>
      {/* TOP APP BAR */}
      <header className="kds-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Image src="/logoHide.png" alt="Hideaway" width={32} height={32} style={{ borderRadius: '50%' }} priority />
          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Monitor KDS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {loading && (
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fbbc04' }} />
          )}
          <div onClick={fetchOrders} style={{ cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.15)', borderRadius: '50%' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
          </div>
          <div style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: '20px', fontWeight: 600 }}>
            {pendingItemsForTab.length} pendiente{pendingItemsForTab.length !== 1 ? 's' : ''}
          </div>
        </div>
      </header>

      <div style={{ paddingTop: '56px', paddingBottom: '64px' }}>
        
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
            <div className="kds-col-notas">NOTAS</div>
            <div style={{ textAlign: 'right' }}>HORA</div>
          </div>

          {pendingItemsForTab.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#80868b" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dadce0" strokeWidth="1.5" style={{ marginBottom: '16px', display: 'block', margin: '0 auto 16px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#202124' }}>¡Todo al día!</div>
              <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>No hay pedidos pendientes en {activeTab}.</div>
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
                {/* LISTO button */}
                <div
                  onClick={() => toggleItemReady(item.id)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <div style={{ 
                    width: '30px', height: '30px', borderRadius: '50%', 
                    border: `2px solid ${isUrgent ? '#d93025' : '#dadce0'}`,
                    backgroundColor: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? '#d93025' : '#9aa0a6'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                </div>

                {/* CANTIDAD */}
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1a73e8' }}>
                  {item.cantidad}×
                </div>

                {/* ARTÍCULO */}
                <div>
                  <div style={{ fontSize: '0.9375rem', color: '#202124', fontWeight: 600, lineHeight: 1.3 }}>
                    {item.articulo}
                    {urgencyBadge && (
                      <span style={{ 
                        marginLeft: '8px', fontSize: '0.7rem', fontWeight: 800,
                        background: isUrgent ? '#fce8e6' : '#fef3e2',
                        color: timeColor, padding: '2px 6px', borderRadius: '4px',
                        verticalAlign: 'middle', whiteSpace: 'nowrap'
                      }}>
                        {urgencyBadge}
                      </span>
                    )}
                  </div>
                  {item.notas && (
                    <div style={{ fontSize: '0.78rem', color: '#d93025', marginTop: '2px', fontStyle: 'italic' }}>
                      📝 {item.notas}
                    </div>
                  )}
                </div>

                {/* MESA */}
                <div className="kds-col-mesa" style={{ fontSize: '0.875rem', color: '#5f6368', fontWeight: 500 }}>
                  {item.mesa || item.orderCliente || '—'}
                </div>

                {/* NOTAS — visible on larger screens */}
                <div className="kds-col-notas" style={{ fontSize: '0.75rem', color: '#d93025', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.notas || '—'}
                </div>

                {/* HORA with time-based color */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.875rem', color: timeColor, fontWeight: 800 }}>
                    {formatTime(item.hora_registro)}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', color: timeColor, fontWeight: 600,
                    background: elapsed >= 30 ? `${timeColor}18` : 'transparent',
                    padding: elapsed >= 30 ? '1px 4px' : '0',
                    borderRadius: '4px',
                    display: 'inline-block'
                  }}>
                    {elapsed} min
                  </div>
                </div>
              </div>
            );
          })}

          {/* Count footer */}
          {pendingItemsForTab.length > 0 && (
            <div style={{ padding: '12px 16px', fontSize: '0.8125rem', color: '#5f6368', fontWeight: 500, textAlign: 'center', backgroundColor: '#f8f9fa', borderTop: '1px solid #e0e0e0' }}>
              {pendingItemsForTab.length} pedido{pendingItemsForTab.length !== 1 ? 's' : ''} pendiente{pendingItemsForTab.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav className="kds-bottom-nav">
        <Link href="/mesas" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg>
          <span>Mesas</span>
        </Link>
        <div className="kds-nav-item kds-nav-active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={CHEF_ICON}/></svg>
          <span>Monitor</span>
        </div>
        <Link href="/inicio" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Inicio</span>
        </Link>
        <Link href="/bebidas-frias" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v4M12 2v4M6 6h12l-1 14H7L6 6z"/></svg>
          <span>Bebidas</span>
        </Link>
        <Link href="/entregados" className="kds-nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>
          <span>Entregas</span>
        </Link>
      </nav>

      <style dangerouslySetInnerHTML={{__html: KDS_STYLES}} />
    </div>
  );
}

// CSS in JS for KDS — using real CSS classes for robust media queries
const KDS_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
  body { margin: 0; background-color: #f3f4f6; }

  /* Header */
  .kds-header {
    position: fixed; top: 0; left: 0; right: 0; height: 56px;
    background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
    color: white; display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px;
    box-shadow: 0 2px 8px rgba(26,115,232,0.4);
    z-index: 1000;
    font-family: Roboto, sans-serif;
  }

  /* Tabs */
  .kds-tabs {
    display: flex; overflow-x: auto;
    background: white; border-bottom: 1px solid #e0e0e0;
    position: sticky; top: 56px; z-index: 900;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .kds-tabs::-webkit-scrollbar { display: none; }

  .kds-tab {
    flex: 1; min-width: 90px; padding: 14px 8px;
    font-size: 0.8125rem; font-weight: 500;
    border: none; white-space: nowrap; cursor: pointer;
    border-bottom: 4px solid transparent;
    background: white; color: #5f6368;
    transition: all 0.2s;
    text-transform: uppercase; letter-spacing: 0.5px;
    font-family: Roboto, sans-serif;
  }
  .kds-tab:active { background: #f8f9fa; }
  .kds-tab-active {
    border-bottom-color: #1a73e8 !important;
    color: #1a73e8 !important;
    font-weight: 700 !important;
    background: #f0f6ff !important;
  }

  /* Table header — full width, 6 columns */
  .kds-table-header {
    display: grid;
    grid-template-columns: 44px 50px 1fr 80px 100px 72px;
    padding: 10px 12px;
    background: #f8f9fa;
    border-bottom: 1px solid #e0e0e0;
    font-size: 0.6875rem; color: #5f6368;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    position: sticky; top: 105px; z-index: 800;
    font-family: Roboto, sans-serif;
  }

  /* Table row */
  .kds-table-row {
    display: grid;
    grid-template-columns: 44px 50px 1fr 80px 100px 72px;
    padding: 12px 12px;
    align-items: center;
    border-bottom: 1px solid #f1f3f4;
    transition: background 0.2s;
    font-family: Roboto, sans-serif;
  }
  .kds-table-row:active { background: #f0f6ff !important; }

  /* Bottom nav */
  .kds-bottom-nav {
    position: fixed; bottom: 0; left: 0; right: 0; height: 60px;
    background: white; border-top: 1px solid #e0e0e0;
    display: flex; justify-content: space-around; align-items: center;
    z-index: 1000; box-shadow: 0 -1px 6px rgba(0,0,0,0.06);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .kds-nav-item {
    display: flex; flex-direction: column; align-items: center;
    color: #5f6368; text-decoration: none;
    font-size: 0.68rem; font-weight: 500; gap: 2px;
    padding: 4px 8px; border-radius: 8px; transition: all 0.15s;
    font-family: Roboto, sans-serif;
    min-width: 44px;
  }
  .kds-nav-active {
    color: #1a73e8 !important;
    background: #e8f0fe;
  }

  /* Mobile: collapse NOTAS and MESA columns */
  @media (max-width: 600px) {
    .kds-table-header,
    .kds-table-row {
      grid-template-columns: 44px 44px 1fr 0 0 68px;
    }
    .kds-col-mesa,
    .kds-col-notas {
      display: none !important;
    }
    .kds-tab {
      min-width: 80px;
      padding: 12px 6px;
      font-size: 0.75rem;
    }
  }

  /* Tablet (601-900px): show mesa, hide notas */
  @media (min-width: 601px) and (max-width: 900px) {
    .kds-table-header,
    .kds-table-row {
      grid-template-columns: 44px 50px 1fr 90px 0 80px;
    }
    .kds-col-notas {
      display: none !important;
    }
  }

  /* Large desktop: full table */
  @media (min-width: 901px) {
    .kds-table-header,
    .kds-table-row {
      grid-template-columns: 44px 56px 1fr 100px 120px 80px;
    }
  }
`;
