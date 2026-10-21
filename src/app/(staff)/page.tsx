'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type CartItem, type Product } from '@/types';
import { formatColones } from '@/lib/format';
import cardStyles from '@/components/ProductCard.module.css';
import cartStyles from '@/components/Cart.module.css';

type MenuResponse = {
  products?: Product[];
  categories?: string[];
};

type OrderResponse = {
  success?: boolean;
  orden_nu?: string;
  error?: string;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function StaffPosPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successId, setSuccessId] = useState<string | null>(null);

  const [mesa, setMesa] = useState<number | null>(null);
  const [isLlevar, setIsLlevar] = useState(false);
  const [cliente, setCliente] = useState('');
  const [notes, setNotes] = useState('');
  const [locationReady, setLocationReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const takeaway = params.get('llevar');
    const customer = params.get('nombre');
    const table = Number.parseInt(params.get('mesa') || '', 10);
    if (customer) setCliente(customer);
    if (takeaway) {
      setIsLlevar(true);
      setMesa(99);
      setCliente(takeaway);
    } else if (Number.isInteger(table) && table >= 1 && table <= 6) {
      setMesa(table);
    }
    setLocationReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/menu')
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as MenuResponse;
        if (!response.ok) throw new Error(data.products ? 'Error al cargar el menú' : 'No autorizado');
        if (!cancelled) {
          setProducts(Array.isArray(data.products) ? data.products : []);
          setCategories(Array.isArray(data.categories) ? data.categories : []);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Error al cargar el menú');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = normalize(search);
    return products.filter((product) => {
      if (category !== 'Todos' && product.category !== category) return false;
      if (!query) return true;
      return normalize(product.name).includes(query);
    });
  }, [products, category, search]);

  const cartQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) map.set(item.id, item.quantity);
    return map;
  }, [cart]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = useCallback((product: Product) => {
    setCart((previous) => {
      const existing = previous.find((item) => item.id === product.id);
      if (existing) {
        return previous.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...previous, { ...product, quantity: 1, notas: '' }];
    });
  }, []);

  const changeQuantity = useCallback((id: string, delta: number) => {
    setCart((previous) =>
      previous
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const updateNote = useCallback((id: string, notas: string) => {
    setCart((previous) =>
      previous.map((item) => (item.id === id ? { ...item, notas } : item))
    );
  }, []);

  const submitOrder = async () => {
    if (!mesa || cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesa,
          tipo: isLlevar ? 'llevar' : 'mesa',
          cliente: cliente || '',
          notas: notes,
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
            notas: item.notas || '',
          })),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as OrderResponse;
      if (!response.ok) {
        setError(data.error || 'No se pudo enviar la comanda');
        return;
      }
      setShowConfirm(false);
      setCartOpen(false);
      setCart([]);
      setNotes('');
      setSuccessId(data.orden_nu || 'ok');
      window.setTimeout(() => {
        router.push('/mesas');
        router.refresh();
      }, 1500);
    } catch {
      setError('Error de conexión al enviar la comanda');
    } finally {
      setSubmitting(false);
    }
  };

  if (!locationReady) {
    return (
      <div className="pos-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!mesa) {
    return (
      <div className="pos-layout" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div className="empty-state">
          <p>No se indicó una mesa.</p>
          <p>Elegí una mesa o un pedido para llevar.</p>
          <Link
            href="/nueva-comanda"
            style={{
              display: 'inline-block',
              marginTop: '18px',
              padding: '12px 18px',
              borderRadius: '10px',
              background: 'var(--primary)',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Ir a Nueva Comanda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      <div className="pos-main">
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link href="/mesas" aria-label="Volver a mesas" style={{ color: 'white', display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </Link>
            <Image src="/logo.svg" alt="easystem" width={36} height={36} className="header-logo" />
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--header-text)' }}>
                {isLlevar ? 'Para Llevar' : `Mesa ${mesa}`}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(238,247,240,0.72)' }}>
                {isLlevar ? cliente || 'Mostrador' : 'Nueva comanda'}
              </div>
            </div>
          </div>
          <div className="mesa-badge" style={{ background: 'rgba(255,255,255,0.12)', color: 'white', borderColor: 'rgba(255,255,255,0.15)' }}>
            {totalItems} item{totalItems === 1 ? '' : 's'}
          </div>
        </header>

        <div className="order-info-bar">
          <div className="order-field">
            <label htmlFor="cliente">{isLlevar ? 'Nombre del cliente' : 'Cliente (opcional)'}</label>
            <input
              id="cliente"
              type="text"
              value={cliente}
              onChange={(event) => setCliente(event.target.value)}
              placeholder={isLlevar ? 'Nombre para llamar el pedido' : 'Ej: Juan'}
              maxLength={120}
            />
          </div>
          <div className="order-field">
            <label htmlFor="notas">Notas de la comanda (opcional)</label>
            <textarea
              id="notas"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ej: todo junto, sin cubiertos…"
              maxLength={500}
              rows={2}
            />
          </div>
        </div>

        <div className="search-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="search-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto…"
            aria-label="Buscar producto"
          />
        </div>

        <div className="categories">
          <button
            type="button"
            className={`category-pill ${category === 'Todos' ? 'active' : ''}`}
            onClick={() => setCategory('Todos')}
          >
            Todos
          </button>
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className={`category-pill ${category === name ? 'active' : ''}`}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>

        {error && <div className="error-inline">{error}</div>}

        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p className="loading-text">Cargando menú…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>No se encontraron productos</p>
            <p>Probá con otra búsqueda o categoría.</p>
          </div>
        ) : (
          <div className="products-grid">
            {filtered.map((product) => {
              const quantity = cartQty.get(product.id) || 0;
              return (
                <div
                  key={product.id}
                  className={`${cardStyles.card} ${quantity > 0 ? cardStyles.cardActive : ''}`}
                  onClick={() => addToCart(product)}
                >
                  <span className={cardStyles.category}>{product.category}</span>
                  <span className={cardStyles.name}>{product.name}</span>
                  <div className={cardStyles.bottom}>
                    <span className={cardStyles.price}>{formatColones(product.price)}</span>
                    <div className={cardStyles.cardControls}>
                      {quantity > 0 && (
                        <>
                          <button
                            type="button"
                            className={cardStyles.removeBtn}
                            onClick={(event) => {
                              event.stopPropagation();
                              changeQuantity(product.id, -1);
                            }}
                            aria-label={`Quitar ${product.name}`}
                          >
                            −
                          </button>
                          <span className={cardStyles.qtyBadge}>{quantity}</span>
                        </>
                      )}
                      <button
                        type="button"
                        className={cardStyles.addBtn}
                        onClick={(event) => {
                          event.stopPropagation();
                          addToCart(product);
                        }}
                        aria-label={`Agregar ${product.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalItems > 0 && (
        <button type="button" className="floating-cart-bar" onClick={() => setCartOpen(true)}>
          <span className="floating-cart-info">
            <span className="floating-cart-count">{totalItems}</span>
            Ver comanda
          </span>
          <span className="floating-cart-total">{formatColones(total)}</span>
          <span className="floating-cart-btn">Revisar</span>
        </button>
      )}

      {cartOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!submitting) setCartOpen(false);
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '460px', textAlign: 'left', padding: 0, overflow: 'hidden' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={cartStyles.sidebar} style={{ maxHeight: '90dvh', padding: '18px' }}>
              <div className={cartStyles.title}>
                <span>Comanda</span>
                <span className={cartStyles.badge}>{totalItems}</span>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  aria-label="Cerrar comanda"
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>

              <div className={cartStyles.items}>
                {cart.length === 0 ? (
                  <div className={cartStyles.emptyMsg}>Agregá productos del menú</div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} style={{ marginBottom: '10px' }}>
                      <div className={cartStyles.item}>
                        <div className={cartStyles.itemInfo}>
                          <div className={cartStyles.itemName}>{item.name}</div>
                          <div className={cartStyles.itemPrice}>{formatColones(item.price)} c/u</div>
                        </div>
                        <div className={cartStyles.itemRow2}>
                          <div className={cartStyles.qtyControls}>
                            <button
                              type="button"
                              className={cartStyles.qtyBtn}
                              onClick={() => changeQuantity(item.id, -1)}
                              aria-label={`Quitar ${item.name}`}
                            >
                              −
                            </button>
                            <span className={cartStyles.qty}>{item.quantity}</span>
                            <button
                              type="button"
                              className={cartStyles.qtyBtn}
                              onClick={() => changeQuantity(item.id, 1)}
                              aria-label={`Agregar ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                          <span className={cartStyles.itemTotal}>
                            {formatColones(item.price * item.quantity)}
                          </span>
                          <button
                            type="button"
                            className={cartStyles.removeBtn}
                            onClick={() => removeItem(item.id)}
                            aria-label={`Eliminar ${item.name}`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={item.notas || ''}
                        onChange={(event) => updateNote(item.id, event.target.value)}
                        placeholder="Notas: sin hielo, extra limón…"
                        maxLength={300}
                        style={{
                          width: '100%',
                          marginTop: '6px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--surface-border)',
                          background: 'var(--surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                        }}
                      />
                    </div>
                  ))
                )}
              </div>

              <div className={cartStyles.footer}>
                {error && <div className="error-inline">{error}</div>}
                <div className={cartStyles.totalRow}>
                  <span className={cartStyles.totalLabel}>Total</span>
                  <span className={cartStyles.totalAmount}>{formatColones(total)}</span>
                </div>
                <button
                  type="button"
                  className={cartStyles.invoiceBtn}
                  onClick={() => setShowConfirm(true)}
                  disabled={cart.length === 0 || submitting}
                >
                  Enviar a Cocina
                </button>
                {cart.length > 0 && (
                  <button
                    type="button"
                    className={cartStyles.clearBtn}
                    onClick={() => setCart([])}
                  >
                    Vaciar comanda
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="modal-overlay" onClick={() => !submitting && setShowConfirm(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h2>Confirmar comanda</h2>
            <p>Se enviará directamente a cocina.</p>
            <p>
              <strong>{isLlevar ? 'Para Llevar' : `Mesa ${mesa}`}</strong>
              {cliente ? ` — ${cliente}` : ''}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {totalItems} artículo{totalItems === 1 ? '' : 's'}
            </p>
            <div className="modal-total">{formatColones(total)}</div>
            {error && <div className="error-inline">{error}</div>}
            <div className="modal-buttons">
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                Regresar
              </button>
              <button
                type="button"
                className="modal-btn-confirm"
                onClick={submitOrder}
                disabled={submitting || cart.length === 0}
              >
                {submitting ? 'Procesando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {successId && (
        <div className="order-success-overlay" role="status" aria-live="assertive">
          <div className="order-success-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="order-success-title">¡Comanda Enviada!</h2>
          <p className="order-success-sub">Volviendo a mesas…</p>
          <div className="order-success-progress" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
