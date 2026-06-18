"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from 'next/link';
import Image from "next/image";
import dynamic from 'next/dynamic';
import { formatTime, getElapsedMins, getTimeColor, getTimeBg, getUrgencyBadge, getElapsedLabel } from "@/lib/timeUtils";

const AnalyticsDashboard = dynamic(() => import('@/components/analytics/AnalyticsDashboard'), { ssr: false });
import { type Product, type CartItem } from "@/types";
import { formatColones } from "@/lib/format";

type MesaGroup = {
    mesa: string | null;
    ordenes: {orden_nu: string, cliente: string, fecha: string, estado: string, total: number, tipo?: string}[];
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



/** Strip "Mesa " prefix to avoid "Mesa Mesa X" display duplication. */
function stripMesaPrefix(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/^Mesa\s+/i, '').trim();
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
    // Split Bill
    const [splitMode, setSplitMode] = useState<'none' | 'by_person' | 'manual' | 'manual_person' | 'equal'>('none');
    const [splitN, setSplitN] = useState(2);
    const [splitPersonIdx, setSplitPersonIdx] = useState(0);

    // Phase E: Reassign Items
    const [reassignModal, setReassignModal] = useState<{show: boolean, item: OrderItem} | null>(null);
    const [reassignTarget, setReassignTarget] = useState<string>('');
    const [reassigning, setReassigning] = useState(false);

    // Phase E.2: Split Item por Cantidad (cobrar parte de "2x Cocacola")
    const [splitItemModal, setSplitItemModal] = useState<{show: boolean, item: OrderItem} | null>(null);
    const [splitItemQty, setSplitItemQty] = useState<number>(1);
    const [splittingItem, setSplittingItem] = useState(false);

    // Phase F: Add Products to Existing Order
    const [showAddProducts, setShowAddProducts] = useState(false);
    const [selectedAddProducts, setSelectedAddProducts] = useState<any[]>([]);
    const [addingProducts, setAddingProducts] = useState(false);
    const [productSearch, setProductSearch] = useState("");
    const [targetOrdenNu, setTargetOrdenNu] = useState<string | null>(null);

    // Phase D: Admin Tabs & Closed Orders
    const [adminTab, setAdminTab] = useState<"open" | "closed" | "caja" | "stats">("open");
    const [closedOrders, setClosedOrders] = useState<any[]>([]);
    const [closedTotal, setClosedTotal] = useState(0);
    const [meseroCount, setMeseroCount] = useState(1);

    // Polling ref for open order detail
    const detailPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    
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
            if (adminKey === "0000") {
                const res = await fetch("/api/admin/tables", {
                    headers: { "x-admin-key": adminKey }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMesaGroups(data.mesa_groups || []);
                    setIsLoggedIn(true);
                } else {
                    setLoginError("No se pudo conectar al servidor");
                }
            } else {
                setLoginError("PIN incorrecto");
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
                    const data = await res.json();
                    fetchTables();
                    // If it was a split (partial), refresh items instead of closing modal
                    if (data.split) {
                        // Remove the paid items from the UI
                        setTableItems(prev => prev.filter(i => !itemIds?.includes(i.ID)));
                        // Update selected payment items to remaining
                        setSelectedPaymentItems(prev => prev.filter(id => !itemIds?.includes(id)));
                        setSplitMode('none');
                        setAmountReceived('');
                        setClosing(null);
                        return; // Don't close the modal
                    }
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

    const unlockTable = async (e: React.MouseEvent, group: MesaGroup) => {
        e.stopPropagation();
        if (!group.mesa) {
            alert("Solo las órdenes de Restaurante (en mesa) se pueden desbloquear.");
            return;
        }
        try {
            const res = await fetch("/api/admin/unlock-table", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
                body: JSON.stringify({ mesa: group.mesa })
            });
            if (res.ok) {
                alert(`Mesa ${group.mesa} abierta. ¡Tu invitado tiene 5 minutos para escanear el QR!`);
            } else {
                alert("Error al desbloquear la mesa.");
            }
        } catch (err) {
            alert("Error de conexión al intentar desbloquear la mesa.");
        }
    };

    const openTableDetails = async (group: MesaGroup) => {
        setSelectedGroup(group);
        setLoadingDetails(true);
        setTableItems([]);
        setSelectedPaymentItems([]);
        setPaymentMethod("Efectivo");
        setAmountReceived("");
        setSplitMode('none');
        setSplitN(2);
        setSplitPersonIdx(0);
        try {
            const ordenesParam = group.ordenes.map(o => o.orden_nu).join(',');
            const res = await fetch(`/api/admin/table-details?ordenes=${ordenesParam}`, {
                headers: { "x-admin-key": adminKey }
            });
            if (res.ok) {
                const data = await res.json();
                const items = data.items || [];
                setTableItems(items);
                setSelectedPaymentItems(items.map((i: OrderItem) => i.ID));
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || `Error del servidor (${res.status}) al obtener detalles`);
            }
        } catch (err) {
            console.error(err);
            alert("Error de conexión al obtener detalles de la mesa");
        } finally {
            setLoadingDetails(false);
        }
    };

    // Background refresh for open order detail (keeps items in sync with kitchen)
    const refreshTableDetails = useCallback(async (group: MesaGroup) => {
        try {
            const ordenesParam = group.ordenes.map(o => o.orden_nu).join(',');
            const res = await fetch(`/api/admin/table-details?ordenes=${ordenesParam}`, {
                headers: { "x-admin-key": adminKey }
            });
            if (res.ok) {
                const data = await res.json();
                setTableItems(data.items);
            }
        } catch (err) {
            // Silent fail — don't disrupt UI on background poll error
        }
    }, [adminKey]);

    // Start/stop polling when order detail panel opens or closes
    useEffect(() => {
        if (detailPollRef.current) clearInterval(detailPollRef.current);
        if (selectedGroup) {
            detailPollRef.current = setInterval(() => {
                refreshTableDetails(selectedGroup);
            }, 5000);
        }
        return () => {
            if (detailPollRef.current) clearInterval(detailPollRef.current);
        };
    }, [selectedGroup, refreshTableDetails]);

    const submitReassignItem = async () => {
        if (!reassignModal || !reassignTarget) return;

        // Detectar si es cross-mesa
        const itemMesa = selectedGroup?.ordenes.find(o => o.orden_nu === reassignModal.item.Orden_Nu);
        const targetOrder = mesaGroups.flatMap(mg => mg.ordenes).find(o => o.orden_nu === reassignTarget);
        const targetGroup = mesaGroups.find(mg => mg.ordenes.some(o => o.orden_nu === reassignTarget));
        if (itemMesa && targetGroup && targetGroup.mesa !== selectedGroup?.mesa) {
            if (!confirm("⚠️ Este ítem se moverá a OTRA MESA.\n(Origen: " + (selectedGroup?.mesa || 'Mesa actual') + " → Destino: " + (targetGroup.mesa || 'Otra mesa') + ")\n¿Estás segura?")) {
                return;
            }
        }

        setReassigning(true);
        try {
            const res = await fetch("/api/admin/reassign-item", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
                body: JSON.stringify({ itemId: reassignModal.item.ID, targetOrdenNu: reassignTarget })
            });
            if (res.ok) {
                setTableItems(prev => prev.filter(i => i.ID !== reassignModal.item.ID));
                setReassignModal(null);
                setReassignTarget('');
                fetchTables();
            } else {
                const data = await res.json();
                alert(data.error || "Error al reasignar el ítem");
            }
        } catch(err) {
            alert("Error de conexión");
        } finally {
            setReassigning(false);
        }
    };

    // Divide un item por cantidad: separa N unidades en un nuevo orden_item
    // (mismo orden_id) que después puede reasignarse o cobrarse aparte.
    const openSplitItemModal = (item: OrderItem) => {
        if (item.CANTIDAD <= 1) return;
        setSplitItemQty(1);
        setSplitItemModal({ show: true, item });
    };

    const submitSplitItem = async () => {
        if (!splitItemModal || !selectedGroup) return;
        const { item } = splitItemModal;
        if (splitItemQty < 1 || splitItemQty >= item.CANTIDAD) return;
        setSplittingItem(true);
        try {
            const res = await fetch("/api/admin/split-item", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
                body: JSON.stringify({ itemId: item.ID, cantidadSeparar: splitItemQty })
            });
            if (res.ok) {
                // Recargar items para mostrar el nuevo
                await refreshTableDetails(selectedGroup);
                setSplitItemModal(null);
                setSplitItemQty(1);
                fetchTables();
            } else {
                const data = await res.json();
                alert(data.error || "Error al dividir el ítem");
            }
        } catch (err) {
            alert("Error de conexión al dividir");
        } finally {
            setSplittingItem(false);
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

    const openAddProductsModal = (ordenNu?: string) => {
        setTargetOrdenNu(ordenNu || selectedGroup?.ordenes[0]?.orden_nu || null);
        setShowAddProducts(true);
        setSelectedAddProducts([]);
        setProductSearch("");
    };

    const addProductToSelection = (product: Product) => {
        setSelectedAddProducts(prev => {
            const existing = prev.find(p => p.id === product.id);
            if (existing) {
                return prev.map(p => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const updateSelectedAddQty = (productId: string, delta: number) => {
        setSelectedAddProducts(prev => prev.map(p => {
            if (p.id === productId) {
                return { ...p, quantity: Math.max(0, p.quantity + delta) };
            }
            return p;
        }).filter(p => p.quantity > 0));
    };

    const submitAddedProducts = async () => {
        if (selectedAddProducts.length === 0 || !targetOrdenNu) return;
        setAddingProducts(true);
        try {
            const res = await fetch("/api/admin/add-items", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
                body: JSON.stringify({
                    orden_nu: targetOrdenNu,
                    items: selectedAddProducts.map(p => ({ name: p.name, quantity: p.quantity, notes: "" }))
                })
            });
            if (res.ok) {
                setShowAddProducts(false);
                setSelectedAddProducts([]);
                setTargetOrdenNu(null);
                if (selectedGroup) refreshTableDetails(selectedGroup);
                fetchTables();
            } else {
                const data = await res.json();
                alert(data.error || "Error al agregar productos");
            }
        } catch(err) { alert("Error de conexión"); }
        finally { setAddingProducts(false); }
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
                    items: cart.map(c => ({ name: c.name, quantity: c.quantity, notas: c.notas || '' })),
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
    const checkoutSelectedTotal = Math.round(checkoutSubtotal);
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

    const handleDownloadInvoice = async (ordenNu: string, clienteName: string, orderTotal: number) => {
        try {
            const res = await fetch(`/api/admin/table-details?orden_nu=${ordenNu}`, {
                headers: { "x-admin-key": adminKey }
            });
            if (!res.ok) throw new Error("Error obteniendo detalles");
            const data = await res.json();

            const formattedItems = data.items.map((i: any, index: number) => ({
                id: i.ID || String(index),
                name: i.ARTICULO,
                price: i.PRECIO,
                quantity: i.CANTIDAD,
                category: "",
                notas: i.NOTAS || undefined
            }));

            // Calcular total desde items (ordenes.total puede ser 0 tras el cierre
            // porque el trigger recalcula al borrar orden_items).
            const computedTotal = formattedItems.reduce(
                (s: number, it: any) => s + Number(it.price) * Number(it.quantity),
                0
            );
            const finalTotal = computedTotal > 0 ? computedTotal : Number(orderTotal || 0);

            const { generateInvoice } = await import('@/lib/generateInvoice');
            const mesaValue = stripMesaPrefix(clienteName) ? "Restaurante" : "Llevar";
            await generateInvoice(formattedItems, finalTotal, { mesa: mesaValue, cliente: clienteName }, ordenNu);
        } catch (err) {
            alert("No se pudo generar el PDF");
        }
    };


    // UI TopAppBar mimicking the home page
    const TopAppBar = ({ title, onSync }: { title: string, onSync?: () => void }) => (
        <header style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, height: '60px',
            background: 'var(--header-bg)', 
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', zIndex: 1000, fontFamily: 'Roboto, sans-serif'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Image src="/LogoFastF.jpeg" alt="Fast Food San Vicente" width={36} height={36} style={{ borderRadius: '50%' }} />
                <div>
                    <h1 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--header-text)", lineHeight: 1.2 }}>Fast Food San Vicente</h1>
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
                <div onClick={() => setShowPos(true)} style={{ cursor: 'pointer', padding: '6px 14px', background: 'var(--primary)', color: 'white', borderRadius: '24px', fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    COMANDAR
                </div>
                {/* Salir Button */}
                <Link href="/inicio" style={{ color: 'rgba(238,247,240,0.7)', textDecoration: 'none' }}>
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </Link>
            </div>
        </header>
    );

    if (!isLoggedIn) {
        return (
            <div style={{ minHeight: "100vh", backgroundColor: "var(--background)", fontFamily: 'Roboto, sans-serif' }}>
                <TopAppBar title="ACCESO ADMINISTRADOR" />
                <div style={{ paddingTop: '100px', padding: '16px', display: "flex", justifyContent: "center" }}>
                    <div style={{ backgroundColor: "var(--card-bg)", padding: "32px", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", width: "100%", maxWidth: "400px" }}>
                        <div style={{ textAlign: "center", marginBottom: "24px" }}>
                            <div style={{ background: 'var(--primary-surface)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            </div>
                            <h2 style={{ fontSize: "1.25rem", color: "var(--text-primary)", fontWeight: 700 }}>🔐 Portal Seguro</h2>
                        </div>
                        <form onSubmit={handleLogin}>
                            <input 
                                type="password" 
                                placeholder="Contraseña Maestra" 
                                value={adminKey}
                                onChange={(e) => setAdminKey(e.target.value)}
                                style={{ 
                                    width: "100%", padding: "14px", fontSize: "1rem", borderRadius: "8px", 
                                    border: "1px solid var(--surface-border)", marginBottom: "16px", outline: 'none', background: 'var(--surface)'
                                }}
                            />
                            {loginError && <p style={{ color: "var(--danger)", marginBottom: "16px", fontSize: "0.875rem", textAlign: 'center' }}>{loginError}</p>}
                            <button 
                                type="submit" 
                                disabled={loading || !adminKey}
                                style={{ 
                                    width: "100%", padding: "14px", fontSize: "0.9rem", borderRadius: "8px", border: "none", 
                                    background: adminKey ? "var(--primary-gradient)" : "var(--surface-border)", 
                                    color: adminKey ? "white" : "var(--text-muted)", 
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
        <div style={{ minHeight: "100vh", backgroundColor: "var(--background)", fontFamily: 'Roboto, sans-serif' }}>
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
                <div style={{ display: 'flex', gap: '0', backgroundColor: 'var(--card-bg)', borderRadius: '12px', marginBottom: '20px', overflow: 'auto hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                    <style>{`.admin-tabs::-webkit-scrollbar { display: none; }`}</style>
                    {[{key: 'open' as const, label: 'En Curso'}, {key: 'closed' as const, label: 'Cerradas'}, {key: 'caja' as const, label: 'Cierre'}, {key: 'stats' as const, label: 'Estadísticas'}].map(tab => (
                        <button key={tab.key} onClick={() => setAdminTab(tab.key)} style={{
                            flex: '1 0 auto', padding: '12px 10px', fontSize: 'clamp(0.7rem, 2.5vw, 0.85rem)', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            borderBottom: adminTab === tab.key ? '3px solid var(--primary)' : '3px solid transparent',
                            backgroundColor: adminTab === tab.key ? 'var(--surface)' : 'var(--card-bg)', 
                            color: adminTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                            textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.2s'
                        }}>{tab.label}</button>
                    ))}
                </div>

                {/* TAB: Mesas Abiertas */}
                {adminTab === 'open' && <>
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Cuentas Activas ({mesaGroups.length})</div>
                        <div style={{ fontSize: '2rem', color: 'var(--primary)', fontWeight: 800 }}>{formatColones(totalSales)}</div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--primary-surface)', borderRadius: '50%' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                </div>
                
                {mesaGroups.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 16px", color: "var(--text-muted)" }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--surface-border)" strokeWidth="1.5" style={{ marginBottom: '16px' }}><path d="M10 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path></svg>
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
                                        backgroundColor: "var(--card-bg)", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", 
                                        overflow: "hidden", position: 'relative', cursor: 'pointer', transition: 'transform 0.1s',
                                        border: '1px solid var(--surface-border)'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', backgroundColor: elapsedMins > 60 ? '#ea4335' : elapsedMins > 30 ? '#fbbc04' : 'var(--primary)' }}></div>
                                    
                                    <div style={{ padding: "16px", paddingLeft: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                        <div>
                                            <div style={{ fontSize: "1.1rem", color: "var(--text-primary)", fontWeight: 700, marginBottom: '4px' }}>
                                                {group.mesa ? `Mesa ${stripMesaPrefix(group.mesa)}` : `Para Llevar:`}
                                            </div>
                                            {group.ordenes.map(o => (
                                                <div key={o.orden_nu} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                                    • {stripMesaPrefix(o.cliente) || '(sin nombre)'} (#{o.orden_nu})
                                                </div>
                                            ))}
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                Abierta hace {elapsedMins} min
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: "1.25rem", color: "var(--primary)", fontWeight: 800 }}>
                                                {formatColones(group.total_mesa)}
                                            </div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: '4px' }}>
                                                {group.ordenes.length} comanda{group.ordenes.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ borderTop: '1px solid var(--surface-border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', backgroundColor: 'var(--card-bg)', gap: '8px', flexWrap: 'wrap' }}>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); openAddProductsModal(group.ordenes[0]?.orden_nu); }}
                                            style={{ 
                                                background: 'none', border: '2px solid var(--primary)', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, 
                                                letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer',
                                                padding: '10px 14px', borderRadius: '8px', transition: 'all 0.2s',
                                                backgroundColor: 'var(--card-bg)', whiteSpace: 'nowrap', minHeight: '44px',
                                                display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                            title="Agregar productos a esta orden"
                                        >
                                            <span style={{fontSize:'1rem'}}>➕</span> AGREGAR
                                        </button>
                                        <button 
                                            onClick={(e) => unlockTable(e, group)}
                                            style={{ 
                                                background: 'none', border: '2px solid #1a73e8', color: '#1a73e8', fontSize: '0.8rem', fontWeight: 700, 
                                                letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer',
                                                padding: '10px 14px', borderRadius: '8px', transition: 'all 0.2s',
                                                backgroundColor: 'var(--card-bg)', minHeight: '44px',
                                                display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                            title="Otorgar 5 minutos de acceso para un nuevo integrante de la mesa"
                                        >
                                            <span style={{fontSize:'1rem'}}>🔓</span> ADMITIR
                                        </button>
                                        <button 
                                            onClick={(e) => closeTableGroup(e, group)}
                                            disabled={closing === targetId}
                                            style={{ 
                                                background: 'none', border: '2px solid var(--danger)', color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 700, 
                                                letterSpacing: '0.5px', textTransform: 'uppercase', cursor: closing === targetId ? 'default' : 'pointer',
                                                padding: '10px 14px', borderRadius: '8px', opacity: closing === targetId ? 0.5 : 1, transition: 'all 0.2s',
                                                backgroundColor: closing === targetId ? 'var(--danger-soft)' : 'var(--card-bg)', minHeight: '44px',
                                                display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                        >
                                            {closing === targetId ? "..." : <><span style={{fontSize:'1rem'}}>💳</span> COBRAR</>}
                                        </button>
                                    </div>
                                    
                                    <style dangerouslySetInnerHTML={{__html: `
                                        @media (max-width: 480px) {
                                          /* En móvil, botones ocupan ancho completo en 2 filas */
                                          div[style*="borderTop: '1px solid var(--surface-border)'"] button {
                                            flex: 1 1 calc(50% - 8px) !important;
                                            justify-content: center;
                                            min-width: 0 !important;
                                          }
                                          div[style*="borderTop: '1px solid var(--surface-border)'"] button:last-child {
                                            flex: 1 1 100% !important;
                                          }
                                        }
                                    `}} />
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
                            <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--text-muted)', fontSize: '1rem' }}>
                                No hay órdenes cerradas hoy.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {closedOrders.map(order => (
                                    <div key={order.comprobante_id || order.orden_nu} style={{ 
                                        backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '16px', border: '1px solid var(--surface-border)',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>{order.cliente}</div>
                                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span>#{order.orden_nu}</span>
                                                <span style={{color: 'var(--surface-border)'}}>|</span>
                                                <span>{new Date(order.fecha).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })}</span>
                                                <span style={{color: 'var(--surface-border)'}}>|</span>
                                                <span style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--surface-border)' }}>{order.forma_pago}</span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                                {formatColones(order.total)}
                                            </div>
                                            <button 
                                                onClick={() => handleDownloadInvoice(order.orden_nu, order.cliente, order.total)}
                                                style={{
                                                    marginTop: '6px', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 600,
                                                    color: '#1a73e8', background: 'var(--primary-surface)', border: 'none', borderRadius: '4px', cursor: 'pointer'
                                                }}
                                            >
                                                📄 FACTURA
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginTop: '8px', textAlign: 'center', border: '1px solid var(--primary-surface)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Cerradas Hoy ({closedOrders.length} tickets)</div>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{formatColones(closedTotal)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB: Caja del Día */}
                {adminTab === 'caja' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '32px 24px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--surface-border)' }}>
                            <div style={{ display: 'inline-block', padding: '12px', background: 'var(--primary-surface)', borderRadius: '50%', marginBottom: '16px' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 600 }}>Caja Diaria</div>
                            <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1px' }}>{formatColones(closedTotal)}</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>{closedOrders.length} orden{closedOrders.length !== 1 ? 'es' : ''} procesada{closedOrders.length !== 1 ? 's' : ''} con éxito</div>
                        </div>

                        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '12px', fontWeight: 600, textAlign: 'center' }}>Reparto entre Meseros</div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '12px' }}>
                                    <button onClick={() => setMeseroCount(Math.max(1, meseroCount - 1))} style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 700, minWidth: '24px', textAlign: 'center' }}>{meseroCount}</span>
                                    <button onClick={() => setMeseroCount(meseroCount + 1)} style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--surface-border)', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                </div>
                                <div style={{ textAlign: 'center', background: 'var(--primary-surface)', padding: '8px', borderRadius: '8px', color: '#1a73e8' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>del total diario</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatColones(Math.round(closedTotal / meseroCount))} c/u</div>
                                </div>
                            </div>
                    </div>
                )}

                {/* TAB: Estadísticas */}
                {adminTab === 'stats' && <AnalyticsDashboard adminKey={adminKey} />}

            </div>

            {/* Table Details / Checkout Modal */}
            {selectedGroup && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--background)', zIndex: 2000, 
                    display: 'flex', flexDirection: 'column', fontFamily: 'Roboto, sans-serif', animation: 'fadeIn 0.2s ease-out'
                }}>
                    <header style={{ 
                        height: '60px', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '0 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                    }}>
                        <div onClick={() => setSelectedGroup(null)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', background: 'var(--surface-border)', borderRadius: '50%' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 800 }}>
                                Check-out: {selectedGroup.mesa ? `Mesa ${selectedGroup.mesa}` : stripMesaPrefix(selectedGroup.ordenes[0].cliente) || selectedGroup.ordenes[0].cliente}
                            </div>
                            {selectedGroup.ordenes.length > 1 && <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500}}>{selectedGroup.ordenes.length} comandas consolidadas</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={() => openAddProductsModal()} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '20px', padding: '10px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', minHeight: '44px', boxShadow: '0 2px 8px rgba(37,211,102,0.3)' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                AGREGAR
                            </button>
                            <div title="Actualizando en tiempo real" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--primary)', animation: 'pulse 2s ease-in-out infinite', flexShrink: 0 }} />
                            <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem', background: 'var(--primary-surface)', padding: '6px 14px', borderRadius: '16px' }}>
                                {formatColones(selectedGroup.total_mesa)}
                            </div>
                        </div>
                        
                        <style dangerouslySetInnerHTML={{__html: `
                            @media (max-width: 480px) {
                              /* Header del checkout en móvil */
                              header[style*="height: '60px'"] {
                                flex-wrap: wrap !important;
                                height: auto !important;
                                padding: 12px 16px !important;
                                gap: 12px !important;
                              }
                              header[style*="height: '60px'"] > div:last-child {
                                width: 100% !important;
                                justify-content: space-between !important;
                              }
                            }
                        `}} />
                    </header>

                    <div style={{ padding: '16px', overflowY: 'auto', flex: 1, paddingBottom: splitMode === 'none' ? '320px' : splitMode === 'equal' ? '380px' : '340px', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                        {loadingDetails ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                                <div className="loading-spinner" style={{ margin: '0 auto 16px', borderTopColor: 'var(--primary)' }}></div>
                                Obteniendo detalles consolidados...
                            </div>
                        ) : tableItems.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No hay ítems registrados.</div>
                        ) : (
                            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', background: 'var(--primary-gradient-soft)', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--surface-border)' }}>
                                    Detalle de Consumo General ({tableItems.length} ítems)
                                </div>
                                {tableItems.map((item, index) => {
                                    const horaStr = item.HoraRegistro || item.FechaRegistro;
                                    const isReady = !!item.LISTO;
                                    // Use correct 4-level format rules from timeUtils
                                    const tColor = isReady ? 'var(--primary)' : getTimeColor(horaStr);
                                    const tBg = isReady ? 'transparent' : getTimeBg(horaStr);
                                    const urgencyBadge = isReady ? null : getUrgencyBadge(horaStr);
                                    const elapsed = isReady ? 0 : getElapsedMins(horaStr);
                                    // Person name from order cross-reference
                                    const personName = selectedGroup.ordenes.find(o => o.orden_nu === item.Orden_Nu)?.cliente || null;

                                    return (
                                    <div key={item.ID} 
                                        onClick={() => togglePaymentItem(item.ID)}
                                        style={{ 
                                            padding: '16px', borderBottom: index < tableItems.length - 1 ? '1px solid var(--surface-border)' : 'none',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            cursor: 'pointer', background: tBg !== 'transparent' ? tBg : (selectedPaymentItems.includes(item.ID) ? 'var(--card-bg)' : 'var(--surface)'),
                                            opacity: selectedPaymentItems.includes(item.ID) ? 1 : 0.6,
                                            transition: 'all 0.1s',
                                            borderLeft: `4px solid ${tColor}`
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <div style={{ 
                                                width: '24px', height: '24px', borderRadius: '6px', border: '2px solid',
                                                borderColor: selectedPaymentItems.includes(item.ID) ? 'var(--primary)' : 'var(--surface-border)',
                                                backgroundColor: selectedPaymentItems.includes(item.ID) ? 'var(--primary)' : 'var(--surface)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s'
                                            }}>
                                                {selectedPaymentItems.includes(item.ID) && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '1.05rem', color: isReady ? 'var(--primary)' : 'var(--text-primary)', fontWeight: 600, textDecoration: isReady ? 'line-through' : 'none' }}>
                                                    {item.CANTIDAD}x {item.ARTICULO}
                                                    {isReady && <span style={{fontSize: '0.65rem', marginLeft: '6px', background: 'var(--primary-surface)', padding: '4px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', fontWeight: 800}}>LISTO</span>}
                                                    {urgencyBadge && <span style={{fontSize: '0.65rem', marginLeft: '6px', background: elapsed >= 40 ? 'var(--danger-soft)' : 'var(--accent-soft)', color: tColor, padding: '2px 5px', borderRadius: '4px', fontWeight: 800}}>{urgencyBadge}</span>}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    {personName && (
                                                        <span style={{ background: 'var(--primary-surface)', color: '#1a73e8', padding: '1px 7px', borderRadius: '10px', fontWeight: 700, fontSize: '0.72rem' }}>
                                                            👤 {personName}
                                                        </span>
                                                    )}
                                                    <span>{formatColones(item.PRECIO)} c/u</span>
                                                    <span style={{ color: 'var(--surface-border)' }}>|</span>
                                                    <span style={{ color: tColor, fontWeight: elapsed >= 30 ? 800 : 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                        {formatTime(horaStr)}{!isReady && elapsed > 0 ? ` (+${getElapsedLabel(horaStr)})` : ''}
                                                    </span>
                                                </div>
                                                {item.NOTAS && <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontStyle: 'italic', marginTop: '3px' }}>📝 {item.NOTAS}</div>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                                                {formatColones(item.TOTAL)}
                                            </div>
                                            {item.CANTIDAD > 1 && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openSplitItemModal(item); }}
                                                    title="Dividir cantidad (separar unidades)"
                                                    style={{
                                                        background: 'var(--accent-soft)', border: 'none', cursor: 'pointer',
                                                        padding: '8px', borderRadius: '50%', color: 'var(--accent)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                                                </button>
                                            )}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setReassignModal({ show: true, item }); }}
                                                disabled={deletingItem === item.ID}
                                                style={{ 
                                                    background: 'var(--danger-soft)', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%',
                                                    color: 'var(--danger)', opacity: deletingItem === item.ID ? 0.5 : 1
                                                }}
                                                title="Gestionar Ítem"
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

                    {/* ===== SPLIT BILL FOOTER ===== */}
                    <div style={{ 
                        position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'var(--card-bg)', 
                        borderTop: '1px solid var(--surface-border)', padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', 
                        boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', zIndex: 2001, maxHeight: '38dvh', overflowY: 'auto',
                        WebkitOverflowScrolling: 'touch'
                    }}>

                    {/* ---------- ESTADO: no split seleccionado ---------- */}
                    {splitMode === 'none' && (() => {
                        return (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)', borderTop: '1px solid var(--surface-border)', paddingTop: '4px', marginBottom: '8px' }}>
                                <span>TOTAL</span><span>{formatColones(checkoutSelectedTotal)}</span>
                            </div>

                            {/* Modo de pago */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                {(['Efectivo','Tarjeta','Sinpe'] as const).map(m => (
                                    <button key={m} onClick={() => { setPaymentMethod(m); if (m !== 'Efectivo') setAmountReceived(checkoutSelectedTotal.toString()); else setAmountReceived(''); }}
                                        style={{ flex:'1 1 60px', padding:'6px', borderRadius:'6px', fontSize:'0.75rem', fontWeight:600, border:'1px solid', cursor:'pointer', transition:'all 0.15s', minHeight:'36px',
                                            ...(paymentMethod === m ? {backgroundColor:'var(--primary-surface)', color:'var(--primary)', borderColor:'var(--primary)'} : {backgroundColor:'var(--surface)', color:'var(--text-secondary)', borderColor:'var(--surface-border)'}) }}
                                    >{m}</button>
                                ))}
                            </div>

                            {paymentMethod === 'Efectivo' && (
                                <div style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
                                    <input type="number" placeholder="Monto recibido" min="0" value={amountReceived}
                                        onChange={e => setAmountReceived(e.target.value)}
                                        style={{ flex:1, padding:'8px', fontSize:'0.9rem', fontWeight:700, border:'2px solid var(--surface-border)', borderRadius:'6px' }} />
                                    {Number(amountReceived) > checkoutSelectedTotal && (
                                        <div style={{ flex:'0 0 auto', background:'var(--surface)', padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--surface-border)', textAlign:'center' }}>
                                            <div style={{ fontSize:'0.6rem', color:'var(--text-secondary)', fontWeight:600, textTransform:'uppercase' }}>Vuelto</div>
                                            <div style={{ fontSize:'1rem', color:'#1a73e8', fontWeight:800 }}>{formatColones(Math.max(0,(Number(amountReceived)||0)-checkoutSelectedTotal))}</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div style={{ display:'flex', gap:'6px' }}>
                                {/* Cobrar Todo */}
                                <button onClick={checkOutAndClose}
                                    disabled={closing === (selectedGroup.mesa || selectedGroup.ordenes[0].orden_nu) || checkoutSelectedTotal === 0}
                                    style={{ flex:2, padding:'10px', background: checkoutSelectedTotal===0?'var(--surface-border)':'var(--primary-gradient)', color: checkoutSelectedTotal===0?'var(--text-muted)':'white', border:'none', borderRadius:'6px', fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase', cursor: checkoutSelectedTotal===0?'default':'pointer', boxShadow: checkoutSelectedTotal===0?'none':'0 2px 8px rgba(37,211,102,0.3)' }}>
                                    {closing === (selectedGroup.mesa || selectedGroup.ordenes[0].orden_nu) ? 'CERRANDO...' : `COBRAR ${formatColones(checkoutSelectedTotal)}`}
                                </button>
                                {/* Dividir Cuenta */}
                                <button onClick={() => setSplitMode('by_person')}
                                    style={{ flex:1, padding:'10px', background:'var(--primary-surface)', color:'#1a73e8', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                    Dividir
                                </button>
                            </div>
                        </>
                        );
                    })()}

                    {/* ---------- MODO A: Por Persona ---------- */}
                    {splitMode === 'by_person' && (() => {
                        return (
                        <>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                                <button onClick={() => setSplitMode('none')} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'var(--text-secondary)' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                </button>
                                <div style={{ flex:1, fontSize:'1rem', fontWeight:800, color:'var(--text-primary)' }}>Cobrar por Persona</div>
                            </div>
                            {/* Lista de personas */}
                            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'8px', maxHeight:'40dvh', overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
                                {selectedGroup.ordenes.map((orden, idx) => {
                                    const personItems = tableItems.filter(i => i.Orden_Nu === orden.orden_nu);
                                    const personSub = personItems.reduce((s,i) => s+i.TOTAL, 0);
                                    const personTot = Math.round(personSub);
                                    return (
                                    <div key={orden.orden_nu}
                                        onClick={() => { setSelectedPaymentItems(personItems.map(i=>i.ID)); setSplitPersonIdx(idx); setSplitMode('manual_person'); setAmountReceived(''); }}
                                        style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', background: splitPersonIdx===idx?'var(--primary-surface)':'var(--surface)', border: splitPersonIdx===idx?'2px solid #1a73e8':'2px solid transparent', borderRadius:'10px', cursor:'pointer', transition:'all 0.15s' }}>
                                        <div>
                                            <div style={{ fontWeight:700, color:'var(--text-primary)', fontSize:'0.95rem' }}>{orden.cliente || '(sin nombre)'}</div>
                                            <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'2px' }}>{personItems.length} ítem{personItems.length!==1?'s':''} • #{orden.orden_nu}</div>
                                        </div>
                                        <div style={{ textAlign:'right' }}>
                                            <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--primary)' }}>{formatColones(personTot)}</div>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                            {/* También ofrece los otros modos */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                                <button onClick={() => { setSplitMode('manual'); setSelectedPaymentItems([]); }}
                                    style={{ padding:'10px', background:'var(--accent-soft)', color:'var(--accent)', border:'none', borderRadius:'8px', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
                                    ✎ Selección Manual
                                </button>
                                <button onClick={() => { setSplitMode('equal'); setSplitN(2); }}
                                    style={{ padding:'10px', background:'var(--accent-soft)', color:'var(--accent)', border:'none', borderRadius:'8px', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
                                    ÷ Partes Iguales
                                </button>
                            </div>
                        </>
                        );
                    })()}

                    {/* ---------- MODO A2: cobro de persona seleccionada ---------- */}
                    {splitMode === 'manual_person' && (() => {
                        const sub = tableItems.filter(i=>selectedPaymentItems.includes(i.ID)).reduce((s,i)=>s+i.TOTAL,0);
                        const tot = sub;
                        const persona = selectedGroup.ordenes[splitPersonIdx]?.cliente || '(sin nombre)';
                        return (
                        <>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                                <button onClick={() => setSplitMode('by_person')} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'var(--text-secondary)' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                </button>
                                <div style={{ flex:1 }}>
                                    <div style={{ fontWeight:800, color:'var(--text-primary)' }}>Cobrar: {persona}</div>
                                    <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{selectedPaymentItems.length} ítems • Total: {formatColones(tot)}</div>
                                </div>
                            </div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'10px' }}>
                                {(['Efectivo','Tarjeta','Sinpe'] as const).map(m => (
                                    <button key={m} onClick={() => { setPaymentMethod(m); if (m!=='Efectivo') setAmountReceived(tot.toString()); else setAmountReceived(''); }}
                                        style={{ flex:'1 1 80px', padding:'8px', borderRadius:'8px', fontSize:'0.8rem', fontWeight:600, border:'1px solid', cursor:'pointer', minHeight:'44px',
                                            ...(paymentMethod===m?{backgroundColor:'var(--primary-surface)',color:'var(--primary)',borderColor:'var(--primary)'}:{backgroundColor:'var(--surface)',color:'var(--text-secondary)',borderColor:'var(--surface-border)'}) }}
                                    >{m}</button>
                                ))}
                            </div>
                            {paymentMethod==='Efectivo' && (
                                <div style={{ display:'flex', gap:'10px', marginBottom:'10px', alignItems:'center' }}>
                                    <input type="number" placeholder={`Paga con (total: ${tot})`} min="0" value={amountReceived}
                                        onChange={e => setAmountReceived(e.target.value)}
                                        style={{ flex:1, padding:'10px', fontSize:'1rem', fontWeight:700, border:'2px solid var(--surface-border)', borderRadius:'8px' }} />
                                    {Number(amountReceived)>tot && (
                                        <div style={{ background:'var(--surface)', padding:'10px', borderRadius:'8px', border:'1px solid var(--surface-border)', textAlign:'center' }}>
                                            <div style={{ fontSize:'0.65rem', color:'var(--text-secondary)', fontWeight:600 }}>VUELTO</div>
                                            <div style={{ fontSize:'1.2rem', color:'#1a73e8', fontWeight:800 }}>{formatColones(Math.max(0,(Number(amountReceived)||0)-tot))}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button onClick={checkOutAndClose}
                                disabled={closing===(selectedGroup.mesa||selectedGroup.ordenes[0].orden_nu) || tot===0 || (paymentMethod==='Efectivo' && Number(amountReceived)<tot)}
                                style={{ width:'100%', padding:'14px', background:'var(--primary-gradient)', color:'white', border:'none', borderRadius:'8px', fontSize:'0.9rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer', boxShadow:'0 4px 12px rgba(37,211,102,0.3)' }}>
                                {closing===(selectedGroup.mesa||selectedGroup.ordenes[0].orden_nu)?'PROCESANDO...': `COBRAR ${persona}: ${formatColones(tot)}`}
                            </button>
                        </>
                        );
                    })()}

                    {/* ---------- MODO B: Selección Manual ---------- */}
                    {splitMode === 'manual' && (() => {
                        const sub = tableItems.filter(i=>selectedPaymentItems.includes(i.ID)).reduce((s,i)=>s+i.TOTAL,0);
                        const tot = sub;
                        return (
                        <>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                                <button onClick={() => setSplitMode('none')} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'var(--text-secondary)' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                </button>
                                <div style={{ flex:1 }}>
                                    <div style={{ fontWeight:800, color:'var(--text-primary)' }}>Selección Manual</div>
                                    <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>Toca los ítems de arriba para activar/desactivar · {selectedPaymentItems.length} seleccionados</div>
                                </div>
                            </div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'8px' }}>
                                {(['Efectivo','Tarjeta','Sinpe'] as const).map(m => (
                                    <button key={m} onClick={() => { setPaymentMethod(m); if(m!=='Efectivo') setAmountReceived(tot.toString()); else setAmountReceived(''); }}
                                        style={{ flex:'1 1 80px', padding:'8px', borderRadius:'8px', fontSize:'0.8rem', fontWeight:600, border:'1px solid', cursor:'pointer', minHeight:'44px',
                                            ...(paymentMethod===m?{backgroundColor:'var(--primary-surface)',color:'var(--primary)',borderColor:'var(--primary)'}:{backgroundColor:'var(--surface)',color:'var(--text-secondary)',borderColor:'var(--surface-border)'}) }}
                                    >{m}</button>
                                ))}
                            </div>
                            {paymentMethod==='Efectivo' && (
                                <div style={{ display:'flex', gap:'10px', marginBottom:'8px', alignItems:'center' }}>
                                    <input type="number" placeholder="Monto recibido" min="0" value={amountReceived}
                                        onChange={e => setAmountReceived(e.target.value)}
                                        style={{ flex:1, padding:'10px', fontSize:'1rem', fontWeight:700, border:'2px solid var(--surface-border)', borderRadius:'8px' }} />
                                    {Number(amountReceived)>tot && (
                                        <div style={{ background:'var(--surface)', padding:'10px', borderRadius:'8px', border:'1px solid var(--surface-border)', textAlign:'center' }}>
                                            <div style={{ fontSize:'0.65rem', color:'var(--text-secondary)', fontWeight:600 }}>VUELTO</div>
                                            <div style={{ fontSize:'1.2rem', color:'#1a73e8', fontWeight:800 }}>{formatColones(Math.max(0,(Number(amountReceived)||0)-tot))}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                                <div>
                                    <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase', fontWeight:600 }}>Seleccionado</div>
                                    <div style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--primary)' }}>{formatColones(tot)}</div>
                                </div>
                                <div style={{ display:'flex', gap:'8px' }}>
                                    <button onClick={() => setSelectedPaymentItems(tableItems.map(i=>i.ID))} style={{ padding:'6px 12px', background:'var(--primary-surface)', color:'var(--primary)', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>Todo</button>
                                    <button onClick={() => setSelectedPaymentItems([])} style={{ padding:'6px 12px', background:'var(--danger-soft)', color:'var(--danger)', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>Nada</button>
                                </div>
                            </div>
                            <button onClick={checkOutAndClose}
                                disabled={closing===(selectedGroup.mesa||selectedGroup.ordenes[0].orden_nu)||tot===0||(paymentMethod==='Efectivo'&&Number(amountReceived)<tot)}
                                style={{ width:'100%', padding:'14px', background:tot===0?'var(--surface-border)':'var(--primary-gradient)', color:tot===0?'var(--text-muted)':'white', border:'none', borderRadius:'8px', fontSize:'0.9rem', fontWeight:800, textTransform:'uppercase', cursor:tot===0?'default':'pointer', boxShadow:tot===0?'none':'0 4px 12px rgba(37,211,102,0.3)' }}>
                                {closing===(selectedGroup.mesa||selectedGroup.ordenes[0].orden_nu)?'CERRANDO...': tot===0?'SELECCIONA ÍTEMS':`COBRAR ${formatColones(tot)}`}
                            </button>
                        </>
                        );
                    })()}

                    {/* ---------- MODO C: Partes Iguales ---------- */}
                    {splitMode === 'equal' && (() => {
                        const totalMesa = Math.round(checkoutSubtotal);
                        const parte = Math.ceil(totalMesa / splitN);
                        return (
                        <>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                                <button onClick={() => setSplitMode('none')} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'var(--text-secondary)' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                </button>
                                <div style={{ flex:1, fontWeight:800, color:'var(--text-primary)' }}>Partes Iguales</div>
                                <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>Total mesa: {formatColones(totalMesa)}</div>
                            </div>
                            {/* Selector N personas */}
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'20px', marginBottom:'12px', background:'var(--surface)', padding:'14px', borderRadius:'10px' }}>
                                <button onClick={() => setSplitN(n => Math.max(2,n-1))}
                                    style={{ width:'36px', height:'36px', borderRadius:'50%', border:'1px solid var(--surface-border)', background:'var(--card-bg)', color:'var(--text-primary)', cursor:'pointer', fontSize:'1.4rem', fontWeight:800 }}>−</button>
                                <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'2.5rem', fontWeight:800, color:'#1a73e8', lineHeight:1 }}>{splitN}</div>
                                    <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:600 }}>personas</div>
                                </div>
                                <button onClick={() => setSplitN(n => n+1)}
                                    style={{ width:'36px', height:'36px', borderRadius:'50%', border:'none', background:'var(--primary-surface)', cursor:'pointer', fontSize:'1.4rem', fontWeight:800, color:'#1a73e8' }}>+</button>
                            </div>
                            {/* Monto por persona */}
                            <div style={{ background:'linear-gradient(135deg,var(--accent-soft),var(--accent-soft))', borderRadius:'10px', padding:'14px', textAlign:'center', marginBottom:'12px' }}>
                                <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:700, textTransform:'uppercase', marginBottom:'4px' }}>Cada persona paga</div>
                                <div style={{ fontSize:'2rem', fontWeight:800, color:'var(--accent)' }}>{formatColones(parte)}</div>
                                <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'4px' }}>IVA incluido en precio</div>
                            </div>
                            {/* Modo de pago */}
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'8px' }}>
                                {(['Efectivo','Tarjeta','Sinpe'] as const).map(m => (
                                    <button key={m} onClick={() => { setPaymentMethod(m); if(m!=='Efectivo') setAmountReceived(parte.toString()); else setAmountReceived(''); }}
                                        style={{ flex:'1 1 80px', padding:'8px', borderRadius:'8px', fontSize:'0.8rem', fontWeight:600, border:'1px solid', cursor:'pointer', minHeight:'44px',
                                            ...(paymentMethod===m?{backgroundColor:'var(--primary-surface)',color:'var(--primary)',borderColor:'var(--primary)'}:{backgroundColor:'var(--surface)',color:'var(--text-secondary)',borderColor:'var(--surface-border)'}) }}
                                    >{m}</button>
                                ))}
                            </div>
                            {paymentMethod==='Efectivo' && (
                                <div style={{ display:'flex', gap:'10px', marginBottom:'8px', alignItems:'center' }}>
                                    <input type="number" placeholder={`Paga con (mínimo ${parte})`} min="0" value={amountReceived}
                                        onChange={e => setAmountReceived(e.target.value)}
                                        style={{ flex:1, padding:'10px', fontSize:'1rem', fontWeight:700, border:'2px solid var(--surface-border)', borderRadius:'8px' }} />
                                    {Number(amountReceived)>parte && (
                                        <div style={{ background:'var(--surface)', padding:'10px', borderRadius:'8px', border:'1px solid var(--surface-border)', textAlign:'center' }}>
                                            <div style={{ fontSize:'0.65rem', color:'var(--text-secondary)', fontWeight:600 }}>VUELTO</div>
                                            <div style={{ fontSize:'1.2rem', color:'#1a73e8', fontWeight:800 }}>{formatColones(Math.max(0,(Number(amountReceived)||0)-parte))}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Cobrar parte: registra un partial-close con recibido=parte */}
                            <button
                                disabled={closing===(selectedGroup.mesa||selectedGroup.ordenes[0].orden_nu)||(paymentMethod==='Efectivo'&&Number(amountReceived)<parte)}
                                onClick={async (e) => {
                                    setAmountReceived(parte.toString());
                                    await closeTableGroup(e, selectedGroup, paymentMethod, parte, selectedPaymentItems);
                                }}
                                style={{ width:'100%', padding:'14px', background:'linear-gradient(135deg,var(--accent),var(--accent))', color:'white', border:'none', borderRadius:'8px', fontSize:'0.9rem', fontWeight:800, textTransform:'uppercase', cursor:'pointer', boxShadow:'0 4px 12px var(--primary-glow)' }}>
                                {closing===(selectedGroup.mesa||selectedGroup.ordenes[0].orden_nu)?'PROCESANDO...': `COBRAR 1 DE ${splitN}: ${formatColones(parte)}`}
                            </button>
                        </>
                        );
                    })()}

                    </div>
                </div>
            )}

            {/* POS Modal (Nueva Comanda) */}
            {showPos && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--background)', zIndex: 2000, 
                    display: 'flex', flexDirection: 'column', fontFamily: 'Roboto, sans-serif', animation: 'slideUp 0.3s ease-out'
                }}>
                    <header style={{ 
                        height: '60px', background: 'var(--header-bg)', color: 'white', display: 'flex', alignItems: 'center', gap: '16px',
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
                        <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Tipo</label>
                                    <select 
                                        value={posTipo} onChange={e => setPosTipo(e.target.value)}
                                        style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 600, border: '2px solid var(--surface-border)', borderRadius: '8px', outline: 'none', background: 'var(--surface)' }}
                                    >
                                        <option value="Restaurante">Mesa (Local)</option>
                                        <option value="Llevar">Para Llevar</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Identificador</label>
                                    <input 
                                        type="text" placeholder={posTipo === 'Restaurante' ? 'Ej. 10' : 'Nombre'} 
                                        value={posTipo === 'Restaurante' ? posMesa : posCliente} 
                                        onChange={e => posTipo === 'Restaurante' ? setPosMesa(e.target.value) : setPosCliente(e.target.value)}
                                        style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 600, border: '2px solid var(--surface-border)', borderRadius: '8px', outline: 'none' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginLeft: '4px' }}>SELECCIÓN DE PLATILLOS</div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '160px' }}>
                            {menu.map(p => {
                                const inCart = cart.find(c => c.id === p.id);
                                return (
                                    <div key={p.id} onClick={() => addToCart(p)} style={{ 
                                        backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '16px 12px', cursor: 'pointer',
                                        boxShadow: inCart ? '0 4px 12px rgba(37,211,102,0.2)' : '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', 
                                        border: inCart ? '2px solid var(--primary)' : '2px solid transparent', transition: 'all 0.1s', position: 'relative'
                                    }}>
                                        {inCart && (
                                            <div style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--primary)', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                                {inCart.quantity}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.2 }}>{p.name}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 700, marginTop: 'auto' }}>{formatColones(p.price)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ 
                        position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'var(--card-bg)', 
                        borderTop: '1px solid var(--surface-border)', padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', boxShadow: '0 -4px 16px rgba(0,0,0,0.1)'
                    }}>
                        {cart.length > 0 ? (
                            <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '16px' }}>
                                {cart.map(c => (
                                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', background: 'var(--surface)', padding: '8px 12px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>{c.name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <button onClick={() => updateCartQty(c.id, -1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--surface-border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 800, color: 'var(--text-secondary)' }}>-</button>
                                            <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center', fontWeight: 700 }}>{c.quantity}</span>
                                            <button onClick={() => updateCartQty(c.id, 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--primary-surface)', color: 'var(--primary)', cursor: 'pointer', fontWeight: 800 }}>+</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px', padding: '20px', border: '2px dashed var(--surface-border)', borderRadius: '8px' }}>Ningún producto preparado</div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Estimado</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{formatColones(posTotal)}</div>
                            </div>
                            <button 
                                onClick={submitPosOrder}
                                disabled={cart.length === 0 || posLoading}
                                style={{ 
                                    padding: '16px 32px', background: cart.length === 0 ? 'var(--surface-border)' : 'var(--primary-gradient)', 
                                    color: cart.length === 0 ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: '8px',
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
                body { margin: 0; background-color: var(--background); }
                .loading-spinner { border: 3px solid var(--surface-border); border-left-color: var(--primary); border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                
                /* === RESET y BASE === */
                * { box-sizing: border-box; }
                
                /* === RESPONSIVE GLOBAL ADMIN === */
                @media (max-width: 480px) {
                    /* Cards de mesas: 1 columna en móvil */
                    div[style*="grid-template-columns: 'repeat(auto-fill, minmax(300px, 1fr))'"],
                    div[style*="repeat(auto-fill, minmax(300px, 1fr))"] {
                        grid-template-columns: 1fr !important;
                    }
                    
                    /* Botones de acción en cards de mesa */
                    div[style*="borderTop: '1px solid var(--surface-border)'"] button {
                        min-height: 44px !important;
                        font-size: 0.8rem !important;
                    }
                    
                    /* Checkout footer - asegurar botones touch-friendly */
                    div[style*="position: fixed"] button {
                        min-height: 48px !important;
                        padding: 12px 16px !important;
                        font-size: 0.9rem !important;
                    }
                    
                    /* Split mode buttons */
                    div[style*="flex:1 1 80px"],
                    div[style*="flex: '1 1 80px'"] {
                        flex: 1 1 100% !important;
                        min-height: 48px;
                    }
                    
                    /* Header del checkout: ajustar en móvil */
                    header {
                        flex-wrap: wrap !important;
                        height: auto !important;
                        padding: 12px 16px !important;
                        gap: 12px !important;
                    }
                }
                
                /* === Mejorar scroll en móvil === */
                @media (max-width: 768px) {
                    div[style*="overflow-y: auto"],
                    div[style*="overflowY: 'auto'"] {
                        -webkit-overflow-scrolling: touch;
                        overscroll-behavior: contain;
                    }
                    
                    /* Inputs más grandes en táctil */
                    input[type="number"], input[type="text"], select {
                        min-height: 48px !important;
                        font-size: 16px !important;
                    }
                }
            `}} />
            {/* Split Item por Cantidad Modal */}
            {splitItemModal && (() => {
                const item = splitItemModal.item;
                const restante = item.CANTIDAD - splitItemQty;
                const precioUnit = item.PRECIO;
                return (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 3001,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'Roboto, sans-serif'
                    }} onClick={() => { if (!splittingItem) { setSplitItemModal(null); setSplitItemQty(1); } }}>
                        <div style={{
                            backgroundColor: 'var(--card-bg)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.3)', maxHeight: '90vh', display: 'flex', flexDirection: 'column'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem' }}>Dividir cantidad</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.CANTIDAD}x {item.ARTICULO}</div>
                                </div>
                            </div>

                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                ¿Cuántas unidades quieres <strong style={{color:'var(--accent)'}}>separar</strong> en un ítem aparte?
                            </div>

                            {/* Selector de cantidad a separar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', background: 'var(--surface)', padding: '16px', borderRadius: '12px', marginBottom: '14px' }}>
                                <button
                                    onClick={() => setSplitItemQty(q => Math.max(1, q - 1))}
                                    disabled={splittingItem || splitItemQty <= 1}
                                    style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--surface-border)', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: splitItemQty<=1?'default':'pointer', fontSize: '1.4rem', fontWeight: 800, opacity: splitItemQty<=1?0.4:1 }}
                                >−</button>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{splitItemQty}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>de {item.CANTIDAD}</div>
                                </div>
                                <button
                                    onClick={() => setSplitItemQty(q => Math.min(item.CANTIDAD - 1, q + 1))}
                                    disabled={splittingItem || splitItemQty >= item.CANTIDAD - 1}
                                    style={{ width: '44px', height: '44px', borderRadius: '50%', border: 'none', background: 'var(--primary-surface)', color: 'var(--primary)', cursor: splitItemQty>=item.CANTIDAD-1?'default':'pointer', fontSize: '1.4rem', fontWeight: 800, opacity: splitItemQty>=item.CANTIDAD-1?0.4:1 }}
                                >+</button>
                            </div>

                            {/* Preview del resultado */}
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '0.85rem' }}>
                                <div style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '8px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quedará así</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                    <span>• {restante}x {item.ARTICULO} <span style={{color:'var(--text-secondary)', fontSize:'0.75rem'}}>(original)</span></span>
                                    <span style={{ fontWeight: 700 }}>{formatColones(precioUnit * restante)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent)' }}>
                                    <span>• {splitItemQty}x {item.ARTICULO} <span style={{color:'var(--text-secondary)', fontSize:'0.75rem'}}>(nuevo)</span></span>
                                    <span style={{ fontWeight: 700 }}>{formatColones(precioUnit * splitItemQty)}</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
                                    Luego puedes reasignar o cobrar cada uno por separado.
                                </div>
                            </div>

                            {/* Botones */}
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => { setSplitItemModal(null); setSplitItemQty(1); }}
                                    disabled={splittingItem}
                                    style={{ flex: 1, padding: '12px', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: '8px', fontWeight: 700, color: 'var(--text-secondary)', cursor: splittingItem?'default':'pointer' }}
                                >Cancelar</button>
                                <button
                                    onClick={submitSplitItem}
                                    disabled={splittingItem || splitItemQty < 1 || splitItemQty >= item.CANTIDAD}
                                    style={{ flex: 1.4, padding: '12px', background: splittingItem?'var(--surface-border)':'var(--primary-gradient)', border: 'none', borderRadius: '8px', fontWeight: 800, color: splittingItem?'var(--text-muted)':'white', cursor: splittingItem?'default':'pointer', textTransform: 'uppercase', fontSize: '0.85rem' }}
                                >{splittingItem ? 'Dividiendo...' : 'Dividir'}</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {/* Reassign Item Modal */}
            {reassignModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 3000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'Roboto, sans-serif'
                }} onClick={() => { setReassignModal(null); setReassignTarget(''); }}>
                    <div style={{
                        backgroundColor: 'var(--card-bg)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column'
                    }} onClick={e => e.stopPropagation()}>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ width: 40, height: 40, background: 'var(--primary-surface)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Gestionar Ítem</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {reassignModal.item.CANTIDAD}x {reassignModal.item.ARTICULO} ({formatColones(reassignModal.item.TOTAL)})
                                </p>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Reasignar a Otra Persona (Misma Mesa)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                {selectedGroup?.ordenes.filter(o => o.orden_nu !== reassignModal.item.Orden_Nu).map(o => (
                                    <button key={o.orden_nu} 
                                        onClick={() => setReassignTarget(o.orden_nu)}
                                        style={{ 
                                            padding: '12px', textAlign: 'left', borderRadius: '8px', cursor: 'pointer',
                                            border: reassignTarget === o.orden_nu ? '2px solid #1a73e8' : '1px solid var(--surface-border)',
                                            background: reassignTarget === o.orden_nu ? 'var(--primary-surface)' : 'var(--card-bg)',
                                            color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem'
                                    }}>
                                        👤 {stripMesaPrefix(o.cliente) || '(sin nombre)'} <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400}}>#{o.orden_nu}</span>
                                    </button>
                                ))}
                                {selectedGroup?.ordenes.filter(o => o.orden_nu !== reassignModal.item.Orden_Nu).length === 0 && (
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px' }}>No hay otras personas en esta mesa.</div>
                                )}
                            </div>

                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Transferir a Otra Mesa Activa
                            </div>
                            <select 
                                value={reassignTarget}
                                onChange={e => setReassignTarget(e.target.value)}
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.95rem', background: 'var(--card-bg)' }}
                            >
                                <option value="" disabled>Seleccionar mesa destino...</option>
                                {mesaGroups.filter(mg => mg.ordenes[0].orden_nu !== selectedGroup?.ordenes[0].orden_nu).map(mg => (
                                    <optgroup key={mg.ordenes[0].orden_nu} label={mg.mesa ? `Mesa ${mg.mesa}` : 'Para Llevar'}>
                                        {mg.ordenes.map(o => (
                                            <option key={o.orden_nu} value={o.orden_nu}>
                                                {mg.mesa ? `Mesa ${mg.mesa}` : ''} {stripMesaPrefix(o.cliente)} (#{o.orden_nu})
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => { setReassignModal(null); setReassignTarget(''); }} style={{ flex: 1, padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancelar</button>
                                <button onClick={submitReassignItem} disabled={!reassignTarget || reassigning} style={{ flex: 1, padding: '12px', background: reassignTarget ? '#1a73e8' : 'var(--surface-border)', border: 'none', borderRadius: '8px', fontWeight: 700, color: reassignTarget ? 'white' : 'var(--text-muted)', cursor: reassignTarget ? 'pointer' : 'default' }}>
                                    {reassigning ? 'Moviendo...' : 'Confirmar Mover'}
                                </button>
                            </div>
                            <button onClick={() => { 
                                setReassignModal(null); 
                                deleteItem(reassignModal.item.ID, reassignModal.item.ARTICULO); 
                            }} style={{ width: '100%', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--danger-soft)', borderRadius: '8px', fontWeight: 600, color: 'var(--danger)', cursor: 'pointer' }}>
                                🗑 Anular Definitivamente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Products Modal */}
            {showAddProducts && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px 16px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Agregar Productos</div>
                            <button onClick={() => setShowAddProducts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div style={{ padding: '12px', borderBottom: '1px solid var(--surface-border)' }}>
                            <input type="text" placeholder="Buscar producto..." value={productSearch} onChange={e => setProductSearch(e.target.value)}
                                autoFocus
                                style={{ width: '100%', padding: '12px', fontSize: '1rem', border: '1px solid var(--surface-border)', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', paddingBottom: selectedAddProducts.length > 0 ? '120px' : '12px' }}>
                            {menu.filter(p => productSearch === "" || p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No se encontraron productos</div>
                            ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                {menu.filter(p => productSearch === "" || p.name.toLowerCase().includes(productSearch.toLowerCase())).map((product: Product) => (
                                    <div key={product.id} onClick={() => addProductToSelection(product)} style={{ backgroundColor: 'var(--surface)', borderRadius: '8px', padding: '10px', cursor: 'pointer', border: '1px solid var(--card-border)', transition: 'all 0.1s' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.2 }}>{product.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>{formatColones(product.price)}</div>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>
                        {selectedAddProducts.length > 0 && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'var(--card-bg)', borderTop: '1px solid var(--surface-border)', padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }}>
                                <div style={{ marginBottom: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                                    {selectedAddProducts.map(p => (
                                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--surface-border)' }}>
                                            <div style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                <span style={{ fontWeight: 600 }}>{p.quantity}x</span> {p.name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <button onClick={() => updateSelectedAddQty(p.id, -1)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--surface-border)', backgroundColor: 'var(--card-bg)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{p.quantity}</span>
                                                <button onClick={() => updateSelectedAddQty(p.id, 1)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--surface-border)', backgroundColor: 'var(--card-bg)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={submitAddedProducts} disabled={addingProducts} style={{ width: '100%', padding: '14px', backgroundColor: addingProducts ? '#ccc' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 700, cursor: addingProducts ? 'default' : 'pointer', minHeight: '50px', boxShadow: addingProducts ? 'none' : '0 4px 12px rgba(37,211,102,0.3)' }}>
                                    {addingProducts ? 'Agregando...' : `Agregar ${selectedAddProducts.reduce((s, p) => s + p.quantity, 0)} items`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
