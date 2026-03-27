"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge, getElapsedLabel, parseHora } from "@/lib/timeUtils";

const CHEF_ICON = "M12 3c-1.2 5.4-6 6-6 12h12c0-6-4.8-6.6-6-12zM6 17h12M10 21v-4M14 21v-4";

type Table = {
    orden_nu: string;
    cliente: string;
    mesa: string | null;
    fecha: string;
    estado: string;
    total: number;
};

type OrderItem = {
    ID: string;
    ARTICULO: string;
    CANTIDAD: number;
    PRECIO: number;
    TOTAL: number;
    NOTAS: string;
    LISTO: boolean;
    HoraRegistro: string;
    FechaRegistro: string;
};

function formatColones(amount: number): string {
    const rounded = Math.round(amount).toString();
    return "\u20A1" + rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Strip "Mesa " prefix from a cliente name to avoid "Mesa Mesa X" display bug.
 * Happens when admin saves cliente = mesa number and display prepends "Mesa" again.
 */
function stripMesaPrefix(s: string | null | undefined): string {
    if (!s) return '';
    // Strip "Mesa X - " or "X - " where X is a number
    const noPrefix = s.replace(/^(?:Mesa\s*)?\d+\s*-\s*/i, '');
    // Strip just "Mesa "
    return noPrefix.replace(/^Mesa\s+/i, '').trim();
}

// Time utils imported from @/lib/timeUtils — formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge, getElapsedLabel, parseHora

export default function MesasPage() {
    const [tables, setTables] = useState<Table[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<Table | null>(null);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [markingListo, setMarkingListo] = useState<string | null>(null);
    
    // Checkout state
    const [paymentMethod, setPaymentMethod] = useState<"Efectivo" | "Tarjeta" | "Sinpe">("Efectivo");
    const [amountReceived, setAmountReceived] = useState("");
    const [closing, setClosing] = useState(false);

    // Polling ref for open order detail
    const detailPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const API_KEY = process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY || "";

    const fetchTables = useCallback(async () => {
        try {
            const res = await fetch("/api/tables", { headers: { "x-api-key": API_KEY } });
            if (res.ok) {
                const data = await res.json();
                setTables(data.tables);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [API_KEY]);

    useEffect(() => {
        fetchTables();
        const interval = setInterval(fetchTables, 10000);
        return () => clearInterval(interval);
    }, [fetchTables]);

    const openOrder = async (table: Table) => {
        setSelectedOrder(table);
        setLoadingDetails(true);
        setPaymentMethod("Efectivo");
        setAmountReceived("");
        try {
            const res = await fetch(`/api/admin/table-details?orden_nu=${table.orden_nu}`, {
                headers: { "x-admin-key": "admin123" }
            });
            if (res.ok) {
                const data = await res.json();
                setOrderItems(data.items);
            }
        } catch (err) { console.error(err); }
        finally { setLoadingDetails(false); }
    };

    const refreshOrderDetails = useCallback(async (table: Table) => {
        try {
            const res = await fetch(`/api/admin/table-details?orden_nu=${table.orden_nu}`, {
                headers: { "x-admin-key": "admin123" }
            });
            if (res.ok) {
                const data = await res.json();
                setOrderItems(data.items);
            }
        } catch (err) { }
    }, []);

    useEffect(() => {
        if (detailPollRef.current) clearInterval(detailPollRef.current);
        if (selectedOrder) {
            detailPollRef.current = setInterval(() => {
                refreshOrderDetails(selectedOrder);
            }, 5000);
        }
        return () => {
            if (detailPollRef.current) clearInterval(detailPollRef.current);
        };
    }, [selectedOrder, refreshOrderDetails]);

    const toggleListo = async (itemId: string) => {
        setMarkingListo(itemId);
        try {
            const res = await fetch("/api/kitchen/mark-ready", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId })
            });
            if (res.ok) {
                setOrderItems(prev => prev.map(i => i.ID === itemId ? { ...i, LISTO: !i.LISTO } : i));
            }
        } catch (err) { console.error(err); }
        finally { setMarkingListo(null); }
    };

    const closeOrder = async () => {
        if (!selectedOrder) return;
        const itemsTotal = orderItems.reduce((s, i) => s + Number(i.TOTAL || 0), 0);
        const total = Math.round(itemsTotal * 1.1);
        
        if (paymentMethod === "Efectivo") {
            const recv = Number(amountReceived) || 0;
            if (recv < total) {
                alert(`Monto recibido (₡${recv}) es menor al total (₡${total}).`);
                return;
            }
        }

        setClosing(true);
        try {
            const res = await fetch("/api/admin/close-table", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": "admin123" },
                body: JSON.stringify({
                    ordenNu: selectedOrder.orden_nu,
                    forma_pago: paymentMethod,
                    recibido: paymentMethod === "Efectivo" ? Number(amountReceived) : total
                })
            });
            if (res.ok) {
                setSelectedOrder(null);
                fetchTables();
            } else {
                alert("Error al cerrar");
            }
        } catch (err) { alert("Error de conexión"); }
        finally { setClosing(false); }
    };

    // Detail view
    if (selectedOrder) {
        const itemsTotal = orderItems.reduce((s, i) => s + Number(i.TOTAL || 0), 0);
        const serviceCharge = Math.round(itemsTotal * 0.1);
        const totalFinal = itemsTotal + serviceCharge;
        const vuelto = paymentMethod === "Efectivo" ? Math.max(0, (Number(amountReceived) || 0) - totalFinal) : 0;

        return (
            <div style={{ minHeight: '100dvh', backgroundColor: '#f3f4f6', fontFamily: 'Roboto, sans-serif' }}>
                <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: 'white', display: 'flex', alignItems: 'center', gap: '16px', padding: '0 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', zIndex: 1000 }}>
                    <div onClick={() => setSelectedOrder(null)} style={{ cursor: 'pointer' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1.1rem', color: '#202124', fontWeight: 500 }}>
                            {selectedOrder.mesa ? `Mesa ${stripMesaPrefix(selectedOrder.mesa)}` : ''}{selectedOrder.cliente && stripMesaPrefix(selectedOrder.cliente) ? ` — ${stripMesaPrefix(selectedOrder.cliente)}` : ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#5f6368' }}>#{selectedOrder.orden_nu}</div>
                    </div>
                    <div style={{ color: '#1a73e8', fontWeight: 600, fontSize: '1.1rem' }}>{formatColones(totalFinal)}</div>
                </header>

                <div style={{ paddingTop: '64px', paddingBottom: '280px', padding: '64px 12px 280px' }}>
                    {/* Date & Status */}
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#5f6368' }}>Apertura de Orden</div>
                            <div style={{ fontSize: '0.95rem', color: '#202124', fontWeight: 600 }}>
                                {new Date(selectedOrder.fecha).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' })}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            {/* Live sync dot */}
                            <div title="Actualizando en tiempo real" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#25d366', animation: 'pulse 2s ease-in-out infinite' }} />
                            {/* Elapsed time badge colored by format rule */}
                            <div style={{ 
                                color: getTimeColor(selectedOrder.fecha), 
                                fontWeight: 800, fontSize: '1rem', 
                                background: getTimeBg(selectedOrder.fecha) !== 'transparent' ? getTimeBg(selectedOrder.fecha) : '#f8f9fa', 
                                padding: '6px 12px', borderRadius: '16px',
                                border: `1.5px solid ${getTimeColor(selectedOrder.fecha)}`,
                                display: 'flex', alignItems: 'center', gap: '5px'
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                {getElapsedLabel(selectedOrder.fecha)}
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    {loadingDetails ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#5f6368' }}>Cargando...</div>
                    ) : (
                        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                            <div style={{ padding: '10px 16px', backgroundColor: '#e8f0fe', color: '#1a73e8', fontSize: '0.8rem', fontWeight: 500 }}>
                                Pedidos ({orderItems.length})
                            </div>
                            {/* Table Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 72px 64px', padding: '8px 12px', fontSize: '0.68rem', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '2px solid #e8eaed', fontWeight: 700 }}>
                                <span>✓</span><span>Artículo</span><span>Cant.</span><span>Hora</span><span style={{ textAlign: 'right' }}>Total</span>
                            </div>
                            {orderItems.map(item => {
                                const timeColor = !item.LISTO ? getTimeColor(item.HoraRegistro || item.FechaRegistro) : '#1e8e3e';
                                const timeBg = !item.LISTO ? getTimeBg(item.HoraRegistro || item.FechaRegistro) : 'transparent';
                                const badge = !item.LISTO ? getUrgencyBadge(item.HoraRegistro || item.FechaRegistro) : null;
                                const elapsed = !item.LISTO ? getElapsedMins(item.HoraRegistro || item.FechaRegistro) : 0;
                                return (
                                <div key={item.ID} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 72px 64px', padding: '12px', alignItems: 'center', borderBottom: '1px solid #f8f9fa', borderLeft: `4px solid ${timeColor}`, backgroundColor: timeBg !== 'transparent' ? timeBg : undefined, transition: 'background 0.2s' }}>
                                    <button 
                                        onClick={() => toggleListo(item.ID)}
                                        disabled={markingListo === item.ID}
                                        style={{ 
                                            width: '32px', height: '32px', borderRadius: '50%',
                                            border: `2px solid ${item.LISTO ? '#1e8e3e' : '#dadce0'}`,
                                            backgroundColor: item.LISTO ? '#1e8e3e' : 'white',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            padding: 0, flexShrink: 0
                                        }}
                                    >
                                        {item.LISTO
                                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                          : markingListo === item.ID
                                            ? <span style={{ fontSize: '0.6rem' }}>...</span>
                                            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                        }
                                    </button>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.9rem', color: '#202124', fontWeight: 600 }}>
                                          {item.ARTICULO}
                                          {badge && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: elapsed >= 40 ? '#fce8e6' : '#fef3e2', color: timeColor, padding: '1px 4px', borderRadius: '3px', fontWeight: 800 }}>{badge}</span>}
                                        </div>
                                        {item.NOTAS && <div style={{ fontSize: '0.75rem', color: '#d93025', fontStyle: 'italic', marginTop: '2px' }}>📝 {item.NOTAS}</div>}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#5f6368', textAlign: 'center', fontWeight: 600 }}>{item.CANTIDAD}</div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.78rem', color: timeColor, fontWeight: 800 }}>{formatTime(item.HoraRegistro || item.FechaRegistro)}</div>
                                        {!item.LISTO && <div style={{ fontSize: '0.68rem', color: timeColor }}>{elapsed}m</div>}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#202124', textAlign: 'right', fontWeight: 600 }}>{formatColones(Number(item.TOTAL))}</div>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Checkout Footer */}
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTop: '1px solid #e0e0e0', padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '0.85rem', color: '#5f6368', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{formatColones(itemsTotal)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Servicio 10%</span><span>{formatColones(serviceCharge)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#202124', fontSize: '1.1rem', borderTop: '1px solid #e0e0e0', paddingTop: '6px', marginTop: '4px' }}><span>Total</span><span>{formatColones(totalFinal)}</span></div>
                    </div>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                        {(["Efectivo", "Tarjeta", "Sinpe"] as const).map(m => (
                            <button key={m} onClick={() => { setPaymentMethod(m); if (m !== 'Efectivo') setAmountReceived(String(totalFinal)); else setAmountReceived(''); }}
                                style={{ flex: '1 1 80px', padding: '8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', border: '1px solid', minHeight: '44px', ...(paymentMethod === m ? { backgroundColor: '#e8f0fe', color: '#1a73e8', borderColor: '#1a73e8' } : { backgroundColor: 'white', color: '#5f6368', borderColor: '#dadce0' }) }}
                            >{m}</button>
                        ))}
                    </div>
                    
                    {paymentMethod === "Efectivo" && (
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', alignItems: 'center' }}>
                            <input type="number" placeholder="Monto recibido" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
                                min="0"
                                style={{ flex: 1, padding: '8px', border: '1px solid #dadce0', borderRadius: '4px', fontSize: '1rem' }} />
                            {vuelto > 0 && <div style={{ color: '#34a853', fontWeight: 600 }}>Vuelto: {formatColones(vuelto)}</div>}
                        </div>
                    )}
                    
                    <button onClick={closeOrder} disabled={closing} style={{ width: '100%', padding: '12px', backgroundColor: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', textTransform: 'uppercase' }}>
                        {closing ? 'Procesando...' : `Cobrar ${formatColones(totalFinal)} y Cerrar`}
                    </button>
                </div>
            </div>
        );
    }

    // Cards list view
    return (
        <div style={{ minHeight: "100dvh", backgroundColor: "#f3f4f6", fontFamily: 'Roboto, sans-serif' }}>
            <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: '#f9ab00', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1000 }}>
                <Link href="/inicio" style={{ color: 'white', display: 'flex' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></Link>
                <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>Mesas en Servicio</div>
                <div onClick={fetchTables} style={{ cursor: 'pointer' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg></div>
            </header>

            <div style={{ paddingTop: '70px', paddingBottom: '70px', padding: '70px 16px 70px', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Órdenes Activas</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 400, color: '#202124' }}>{tables.length}</div>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[1,2,3].map(i => (
                            <div key={i} className="skeleton skeleton-row" style={{ borderRadius: '8px', width: '100%' }} />
                        ))}
                    </div>
                ) : tables.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#80868b' }}>No hay mesas en servicio.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {tables.map(t => {
                            const tColor = getTimeColor(t.fecha);
                            const tBg = getTimeBg(t.fecha);
                            const tBadge = getUrgencyBadge(t.fecha);
                            return (
                            <div key={t.orden_nu} onClick={() => openOrder(t)} style={{ backgroundColor: tBg !== 'transparent' ? tBg : 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', cursor: 'pointer', position: 'relative', borderLeft: `4px solid ${tColor}` }}>
                                <div style={{ padding: '14px 16px 14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '1rem', color: '#202124', fontWeight: 600 }}>
                                            {t.mesa ? `Mesa ${stripMesaPrefix(t.mesa)}` : ''}{stripMesaPrefix(t.cliente) ? ` — ${stripMesaPrefix(t.cliente)}` : ''}
                                            {tBadge && <span style={{ marginLeft: '8px', fontSize: '0.68rem', color: tColor, fontWeight: 800 }}>{tBadge}</span>}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#5f6368', marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ color: '#80868b' }}>{formatTime(t.fecha)}</span>
                                            <span style={{ 
                                                color: tColor, fontWeight: 700, 
                                                background: tBg !== 'transparent' ? 'rgba(255,255,255,0.7)' : '#f8f9fa',
                                                padding: '2px 8px', borderRadius: '10px',
                                                border: `1px solid ${tColor}`,
                                                fontSize: '0.8rem',
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                {getElapsedLabel(t.fecha)}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#202124' }}>{formatColones(t.total)}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#1e8e3e', marginTop: '2px' }}>Abierta →</div>
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Bottom Nav */}
            <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 1000, fontSize: '0.68rem', boxShadow: '0 -1px 6px rgba(0,0,0,0.06)', paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: '4px', minHeight: '60px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#f9ab00', minWidth: '44px', minHeight: '44px', justifyContent: 'center', borderRadius: '8px', background: '#fef9e7' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg>
                    <span style={{ marginTop: '2px', fontWeight: 700 }}>Mesas</span>
                </div>
                <Link href="/cocina" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#5f6368', textDecoration: 'none', minWidth: '44px', minHeight: '44px', justifyContent: 'center', borderRadius: '8px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={CHEF_ICON}/></svg>
                    <span style={{ marginTop: '2px' }}>Cocina</span>
                </Link>
                <Link href="/inicio" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#5f6368', textDecoration: 'none', minWidth: '44px', minHeight: '44px', justifyContent: 'center', borderRadius: '8px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    <span style={{ marginTop: '2px' }}>Inicio</span>
                </Link>
                <Link href="/bebidas-frias" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#5f6368', textDecoration: 'none', minWidth: '44px', minHeight: '44px', justifyContent: 'center', borderRadius: '8px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v4M12 2v4M6 6h12l-1 14H7L6 6z"/></svg>
                    <span style={{ marginTop: '2px' }}>Bebidas</span>
                </Link>
                <Link href="/entregados" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#5f6368', textDecoration: 'none', minWidth: '44px', minHeight: '44px', justifyContent: 'center', borderRadius: '8px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>
                    <span style={{ marginTop: '2px' }}>Entregas</span>
                </Link>
            </nav>
        </div>
    );
}
