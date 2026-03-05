"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import { categories, type Product } from "@/data";
import { generateInvoice, type CartItem } from "@/lib/generateInvoice";
import cardStyles from "@/components/ProductCard.module.css";
import cartStyles from "@/components/Cart.module.css";

function formatColones(amount: number): string {
  return "\u20A1" + amount.toLocaleString("es-CR");
}

const MESAS = Array.from({ length: 15 }, (_, i) => `Mesa ${i + 1}`);
const API_KEY = process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY || "";

export default function POSPage() {
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  // Order info
  const [mesa, setMesa] = useState("Mesa 1");
  const [cliente, setCliente] = useState("");
  const [notas, setNotas] = useState("");

  // Dynamic categories from DB
  const dynamicCategories = useMemo(() => {
    const cats = new Set(productsList.map((p) => p.category));
    return ["Todos", ...Array.from(cats).sort()];
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
        if (data.products) setProductsList(data.products);
      } catch (error) {
        console.error("Error fetching menu:", error);
        setErrorMsg("Error cargando el menu. Por favor recarga la pagina.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMenu();
  }, []);

  // Filter products
  const filtered = useMemo(() => {
    return productsList.filter((p) => {
      const matchesCategory =
        activeCategory === "Todos" || p.category === activeCategory;
      const matchesSearch =
        search === "" || p.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory, productsList]);

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
    setNotas("");
    setMesa("Mesa 1");
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const handleConfirmInvoice = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          mesa,
          cliente,
          notas,
          items: cart.map((i) => ({
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error procesando la orden");

      const ordenNu = data.orden_nu;

      // Generate PDF
      await generateInvoice(cart, total, { mesa, cliente, notas }, ordenNu);

      // Show success
      setShowConfirm(false);
      setCartOpen(false);
      clearCart();
      setOrderSuccess(ordenNu);

      // Auto-dismiss success after 5 seconds
      setTimeout(() => setOrderSuccess(null), 5000);
    } catch (error: any) {
      console.error("Order processing error:", error);
      setErrorMsg(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="pos-layout">
        <div className="pos-main">
          {/* Header */}
          <div className="header">
            <div
              style={{ display: "flex", alignItems: "center", gap: "10px" }}
            >
              <Image
                src="/logoHide.png"
                alt="Hideaway"
                width={38}
                height={38}
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
                  Hideaway
                </h1>
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "rgba(238,247,240,0.5)",
                  }}
                >
                  Menu Digital
                </p>
              </div>
            </div>
            <div
              style={{
                fontSize: "0.72rem",
                color: "rgba(238,247,240,0.5)",
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

          {/* Order Info */}
          <div className="order-info-bar">
            <div className="order-field">
              <label htmlFor="select-mesa">Mesa</label>
              <select
                id="select-mesa"
                value={mesa}
                onChange={(e) => setMesa(e.target.value)}
              >
                {MESAS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
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
              />
            </div>
            <div className="order-field">
              <label htmlFor="input-notas">Notas especiales</label>
              <textarea
                id="input-notas"
                placeholder="Sin cebolla, alergia..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={1}
                maxLength={150}
              />
            </div>
          </div>

          {/* Search */}
          <input
            type="text"
            className="search-input"
            placeholder="Buscar en el menu..."
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="search-products"
          />

          {/* Categories — wrapping layout */}
          <div className="categories">
            {dynamicCategories.map((cat) => (
              <button
                key={cat}
                className={`category-pill ${activeCategory === cat ? "active" : ""}`}
                onClick={() => setActiveCategory(cat)}
                id={`cat-${cat.replace(/\s/g, "-")}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="products-grid">
            {isLoading ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "60px 0",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: "3px solid #e0e8e3",
                    borderTop: "3px solid #1cc672",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto 12px",
                  }}
                />
                <p style={{ fontSize: "0.9rem", color: "#5a7a66" }}>
                  Cargando menu...
                </p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
              </div>
            ) : filtered.length === 0 ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "60px 0",
                  color: "#8fa898",
                }}
              >
                <p style={{ fontSize: "1rem" }}>
                  No se encontraron articulos
                </p>
                <p style={{ fontSize: "0.8rem", marginTop: "6px" }}>
                  Intenta cambiar el filtro o la busqueda
                </p>
              </div>
            ) : (
              filtered.map((product) => (
                <div
                  key={product.id}
                  className={cardStyles.card}
                  onClick={() => addToCart(product)}
                  id={`product-${product.id}`}
                >
                  <span className={cardStyles.category}>
                    {product.category}
                  </span>
                  <span className={cardStyles.name}>{product.name}</span>
                  <div className={cardStyles.bottom}>
                    <span className={cardStyles.price}>
                      {formatColones(product.price)}
                    </span>
                    <button
                      className={cardStyles.addBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product);
                      }}
                      aria-label={`Agregar ${product.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* === FLOATING CART BAR (always visible when items in cart) === */}
      {totalItems > 0 && (
        <div className="floating-cart-bar">
          <div className="floating-cart-info">
            <span className="floating-cart-count">
              {totalItems} articulo{totalItems > 1 ? "s" : ""} en tu orden
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

      {/* === CART BOTTOM SHEET === */}
      {cartOpen && (
        <div
          className="modal-overlay"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ textAlign: "left" }}
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
                  {mesa}
                </span>
              </div>

              <div className={cartStyles.items}>
                {cart.length === 0 ? (
                  <div className={cartStyles.emptyMsg}>
                    Agrega articulos del menu
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className={cartStyles.item}>
                      <div className={cartStyles.itemInfo}>
                        <div className={cartStyles.itemName}>
                          {item.name}
                        </div>
                        <div className={cartStyles.itemPrice}>
                          {formatColones(item.price)} c/u
                        </div>
                      </div>
                      <div className={cartStyles.qtyControls}>
                        <button
                          className={cartStyles.qtyBtn}
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          -
                        </button>
                        <span className={cartStyles.qty}>
                          {item.quantity}
                        </span>
                        <button
                          className={cartStyles.qtyBtn}
                          onClick={() => updateQuantity(item.id, 1)}
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
                      >
                        x
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className={cartStyles.footer}>
                {errorMsg && (
                  <div
                    style={{
                      color: "#ef233c",
                      fontSize: "0.8rem",
                      marginBottom: "10px",
                      textAlign: "center",
                      background: "rgba(239,35,60,0.06)",
                      padding: "8px",
                      borderRadius: "8px",
                    }}
                  >
                    {errorMsg}
                  </div>
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
                  Enviar a Cocina
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

      {/* === CONFIRMATION MODAL === */}
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
            <p>Se enviara directamente a cocina.</p>
            <p>
              <strong>{mesa}</strong>
              {cliente ? ` - ${cliente}` : ""}
            </p>
            <p style={{ fontSize: "0.8rem", color: "#8fa898" }}>
              {totalItems} articulo{totalItems > 1 ? "s" : ""}
              {notas ? " - Notas especiales" : ""}
            </p>
            <div className="modal-total">{formatColones(total)}</div>

            {errorMsg && (
              <div
                style={{
                  color: "#ef233c",
                  fontSize: "0.85rem",
                  margin: "10px 0",
                  background: "rgba(239,35,60,0.06)",
                  padding: "10px",
                  borderRadius: "8px",
                }}
              >
                {errorMsg}
              </div>
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
                {isSubmitting ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === SUCCESS TOAST === */}
      {orderSuccess && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            background: "#0f2618",
            color: "#1cc672",
            padding: "16px 24px",
            borderRadius: "14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            textAlign: "center",
            animation: "fadeIn 0.3s ease",
            maxWidth: "90%",
          }}
        >
          <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>
            Orden enviada a cocina
          </div>
          <div style={{ fontSize: "0.85rem", color: "#ffb703" }}>
            Numero de orden: {orderSuccess}
          </div>
        </div>
      )}
    </>
  );
}
