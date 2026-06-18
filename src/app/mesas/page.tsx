"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTime, getTimeColor, getTimeBg, getElapsedMins, getUrgencyBadge, getElapsedLabel } from "@/lib/timeUtils";
import { formatColones } from "@/lib/format";

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

function stripMesaPrefix(s: string | null | undefined): string {
    if (!s) return '';
    const noPrefix = s.replace(/^(?:Mesa\s*)?\d+\s*-\s*/i, '');
    return noPrefix.replace(/^Mesa\s+/i, '').trim();
}

const MESAS_FIJAS = [1, 2, 3, 4, 5, 6];

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
    
    // Multi-order selection state (same mesa, multiple orders)
    const [mesaSelectionOrders, setMesaSelectionOrders] = useState<Table[] | null>(null);

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
                    items: selectedProducts.map(p => ({ name: p.name, quantity: p.quantity, notas: p.notas || "" }))
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

    const openReplaceModal = async (itemId: string) => {
        setReplacingItemId(itemId);
        setReplaceSearch("");
        setReplaceCantidad(1);
        setReplaceNota("");
        setReplaceSelectedProduct(null);
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

    // Detail view — SOLO VISUAL (cobro en /admin)
    if (selectedOrder) {
        const itemsTotal = orderItems.reduce((s, i) => s + Number(i.TOTAL || 0), 0);
        const totalFinal = Math.round(itemsTotal);

        return (
            <div style={{ minHeight: '100dvh', backgroundColor: 'var(--background)', color: 'var(--text-primary)', fontFamily: 'Roboto, sans-serif' }}>
                <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: 'var(--card-bg)', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', borderBottom: '1px solid var(--surface-border)', zIndex: 1000 }}>
                    <div onClick={() => setSelectedOrder(null)} style={{ cursor: 'pointer', display: 'flex' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {selectedOrder.mesa ? `Mesa ${stripMesaPrefix(selectedOrder.mesa)}` : ''}{selectedOrder.cliente && stripMesaPrefix(selectedOrder.cliente) ? ` — ${stripMesaPrefix(selectedOrder.cliente)}` : ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>#{selectedOrder.orden_nu}</div>
                    </div>
                    <button 
                        onClick={() => openAddProductsModal()} 
                        style={{
                            background: 'var(--primary-gradient)', border: 'none', color: 'white',
                            borderRadius: '8px', padding: '6px 12px', fontSize: '0.75rem',
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        AGREGAR
                    </button>
                    <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>{formatColones(totalFinal)}</div>
                </header>

                <div style={{ paddingTop: '64px', paddingBottom: '280px', paddingLeft: '12px', paddingRight: '12px' }}>
                    {/* Date & Status */}
                    <div style={{ backgroundColor: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--card-shadow)' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Apertura de Orden</div>
                            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {new Date(selectedOrder.fecha).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' })}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
                            <div style={{ 
                                color: getTimeColor(selectedOrder.fecha), 
                                fontWeight: 800, fontSize: '1.05rem', 
                                background: getTimeBg(selectedOrder.fecha) !== 'transparent' ? getTimeBg(selectedOrder.fecha) : 'var(--surface)', 
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
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Cargando...</div>
                    ) : (
                        <div style={{ backgroundColor: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
                            <div style={{ padding: '10px 16px', backgroundColor: 'var(--primary-surface)', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Pedidos ({orderItems.length})</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Toca 🔄 para reemplazar</span>
                            </div>
                            {/* Table Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 72px 44px 64px', padding: '8px 12px', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid var(--surface-border)', fontWeight: 700 }}>
                                <span>✓</span><span>Artículo</span><span>Cant.</span><span>Hora</span><span></span><span style={{ textAlign: 'right' }}>Total</span>
                            </div>
                            {orderItems.map(item => {
                                const timeColor = !item.LISTO ? getTimeColor(item.HoraRegistro || item.FechaRegistro) : 'var(--primary)';
                                const timeBg = !item.LISTO ? getTimeBg(item.HoraRegistro || item.FechaRegistro) : 'transparent';
                                const badge = !item.LISTO ? getUrgencyBadge(item.HoraRegistro || item.FechaRegistro) : null;
                                const elapsed = !item.LISTO ? getElapsedMins(item.HoraRegistro || item.FechaRegistro) : 0;
                                return (
                                <div key={item.ID} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 72px 44px 64px', padding: '12px', alignItems: 'center', borderBottom: '1px solid var(--surface-border)', borderLeft: `4px solid ${timeColor}`, backgroundColor: timeBg !== 'transparent' ? timeBg : undefined }}>
                                    <button 
                                        onClick={() => toggleListo(item.ID)}
                                        disabled={markingListo === item.ID}
                                        aria-label={item.LISTO ? `Marcar ${item.ARTICULO} como pendiente` : `Marcar ${item.ARTICULO} como listo`}
                                        style={{ 
                                            width: '32px', height: '32px', borderRadius: '50%',
                                            border: `2px solid ${item.LISTO ? 'var(--primary)' : 'var(--surface-border)'}`,
                                            backgroundColor: item.LISTO ? 'var(--primary)' : 'var(--card-bg)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            padding: 0, flexShrink: 0, touchAction: 'manipulation', color: item.LISTO ? 'white' : 'var(--text-secondary)'
                                        }}
                                    >
                                        {item.LISTO
                                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                          : markingListo === item.ID
                                            ? <span style={{ fontSize: '0.6rem' }}>...</span>
                                            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                        }
                                    </button>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                          {item.ARTICULO}
                                          {badge && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: elapsed >= 40 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: timeColor, padding: '1px 4px', borderRadius: '3px', fontWeight: 800 }}>{badge}</span>}
                                        </div>
                                        {item.NOTAS && <div style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic', marginTop: '2px' }}>📝 {item.NOTAS}</div>}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600 }}>{item.CANTIDAD}</div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.78rem', color: timeColor, fontWeight: 800 }}>{formatTime(item.HoraRegistro || item.FechaRegistro)}</div>
                                        {!item.LISTO && <div style={{ fontSize: '0.68rem', color: timeColor }}>{elapsed}m</div>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <button
                                            onClick={() => openReplaceModal(item.ID)}
                                            aria-label={`Reemplazar ${item.ARTICULO}`}
                                            style={{
                                                width: '32px', height: '32px', borderRadius: '8px',
                                                border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.9rem', padding: 0, touchAction: 'manipulation'
                                            }}
                                            title="Reemplazar plato"
                                        >🔄</button>
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', textAlign: 'right', fontWeight: 600 }}>{formatColones(Number(item.TOTAL))}</div>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Info Footer — VISUAL ONLY, no cobrar aquí */}
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'var(--card-bg)', borderTop: '1.5px solid var(--surface-border)', padding: '14px 16px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', boxShadow: '0 -2px 12px rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Total acumulado</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>{formatColones(totalFinal)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Para cobrar ve a</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--accent)' }}>📊 Admin / Facturación</div>
                        </div>
                    </div>
                </div>

                {/* Add Products Modal */}
                {showAddProducts && (
                    <div 
                        role="dialog" 
                        aria-modal="true" 
                        aria-labelledby="modal-title"
                        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'flex-end' }} 
                        onClick={() => setShowAddProducts(false)}
                    >
                        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '600px', margin: '0 auto', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div id="modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Agregar Productos</div>
                                <button onClick={() => setShowAddProducts(false)} aria-label="Cerrar modal" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            </div>
                            <div style={{ padding: '12px', borderBottom: '1px solid var(--surface-border)' }}>
                                <input 
                                    type="text" 
                                    placeholder="Buscar producto..." 
                                    value={productSearch} 
                                    onChange={e => setProductSearch(e.target.value)}
                                    aria-label="Buscar productos en el menu"
                                    autoFocus
                                    style={{ width: '100%', padding: '12px', fontSize: '1rem', border: '1px solid var(--surface-border)', borderRadius: '8px', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }} 
                                />
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: '200px', maxHeight: '50vh' }} role="list" aria-label="Lista de productos">
                                {loadingMenu ? (
                                    <div role="status" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Cargando menú...</div>
                                ) : menuProducts.filter(p => productSearch === "" || p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 ? (
                                    <div role="status" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No se encontraron productos</div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                        {menuProducts.filter(p => productSearch === "" || p.name.toLowerCase().includes(productSearch.toLowerCase())).map((product: any) => (
                                            <div 
                                                key={product.id} 
                                                onClick={() => addProductToSelection(product)} 
                                                role="listitem"
                                                tabIndex={0}
                                                onKeyDown={(e) => e.key === 'Enter' && addProductToSelection(product)}
                                                style={{ backgroundColor: 'var(--surface)', borderRadius: '8px', padding: '12px', cursor: 'pointer', border: '1px solid var(--surface-border)', transition: 'all 0.1s' }}
                                            >
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.2 }}>{product.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>{formatColones(product.price)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {selectedProducts.length > 0 && (
                                <div style={{ backgroundColor: 'var(--card-bg)', borderTop: '1px solid var(--surface-border)', padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', boxShadow: '0 -2px 10px rgba(0,0,0,0.2)' }}>
                                    <div style={{ marginBottom: '8px', maxHeight: '100px', overflowY: 'auto' }} role="list" aria-label="Productos seleccionados">
                                        {selectedProducts.map(p => (
                                            <div key={p.id} role="listitem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--surface-border)' }}>
                                                <div style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                    <span style={{ fontWeight: 600 }}>{p.quantity}x</span> {p.name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button onClick={() => updateSelectedQty(p.id, -1)} aria-label={`Disminuir cantidad de ${p.name}`} style={{ width: '36px', height: '36px', minWidth: '36px', borderRadius: '50%', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>−</button>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, minWidth: '20px', textAlign: 'center', color: 'var(--text-primary)' }}>{p.quantity}</span>
                                                    <button onClick={() => updateSelectedQty(p.id, 1)} aria-label={`Aumentar cantidad de ${p.name}`} style={{ width: '36px', height: '36px', minWidth: '36px', borderRadius: '50%', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>+</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={submitAddedProducts} disabled={addingProducts} aria-label={addingProducts ? 'Agregando productos' : `Agregar ${selectedProducts.reduce((s, p) => s + p.quantity, 0)} productos a la orden`} style={{ width: '100%', padding: '14px', backgroundColor: addingProducts ? 'var(--surface-border)' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 700, cursor: addingProducts ? 'default' : 'pointer' }}>
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
                        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'flex-end' }} 
                        onClick={() => setReplacingItemId(null)}
                    >
                        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '600px', margin: '0 auto', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>🔄</span>
                                    <div>
                                        <div id="replace-modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Reemplazar Plato</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Selecciona el nuevo artículo y ajusta cantidad/nota</div>
                                    </div>
                                </div>
                                <button onClick={() => setReplacingItemId(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            </div>
                            
                            {/* Banner: artículo actual */}
                            {replaceCurrentName && (
                                <div style={{ padding: '10px 16px', backgroundColor: 'var(--accent-soft)', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Reemplazando:</span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>{replaceCurrentName}</span>
                                </div>
                            )}
                            
                            {/* Cantidad y Nota inputs */}
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Cantidad:</label>
                                    <button 
                                        onClick={() => setReplaceCantidad(Math.max(1, replaceCantidad - 1))}
                                        style={{ width: '36px', height: '36px', border: '1px solid var(--surface-border)', borderRadius: '8px', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                                    >−</button>
                                    <span style={{ minWidth: '28px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{replaceCantidad}</span>
                                    <button 
                                        onClick={() => setReplaceCantidad(replaceCantidad + 1)}
                                        style={{ width: '36px', height: '36px', border: '1px solid var(--surface-border)', borderRadius: '8px', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                                    >+</button>
                                </div>
                                <div style={{ flex: '1 1 180px' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Nota (opcional)..." 
                                        value={replaceNota} 
                                        onChange={e => setReplaceNota(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', border: '1px solid var(--surface-border)', borderRadius: '8px', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }} 
                                    />
                                </div>
                            </div>
                            
                            <div style={{ padding: '12px', borderBottom: '1px solid var(--surface-border)' }}>
                                <input 
                                    type="text" 
                                    placeholder="Buscar nuevo plato..." 
                                    value={replaceSearch} 
                                    onChange={e => setReplaceSearch(e.target.value)}
                                    autoFocus
                                    style={{ width: '100%', padding: '12px', fontSize: '1rem', border: '1px solid var(--surface-border)', borderRadius: '8px', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }} 
                                />
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: '200px', maxHeight: '60vh' }}>
                                {loadingReplaceMenu ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Cargando menú...</div>
                                ) : replaceMenuProducts.filter(p => replaceSearch === "" || p.name.toLowerCase().includes(replaceSearch.toLowerCase())).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No se encontraron productos</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {replaceMenuProducts.filter(p => replaceSearch === "" || p.name.toLowerCase().includes(replaceSearch.toLowerCase())).map((product: any) => (
                                            <div 
                                                key={product.id} 
                                                onClick={() => setReplaceSelectedProduct(product.name)}
                                                style={{ 
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    backgroundColor: replaceSelectedProduct === product.name ? 'var(--primary-surface)' : 'var(--surface)', 
                                                    borderRadius: '8px', padding: '14px 16px', 
                                                    cursor: 'pointer', 
                                                    border: replaceSelectedProduct === product.name ? '2px solid var(--primary)' : '1px solid var(--surface-border)', 
                                                    transition: 'all 0.1s'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: replaceSelectedProduct === product.name ? 'var(--primary)' : 'var(--text-primary)' }}>{product.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{product.category}</div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 700 }}>{formatColones(product.price)}</div>
                                                    {replaceSelectedProduct === product.name && (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Confirm button */}
                            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--surface-border)', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                                {replacingInProgress ? (
                                    <div style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: 600, padding: '14px' }}>Reemplazando artículo...</div>
                                ) : (
                                    <button 
                                        onClick={() => replaceSelectedProduct && confirmReplace(replaceSelectedProduct)}
                                        disabled={!replaceSelectedProduct}
                                        style={{ 
                                            width: '100%', padding: '14px', 
                                            backgroundColor: replaceSelectedProduct ? 'var(--primary)' : 'var(--surface-border)', 
                                            color: replaceSelectedProduct ? 'white' : 'var(--text-muted)', 
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
        <div style={{ minHeight: "100dvh", backgroundColor: 'var(--background)', color: 'var(--text-primary)', fontFamily: 'Roboto, sans-serif' }}>
            <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1000 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <a href="/inicio" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    </a>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>Mesas en Servicio</div>
                </div>
                <div onClick={fetchTables} style={{ cursor: 'pointer', display: 'flex' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg></div>
            </header>

            <div style={{ paddingTop: '70px', paddingBottom: '90px', paddingLeft: '16px', paddingRight: '16px', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: 'var(--card-shadow)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700 }}>Órdenes Activas</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{tables.length}</div>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[1,2,3].map(i => (
                            <div key={i} className="skeleton skeleton-row" style={{ borderRadius: '8px', width: '100%', height: '80px', backgroundColor: 'var(--surface)' }} />
                        ))}
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 700 }}>Mesas</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                            {MESAS_FIJAS.map(n => {
                                const mesaOrders = tables.filter(x => String(x.mesa) === String(n));
                                const libre = mesaOrders.length === 0;
                                const totalMesa = mesaOrders.reduce((s, o) => s + o.total, 0);
                                return (
                                    <button
                                        key={n}
                                        onClick={() => {
                                            if (libre) {
                                                router.push(`/?mesa=${n}&waiter_mode=true`);
                                            } else if (mesaOrders.length === 1) {
                                                openOrder(mesaOrders[0]);
                                            } else {
                                                setMesaSelectionOrders(mesaOrders);
                                            }
                                        }}
                                        style={{
                                            background: libre ? 'var(--card-bg)' : 'var(--primary-gradient)',
                                            border: libre ? '2px dashed var(--surface-border)' : 'none',
                                            borderRadius: '10px',
                                            padding: '16px 8px',
                                            cursor: 'pointer',
                                            color: libre ? 'var(--text-secondary)' : 'white',
                                            textAlign: 'center',
                                            minHeight: '88px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            gap: '2px',
                                            boxShadow: 'var(--card-shadow)',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{n}</div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.85 }}>
                                            {libre ? 'Libre' : 'Ocupada'}
                                        </div>
                                        {!libre && (
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, marginTop: '2px' }}>
                                                {formatColones(totalMesa)}
                                            </div>
                                        )}
                                        {mesaOrders.length > 1 && (
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.9, marginTop: '2px', background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '8px' }}>
                                                {mesaOrders.length} órdenes
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {tables.filter(t => !MESAS_FIJAS.map(String).includes(String(t.mesa))).length > 0 && (
                            <>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 700 }}>🛍️ Para Llevar (Cinta)</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {tables.filter(t => !MESAS_FIJAS.map(String).includes(String(t.mesa))).map(t => {
                                        const tColor = getTimeColor(t.fecha);
                                        const tBg = getTimeBg(t.fecha);
                                        const tBadge = getUrgencyBadge(t.fecha);
                                        return (
                                        <div key={t.orden_nu} style={{ backgroundColor: tBg !== 'transparent' ? tBg : 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: '12px', boxShadow: 'var(--card-shadow)', overflow: 'hidden', position: 'relative', borderLeft: `4px solid ${tColor}` }}>
                                            <div onClick={() => openOrder(t)} style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                                                        {stripMesaPrefix(t.cliente) || (t.mesa ? `Mesa ${stripMesaPrefix(t.mesa)}` : 'Sin nombre')}
                                                        {tBadge && <span style={{ marginLeft: '8px', fontSize: '0.68rem', color: tColor, fontWeight: 800 }}>{tBadge}</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                        <span>{formatTime(t.fecha)}</span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatColones(t.total)}</div>
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {mesaSelectionOrders && (
                            <div
                                role="dialog"
                                aria-modal="true"
                                style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'flex-end' }}
                                onClick={() => setMesaSelectionOrders(null)}
                            >
                                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '600px', margin: '0 auto', maxHeight: '60vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                                    <div style={{ padding: '16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            Mesa {mesaSelectionOrders[0].mesa} — {mesaSelectionOrders.length} órdenes
                                        </div>
                                        <button onClick={() => setMesaSelectionOrders(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                        </button>
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                                        {mesaSelectionOrders.map(t => {
                                            const tColor = getTimeColor(t.fecha);
                                            const tBg = getTimeBg(t.fecha);
                                            const tBadge = getUrgencyBadge(t.fecha);
                                            return (
                                            <div
                                                key={t.orden_nu}
                                                onClick={() => { setMesaSelectionOrders(null); openOrder(t); }}
                                                style={{ backgroundColor: tBg !== 'transparent' ? tBg : 'var(--surface)', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', cursor: 'pointer', borderLeft: `4px solid ${tColor}`, border: '1px solid var(--surface-border)' }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                            {stripMesaPrefix(t.cliente) || 'Sin nombre'}
                                                            {tBadge && <span style={{ marginLeft: '8px', fontSize: '0.68rem', color: tColor, fontWeight: 800 }}>{tBadge}</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                            {formatTime(t.fecha)} — {getElapsedLabel(t.fecha)}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatColones(t.total)}</div>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
