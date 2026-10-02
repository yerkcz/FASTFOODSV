"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { type Product, type CartItem } from "@/types";
import cardStyles from "@/components/ProductCard.module.css";
import cartStyles from "@/components/Cart.module.css";
import { formatColones } from "@/lib/format";

const API_KEY = process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY || "";

// Orden de categorías del menú nuevo de Delissia (`docs/Delissia/Menu NUevo.txt`).
// Solo existen estas dos: cualquier otra cae al `else` y se ordena alfabético.
const CATEGORY_ORDER = ["Típicos", "Deli"];

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

function validateOrderBeforeSubmit(items: CartItem[], totalFinal: number): string | null {
  if (items.length === 0) return 'Agrega al menos un producto';
  if (items.some(i => i.price < 0 || isNaN(i.price))) return 'Precio inválido en orden';
  if (items.some(i => i.quantity < 1)) return 'Cantidad inválida';
  // La venta es INDIVIDUAL: no hay mesa que asignar. Lo único que no se puede
  // cobrar es un total no positivo (ej. un descuento que se lo lleva todo).
  if (!isFinite(totalFinal) || totalFinal <= 0) return 'El total debe ser mayor a ₡0';
  return null;
}

export default function POSPage() {
  const router = useRouter();
  // El POS ya no depende de una mesa: sin `?mesa=` la venta es INDIVIDUAL
  // (0011). `?cliente=`/`?nombre=` solo sirven para precargar el nombre de la
  // venta, y `?waiter_mode=true` sigue sirviendo para el modo lista.
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [isWaiterMode, setIsWaiterMode] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const nombreParam = params.get("nombre");
      const llevarParam = params.get("llevar");
      const waiterParam = params.get("waiter_mode");

      if (waiterParam === "true") setIsWaiterMode(true);

      const nombre = nombreParam || llevarParam || "";
      if (nombre) {
        setCliente(nombre);
        localStorage.setItem("eas_name", nombre);
      } else {
        const savedName = localStorage.getItem("eas_name");
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

  // ── Datos de la venta (todo individual, sin mesa) ─────────────────────────
  const [cliente, setCliente] = useState("");

  // Descuento: `porcentaje` o `monto`. El valor lo resuelve la DB en el
  // trigger `trg_recalcular_total_orden` (con clamp a subtotal), así que aquí
  // solo calculamos el número que se le va a ENVIAR, nunca el total final.
  const [descTipo, setDescTipo] = useState<"porcentaje" | "monto">("porcentaje");
  const [descValor, setDescValor] = useState("");
  const [descMotivo, setDescMotivo] = useState("");

  // Cargos extra (delivery, propina simbólica, empaque…): van como LÍNEA en
  // `orden_items` con `tipo_linea='extra'`, no como número suelto, para que
  // entren solos en SUM(subtotal) y el guard de cobro siga cuadrando.
  const [extras, setExtras] = useState<{ nombre: string; monto: number }[]>([]);
  const [extraNombre, setExtraNombre] = useState("");
  const [extraMonto, setExtraMonto] = useState("");

  // Total editable. Si queda vacío se usa el calculado; si el cajero teclea
  // uno distinto, se traduce a un descuento en MONTOS (bruto − total) para no
  // añadir una segunda fuente de verdad del total.
  const [totalManual, setTotalManual] = useState("");

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
          // El menú nuevo de Delissia ya viene con sus dos categorías reales
          // (Típicos / Deli). El remap viejo reetiquetaba por nombre de
          // producto contra categorías que ya no existen, así que se elimina:
          // si el menú cambia, cambia aquí.
          setProductsList(data.products as Product[]);
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

  // ── Cargos extra ──────────────────────────────────────────────────────────
  const agregarExtra = useCallback(() => {
    const monto = Number(extraMonto.replace(",", ".")) || 0;
    const nombre = extraNombre.trim();
    if (!nombre || monto <= 0) return;
    setExtras((prev) => [...prev, { nombre, monto }]);
    setExtraNombre("");
    setExtraMonto("");
  }, [extraNombre, extraMonto]);

  const quitarExtra = useCallback((idx: number) => {
    setExtras((prev) => prev.filter((_, i) => i !== idx));
  }, []);


  // ── Dinero de la venta ─────────────────────────────────────────────────────
  // `bruto` = Σ ítems + extras. El descuento se calcula AQUÍ SOLO para
  // mostrarlo: la cifra que manda es la que resuelve la DB en el trigger
  // `trg_recalcular_total_orden`, que usa la misma fórmula con el mismo
  // clamp (nunca descuenta más que el subtotal). Así la UI y el backend no
  // pueden divergir, y el API jamás recibe un `total` escrito a mano.
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const extrasTotal = useMemo(() => extras.reduce((s, e) => s + e.monto, 0), [extras]);
  const bruto = subtotal + extrasTotal;

  const descuentoCalculado = useMemo(() => {
    const v = Math.abs(Number(String(descValor).replace(",", ".")) || 0);
    if (v <= 0 || bruto <= 0) return 0;
    if (descTipo === "porcentaje") return Math.min(bruto, (bruto * Math.min(v, 100)) / 100);
    return Math.min(bruto, v);
  }, [descTipo, descValor, bruto]);

  const totalCalculado = Math.max(0, bruto - descuentoCalculado);

  /**
   * Total editable (campo en el formulario). Si queda vacío se usa el
   * calculado; si el cajero teclea otro, ese manda y se convierte en un
   * DESCUENTO EN MONTOS (bruto − total) para no añadir una segunda fuente de
   * verdad del total. Un total mayor al bruto no se puede representar — eso
   * es un cargo extra, y justo para eso existe la fila de extras.
   */
  const totalFinal = useMemo(() => {
    if (totalManual.trim() === "") return totalCalculado;
    const tecleado = Number(totalManual.replace(",", ".")) || 0;
    return Math.max(0, Math.min(tecleado, bruto));
  }, [totalManual, totalCalculado, bruto]);

  /**
   * Descuento REAL de esta venta: `bruto − totalFinal`. Se usa para pintar el
   * renglón del resumen, de modo que lo que ve el cajero en pantalla es
   * exactamente lo que va a registrar la DB — ni el % tecleado ni un número
   * calculado por otro lado.
   */
  const descuentoAplicado = Math.max(0, Math.round((bruto - totalFinal) * 100) / 100);

  /** Lo que se le manda al API como `descuento` (null = sin descuento). */
  const descuentoPayload = useMemo(() => {
    const num = Math.abs(Number(String(descValor).replace(",", ".")) || 0);
    const motivo = descMotivo.trim() ? descMotivo.trim() : undefined;

    // Total tecleado a mano: manda el resultado, en monto.
    if (totalManual.trim() !== "") {
      const monto = descuentoAplicado;
      return monto > 0 ? { tipo: "monto" as const, valor: monto, motivo } : null;
    }

    // Sin total manual: manda el % o el monto que eligió el cajero (queda
    // registrado como regla, no como número mágico) y la DB lo resuelve
    // contra el bruto del momento.
    if (num <= 0) return null;
    return { tipo: descTipo, valor: num, motivo };
  }, [totalManual, descuentoAplicado, descValor, descMotivo, descTipo]);

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  /** Vuelve a dejar la venta en blanco (no el carrito: eso lo hace clearCart). */
  const resetVenta = useCallback(() => {
    setCliente("");
    setDescValor("");
    setDescMotivo("");
    setExtras([]);
    setExtraNombre("");
    setExtraMonto("");
    setTotalManual("");
  }, []);

  const handleConfirmInvoice = async () => {
    const errorValidation = validateOrderBeforeSubmit(cart, totalFinal);
    if (errorValidation) {
      setErrorMsg(errorValidation);
      return;
    }

    // Un total tecleado MAYOR al bruto no se puede cobrar: el descuento es
    // siempre ≥ 0 y la DB no acepta un total por encima de la suma de los
    // items. En vez de cobrar otro número distinto al que ve el cajero, se
    // corta aquí y se le explica (si necesita cobrar más, que agregue un
    // cargo extra).
    const tecleado = Number(totalManual.replace(",", ".")) || 0;
    if (totalManual.trim() !== "" && tecleado > bruto + 0.01) {
      setErrorMsg(
        `El total no puede superar los ${formatColones(bruto)} de esta venta. ` +
          "Si es un cargo adicional, agrégalo como cargo extra."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          // Sin `mesa`: el API marca la orden como `tipo:'individual'` y deja
          // `mesa_numero` en NULL. Cada envío es una venta propia y cerrable
          // por su cuenta.
          tipo: "individual",
          cliente: cliente.trim(),
          items: cart.map((i) => ({
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            notas: i.notas,
          })),
          ...(descuentoPayload ? { descuento: descuentoPayload } : {}),
          extras: extras.map((e) => ({ nombre: e.nombre, monto: e.monto })),
          // NOTA: no se manda ningún `pago`/abono. `close-table` cobra el
          // total completo al cerrar, así que un abono aquí se cobraría dos
          // veces. El abono inicial (50% de `PeticionCliente` #4) se habilita
          // junto con el cobro por saldo pendiente.
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error procesando la orden");

      const ordenNu = data.orden_nu;

      setShowConfirm(false);
      setCartOpen(false);
      clearCart();
      resetVenta();
      setOrderSuccess(ordenNu);

      // Modo lista: vuelve a /inicio (la vista de mesas ya no existe) para
      // que el personal vea el registro de órdenes del día.
      if (isWaiterMode) {
        redirectTimerRef.current = setTimeout(() => {
          router.push("/inicio");
        }, 2000);
      } else {
        setTimeout(() => setOrderSuccess(null), 5000);
      }
    } catch (error: unknown) {
      console.error("Order processing error:", error);
      setErrorMsg(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setIsSubmitting(false);
    }
  };

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
                src="/logo.svg"
                alt="easystem"
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
                  easystem
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

          {/* ===== DATOS DE LA VENTA (individual, sin mesa) ===== */}
          <div className="order-info-bar">
            <div className="order-field">
              <label htmlFor="input-cliente">Cliente de la venta (opcional)</label>
              <input
                id="input-cliente"
                type="text"
                placeholder="Ej. Yerick, Pedido mostrador..."
                autoComplete="off"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                maxLength={40}
              />
            </div>
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
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '16px', opacity: 0.5 }}>
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--primary)' }}>Buscador Activo</p>
                  <p style={{ fontSize: '0.9rem' }}>Escriba el nombre del artículo para agregarlo a la comanda.</p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--danger)' }}>No hay coincidencias.</div>
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
                        padding: '16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', 
                        borderRadius: '12px', cursor: 'pointer', boxShadow: 'var(--card-shadow)'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{product.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{product.category}</div>
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)' }}>
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
              {totalItems} artículo{totalItems > 1 ? "s" : ""} en la venta
            </span>
            <span className="floating-cart-total">{formatColones(totalFinal)}</span>
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
                  {cliente.trim() || "Venta individual"}
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
                {/* ── Descuento ── */}
                <div className={cartStyles.ventaBox}>
                  <div className={cartStyles.filaRow}>
                    <span className={cartStyles.filaLabel}>Descuento</span>
                    <div className={cartStyles.segmented} role="group" aria-label="Tipo de descuento">
                      <button
                        type="button"
                        className={descTipo === "porcentaje" ? cartStyles.segOn : cartStyles.seg}
                        onClick={() => setDescTipo("porcentaje")}
                        aria-pressed={descTipo === "porcentaje"}
                        aria-label="Descuento por porcentaje"
                      >
                        %
                      </button>
                      <button
                        type="button"
                        className={descTipo === "monto" ? cartStyles.segOn : cartStyles.seg}
                        onClick={() => setDescTipo("monto")}
                        aria-pressed={descTipo === "monto"}
                        aria-label="Descuento en colones"
                      >
                        ₡
                      </button>
                    </div>
                    <input
                      id="desc-valor"
                      className={cartStyles.campoSm}
                      inputMode="decimal"
                      placeholder={descTipo === "porcentaje" ? "0 %" : "₡0"}
                      value={descValor}
                      onChange={(e) => setDescValor(e.target.value.replace(/[^0-9.,]/g, ""))}
                      aria-label="Valor del descuento"
                    />
                    <input
                      id="desc-motivo"
                      className={cartStyles.campo}
                      type="text"
                      placeholder="Motivo (opcional)"
                      value={descMotivo}
                      onChange={(e) => setDescMotivo(e.target.value)}
                      maxLength={60}
                    />
                  </div>

                  {/* ── Cargo extra ── */}
                  <div className={cartStyles.filaRow}>
                    <span className={cartStyles.filaLabel}>
                      Cargo extra (delivery, empaque…)
                    </span>
                    <input
                      id="extra-nombre"
                      className={cartStyles.campo}
                      type="text"
                      placeholder="Nombre"
                      value={extraNombre}
                      onChange={(e) => setExtraNombre(e.target.value)}
                      maxLength={40}
                    />
                    <input
                      id="extra-monto"
                      className={cartStyles.campoSm}
                      inputMode="decimal"
                      placeholder="₡0"
                      value={extraMonto}
                      onChange={(e) => setExtraMonto(e.target.value.replace(/[^0-9.,]/g, ""))}
                      aria-label="Monto del cargo extra"
                    />
                    <button
                      type="button"
                      className={cartStyles.addBtn}
                      onClick={agregarExtra}
                      disabled={
                        !extraNombre.trim() ||
                        !Number(extraMonto.replace(",", ".")) ||
                        Number(extraMonto.replace(",", ".")) <= 0
                      }
                      aria-label="Agregar cargo extra"
                    >
                      +
                    </button>
                  </div>

                  {extras.map((e, i) => (
                    <div key={`${e.nombre}-${i}`} className={cartStyles.extraLinea}>
                      <span className={cartStyles.extraNombre}>{e.nombre}</span>
                      <span className={cartStyles.extraMonto}>+{formatColones(e.monto)}</span>
                      <button
                        type="button"
                        className={cartStyles.extraQuitar}
                        onClick={() => quitarExtra(i)}
                        aria-label={`Quitar ${e.nombre}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* ── Resumen ── */}
                  <div className={cartStyles.resumen}>
                    <div className={cartStyles.resumenRow}>
                      <span>
                        Subtotal ({totalItems} ítem{totalItems === 1 ? "" : "s"})
                      </span>
                      <span>{formatColones(subtotal)}</span>
                    </div>
                    {extrasTotal > 0 && (
                      <div className={cartStyles.resumenRow}>
                        <span>Cargos extra ({extras.length})</span>
                        <span>+{formatColones(extrasTotal)}</span>
                      </div>
                    )}
                    {descuentoAplicado > 0 && (
                      <div className={`${cartStyles.resumenRow} ${cartStyles.resumenDesc}`}>
                        <span>
                          Descuento
                          {descTipo === "porcentaje" && descValor
                            ? ` ${descValor.replace(/[^\d.,]/g, "")} %`
                            : ""}
                        </span>
                        <span>−{formatColones(descuentoAplicado)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Total (editable) ── */}
                <div className={cartStyles.totalRow}>
                  <span className={cartStyles.totalLabel}>Total</span>
                  <div className={cartStyles.totalWrap}>
                    <input
                      id="total-manual"
                      className={cartStyles.totalInput}
                      inputMode="decimal"
                      value={totalManual}
                      placeholder={formatColones(totalCalculado)}
                      onChange={(e) => setTotalManual(e.target.value.replace(/[^0-9.,]/g, ""))}
                      aria-label="Total de la venta, editable"
                    />
                    {totalManual !== "" && (
                      <button
                        type="button"
                        className={cartStyles.totalReset}
                        onClick={() => setTotalManual("")}
                        aria-label="Restablecer el total calculado"
                      >
                        ↺
                      </button>
                    )}
                  </div>
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
                  {isWaiterMode ? "Enviar a Cocina" : "Registrar venta"}
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
            <h2>Confirmar venta</h2>
            <p>
              {cliente.trim() || "Sin nombre — venta individual"}
            </p>
            <p style={{ fontSize: "0.8rem", color: "#8fa898" }}>
              {totalItems} artículo{totalItems > 1 ? "s" : ""}
              {extras.length > 0
                ? ` · ${extras.length} cargo${extras.length > 1 ? "s" : ""} extra`
                : ""}
            </p>
            {descuentoAplicado > 0 && (
              <p style={{ fontSize: "0.85rem", color: "#e01b24", fontWeight: 600 }}>
                Descuento: −{formatColones(descuentoAplicado)}
              </p>
            )}
            <div className="modal-total">{formatColones(totalFinal)}</div>

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
                {isSubmitting ? "Procesando..." : "Registrar venta"}
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
          <h2 className="order-success-title">¡Venta registrada!</h2>
          <p className="order-success-sub">
            {isWaiterMode
              ? `Orden #${orderSuccess} en cocina. Volviendo a Órdenes...`
              : `La venta #${orderSuccess} quedó registrada en Órdenes.`
            }
          </p>
          {isWaiterMode && (
            <>
              <div className="order-success-progress" aria-hidden="true" />
              <button
                onClick={() => {
                  if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
                  router.push('/inicio');
                }}
                style={{
                  marginTop: '16px', padding: '12px 32px', background: 'rgba(255,255,255,0.15)',
                  border: '2px solid rgba(255,255,255,0.4)', borderRadius: '8px',
                  color: 'white', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                  touchAction: 'manipulation'
                }}
              >
                Ir a Órdenes →
              </button>
            </>
          )}
        </div>
      )}
      {/* ===== WAITER ADD ITEM MODAL ===== */}
      {waiterModal && (
        <div className="modal-overlay" onClick={() => setWaiterModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: '24px', background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>{waiterModal.name}</h3>
            <p style={{ margin: '0 0 20px 0', color: 'var(--primary)', fontWeight: 600 }}>{formatColones(waiterModal.price)}</p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Cantidad</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--surface)', padding: '8px', borderRadius: '12px', border: '1px solid var(--surface-border)', width: 'fit-content' }}>
                <button 
                  onClick={() => setWaiterQty(Math.max(1, waiterQty - 1))}
                  aria-label="Disminuir cantidad"
                  style={{ width: '44px', height: '44px', borderRadius: '8px', border: 'none', background: 'var(--card-bg)', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontSize: '1.2rem', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                >−</button>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, minWidth: '24px', textAlign: 'center', color: 'var(--text-primary)' }}>{waiterQty}</span>
                <button 
                  onClick={() => setWaiterQty(waiterQty + 1)}
                  style={{ width: '44px', height: '44px', borderRadius: '8px', border: 'none', background: 'var(--card-bg)', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontSize: '1.2rem', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                >+</button>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Notas (opcional)</label>
              <input 
                type="text" 
                placeholder="Ej. Sin cebolla, extra salsa..."
                value={waiterNota}
                onChange={e => setWaiterNota(e.target.value)}
                autoComplete="off"
                style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '1rem', background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setWaiterModal(null)} 
                style={{ flex: 1, padding: '14px', background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}
              >Cancelar</button>
              <button 
                onClick={handleWaiterAdd} 
                style={{ flex: 2, padding: '14px', background: 'var(--primary)', border: 'none', borderRadius: '8px', fontWeight: 700, color: 'white', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
              >Agregar Artículo →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
