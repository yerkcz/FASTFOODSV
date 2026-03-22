"use client";

import { useEffect, useState, useCallback } from "react";
import Link from 'next/link';
import Image from "next/image";
import { formatTime, getElapsedMins } from "@/lib/timeUtils";

type MesaGroup = {
    mesa: string | null;
    ordenes: {orden_nu: string, cliente: string, fecha: string, estado: string, total: number}[];
    total_mesa: number;
    fecha_primera: string;
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
    FechaRegistro?: string;
    Orden_Nu: string;
};

type Product = {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    image_url: string;
};

type CartItem = Product & { quantity: number; notes: string };

function formatColones(amount: number): string {
  const rounded = Math.round(amount).toString();
  return "\u20A1" + rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}


export default function AdminPortal() {
    const [adminKey, setAdminKey] = useState<string>("");
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loginError, setLoginError] = useState("");
    
    const [mesaGroups, setMesaGroups] = useState<MesaGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [closing, setClosing] = useState<string | null>(null);

    // Inline confirm modal (replaces window.confirm)
    const [confirmState, setConfirmState] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ show: false, title: '', message: '', onConfirm: () => {} });

    const showConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmState({ show: true, title, message, onConfirm });
    };

    const dismissConfirm = () => {
        setConfirmState(prev => ({ ...prev, show: false }));
    };

    // Phase A: Table Details
    const [selectedGroup, setSelectedGroup] = useState<MesaGroup | null>(null);
    const [tableItems, setTableItems] = useState<OrderItem[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [deletingItem, setDeletingItem] = useState<string | null>(null);

    // Phase B: Admin POS (Nueva Comanda)
    const [showPos, setShowPos] = useState(false);
    const [posMesa, setPosMesa] = useState("");
    const [posCliente, setPosCliente] = useState("");
    const [posTipo, setPosTipo] = useState("Restaurante");
    const [menu, setMenu] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [posLoading, setPosLoading] = useState(false);

    // Phase C: Checkout / Billing
    const [selectedPaymentItems, setSelectedPaymentItems] = useState<string[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<"Efectivo" | "Tarjeta" | "Sinpe">("Efectivo");
    const [amountReceived, setAmountReceived] = useState<string>("");
    const [splitCount, setSplitCount] = useState<number>(1);

    // Phase D: Admin Tabs & Closed Orders
    const [adminTab, setAdminTab] = useState<"open" | "closed" | "caja">("open");
    const [closedOrders, setClosedOrders] = useState<any[]>([]);
    const [closedTotal, setClosedTotal] = useState(0);
    const [closedTip, setClosedTip] = useState(0);
    const [meseroCount, setMeseroCount] = useState(1);
    
    useEffect(() => {
        if (isLoggedIn && menu.length === 0) {
            fetch("/api/menu", { headers: { "x-api-key": process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY || "" }})
                .then(res => res.json())
                .then(data => { if (data.products) setMenu(data.products); })
                .catch(console.error);
        }
    }, [isLoggedIn, menu.length]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setLoginError("");
        try {
            const res = await fetch("/api/admin/tables", {
                headers: { "x-admin-key": adminKey }
            });
            if (res.ok) {
                const data = await res.json();
                setMesaGroups(data.mesa_groups || []);
                setIsLoggedIn(true);
            } else {
                setLoginError("Contraseña incorrecta");
            }
        } catch (err) {
            setLoginError("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const fetchTables = useCallback(async () => {
        if (!isLoggedIn) return;
        try {
            const res = await fetch("/api/admin/tables", {
                headers: { "x-admin-key": adminKey }
            });
            if (res.ok) {
                const data = await res.json();
                setMesaGroups(data.mesa_groups || []);
            } else if (res.status === 401) {
                setIsLoggedIn(false);
            }
        } catch (err) {
            console.error("Error fetching tables", err);
        }
    }, [isLoggedIn, adminKey]);

    useEffect(() => {
        if (isLoggedIn) {
            const interval = setInterval(fetchTables, 10000);
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, fetchTables]);

    const fetchClosedOrders = useCallback(async () => {
        if (!isLoggedIn) return;
        try {
            const res = await fetch("/api/admin/closed-orders", { headers: { "x-admin-key": adminKey } });
            if (res.ok) {
                const data = await res.json();
                setClosedOrders(data.orders);
                setClosedTotal(data.total_diario);
                setClosedTip(data.diez_porciento);
            }
        } catch (err) { console.error(err); }
    }, [isLoggedIn, adminKey]);

    useEffect(() => {
        if (adminTab === "closed" || adminTab === "caja") fetchClosedOrders();
    }, [adminTab, fetchClosedOrders]);

    const closeTableGroup = async (e: React.MouseEvent, group: MesaGroup, formaPago?: string, recibido?: number, itemIds?: string[]) => {
        e.stopPropagation();
        
        const doClose = async () => {
            const isGroup = !!group.mesa;
            const targetId = isGroup ? group.mesa : group.ordenes[0].orden_nu;
            setClosing(targetId as string);
            try {
                const bodyData = isGroup 
                    ? { close_all_mesa: group.mesa, forma_pago: formaPago, recibido, item_ids: itemIds }
                    : { ordenNu: group.ordenes[0].orden_nu, forma_pago: formaPago, recibido, item_ids: itemIds };
                const res = await fetch("/api/admin/close-table", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
                    body: JSON.stringify(bodyData)
                });
                if (res.ok) {
                    fetchTables();
                } else {
                    const data = await res.json();
                    alert(data.error || "Error al cerrar la mesa");
                }
            } catch (err) {
                alert("Error de conexión al cerrar mesa");
            } finally {
                setClosing(null);
                setSelectedGroup(null);
            }
        };

        showConfirm(
            '¿Cerrar esta cuenta?',
            `Se cerrará la cuenta de ${group.mesa ? `Mesa ${group.mesa}` : group.ordenes[0].cliente}. Esta acción no se puede deshacer.`,
            doClose
        );
    };

    const openTableDetails = async (group: MesaGroup) => {
        setSelectedGroup(group);
        setLoadingDetails(true);
        setTableItems([]);
        setSelectedPaymentItems([]);
        setPaymentMethod("Efectivo");
        setAmountReceived("");
        try {
            const ordenesParam = group.ordenes.map(o => o.orden_nu).join(',');
            const res = await fetch(`/api/admin/table-details?ordenes=${ordenesParam}`, {
                headers: { "x-admin-key": adminKey }
            });
            if (res.ok) {
                const data = await res.json();
                setTableItems(data.items);
                setSelectedPaymentItems(data.items.map((i: OrderItem) => i.ID));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingDetails(false);
        }
    };

    const deleteItem = async (itemId: string, itemName: string) => {
        const doDelete = async () => {
            setDeletingItem(itemId);
            try {
                const res = await fetch("/api/admin/delete-item", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "x-admin-key": adminKey
                    },
                    body: JSON.stringify({ itemId })
                });
                if (res.ok) {
                    setTableItems(prev => prev.filter(i => i.ID !== itemId));
                    fetchTables();
                } else {
                    alert("Error al anular el ítem");
                }
            } catch(err) {
                alert("Error de conexión");
            } finally {
                setDeletingItem(null);
            }
        };

        showConfirm(
            `Anular ítem`,
            `¿Seguro que deseas anular "${itemName}"? Esta acción eliminará el ítem de la orden.`,
            doDelete
        );
    };

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1, notes: "" }];
        });
    };

    const updateCartQty = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQ = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQ };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const posTotal = cart.reduce((acc, current) => acc + (current.price * current.quantity), 0);

    const submitPosOrder = async () => {
        if (!posMesa && posTipo === 'Restaurante') return alert("Ingresa el número de mesa");
        if (!posCliente && posTipo === 'Llevar') return alert("Ingresa el nombre del cliente");
        if (cart.length === 0) return alert("Agrega al menos un producto");
        setPosLoading(true);
        try {
            const res = await fetch("/api/admin/create-order", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "x-admin-key": adminKey
                },
                body: JSON.stringify({
                    mesa: posTipo === 'Restaurante' ? posMesa : null,
                    cliente: posCliente || posMesa,
                    tipo: posTipo,
                    items: cart.map(c => ({ name: c.name, quantity: c.quantity, notes: c.notes || '' })),
                    notas: ""
                })
            });
            if (res.ok) {
                setShowPos(false);
                setCart([]);
                setPosMesa("");
                setPosCliente("");
                fetchTables();
            } else {
                const data = await res.json();
                alert(data.error || "Error creando orden");
            }
        } catch(err) {
            alert("Error de conexión");
        } finally {
            setPosLoading(false);
        }
    };

    const togglePaymentItem = (id: string) => {
        setSelectedPaymentItems(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const checkoutSubtotal = tableItems
        .filter(i => selectedPaymentItems.includes(i.ID))
        .reduce((sum, item) => sum + item.TOTAL, 0);
    const checkoutServiceCharge = Math.round(checkoutSubtotal * 0.1);
    const checkoutSelectedTotal = checkoutSubtotal + checkoutServiceCharge;
    const splitAmount = splitCount > 1 ? Math.ceil(checkoutSelectedTotal / splitCount) : checkoutSelectedTotal;

    const checkOutAndClose = async (e: React.MouseEvent) => {
        if (!selectedGroup) return;
        const received = Number(amountReceived) || 0;
        if (paymentMethod === 'Efectivo' && received < checkoutSelectedTotal) {
            alert(`Monto recibido (₡${received}) es menor al total (₡${checkoutSelectedTotal}). Ingrese un monto igual o mayor.`);
            return;
        }
        if ((paymentMethod === 'Tarjeta' || paymentMethod === 'Sinpe') && received !== checkoutSelectedTotal) {
            setAmountReceived(checkoutSelectedTotal.toString());
        }
        await closeTableGroup(e, selectedGroup, paymentMethod, Number(amountReceived) || checkoutSelectedTotal, selectedPaymentItems);
    };

    // UI TopAppBar mimicking the home page
    const TopAppBar = ({ title, onSync }: { title: string, onSync?: () => void }) => (
        <header style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, height: '60px',
            background: 'linear-gradient(135deg, #1a3d2a 0%, #2d5a3f 100%)', 
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', zIndex: 1000, fontFamily: 'Roboto, sans-serif'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Image src="/logoHide.png" alt="Hideaway" width={36} height={36} style={{ borderRadius: '50%' }} />
                <div>
                    <h1 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "#eef7f0", lineHeight: 1.2 }}>Hideaway</h1>
                    <p style={{ fontSize: "0.65rem", margin: 0, color: "rgba(238,247,240,0.7)", letterSpacing: "1px", textTransform: "uppercase" }}>
                        {title}
                    </p>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {onSync && (
                    <div onClick={onSync} style={{ cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
                        </svg>
                    </div>
                )}
                <div onClick={() => setShowPos(true)} style={{ cursor: 'pointer', padding: '6px 14px', background: '#25d366', color: 'white', borderRadius: '24px', fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    COMANDAR
                </div>
                {/* Salir Button */}
                <Link href="/" style={{ color: 'rgba(238,247,240,0.7)', textDecoration: 'none' }}>
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </Link>
            </div>
        </header>
    );

    if (!isLoggedIn) {
        return (
            <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", fontFamily: 'Roboto, sans-serif' }}>
                <TopAppBar title="ACCESO ADMINISTRADOR" />
                <div style={{ paddingTop: '100px', padding: '16px', display: "flex", justifyContent: "center" }}>
                    <div style={{ backgroundColor: "white", padding: "32px", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", width: "100%", maxWidth: "400px" }}>
                        <div style={{ textAlign: "center", marginBottom: "24px" }}>
                            <div style={{ background: '#e6f4ea', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#137333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            </div>
                            <h2 style={{ fontSize: "1.25rem", color: "#202124", fontWeight: 700 }}>🔐 Portal Seguro</h2>
                        </div>
                        <form onSubmit={handleLogin}>
                            <input 
                                type="password" 
                                placeholder="Contraseña Maestra" 
                                value={adminKey}
                                onChange={(e) => setAdminKey(e.target.value)}
                                style={{ 
                                    width: "100%", padding: "14px", fontSize: "1rem", borderRadius: "8px", 
                                    border: "1px solid #dadce0", marginBottom: "16px", outline: 'none', background: '#f8f9fa'
                                }}
                            />
                            {loginError && <p style={{ color: "#d93025", marginBottom: "16px", fontSize: "0.875rem", textAlign: 'center' }}>{loginError}</p>}
                            <button 
                                type="submit" 
                                disabled={loading || !adminKey}
                                style={{ 
                                    width: "100%", padding: "14px", fontSize: "0.9rem", borderRadius: "8px", border: "none", 
                                    background: adminKey ? "linear-gradient(135deg, #25d366 0%, #137333 100%)" : "#e0e0e0", 
                                    color: adminKey ? "white" : "#9aa0a6", 
                                    cursor: adminKey ? "pointer" : "default", fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
                                    boxShadow: adminKey ? "0 4px 12px rgba(37, 211, 102, 0.3)" : "none", transition: 'all 0.2s'
                                }}
                            >
                                {loading ? "VERIFICANDO..." : "INGRESAR AL SISTEMA"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    const totalSales = mesaGroups.reduce((acc, current) => acc + current.total_mesa, 0);

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", fontFamily: 'Roboto, sans-serif' }}>
            <TopAppBar title="POS AVANZADO" onSync={fetchTables} />

            {/* Inline Confirm Modal */}
            {confirmState.show && (
                <div className="confirm-overlay" onClick={dismissConfirm}>
                    <div className="confirm-card" onClick={e => e.stopPropagation()}>
                        <h3>{confirmState.title}</h3>
                        <p>{confirmState.message}</p>
                        <div className="confirm-actions">
                            <button className="confirm-btn-cancel" onClick={dismissConfirm}>
                                Cancelar
                            </button>
                            <button className="confirm-btn-danger" onClick={() => { dismissConfirm(); confirmState.onConfirm(); }}>
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            
            <div style={{ paddingTop: '80px', paddingBottom: '40px', paddingLeft: '16px', paddingRight: '16px', maxWidth: '800px', margin: '0 auto' }}>
                
                {/* Admin Tabs */}
                <div style={{ display: 'flex', gap: '0', backgroundColor: 'white', borderRadius: '12px', marginBottom: '20px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {[{key: 'open' as const, label: 'En Curso'}, {key: 'closed' as const, label: 'Cerradas'}, {key: 'caja' as const, label: 'Cierre'}].map(tab => (
                        <button key={tab.key} onClick={() => setAdminTab(tab.key)} style={{
                            flex: 1, padding: '14px 8px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                            borderBottom: adminTab === tab.key ? '3px solid #25d366' : '3px solid transparent',
                            backgroundColor: adminTab === tab.key ? '#f8fbfc' : 'white', 
                            color: adminTab === tab.key ? '#137333' : '#5f6368',
                            textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.2s'
                        }}>{tab.label}</button>
                    ))}
                </div>

                {/* TAB: Mesas Abiertas */}
                {adminTab === 'open' && <>
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Cuentas Activas ({mesaGroups.length})</div>
                        <div style={{ fontSize: '2rem', color: '#137333', fontWeight: 800 }}>{formatColones(totalSales)}</div>
                    </div>
                    <div style={{ padding: '12px', background: '#e6f4ea', borderRadius: '50%' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#137333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                </div>
                
                {mesaGroups.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 16px", color: "#80868b" }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dadce0" strokeWidth="1.5" style={{ marginBottom: '16px' }}><path d="M10 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path></svg>
                        <div style={{ fontSize: "1rem", fontWeight: 500 }}>No hay facturas abiertas</div>
                        <p style={{ fontSize: "0.85rem", marginTop: '8px' }}>El salón está despejado en este momento.</p>
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: "16px", gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                        {mesaGroups.map(group => {
                            const openDate = new Date(group.fecha_primera);
                            const elapsedMins = Math.floor((Date.now() - openDate.getTime()) / 60000);
                            const targetId = group.mesa || group.ordenes[0].orden_nu;

                            return (
                                <div key={targetId} 
                                    onClick={() => openTableDetails(group)}
                                    style={{ 
                                        backgroundColor: "white", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", 
                                        overflow: "hidden", position: 'relative', cursor: 'pointer', transition: 'transform 0.1s',
                                        border: '1px solid #f1f3f4'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', backgroundColor: elapsedMins > 60 ? '#ea4335' : elapsedMins > 30 ? '#fbbc04' : '#25d366' }}></div>
                                    
                                    <div style={{ padding: "16px", paddingLeft: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                        <div>
                                            <div style={{ fontSize: "1.1rem", color: "#202124", fontWeight: 700, marginBottom: '4px' }}>
                                                {group.mesa ? `Mesa ${group.mesa}` : `Para Llevar:`}
                                            </div>
                                            {group.ordenes.map(o => (
                                                <div key={o.orden_nu} style={{ fontSize: "0.85rem", color: "#5f6368" }}>• {o.cliente || '-'} (#{o.orden_nu})</div>
                                            ))}
                                            <div style={{ fontSize: "0.75rem", color: "#80868b", marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                Abierta hace {elapsedMins} min
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: "1.25rem", color: "#137333", fontWeight: 800 }}>
                                                {formatColones(group.total_mesa)}
                                            </div>
                                            <div style={{ fontSize: "0.75rem", color: "#80868b", marginTop: '4px' }}>
                                                {group.ordenes.length} comanda{group.ordenes.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ borderTop: '1px solid #f1f3f4', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#fcfcfc' }}>
                                        <button 
                                            onClick={(e) => closeTableGroup(e, group)}
                                            disabled={closing === targetId}
                                            style={{ 
                                                background: 'none', border: '1px solid #d93025', color: '#d93025', fontSize: '0.8rem', fontWeight: 600, 
                                                letterSpacing: '0.5px', textTransform: 'uppercase', cursor: closing === targetId ? 'default' : 'pointer',
                                                padding: '6px 16px', borderRadius: '4px', opacity: closing === targetId ? 0.5 : 1, transition: 'all 0.2s',
                                                backgroundColor: closing === targetId ? '#fce8e6' : 'white'
                                            }}
                                        >
                                            {closing === targetId ? "PROCESANDO..." : "COBRAR CUENTA"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                </>}

                {/* TAB: Cerradas Hoy */}
                {adminTab === 'closed' && (
                    <div>
                        {closedOrders.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 16px', color: '#80868b', fontSize: '1rem' }}>
                                No hay órdenes cerradas hoy.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {closedOrders.map(order => (
                                    <div key={order.orden_nu} style={{ 
                                        backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #f1f3f4',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '1rem', color: '#202124', fontWeight: 700 }}>{order.cliente}</div>
                                            <div style={{ fontSize: '0.8125rem', color: '#5f6368', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span>#{order.orden_nu}</span>
                                                <span style={{color: '#dadce0'}}>|</span>
                                                <span>{new Date(order.fecha).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })}</span>
                                                <span style={{color: '#dadce0'}}>|</span>
                                                <span style={{ background: '#f8f9fa', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e0e0e0' }}>{order.forma_pago}</span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#202124' }}>
                                            {formatColones(order.total)}
                                        </div>
                                    </div>
                                ))}
                                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginTop: '8px', textAlign: 'center', border: '1px solid #e6f4ea' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#137333', textTransform: 'uppercase', fontWeight: 600 }}>Total Cerradas Hoy ({closedOrders.length} tickets)</div>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#137333', marginTop: '4px' }}>{formatColones(closedTotal)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB: Caja del Día */}
                {adminTab === 'caja' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px 24px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', textAlign: 'center', background: 'linear-gradient(to bottom, #ffffff, #fcfcfc)', border: '1px solid #f1f3f4' }}>
                            <div style={{ display: 'inline-block', padding: '12px', background: '#e6f4ea', borderRadius: '50%', marginBottom: '16px' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#137333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 600 }}>Caja Diaria</div>
                            <div style={{ fontSize: '3rem', fontWeight: 800, color: '#202124', letterSpacing: '-1px' }}>{formatColones(closedTotal)}</div>
                            <div style={{ fontSize: '0.9rem', color: '#80868b', marginTop: '8px', fontWeight: 500 }}>{closedOrders.length} orden{closedOrders.length !== 1 ? 'es' : ''} procesada{closedOrders.length !== 1 ? 's' : ''} con éxito</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div style={{ backgroundColor: 'white', border: '1px solid #f1f3f4', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '8px', fontWeight: 600 }}>10% Servicio Mín.</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#34a853' }}>{formatColones(closedTip)}</div>
                            </div>

                            <div style={{ backgroundColor: 'white', border: '1px solid #f1f3f4', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '12px', fontWeight: 600, textAlign: 'center' }}>Reparto a Meseros</div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '12px' }}>
                                    <button onClick={() => setMeseroCount(Math.max(1, meseroCount - 1))} style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #dadce0', backgroundColor: '#f8f9fa', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 700, minWidth: '24px', textAlign: 'center' }}>{meseroCount}</span>
                                    <button onClick={() => setMeseroCount(meseroCount + 1)} style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #dadce0', backgroundColor: '#f8f9fa', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                </div>
                                <div style={{ textAlign: 'center', background: '#e8f0fe', padding: '8px', borderRadius: '8px', color: '#1a73e8' }}>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatColones(Math.round(closedTip / meseroCount))} c/u</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Table Details / Checkout Modal */}
            {selectedGroup && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f3f4f6', zIndex: 2000, 
                    display: 'flex', flexDirection: 'column', fontFamily: 'Roboto, sans-serif', animation: 'fadeIn 0.2s ease-out'
                }}>
                    <header style={{ 
                        height: '60px', background: 'white', display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '0 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                    }}>
                        <div onClick={() => setSelectedGroup(null)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', background: '#f1f3f4', borderRadius: '50%' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '1.1rem', color: '#202124', fontWeight: 800 }}>
                                Check-out: {selectedGroup.mesa ? `Mesa ${selectedGroup.mesa}` : selectedGroup.ordenes[0].cliente}
                            </div>
                            {selectedGroup.ordenes.length > 1 && <div style={{fontSize: '0.75rem', color: '#5f6368', fontWeight: 500}}>{selectedGroup.ordenes.length} comandas consolidadas</div>}
                        </div>
                        <div style={{ color: '#137333', fontWeight: 800, fontSize: '1.2rem', background: '#e6f4ea', padding: '4px 12px', borderRadius: '16px' }}>
                            {formatColones(selectedGroup.total_mesa)}
                        </div>
                    </header>

                    <div style={{ padding: '16px', overflowY: 'auto', flex: 1, paddingBottom: '280px' }}>
                        {loadingDetails ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#5f6368' }}>
                                <div className="loading-spinner" style={{ margin: '0 auto 16px', borderTopColor: '#25d366' }}></div>
                                Obteniendo detalles consolidados...
                            </div>
                        ) : tableItems.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#5f6368' }}>No hay ítems registrados.</div>
                        ) : (
                            <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', background: 'linear-gradient(to right, #f8fbfc, #f1f8e9)', color: '#137333', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e0e0e0' }}>
                                    Detalle de Consumo General ({tableItems.length} ítems)
                                </div>
                                {tableItems.map((item, index) => {
                                    const horaStr = item.HoraRegistro || item.FechaRegistro;
                                    const minsElapsed = getElapsedMins(horaStr);
                                    const isReady = !!item.LISTO;
                                    const isLate = !isReady && minsElapsed >= 15;

                                    return (
                                    <div key={item.ID} 
                                        onClick={() => togglePaymentItem(item.ID)}
                                        style={{ 
                                            padding: '16px', borderBottom: index < tableItems.length - 1 ? '1px solid #f1f3f4' : 'none',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            cursor: 'pointer', background: selectedPaymentItems.includes(item.ID) ? 'white' : '#fafafa',
                                            opacity: selectedPaymentItems.includes(item.ID) ? 1 : 0.6,
                                            transition: 'all 0.1s'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <div style={{ 
                                                width: '24px', height: '24px', borderRadius: '6px', border: '2px solid',
                                                borderColor: selectedPaymentItems.includes(item.ID) ? '#25d366' : '#dadce0',
                                                backgroundColor: selectedPaymentItems.includes(item.ID) ? '#25d366' : 'white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s'
                                            }}>
                                                {selectedPaymentItems.includes(item.ID) && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '1.05rem', color: isReady ? '#137333' : '#202124', fontWeight: 600, textDecoration: isReady ? 'line-through' : 'none' }}>
                                                    {item.CANTIDAD}x {item.ARTICULO}
                                                    {isReady && <span style={{fontSize: '0.65rem', marginLeft: '6px', background: '#e6f4ea', padding: '4px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', fontWeight: 800}}>LISTO</span>}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#5f6368', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>{formatColones(item.PRECIO)} c/u {item.Orden_Nu ? ` (#${item.Orden_Nu})` : ''}</span>
                                                    <span style={{ color: '#dadce0' }}>|</span>
                                                    <span style={{ color: isLate ? '#d93025' : '#80868b', fontWeight: isLate ? 800 : 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                        {formatTime(horaStr)} {isLate ? `(+${minsElapsed}m)` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <div style={{ fontSize: '1.1rem', color: '#202124', fontWeight: 700 }}>
                                                {formatColones(item.TOTAL)}
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); deleteItem(item.ID, item.ARTICULO); }}
                                                disabled={deletingItem === item.ID}
                                                style={{ 
                                                    background: '#fce8e6', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%',
                                                    color: '#d93025', opacity: deletingItem === item.ID ? 0.5 : 1
                                                }}
                                                title="Anular Ítem"
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div style={{ 
                        position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'white', 
                        borderTop: '1px solid #e0e0e0', padding: '20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', 
                        boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
                        zIndex: 2001
                    }}>
                        <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: '#5f6368' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: 500 }}>
                                <span>Subtotal Consumos</span>
                                <span style={{color: '#202124'}}>{formatColones(checkoutSubtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: 500 }}>
                                <span>Cargo Servicio (10%)</span>
                                <span style={{color: '#202124'}}>{formatColones(checkoutServiceCharge)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #f1f3f4', marginTop: '8px', fontSize: '1.5rem', fontWeight: 800, color: '#137333' }}>
                                <span>TOTAL A COBRAR</span>
                                <span>{formatColones(checkoutSelectedTotal)}</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {["Efectivo", "Tarjeta", "Sinpe"].map((method) => (
                                <button
                                    key={method}
                                    onClick={() => {
                                        setPaymentMethod(method as any);
                                        if (method !== 'Efectivo') setAmountReceived(checkoutSelectedTotal.toString());
                                        else setAmountReceived('');
                                    }}
                                    style={{
                                        flex: 1, padding: '12px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
                                        border: '1px solid', cursor: 'pointer', transition: 'all 0.2s',
                                        ...(paymentMethod === method 
                                            ? { backgroundColor: '#e6f4ea', color: '#137333', borderColor: '#25d366' }
                                            : { backgroundColor: '#f8f9fa', color: '#5f6368', borderColor: '#dadce0' })
                                    }}
                                >
                                    {method}
                                </button>
                            ))}
                        </div>

                        {paymentMethod === "Efectivo" && (
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 600 }}>Paga con</div>
                                    <input 
                                        type="number" 
                                        placeholder="Ingrese monto..." 
                                        value={amountReceived}
                                        onChange={e => setAmountReceived(e.target.value)}
                                        style={{ width: '100%', padding: '12px', fontSize: '1.25rem', fontWeight: 700, border: '2px solid #dadce0', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: '#202124' }}
                                    />
                                </div>
                                {Number(amountReceived) > checkoutSelectedTotal && (
                                    <div style={{ flex: 1, textAlign: 'right', background: '#f8fbfc', padding: '12px', borderRadius: '8px', border: '1px solid #e1f5fe' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 600 }}>Vuelto (Dar)</div>
                                        <div style={{ fontSize: '1.5rem', color: '#1a73e8', fontWeight: 800 }}>
                                            {formatColones(Math.max(0, (Number(amountReceived) || 0) - checkoutSelectedTotal))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <button 
                            onClick={checkOutAndClose}
                            disabled={closing === (selectedGroup.mesa || selectedGroup.ordenes[0].orden_nu) || checkoutSelectedTotal === 0}
                            style={{ 
                                width: '100%', padding: '16px', 
                                background: checkoutSelectedTotal === 0 ? '#f1f3f4' : 'linear-gradient(135deg, #25d366 0%, #137333 100%)', 
                                color: checkoutSelectedTotal === 0 ? '#9aa0a6' : 'white', border: 'none', borderRadius: '8px',
                                fontSize: '1rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', 
                                cursor: checkoutSelectedTotal === 0 ? 'default' : 'pointer', boxShadow: checkoutSelectedTotal === 0 ? 'none' : '0 4px 12px rgba(37,211,102,0.3)', transition: 'all 0.2s'
                            }}
                        >
                            {closing === (selectedGroup.mesa || selectedGroup.ordenes[0].orden_nu) ? 'CERRANDO CUENTA...' : `APLICAR COBRO DE ${formatColones(checkoutSelectedTotal)}`}
                        </button>
                    </div>
                </div>
            )}

            {/* POS Modal (Nueva Comanda) */}
            {showPos && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f3f4f6', zIndex: 2000, 
                    display: 'flex', flexDirection: 'column', fontFamily: 'Roboto, sans-serif', animation: 'slideUp 0.3s ease-out'
                }}>
                    <header style={{ 
                        height: '60px', background: 'linear-gradient(135deg, #1a3d2a 0%, #2d5a3f 100%)', color: 'white', display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '0 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                        <div onClick={() => setShowPos(false)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </div>
                        <div style={{ flex: 1, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.5px' }}>
                            CREAR ORDEN FAST-POS
                        </div>
                    </header>

                    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Tipo</label>
                                    <select 
                                        value={posTipo} onChange={e => setPosTipo(e.target.value)}
                                        style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 600, border: '2px solid #dadce0', borderRadius: '8px', outline: 'none', background: '#f8f9fa' }}
                                    >
                                        <option value="Restaurante">Mesa (Local)</option>
                                        <option value="Llevar">Para Llevar</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Identificador</label>
                                    <input 
                                        type="text" placeholder={posTipo === 'Restaurante' ? 'Ej. 10' : 'Nombre'} 
                                        value={posTipo === 'Restaurante' ? posMesa : posCliente} 
                                        onChange={e => posTipo === 'Restaurante' ? setPosMesa(e.target.value) : setPosCliente(e.target.value)}
                                        style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 600, border: '2px solid #dadce0', borderRadius: '8px', outline: 'none' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#5f6368', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginLeft: '4px' }}>SELECCIÓN DE PLATILLOS</div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '160px' }}>
                            {menu.map(p => {
                                const inCart = cart.find(c => c.id === p.id);
                                return (
                                    <div key={p.id} onClick={() => addToCart(p)} style={{ 
                                        backgroundColor: 'white', borderRadius: '12px', padding: '16px 12px', cursor: 'pointer',
                                        boxShadow: inCart ? '0 4px 12px rgba(37,211,102,0.2)' : '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', 
                                        border: inCart ? '2px solid #25d366' : '2px solid transparent', transition: 'all 0.1s', position: 'relative'
                                    }}>
                                        {inCart && (
                                            <div style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#137333', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                                {inCart.quantity}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#202124', marginBottom: '8px', lineHeight: 1.2 }}>{p.name}</div>
                                        <div style={{ fontSize: '0.85rem', color: '#137333', fontWeight: 700, marginTop: 'auto' }}>{formatColones(p.price)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ 
                        position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', 
                        borderTop: '1px solid #e0e0e0', padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', boxShadow: '0 -4px 16px rgba(0,0,0,0.1)'
                    }}>
                        {cart.length > 0 ? (
                            <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '16px' }}>
                                {cart.map(c => (
                                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', background: '#f8fbfc', padding: '8px 12px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '0.9rem', color: '#202124', fontWeight: 600, flex: 1 }}>{c.name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <button onClick={() => updateCartQty(c.id, -1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #dadce0', background: 'white', cursor: 'pointer', fontWeight: 800, color: '#5f6368' }}>-</button>
                                            <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center', fontWeight: 700 }}>{c.quantity}</span>
                                            <button onClick={() => updateCartQty(c.id, 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#e6f4ea', color: '#137333', cursor: 'pointer', fontWeight: 800 }}>+</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#80868b', fontSize: '0.9rem', marginBottom: '16px', padding: '20px', border: '2px dashed #dadce0', borderRadius: '8px' }}>Ningún producto preparado</div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', fontWeight: 600 }}>Total Estimado</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#137333' }}>{formatColones(posTotal * 1.1)}</div>
                            </div>
                            <button 
                                onClick={submitPosOrder}
                                disabled={cart.length === 0 || posLoading}
                                style={{ 
                                    padding: '16px 32px', background: cart.length === 0 ? '#f1f3f4' : 'linear-gradient(135deg, #25d366 0%, #137333 100%)', 
                                    color: cart.length === 0 ? '#9aa0a6' : 'white', border: 'none', borderRadius: '8px',
                                    fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', cursor: cart.length === 0 ? 'default' : 'pointer',
                                    boxShadow: cart.length === 0 ? 'none' : '0 4px 12px rgba(37,211,102,0.3)', transition: 'all 0.2s'
                                }}
                            >
                                {posLoading ? 'REGISTRANDO...' : 'ENVIAR A COCINA'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <style dangerouslySetInnerHTML={{__html: `
                @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700;800&display=swap');
                body { margin: 0; background-color: #f3f4f6; }
                .loading-spinner { border: 3px solid rgba(0,0,0,0.1); border-left-color: #25d366; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            `}} />
        </div>
    );
}
