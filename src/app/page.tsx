"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { generateInvoice } from "@/lib/generateInvoice";
import { type Product, type CartItem } from "@/types";
import cardStyles from "@/components/ProductCard.module.css";
import cartStyles from "@/components/Cart.module.css";

function formatColones(amount: number): string {
  const rounded = Math.round(amount).toString();
  return "\u20A1" + rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const API_KEY = process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY || "";

// Preferred category order for better cognitive flow
const CATEGORY_ORDER = [
  "Cocina",
  "Snacks & Entradas",
  "Bebidas Frías",
  "Café & Calientes",
  "Cócteles & Licores",
  "Postres",
  "Extras",
];

function sortCategories(cats: string[]): string[] {
  return cats.sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a);
    const idxB = CATEGORY_ORDER.indexOf(b);
    // Known categories first (by order), unknown at the end alphabetically
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, "es");
  });
}

function validateOrderBeforeSubmit(items: CartItem[], tableId: string): string | null {
  if (items.length === 0) return 'Agrega al menos un producto';
  if (!tableId || tableId.trim() === '' || tableId === 'Mesa --') return 'Asigna una mesa válida';
  if (items.some(i => i.price < 0 || isNaN(i.price))) return 'Precio inválido en orden';
  if (items.some(i => i.quantity < 1)) return 'Cantidad inválida';
  return null;
}

export default function POSPage() {
  const router = useRouter();
  const [mesaName, setMesaName] = useState("Mesa --");
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [isWaiterMode, setIsWaiterMode] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize table from URL param (e.g. ?mesa=9&nombre=Juan)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const mesaParam = params.get("mesa");
      const nombreParam = params.get("nombre");
      const waiterParam = params.get("waiter_mode");
      
      if (!mesaParam && waiterParam !== "true") {
        router.replace('/inicio');
        return;
      }

      if (waiterParam === "true") {
        setIsWaiterMode(true);
      }
      
      if (mesaParam) {
        const isNumeric = /^\d+$/.test(mesaParam.trim());
        setMesaName(isNumeric ? `Mesa ${mesaParam.trim()}` : mesaParam.trim());
      } else if (waiterParam === "true") {
        setMesaName("Mesa Principal"); // Waiter mode fallback
      }

      if (nombreParam) {
        setCliente(nombreParam);
        localStorage.setItem(`ffsv_name`, nombreParam);
      } else {
        const savedName = localStorage.getItem(`ffsv_name`);
        if (savedName) setCliente(savedName);
      }
    }
  }, []);

  // Cleanup redirect timer on unmount to prevent ghost redirect
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  const [isTableOccupied, setIsTableOccupied] = useState<boolean | null>(null);
  const [isCheckingTable, setIsCheckingTable] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [existingOrdenNu, setExistingOrdenNu] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  
  // Order info — mesa is fixed
  const [cliente, setCliente] = useState("");

  // Cart quantities map for fast lookup
  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((item) => map.set(item.id, item.quantity));
    return map;
  }, [cart]);

  // Dynamic categories from DB, sorted
  const dynamicCategories = useMemo(() => {
    const cats = new Set(productsList.map((p) => p.category));
    return ["Todos", ...sortCategories(Array.from(cats))];
  }, [productsList]);

  // Fetch Menu on Load
  useEffect(() => {
    async function fetchMenu() {
      try {
        const res = await fetch("/api/menu", {
          headers: { "x-api-key": API_KEY },
        });
        if (!res.ok) throw new Error("Failed to load menu");
        const data = await res.json();

        if (data.products) {
          // Re-map categories intuitively on the frontend
          const remapped = data.products.map((p: Product) => {
            const name = p.name.toLowerCase();
            let newCat = p.category;

            if (
              name.includes("licor") || name.includes("vino") || name.includes("gin") ||
              name.includes("imperial") || name.includes("bavaria") || name.includes("aperol") ||
              name.includes("tequila") || name.includes("ron") || p.category === "Bebidas Alcohólicas"
            ) {
              newCat = "Cócteles & Licores";
            } else if (
              name.includes("churro") || name.includes("helado") || name.includes("banana split") ||
              p.category === "Postres"
            ) {
              newCat = "Postres";
            } else if (
              name.includes("cafe") || name.includes("café") || name.includes("capuchino") ||
              name.includes("capucchino") || name.includes("chocolate caliente") ||
              name.includes("aguadulce") || p.category === "Bebidas Calientes"
            ) {
              newCat = "Café & Calientes";
            } else if (
              name.includes("limonada") || name.includes("coca cola") || name.includes("fanta") ||
              name.includes("jugo") || name.includes("batido") || name.includes("agua") ||
              name.includes("frio") || name.includes("frío") || p.category.includes("Frias") || p.category.includes("Frías")
            ) {
              newCat = "Bebidas Frías";
            } else if (
              name.includes("dedos") || name.includes("bizcocho") || name.includes("arepa") ||
              name.includes("patacon") || name.includes("patacón") || p.category === "Panadería y Snacks"
            ) {
              newCat = "Snacks & Entradas";
            } else if (
              name.includes("extra") || name.includes("adicional") || p.category === "Acompañamientos"
            ) {
              newCat = "Extras";
            } else if (p.category === "Platos Principales" || p.category === "Cocina") {
              newCat = "Cocina";
            }

            return { ...p, category: newCat };
          });

          setProductsList(remapped);
        }
      } catch (error) {
        console.error("Error fetching menu:", error);
        setErrorMsg("Error cargando el menú. Por favor recarga la página.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMenu();
  }, []);

  // Fetch Table Status
  useEffect(() => {
    async function checkTableStatus() {
        if (mesaName === "Mesa --" || mesaName === "Mesa Principal") {
          // If we are actively on the initial placeholder and there's a param, we will eventually re-run.
          // Let's just assume not occupied for dummy table, but don't mark as not checking immediately
          // actually the other effect will set it to Mesa X soon.
          setIsCheckingTable(false);
          setIsTableOccupied(false);
          return;
        }

      setIsCheckingTable(true);
      try {
        const savedToken = localStorage.getItem(`ffsv_token_${mesaName}`);
        const savedGuestToken = localStorage.getItem(`ffsv_guest_token_${mesaName}`);
        
        const params = new URLSearchParams({ mesa: mesaName });
        if (savedToken) params.append('session_token', savedToken);
        if (savedGuestToken) params.append('guest_token', savedGuestToken);

        const res = await fetch(`/api/table-status?${params.toString()}`, {
          headers: { "x-api-key": API_KEY },
        });

        if (!res.ok) {
          console.error("Failed to fetch table status");
          setIsTableOccupied(false);
        } else {
          const data = await res.json();
          setIsTableOccupied(data.isOccupied);
          setIsOwner(data.isOwner || false);
          setIsGuest(data.isGuest || false);
          setExistingOrdenNu(data.isOwner ? data.orden_nu : null);
          setIsBlocked(data.isBlocked || false);

          // Clean up tokens if table is no longer occupied
          if (!data.isOccupied) {
            localStorage.removeItem(`ffsv_token_${mesaName}`);
            localStorage.removeItem(`ffsv_guest_token_${mesaName}`);
          }
          
          // Frictionless Auto-Join: Save auto-generated guest token if provided
          if (data.guest_token) {
            localStorage.setItem(`ffsv_guest_token_${mesaName}`, data.guest_token);
          }

          // If guest token is no longer valid, remove it
          if (data.isOccupied && !data.isGuest && savedGuestToken && !data.guest_token) {
            localStorage.removeItem(`ffsv_guest_token_${mesaName}`);
          }
        }
      } catch (err) {
        console.error("Table status check error:", err);
        setIsTableOccupied(false);
      } finally {
        setIsCheckingTable(false);
      }
    }

    checkTableStatus();
  }, [mesaName, API_KEY]);

  // Top 15 "Productos Vitales" derived from ANALISIS_DE_DATOS.MD
  const TOP_ITEMS = useMemo(() => [
    "Cordon bleu",
    "New York steak",
    "Hamburgesa carne",
    "Chocolate con marshmallows",
    "Nuggets de pollo",
    "Pinto típico completo",
    "Sopa Mexicana",
    "Filet de pescado",
    "Casado de pescado",
    "Chocolate caliente",
    "Arroz con pollo",
    "Capuchino Grande",
    "Hamburguesa pollo",
    "Casado de pollo",
    "Dedos de queso tequeño"
  ], []);

  // Internal/illogical keywords to filter out of the self-order menu
  const EXCLUDED_KEYWORDS = useMemo(() => [
    "adicional", "incluida", "incluido", "huésped", "huesped", "empaque",
    "llevar", "copa agua", "guillermo", "gian"
  ], []);

  // Filter products
  const filtered = useMemo(() => {
    return productsList.filter((p) => {
      // 1. Filter by user selections UI
      const matchesCategory = activeCategory === "Todos" || p.category === activeCategory;
      const matchesSearch = search === "" || p.name.toLowerCase().includes(search.toLowerCase());

      // 2. Filter out illogical/internal items - ONLY for clients, not for waiters/admins
      const nameLower = p.name.toLowerCase();
      const isLogical = isWaiterMode || !EXCLUDED_KEYWORDS.some(kw => nameLower.includes(kw));

      // 3. Filter by price: clients (not waiter mode) only see items with price > 200
      const hasValidPrice = isWaiterMode || (p.price !== null && p.price > 200);

      return matchesCategory && matchesSearch && isLogical && hasValidPrice;

    }).sort((a, b) => {
      // Sort 1: Category Order (Cocina before Bebidas)
      const idxA = CATEGORY_ORDER.indexOf(a.category);
      const idxB = CATEGORY_ORDER.indexOf(b.category);
      const orderA = idxA === -1 ? 999 : idxA;
      const orderB = idxB === -1 ? 999 : idxB;
      if (orderA !== orderB) return orderA - orderB;

      // Sort 2: Top Products ("Platos más certeros" priority)
      const isTopA = TOP_ITEMS.indexOf(a.name);
      const isTopB = TOP_ITEMS.indexOf(b.name);

      // If both are top items, order by their rank in the Top list
      if (isTopA !== -1 && isTopB !== -1) return isTopA - isTopB;
      // If only A is top, A comes first
      if (isTopA !== -1) return -1;
      // If only B is top, B comes first
      if (isTopB !== -1) return 1;

      // Sort 3: Alphabetical fallback
      return a.name.localeCompare(b.name, "es");
    });
  }, [search, activeCategory, productsList, TOP_ITEMS, EXCLUDED_KEYWORDS]);

  // Cart actions
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          category: product.category,
        },
      ];
    });
  }, []);

  const decrementFromCart = useCallback((productId: string) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCliente("");
  }, []);

  const updateItemNote = useCallback((id: string, note: string) => {
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, notas: note } : item))
    );
  }, []);

  // Waiter Add Modal State
  const [waiterModal, setWaiterModal] = useState<Product | null>(null);
  const [waiterQty, setWaiterQty] = useState(1);
  const [waiterNota, setWaiterNota] = useState("");

  const handleWaiterAdd = () => {
    if (!waiterModal) return;
    setCart(prev => {
      const existingIdx = prev.findIndex(i => i.id === waiterModal.id && (i.notas || "") === waiterNota);
      if (existingIdx >= 0) {
        const newCart = [...prev];
        newCart[existingIdx].quantity += waiterQty;
        return newCart;
      } else {
        return [...prev, {
          id: waiterModal.id,
          name: waiterModal.name,
          price: waiterModal.price,
          quantity: waiterQty,
          category: waiterModal.category,
          notas: waiterNota
        }];
      }
    });
    setWaiterModal(null);
    setWaiterQty(1);
    setWaiterNota("");
  };


  const [isUnlocking, setIsUnlocking] = useState(false);
  const handleOwnerUnlock = async () => {
    setIsUnlocking(true);
    try {
      const savedToken = localStorage.getItem(`ffsv_token_${mesaName}`);
      const res = await fetch("/api/client/unlock-table", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ mesa: mesaName, session_token: savedToken })
      });
      if (res.ok) {
        alert("¡Mesa desbloqueada! Tu invitado tiene 5 minutos para escanear el código QR y unirse a la orden.");
      } else {
        alert("No se pudo desbloquear la mesa. Verifica con el mesero.");
      }
    } catch(e) {
      console.error(e);
      alert("Error de conexión al intentar desbloquear la mesa.");
    }
    setIsUnlocking(false);
  };

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const handleConfirmInvoice = async () => {
    const errorValidation = validateOrderBeforeSubmit(cart, mesaName);
    if (errorValidation) {
      setErrorMsg(errorValidation);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const savedToken = localStorage.getItem(`ffsv_token_${mesaName}`);
      const savedGuestToken = localStorage.getItem(`ffsv_guest_token_${mesaName}`);

      const res = await fetch("/api/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          mesa: mesaName,
          cliente,
          session_token: savedToken || undefined,
          guest_token: savedGuestToken || undefined,
          waiter_mode: isWaiterMode,
          items: cart.map((i) => ({
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            notas: i.notas
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error procesando la orden");

      const ordenNu = data.orden_nu;

      // Save the session_token if this is a new order
      if (data.session_token) {
        localStorage.setItem(`ffsv_token_${mesaName}`, data.session_token);
        setIsOwner(true);
        setExistingOrdenNu(ordenNu);
      }



      // Generate PDF only for new orders (not when adding to existing)
      if (!data.added_to_existing) {
        await generateInvoice(
          cart,
          total,
          { mesa: mesaName, cliente },
          ordenNu
        );
      }

      // Show success
      setShowConfirm(false);
      setCartOpen(false);
      clearCart();
      setOrderSuccess(ordenNu);

      // Waiter mode: redirect to /mesas after 2s so staff sees active tables
      if (isWaiterMode) {
        redirectTimerRef.current = setTimeout(() => {
          router.push('/mesas');
        }, 2000);
      } else {
        // Auto-dismiss success after 5 seconds for self-order mode
        setTimeout(() => setOrderSuccess(null), 5000);
      }

      // Lock the table now that an order was submitted successfully
      setIsTableOccupied(true);
    } catch (error: unknown) {
      console.error("Order processing error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setErrorMsg(errorMessage);

      // If it failed because the table became occupied, trigger the lock screen
      if (errorMessage.includes("ya tiene una orden") || errorMessage.includes("Ingresa el PIN")) {
        setTimeout(() => {
          setIsTableOccupied(true);
          setShowConfirm(false);
          setCartOpen(false);
        }, 4000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // No mesa parameter provided — show redirecting prompt
  if (mesaName === "Mesa --") {
    return (
      <div className="pos-layout" style={{ justifyContent: "center", alignItems: "center", display: "flex", minHeight: "100dvh" }}>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div className="loading-spinner" style={{ margin: "0 auto", marginBottom: "16px" }} />
          <p style={{ fontSize: "1rem", color: "#5f6368" }}>
            Redirigiendo a Inicio...
          </p>
        </div>
      </div>
    );
  }

  if (isCheckingTable) {
    return (
      <div className="pos-layout" style={{ justifyContent: "center", alignItems: "center", display: "flex", minHeight: "100vh" }}>
        <div className="empty-state">
          <div className="loading-spinner" />
          <p className="loading-text">Verificando mesa...</p>
        </div>
      </div>
    );
  }

  // Mesa Bloqueada UI
  if (isTableOccupied && !isOwner && !isGuest && !isWaiterMode) {
    return (
      <div className="pos-layout">
        <div className="pos-main" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          {/* ===== HEADER ===== */}
          <div className="header" style={{ flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Image src="/LogoFastF.jpeg" alt="Fast Food San Vicente" width={40} height={40} className="header-logo" priority />
              <div>
                <h1 style={{ fontSize: "1.1rem", fontWeight: 800, lineHeight: 1.2, color: "#eef7f0" }}>Fast Food San Vicente</h1>
                <p style={{ fontSize: "0.68rem", color: "rgba(238,247,240,0.45)", letterSpacing: "1px", textTransform: "uppercase" }}>
                  Menú Digital
                </p>
              </div>
            </div>
            <div style={{ fontSize: "0.72rem", color: "rgba(238,247,240,0.45)", textAlign: "right" }}>
              {new Date().toLocaleDateString("es-CR", { weekday: "short", day: "numeric", month: "short" })}
            </div>
          </div>

          {/* ===== BLOCKED SCREEN ===== */}
          <div className="pin-screen">
            <svg className="pin-icon" viewBox="0 0 24 24" fill="none" stroke="#e01b24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h2 className="pin-title" style={{color: "#e01b24"}}>{mesaName} está protegida</h2>
            <p className="pin-subtitle">
              Esta mesa ya tiene una orden activa y se encuentra bloqueada por seguridad. 
            </p>
            <p className="pin-hint" style={{marginTop: "20px"}}>
              Si eres parte de esta mesa, por favor <strong>solicita al Mesero</strong> que te habilite el acceso temporalmente, o pídele a quien abrió la orden que abra la mesa desde su pantalla.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pos-layout">
        <div className="pos-main">
          {isWaiterMode && (
            <div className="waiter-mode-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              Modo Mesero Activo
            </div>
          )}
          {/* ===== HEADER ===== */}
          <div className="header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Image
                src="/LogoFastF.jpeg"
                alt="Fast Food San Vicente"
                width={40}
                height={40}
                className="header-logo"
                priority
              />
              <div>
                <h1
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    lineHeight: 1.2,
                    color: "#eef7f0",
                  }}
                >
                  Fast Food San Vicente
                </h1>
                <p
                  style={{
                    fontSize: "0.68rem",
                    color: "rgba(238,247,240,0.45)",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  Menú Digital
                </p>
              </div>
            </div>
            <div
              style={{
                fontSize: "0.72rem",
                color: "rgba(238,247,240,0.45)",
                textAlign: "right",
              }}
            >
              {new Date().toLocaleDateString("es-CR", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </div>
          </div>

          {/* ===== ORDER INFO ===== */}
          {(isOwner || isGuest) && existingOrdenNu && !isWaiterMode && (
            <div style={{
              background: 'linear-gradient(135deg, #1a3d2a 0%, #2d5a3f 100%)',
              padding: '12px 16px',
              margin: '12px',
              borderRadius: '8px',
              border: '1px solid rgba(37, 211, 102, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <div style={{ fontWeight: 600, color: '#25d366', fontSize: '0.9rem' }}>
                    Orden activa: #{existingOrdenNu}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(238,247,240,0.7)' }}>
                    {isOwner 
                      ? 'Los artículos que agregues se sumarán a tu cuenta actual'
                      : 'Te has unido a la orden. Puedes agregar artículos.'}
                  </div>
                </div>
              </div>
              
              {isOwner && (
                <div className="pin-display">
                  <div style={{ flex: 1 }}>
                    <div className="pin-display-label">¿Llegó otro invitado?</div>
                    <div className="pin-display-value" style={{fontSize: "0.8rem", marginTop: "4px"}}>Pídele escanear este QR</div>
                  </div>
                  <button 
                    className={`pin-copy-btn`}
                    onClick={handleOwnerUnlock}
                    disabled={isUnlocking}
                  >
                    {isUnlocking ? 'Abriendo...' : 'Liberar Mesa'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="order-info-bar">
            {/* Mesa fija — not selectable */}
            <div className="order-field">
              <label>Mesa</label>
              <div className="mesa-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3h18v18H3z" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
                {mesaName}
              </div>
            </div>
            {!isWaiterMode && (
              <div className="order-field">
                <label htmlFor="input-cliente">Nombre (opcional)</label>
                <input
                  id="input-cliente"
                  type="text"
                  placeholder="Tu nombre..."
                  autoComplete="off"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  maxLength={40}
                  disabled={!!existingOrdenNu}
                  style={{ opacity: existingOrdenNu ? 0.6 : 1 }}
                />
              </div>
            )}
          </div>

          {/* ===== SEARCH ===== */}
          <div className="search-wrapper">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Buscar en el menú..."
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              id="search-products"
              aria-label="Buscar producto"
            />
          </div>

          {/* ===== CATEGORIES (Hidden in Waiter Mode) ===== */}
          {!isWaiterMode && (
            <div className="categories">
              {dynamicCategories.map((cat) => (
                <button
                  key={cat}
                  className={`category-pill ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => { setActiveCategory(cat); setSearch(""); }}
                  id={`cat-${cat.replace(/\s/g, "-")}`}
                  aria-pressed={activeCategory === cat}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* ===== PRODUCTS DISPLAY ===== */}
          {isWaiterMode ? (
            // WAITER MODE VIEW: Simple List, Search Driven
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {search.trim() === "" ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8fa898' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '16px', opacity: 0.5 }}>
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <p style={{ fontSize: '1.1rem', fontWeight: 500, color: '#2d5a3f' }}>Buscador Activo</p>
                  <p style={{ fontSize: '0.9rem' }}>Escriba el nombre del artículo para agregarlo a la comanda.</p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#d93025' }}>No hay coincidencias.</div>
              ) : (
                filtered.map((product) => (
                  <div 
                    key={product.id} 
                    onClick={() => {
                        setWaiterModal(product);
                        setWaiterQty(1);
                        setWaiterNota("");
                    }}
                    style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        padding: '16px', background: 'white', border: '1px solid #dce8e0', 
                        borderRadius: '12px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a2e23' }}>{product.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#8fa898', marginTop: '2px' }}>{product.category}</div>
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#2d5a3f' }}>
                      {formatColones(product.price)}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            // CUSTOMER MODE VIEW: Product Grid
            <div className="products-grid">
              {isLoading ? (
                <div className="empty-state">
                  <div className="loading-spinner" />
                  <p className="loading-text">Cargando menú...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <p>No se encontraron artículos</p>
                  <p>Intenta cambiar el filtro o la búsqueda</p>
                </div>
              ) : (
                filtered.map((product) => {
                  const qty = cartQtyMap.get(product.id) || 0;
                  return (
                    <div
                      key={product.id}
                      className={`${cardStyles.card} ${qty > 0 ? cardStyles.cardActive : ""}`}
                      onClick={() => addToCart(product)}
                      id={`product-${product.id}`}
                    >
                      <span className={cardStyles.category}>{product.category}</span>
                      <span className={cardStyles.name}>{product.name}</span>
                      <div className={cardStyles.bottom}>
                        <span className={cardStyles.price}>{formatColones(product.price)}</span>
                        <div className={cardStyles.cardControls}>
                          {qty > 0 && (
                            <>
                              <button
                                className={cardStyles.removeBtn}
                                onClick={(e) => { e.stopPropagation(); decrementFromCart(product.id); }}
                                aria-label={`Quitar ${product.name}`}
                              >
                                −
                              </button>
                              <span className={cardStyles.qtyBadge}>{qty}</span>
                            </>
                          )}
                          <button
                            className={cardStyles.addBtn}
                            onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                            aria-label={`Agregar ${product.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== FLOATING CART BAR ===== */}
      {totalItems > 0 && (
        <div className="floating-cart-bar">
          <div className="floating-cart-info">
            <span className="floating-cart-count">
              {totalItems} artículo{totalItems > 1 ? "s" : ""} en tu orden
            </span>
            <span className="floating-cart-total">{formatColones(total)}</span>
          </div>
          <button
            className="floating-cart-btn"
            onClick={() => setCartOpen(true)}
          >
            Ver Orden
          </button>
        </div>
      )}

      {/* ===== CART BOTTOM SHEET ===== */}
      {cartOpen && (
        <div
          className="modal-overlay"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ textAlign: "left" }}
            aria-live="polite"
          >
            <div className={cartStyles.sidebar}>
              <div className={cartStyles.title}>
                Tu Orden
                {totalItems > 0 && (
                  <span className={cartStyles.badge}>{totalItems}</span>
                )}
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "#8fa898",
                    marginLeft: "auto",
                  }}
                >
                  {mesaName}
                </span>
                <button
                  onClick={() => setCartOpen(false)}
                  aria-label="Cerrar vista de orden"
                  style={{
                    marginLeft: '12px',
                    width: '40px',
                    height: '40px',
                    minWidth: '40px',
                    borderRadius: '50%',
                    border: '2px solid #dce8e0',
                    backgroundColor: '#f7faf8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    color: '#5f6368',
                    flexShrink: 0,
                    touchAction: 'manipulation',
                  }}
                >
                  ✕
                </button>
              </div>

              <div className={cartStyles.items}>
                {cart.length === 0 ? (
                  <div className={cartStyles.emptyMsg}>
                    Agrega artículos del menú
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} style={{ marginBottom: '10px' }}>
                      <div className={cartStyles.item}>
                        {/* Row 1: name + unit price */}
                        <div className={cartStyles.itemInfo}>
                          <div className={cartStyles.itemName}>{item.name}</div>
                          <div className={cartStyles.itemPrice}>{formatColones(item.price)} c/u</div>
                        </div>
                        {/* Row 2: qty controls + total + remove */}
                        <div className={cartStyles.itemRow2}>
                          <div className={cartStyles.qtyControls}>
                            <button
                              className={cartStyles.qtyBtn}
                              onClick={() => updateQuantity(item.id, -1)}
                              aria-label={`Quitar ${item.name}`}
                            >
                              −
                            </button>
                            <span className={cartStyles.qty}>{item.quantity}</span>
                            <button
                              className={cartStyles.qtyBtn}
                              onClick={() => updateQuantity(item.id, 1)}
                              aria-label={`Agregar ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                          <span className={cartStyles.itemTotal}>
                            {formatColones(item.price * item.quantity)}
                          </span>
                          <button
                            className={cartStyles.removeBtn}
                            onClick={() => removeItem(item.id)}
                            aria-label={`Eliminar ${item.name}`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {/* Per-item note input */}
                      <div style={{ padding: '4px 0 0 0' }}>
                        <input
                          type="text"
                          placeholder={`Notas: ej. sin hielo, extra limón`}
                          value={item.notas || ""}
                          onChange={(e) => updateItemNote(item.id, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            fontSize: '0.8rem',
                            border: '1px solid #dce8e0',
                            borderRadius: '8px',
                            backgroundColor: '#f7faf8',
                            color: '#1a2e23',
                          }}
                          maxLength={100}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className={cartStyles.footer}>
                {errorMsg && (
                  <div className="error-inline">{errorMsg}</div>
                )}
                <div className={cartStyles.totalRow}>
                  <span className={cartStyles.totalLabel}>Total</span>
                  <span className={cartStyles.totalAmount}>
                    {formatColones(total)}
                  </span>
                </div>
                <button
                  className={cartStyles.invoiceBtn}
                  onClick={() => {
                    setCartOpen(false);
                    setShowConfirm(true);
                  }}
                  disabled={cart.length === 0}
                  id="checkout-btn"
                >
                  {isOwner || isGuest ? "Agregar a la Orden" : "Enviar a Cocina"}
                </button>
                {cart.length > 0 && (
                  <button
                    className={cartStyles.clearBtn}
                    onClick={clearCart}
                    id="clear-cart"
                  >
                    Vaciar orden
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONFIRMATION MODAL ===== */}
      {showConfirm && (
        <div
          className="modal-overlay"
          onClick={() => !isSubmitting && setShowConfirm(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Confirmar orden</h2>
            <p>Se enviará directamente a cocina.</p>
            <p>
              <strong>{mesaName}</strong>
              {cliente ? ` — ${cliente}` : ""}
            </p>
            <p style={{ fontSize: "0.8rem", color: "#8fa898" }}>
              {totalItems} artículo{totalItems > 1 ? "s" : ""}
            </p>
            <div className="modal-total">{formatColones(total)}</div>

            {errorMsg && (
              <div className="error-inline">{errorMsg}</div>
            )}

            <div className="modal-buttons" style={{ marginTop: "16px" }}>
              <button
                className="modal-btn-cancel"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
              >
                Regresar
              </button>
              <button
                className="modal-btn-confirm"
                onClick={handleConfirmInvoice}
                disabled={isSubmitting || cart.length === 0}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                {isSubmitting ? "Procesando..." : (isOwner ? "Agregar a mi orden" : "Confirmar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SUCCESS SCREEN ===== */}
      {orderSuccess && (
        <div className="order-success-overlay" role="status" aria-live="assertive">
          <div className="order-success-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="order-success-title">
            {isOwner ? "¡Artículos Agregados!" : "¡Comanda Enviada!"}
          </h2>
          <p className="order-success-sub">
            {isWaiterMode
              ? `Orden #${orderSuccess} en cocina. Volviendo a Mesas...`
              : isOwner
                ? "Los artículos se sumaron a tu cuenta."
                : `Tu pedido #${orderSuccess} ha sido enviado a la cocina.`
            }
          </p>
          {isWaiterMode && (
            <>
              <div className="order-success-progress" aria-hidden="true" />
              <button
                onClick={() => {
                  if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
                  router.push('/mesas');
                }}
                style={{
                  marginTop: '16px', padding: '12px 32px', background: 'rgba(255,255,255,0.15)',
                  border: '2px solid rgba(255,255,255,0.4)', borderRadius: '8px',
                  color: 'white', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                  touchAction: 'manipulation'
                }}
              >
                Ir a Mesas →
              </button>
            </>
          )}
        </div>
      )}
      {/* ===== WAITER ADD ITEM MODAL ===== */}
      {waiterModal && (
        <div className="modal-overlay" onClick={() => setWaiterModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#1a2e23' }}>{waiterModal.name}</h3>
            <p style={{ margin: '0 0 20px 0', color: '#2d5a3f', fontWeight: 600 }}>{formatColones(waiterModal.price)}</p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: '#5f6368', textTransform: 'uppercase', fontWeight: 700 }}>Cantidad</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#f7faf8', padding: '8px', borderRadius: '12px', border: '1px solid #dce8e0', width: 'fit-content' }}>
                <button 
                  onClick={() => setWaiterQty(Math.max(1, waiterQty - 1))}
                  aria-label="Disminuir cantidad"
                  style={{ width: '44px', height: '44px', borderRadius: '8px', border: 'none', background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', fontSize: '1.2rem', color: '#2d5a3f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                >−</button>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, minWidth: '24px', textAlign: 'center' }}>{waiterQty}</span>
                <button 
                  onClick={() => setWaiterQty(waiterQty + 1)}
                  style={{ width: '44px', height: '44px', borderRadius: '8px', border: 'none', background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', fontSize: '1.2rem', color: '#2d5a3f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                >+</button>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: '#5f6368', textTransform: 'uppercase', fontWeight: 700 }}>Notas (opcional)</label>
              <input 
                type="text" 
                placeholder="Ej. Sin cebolla, extra salsa..."
                value={waiterNota}
                onChange={e => setWaiterNota(e.target.value)}
                autoComplete="off"
                style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #dce8e0', fontSize: '1rem', background: '#f7faf8', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setWaiterModal(null)} 
                style={{ flex: 1, padding: '14px', background: 'white', border: '1px solid #dce8e0', borderRadius: '8px', fontWeight: 700, color: '#5f6368', cursor: 'pointer' }}
              >Cancelar</button>
              <button 
                onClick={handleWaiterAdd} 
                style={{ flex: 2, padding: '14px', background: '#25d366', border: 'none', borderRadius: '8px', fontWeight: 700, color: 'white', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)' }}
              >Agregar Artículo →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
