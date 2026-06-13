"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge, getElapsedLabel, parseHora } from "@/lib/timeUtils";

const CHEF_ICON = "M12 3c-1.2 5.4-6 6-6 12h12c0-6-4.8-6.6-6-12zM6 17h12M10 21v-4M14 21v-4";

type Table = {
    orden_nu: string;
    cliente: string;
    mesa: string | null;
    fecha: string;
    estado: string;
    total: number;
    tipo?: string;
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
    const router = useRouter();
    const [tables, setTables] = useState<Table[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<Table | null>(null);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [markingListo, setMarkingListo] = useState<string | null>(null);
    
    // Add Products Modal State
    const [showAddProducts, setShowAddProducts] = useState(false);
    const [menuProducts, setMenuProducts] = useState<any[]>([]);
    const [loadingMenu, setLoadingMenu] = useState(false);
    const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
    const [addingProducts, setAddingProducts] = useState(false);
    const [productSearch, setProductSearch] = useState("");
    const [targetOrdenNu, setTargetOrdenNu] = useState<string | null>(null);
    
    // Replace item state
    const [replacingItemId, setReplacingItemId] = useState<string | null>(null);
    const [replaceSearch, setReplaceSearch] = useState("");
    const [replaceMenuProducts, setReplaceMenuProducts] = useState<any[]>([]);
    const [loadingReplaceMenu, setLoadingReplaceMenu] = useState(false);
    const [replacingInProgress, setReplacingInProgress] = useState(false);
    const [replaceCantidad, setReplaceCantidad] = useState<number>(1);
    const [replaceNota, setReplaceNota] = useState<string>("");
    const [replaceCurrentName, setReplaceCurrentName] = useState<string>("");
    const [replaceSelectedProduct, setReplaceSelectedProduct] = useState<string | null>(null);
    
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
        // Push state so browser back returns to list, not exits /mesas
        window.history.pushState({ mesaDetail: true }, '', '/mesas');
        try {
            const res = await fetch(`/api/admin/table-details?orden_nu=${table.orden_nu}`, {
                headers: { "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "0000" }
            });
            if (res.ok) {
                const data = await res.json();
                setOrderItems(data.items);
            }
        } catch (err) { console.error(err); }
        finally { setLoadingDetails(false); }
    };

    // Handle browser back button: return to list instead of exiting /mesas
    useEffect(() => {
        const handlePopState = () => {
            if (selectedOrder) {
                setSelectedOrder(null);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [selectedOrder]);

    const refreshOrderDetails = useCallback(async (table: Table) => {
        try {
            const res = await fetch(`/api/admin/table-details?orden_nu=${table.orden_nu}`, {
                headers: { "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "0000" }
            });
            if (res.ok) {
                const data = await res.json();
                setOrderItems(data.items);
            }
        } catch (err) { }
    }, []);

    const openAddProductsModal = async (ordenNu?: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setTargetOrdenNu(ordenNu || selectedOrder?.orden_nu || null);
        setShowAddProducts(true);
        setLoadingMenu(true);
        setSelectedProducts([]);
        setProductSearch("");
        try {
            const res = await fetch("/api/menu", { headers: { "x-api-key": API_KEY } });
            if (res.ok) {
                const data = await res.json();
                if (data.products) setMenuProducts(data.products);
            }
        } catch (err) { console.error(err); }
        finally { setLoadingMenu(false); }
    };

    const addProductToSelection = (product: any) => {
        setSelectedProducts(prev => {
            const existing = prev.find(p => p.id === product.id);
            if (existing) {
                return prev.map(p => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, { ...product, quantity: 1, notes: "" }];
        });
    };

    const updateSelectedQty = (productId: string, delta: number) => {
        setSelectedProducts(prev => prev.map(p => {
            if (p.id === productId) {
                return { ...p, quantity: Math.max(0, p.quantity + delta) };
            }
            return p;
        }).filter(p => p.quantity > 0));
    };

    const submitAddedProducts = async () => {
        if (selectedProducts.length === 0 || !targetOrdenNu) return;
        setAddingProducts(true);
        try {
            const res = await fetch("/api/admin/add-items", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "0000" },
                body: JSON.stringify({
                    orden_nu: targetOrdenNu,
                    items: selectedProducts.map(p => ({ name: p.name, quantity: p.quantity, notes: p.notes || "" }))
                })
            });
            if (res.ok) {
                setShowAddProducts(false);
                setTargetOrdenNu(null);
                if (selectedOrder) refreshOrderDetails(selectedOrder);
                fetchTables();
            } else {
                const data = await res.json();
                alert(data.error || "Error al agregar productos");
            }
        } catch (err) { alert("Error de conexión"); }
        finally { setAddingProducts(false); }
    };

    // Replace item functions
    const openReplaceModal = async (itemId: string) => {
        setReplacingItemId(itemId);
        setReplaceSearch("");
        setReplaceCantidad(1);
        setReplaceNota("");
        setReplaceSelectedProduct(null);
        // Find the current item name to display in modal
        const currentItem = orderItems.find(i => i.ID === itemId);
        setReplaceCurrentName(currentItem?.ARTICULO || "");
        setLoadingReplaceMenu(true);
        try {
            const res = await fetch("/api/menu", { headers: { "x-api-key": API_KEY } });
            if (res.ok) {
                const data = await res.json();
                if (data.products) setReplaceMenuProducts(data.products);
            }
        } catch (err) { console.error(err); }
        finally { setLoadingReplaceMenu(false); }
    };

    const confirmReplace = async (newArticulo: string) => {
        if (!replacingItemId) return;
        setReplacingInProgress(true);
        try {
            const res = await fetch("/api/admin/replace-item", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "0000" },
                body: JSON.stringify({ 
                    itemId: replacingItemId, 
                    newArticulo,
                    cantidad: replaceCantidad,
                    nota: replaceNota || null
                })
            });
            if (res.ok) {
                setReplacingItemId(null);
                setReplaceCantidad(1);
                setReplaceNota("");
                if (selectedOrder) refreshOrderDetails(selectedOrder);
                fetchTables();
            } else {
                const data = await res.json();
                alert(data.error || "Error al reemplazar");
            }
        } catch (err) { alert("Error de conexión"); }
        finally { setReplacingInProgress(false); }
    };

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
        const total = Math.round(itemsTotal * (selectedOrder?.tipo === 'Llevar' ? 1.0 : 1.1));
        
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
                headers: { "Content-Type": "application/json", "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "0000" },
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
        const serviceCharge = Math.round(itemsTotal * (selectedOrder?.tipo === 'Llevar' ? 0 : 0.1));
        const totalFinal = itemsTotal + serviceCharge;
        const vuelto = paymentMethod === "Efectivo" ? Math.max(0, (Number(amountReceived) || 0) - totalFinal) : 0;

        return (
            <div style={{ minHeight: '100dvh', backgroundColor: '#f3f4f6', fontFamily: 'Roboto, sans-serif' }}>
                <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: 'white', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', zIndex: 1000 }}>
                    <div onClick={() => setSelectedOrder(null)} style={{ cursor: 'pointer' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1.1rem', color: '#202124', fontWeight: 500 }}>
                            {selectedOrder.mesa ? `Mesa ${stripMesaPrefix(selectedOrder.mesa)}` : ''}{selectedOrder.cliente && stripMesaPrefix(selectedOrder.cliente) ? ` — ${stripMesaPrefix(selectedOrder.cliente)}` : ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#5f6368' }}>#{selectedOrder.orden_nu}</div>
                    </div>
                    <button onClick={() => openAddProductsModal()} className="add-product-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        AGREGAR
                    </button>
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
                            <div style={{ padding: '10px 16px', backgroundColor: '#e8f0fe', color: '#1a73e8', fontSize: '0.8rem', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Pedidos ({orderItems.length})</span>
                                <span style={{ fontSize: '0.7rem', color: '#5f6368' }}>Toca 🔄 para reemplazar</span>
                            </div>
                            {/* Table Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 72px 44px 64px', padding: '8px 12px', fontSize: '0.68rem', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '2px solid #e8eaed', fontWeight: 700 }}>
                                <span>✓</span><span>Artículo</span><span>Cant.</span><span>Hora</span><span></span><span style={{ textAlign: 'right' }}>Total</span>
                            </div>
                            {orderItems.map(item => {
                                const timeColor = !item.LISTO ? getTimeColor(item.HoraRegistro || item.FechaRegistro) : '#1e8e3e';
                                const timeBg = !item.LISTO ? getTimeBg(item.HoraRegistro || item.FechaRegistro) : 'transparent';
                                const badge = !item.LISTO ? getUrgencyBadge(item.HoraRegistro || item.FechaRegistro) : null;
                                const elapsed = !item.LISTO ? getElapsedMins(item.HoraRegistro || item.FechaRegistro) : 0;
                                return (
                                <div key={item.ID} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 72px 44px 64px', padding: '12px', alignItems: 'center', borderBottom: '1px solid #f8f9fa', borderLeft: `4px solid ${timeColor}`, backgroundColor: timeBg !== 'transparent' ? timeBg : undefined, transition: 'background 0.2s' }}>
                                    <button 
                                        onClick={() => toggleListo(item.ID)}
                                        disabled={markingListo === item.ID}
                                        aria-label={item.LISTO ? `Marcar ${item.ARTICULO} como pendiente` : `Marcar ${item.ARTICULO} como listo`}
                                        style={{ 
                                            width: '44px', height: '44px', borderRadius: '50%',
                                            border: `2px solid ${item.LISTO ? '#1e8e3e' : '#dadce0'}`,
                                            backgroundColor: item.LISTO ? '#1e8e3e' : 'white',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            padding: 0, flexShrink: 0, touchAction: 'manipulation'
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
                                    {/* Replace button */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <button
                                            onClick={() => openReplaceModal(item.ID)}
                                            aria-label={`Reemplazar ${item.ARTICULO}`}
                                            style={{
                                                width: '36px', height: '36px', borderRadius: '8px',
                                                border: '1px solid #dadce0', backgroundColor: '#fff8e1',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '1rem', padding: 0, touchAction: 'manipulation'
                                            }}
                                            title="Reemplazar plato"
                                        >🔄</button>
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

                {/* Add Products Modal - Accesible */}
                {showAddProducts && (
                    <div 
                        role="dialog" 
                        aria-modal="true" 
                        aria-labelledby="modal-title"
                        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'flex-end' }} 
                        onClick={() => setShowAddProducts(false)}
                    >
                        <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '600px', margin: '0 auto', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '16px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div id="modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#202124' }}>Agregar Productos</div>
                                <button onClick={() => setShowAddProducts(false)} aria-label="Cerrar modal" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            </div>
                            <div style={{ padding: '12px', borderBottom: '1px solid #e0e0e0' }}>
                                <input 
                                    type="text" 
                                    placeholder="Buscar producto..." 
                                    value={productSearch} 
                                    onChange={e => setProductSearch(e.target.value)}
                                    aria-label="Buscar productos en el menu"
                                    autoFocus
                                    style={{ width: '100%', padding: '12px', fontSize: '1rem', border: '1px solid #dadce0', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }} 
                                />
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: '200px', maxHeight: '50vh' }} role="list" aria-label="Lista de productos">
                                {loadingMenu ? (
                                    <div role="status" style={{ textAlign: 'center', padding: '40px', color: '#5f6368' }}>Cargando menú...</div>
                                ) : menuProducts.filter(p => productSearch === "" || p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 ? (
                                    <div role="status" style={{ textAlign: 'center', padding: '40px', color: '#5f6368' }}>No se encontraron productos</div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                        {menuProducts.filter(p => productSearch === "" || p.name.toLowerCase().includes(productSearch.toLowerCase())).map((product: any) => (
                                            <div 
                                                key={product.id} 
                                                onClick={() => addProductToSelection(product)} 
                                                role="listitem"
                                                tabIndex={0}
                                                onKeyDown={(e) => e.key === 'Enter' && addProductToSelection(product)}
                                                style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '12px', cursor: 'pointer', border: '1px solid #e8eaed', transition: 'all 0.1s' }}
                                            >
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#202124', marginBottom: '4px', lineHeight: 1.2 }}>{product.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#137333', fontWeight: 700 }}>{formatColones(product.price)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {selectedProducts.length > 0 && (
                                <div style={{ backgroundColor: 'white', borderTop: '1px solid #e0e0e0', padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }}>
                                    <div style={{ marginBottom: '8px', maxHeight: '100px', overflowY: 'auto' }} role="list" aria-label="Productos seleccionados">
                                        {selectedProducts.map(p => (
                                            <div key={p.id} role="listitem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f3f4' }}>
                                                <div style={{ flex: 1, fontSize: '0.9rem', color: '#202124' }}>
                                                    <span style={{ fontWeight: 600 }}>{p.quantity}x</span> {p.name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button onClick={() => updateSelectedQty(p.id, -1)} aria-label={`Disminuir cantidad de ${p.name}`} style={{ width: '44px', height: '44px', minWidth: '44px', borderRadius: '50%', border: '1px solid #dadce0', backgroundColor: 'white', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>−</button>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{p.quantity}</span>
                                                    <button onClick={() => updateSelectedQty(p.id, 1)} aria-label={`Aumentar cantidad de ${p.name}`} style={{ width: '44px', height: '44px', minWidth: '44px', borderRadius: '50%', border: '1px solid #dadce0', backgroundColor: 'white', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>+</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={submitAddedProducts} disabled={addingProducts} aria-label={addingProducts ? 'Agregando productos' : `Agregar ${selectedProducts.reduce((s, p) => s + p.quantity, 0)} productos a la orden`} style={{ width: '100%', padding: '14px', backgroundColor: addingProducts ? '#ccc' : '#25d366', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 700, cursor: addingProducts ? 'default' : 'pointer' }}>
                                        {addingProducts ? 'Agregando...' : `Agregar ${selectedProducts.reduce((s, p) => s + p.quantity, 0)} items`}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Replace Item Modal */}
                {replacingItemId && (
                    <div 
                        role="dialog" 
                        aria-modal="true" 
                        aria-labelledby="replace-modal-title"
                        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'flex-end' }} 
                        onClick={() => setReplacingItemId(null)}
                    >
                        <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '600px', margin: '0 auto', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '16px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>🔄</span>
                                    <div>
                                        <div id="replace-modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#202124' }}>Reemplazar Plato</div>
                                        <div style={{ fontSize: '0.75rem', color: '#5f6368' }}>Selecciona el nuevo artículo y ajusta cantidad/nota</div>
                                    </div>
                                </div>
                                <button onClick={() => setReplacingItemId(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            </div>
                            
                            {/* Banner: artículo actual */}
                            {replaceCurrentName && (
                                <div style={{ padding: '10px 16px', backgroundColor: '#fff8e1', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#5f6368' }}>Reemplazando:</span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#b45309' }}>{replaceCurrentName}</span>
                                </div>
                            )}
                            
                            {/* Cantidad y Nota inputs — stack on mobile */}
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', color: '#5f6368', fontWeight: 500 }}>Cantidad:</label>
                                    <button 
                                        onClick={() => setReplaceCantidad(Math.max(1, replaceCantidad - 1))}
                                        style={{ width: '44px', height: '44px', border: '1px solid #dadce0', borderRadius: '8px', backgroundColor: '#f8f9fa', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 600, color: '#5f6368', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                                    >−</button>
                                    <span style={{ minWidth: '28px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, color: '#202124' }}>{replaceCantidad}</span>
                                    <button 
                                        onClick={() => setReplaceCantidad(replaceCantidad + 1)}
                                        style={{ width: '44px', height: '44px', border: '1px solid #dadce0', borderRadius: '8px', backgroundColor: '#f8f9fa', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 600, color: '#5f6368', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                                    >+</button>
                                </div>
                                <div style={{ flex: '1 1 180px' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Nota (opcional)..." 
                                        value={replaceNota} 
                                        onChange={e => setReplaceNota(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', border: '1px solid #dadce0', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }} 
                                    />
                                </div>
                            </div>
                            
                            <div style={{ padding: '12px', borderBottom: '1px solid #e0e0e0' }}>
                                <input 
                                    type="text" 
                                    placeholder="Buscar nuevo plato..." 
                                    value={replaceSearch} 
                                    onChange={e => setReplaceSearch(e.target.value)}
                                    autoFocus
                                    style={{ width: '100%', padding: '12px', fontSize: '1rem', border: '1px solid #dadce0', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }} 
                                />
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: '200px', maxHeight: '60vh' }}>
                                {loadingReplaceMenu ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#5f6368' }}>Cargando menú...</div>
                                ) : replaceMenuProducts.filter(p => replaceSearch === "" || p.name.toLowerCase().includes(replaceSearch.toLowerCase())).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#5f6368' }}>No se encontraron productos</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {replaceMenuProducts.filter(p => replaceSearch === "" || p.name.toLowerCase().includes(replaceSearch.toLowerCase())).map((product: any) => (
                                            <div 
                                                key={product.id} 
                                                onClick={() => setReplaceSelectedProduct(product.name)}
                                                style={{ 
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    backgroundColor: replaceSelectedProduct === product.name ? '#e8f0fe' : '#f8f9fa', 
                                                    borderRadius: '8px', padding: '14px 16px', 
                                                    cursor: 'pointer', 
                                                    border: replaceSelectedProduct === product.name ? '2px solid #1a73e8' : '1px solid #e8eaed', 
                                                    transition: 'all 0.1s'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: replaceSelectedProduct === product.name ? '#1a73e8' : '#202124' }}>{product.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#5f6368', marginTop: '2px' }}>{product.category}</div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ fontSize: '0.9rem', color: '#137333', fontWeight: 700 }}>{formatColones(product.price)}</div>
                                                    {replaceSelectedProduct === product.name && (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Confirm button */}
                            <div style={{ padding: '12px 16px', borderTop: '1px solid #e0e0e0', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                                {replacingInProgress ? (
                                    <div style={{ textAlign: 'center', color: '#1a73e8', fontWeight: 600, padding: '14px' }}>Reemplazando artículo...</div>
                                ) : (
                                    <button 
                                        onClick={() => replaceSelectedProduct && confirmReplace(replaceSelectedProduct)}
                                        disabled={!replaceSelectedProduct}
                                        style={{ 
                                            width: '100%', padding: '14px', 
                                            backgroundColor: replaceSelectedProduct ? '#1a73e8' : '#dadce0', 
                                            color: replaceSelectedProduct ? 'white' : '#9aa0a6', 
                                            border: 'none', borderRadius: '8px', 
                                            fontSize: '0.95rem', fontWeight: 700, 
                                            cursor: replaceSelectedProduct ? 'pointer' : 'default',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {replaceSelectedProduct 
                                            ? `Reemplazar por "${replaceSelectedProduct}" (${replaceCantidad}×)` 
                                            : 'Selecciona un artículo arriba'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Cards list view
    return (
        <div style={{ minHeight: "100dvh", backgroundColor: "#f3f4f6", fontFamily: 'Roboto, sans-serif' }}>
            <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: '#f9ab00', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1000 }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>Mesas en Servicio</div>
                <div onClick={fetchTables} style={{ cursor: 'pointer' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg></div>
            </header>

            <div style={{ paddingTop: '70px', paddingBottom: '90px', padding: '70px 16px 90px', maxWidth: '800px', margin: '0 auto' }}>
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
                            <div key={t.orden_nu} style={{ backgroundColor: tBg !== 'transparent' ? tBg : 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', position: 'relative', borderLeft: `4px solid ${tColor}` }}>
                                <div onClick={() => openOrder(t)} style={{ padding: '14px 16px 14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}>
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

        </div>
    );
}
