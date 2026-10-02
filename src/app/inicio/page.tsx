"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatColones } from "@/lib/format";
import { itemsParaFactura, metaPedido } from "@/lib/invoicePedido";
import styles from "./inicio.module.css";

/**
 * `/inicio` — REGISTRO DE ÓRDENES.
 *
 * Antes era el launcher con las tarjetas de cada pantalla (mesas, KDS,
 * entregados…). Con las ventas individuales ya no hay esas pantallas: lo que
 * queda es UNA sola lista con todos los pedidos del día, tarjetas, filtros de
 * DÍA y de COBRO, y el PDF de cada uno.
 *
 * El cobro NO vive aquí. `AGENTS.md` pone la facturación en `/admin`; esta
 * vista es solo de consulta e impresión.
 *
 * Mobile-first (Redmi Note 15 Pro): todo control mide ≥44px y los inputs van
 * en 16px para que iOS no haga zoom al enfocarlos.
 */

type Theme = "light" | "dark";

const STORAGE_THEME = "eas_theme";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "0000";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/** Hoy en Costa Rica (UTC-6, sin DST) como `AAAA-MM-DD`. */
function hoyCR(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ── Tipos (espejo de /api/admin/orders) ─────────────────────────────────────
type ItemLista = { nombre: string; cantidad: number; precio: number; subtotal: number };

type PagoPdf = { forma_pago: "efectivo" | "tarjeta" | "sinpe" | "mixto"; recibido: number; vuelto: number } | null;

type OrdenFila = {
  id: string;
  hora: string;
  /** Día propio del pedido en CR — el filtro `fecha` con "todas" diría literalmente "todas". */
  dia: string;
  cliente: string;
  tipo: string;
  mesa_numero: number | null;
  estado: "abierta" | "cerrada" | "cancelada";
  estado_pago: "pendiente" | "parcial" | "pagado";
  items_count: number;
  cantidad_total: number;
  subtotal: number;
  descuento: number;
  total: number;
  pagado: number;
  saldo: number;
  notas: string | null;
  items: ItemLista[];
  pago: PagoPdf;
};

type Resumen = {
  pedidos: number;
  abiertas: number;
  cobradas: number;
  pendientes: number;
  parciales: number;
  pagadas: number;
  total: number;
  pagado: number;
};

type Cobro = "todos" | "pendiente" | "pagado";

/** `(sin nombre)` es lo que devuelve la API para no dejar la tarjeta vacía. */
function nombreReal(o: OrdenFila): string {
  const n = (o.cliente || "").trim();
  return !n || n === "(sin nombre)" ? "" : n;
}

// Badges: el mismo vocabulario que usa la base (`estado` / `estado_pago`).
const BADGE_ESTADO: Record<OrdenFila["estado"], { label: string; bg: string; fg: string }> = {
  abierta: { label: "Abierta", bg: "rgba(217, 119, 6, 0.16)", fg: "#f59e0b" },
  cerrada: { label: "Cerrada", bg: "rgba(4, 120, 87, 0.18)", fg: "#10b981" },
  cancelada: { label: "Cancelada", bg: "rgba(220, 38, 38, 0.16)", fg: "#ef4444" },
};

const BADGE_COBRO: Record<OrdenFila["estado_pago"], { label: string; bg: string; fg: string }> = {
  pendiente: { label: "Pendiente", bg: "rgba(220, 38, 38, 0.14)", fg: "#f87171" },
  parcial: { label: "Parcial", bg: "rgba(217, 119, 6, 0.14)", fg: "#fbbf24" },
  pagado: { label: "Pagado", bg: "rgba(16, 185, 129, 0.16)", fg: "#34d399" },
};

export default function InicioRegistro() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [fecha, setFecha] = useState(""); // "" hasta que el effect la ponga
  const [cobro, setCobro] = useState<Cobro>("todos"); // por defecto: sin filtrar
  const [orders, setOrders] = useState<OrdenFila[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  // Tema + fecha se resuelven después de la hidratación: el estado arranca en
  // lo que pinta el SSR. `hoyCR()` se calcula en el servidor (UTC) y en el
  // cliente (Costa Rica), y dos fechas distintas provocarían un mismatch de
  // hidratación justo al cruzar la medianoche CR.
  useEffect(() => {
    const stored = (typeof window !== "undefined" ? localStorage.getItem(STORAGE_THEME) : null) as Theme | null;
    const initial: Theme = stored === "light" ? "light" : "dark";
    setTheme(initial);
    applyTheme(initial);
    setFecha(hoyCR());
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(STORAGE_THEME, next); } catch { /* sin storage */ }
  };

  const cargar = useCallback(async () => {
    if (!fecha) return; // sin fecha todavía no hay nada que pedir
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ fecha });
      if (cobro === "pendiente") params.set("pago", "pendiente,parcial");
      else if (cobro === "pagado") params.set("pago", "pagado");

      const res = await fetch(`/api/admin/orders?${params.toString()}`, {
        headers: { "x-admin-key": ADMIN_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las órdenes");
      setOrders(data.orders ?? []);
      setResumen(data.resumen ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [fecha, cobro]);

  useEffect(() => { cargar(); }, [cargar]);

  const seleccionada = orders.find((o) => o.id === selId) ?? null;

  /**
   * El PDF sale del MISMO helper que usa `/admin`, así la reimpresión de un
   * comprobante y la descarga desde el registro son papeles idénticos.
   *
   * `descuento` se deriva de `bruto − total cobrado`: es el mismo cálculo que
   * hace `generateInvoice` para pintar el renglón, y evita que el TOTAL del
   * papel diga ₡5.000 cuando se cobraron ₡4.500.
   */
  const generarPdf = async (o: OrdenFila, modo: "descargar" | "imprimir") => {
    try {
      const { items, total: bruto } = itemsParaFactura(o.items);
      const descuento = Math.max(0, Math.round((bruto - o.total) * 100) / 100);
      const { generateInvoice } = await import("@/lib/generateInvoice");
      await generateInvoice(
        items,
        o.total,
        metaPedido(nombreReal(o)),
        o.id,
        o.pago ?? undefined,
        modo,
        descuento,
      );
    } catch {
      setError("No se pudo generar el comprobante");
    }
  };

  const etiquetaCobro =
    cobro === "pendiente" ? "sin cobrar" : cobro === "pagado" ? "cobrado" : "todos";

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Image src="/logo.svg" alt="easystem" width={34} height={34} priority />
          <span className={styles.brandName}>easystem</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.iconBtn} onClick={cargar} aria-label="Actualizar órdenes">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <Link href="/admin" className={styles.iconBtn} aria-label="Admin y facturación">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </Link>
          <button className={styles.iconBtn} onClick={toggleTheme} aria-label="Cambiar tema">
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Órdenes</h1>
          <Link href="/" className={styles.nuevaBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nueva venta
          </Link>
        </div>
        <p className={styles.subtitle}>
          Cada pedido es una venta individual. El cobro y los reportes están en Admin.
        </p>

        {error && <div className={styles.error}>{error}</div>}

        {/* ── Filtros: día + cobro ─────────────────────────────────────── */}
        <div className={styles.filtros}>
          <div className={styles.filaFecha}>
            <input
              type="date"
              className={styles.dateInput}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Día a consultar"
            />
            <button
              className={fecha === hoyCR() ? styles.chipOn : styles.chip}
              onClick={() => setFecha(hoyCR())}
            >
              Hoy
            </button>
            <button
              className={fecha === "todas" ? styles.chipOn : styles.chip}
              onClick={() => setFecha("todas")}
            >
              Todas
            </button>
          </div>

          <div className={styles.segmented} role="group" aria-label="Filtrar por cobro">
            {([
              ["todos", "Todos"],
              ["pendiente", "Pendiente"],
              ["pagado", "Pagado"],
            ] as [Cobro, string][]).map(([v, label]) => (
              <button
                key={v}
                className={cobro === v ? styles.segOn : styles.seg}
                onClick={() => setCobro(v)}
                aria-pressed={cobro === v}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Resumen del día ──────────────────────────────────────────── */}
        {resumen && (
          <div className={styles.resumen}>
            <span><b>{resumen.pedidos}</b> pedidos</span>
            <span><b>{resumen.abiertas}</b> abiertas</span>
            <span><b>{resumen.cobradas}</b> cobradas</span>
            <span>Total <b>{formatColones(resumen.total)}</b></span>
            {resumen.pagado > 0 && <span>Cobrado <b>{formatColones(resumen.pagado)}</b></span>}
          </div>
        )}

        {/* ── Lista ────────────────────────────────────────────────────── */}
        {loading ? (
          <div className={styles.aviso}>Cargando órdenes…</div>
        ) : orders.length === 0 ? (
          <div className={styles.aviso}>
            {cobro === "todos"
              ? "No hay órdenes ese día."
              : `No hay órdenes ${etiquetaCobro} ese día.`}
          </div>
        ) : (
          <div className={styles.lista}>
            {orders.map((o) => {
              const est = BADGE_ESTADO[o.estado] ?? BADGE_ESTADO.abierta;
              const cob = BADGE_COBRO[o.estado_pago] ?? BADGE_COBRO.pendiente;
              const nombre = nombreReal(o);
              return (
                <button
                  key={o.id}
                  className={styles.tarjeta}
                  onClick={() => setSelId(o.id)}
                  aria-label={`Ver detalle de la orden de ${nombre || "sin nombre"} a las ${o.hora}`}
                >
                  <div className={styles.tarjetaTop}>
                    <span className={styles.hora}>{o.hora}</span>
                    <span className={styles.cliente}>{nombre || "Sin nombre"}</span>
                    <span className={styles.ref}>#{o.id.slice(0, 8)}</span>
                  </div>

                  <div className={styles.badges}>
                    <span className={styles.badge} style={{ background: est.bg, color: est.fg }}>
                      {est.label}
                    </span>
                    <span className={styles.badge} style={{ background: cob.bg, color: cob.fg }}>
                      {cob.label}
                    </span>
                    {o.descuento > 0 && (
                      <span
                        className={styles.badge}
                        style={{ background: "rgba(14, 165, 233, 0.14)", color: "#38bdf8" }}
                      >
                        −{formatColones(o.descuento)}
                      </span>
                    )}
                  </div>

                  <div className={styles.tarjetaBottom}>
                    <span>
                      {o.items_count} línea{o.items_count === 1 ? "" : "s"} · {o.cantidad_total} uds
                    </span>
                    <span className={styles.total}>{formatColones(o.total)}</span>
                  </div>

                  {o.saldo > 0 && (
                    <div className={styles.saldo}>Faltan {formatColones(o.saldo)} por cobrar</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detalle ──────────────────────────────────────────────────────── */}
      {seleccionada && (
        <div className={styles.overlay} onClick={() => setSelId(null)} role="presentation">
          <div
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de la orden"
          >
            <div className={styles.sheetHead}>
              <div style={{ minWidth: 0 }}>
                <h2 className={styles.sheetTitle}>{nombreReal(seleccionada) || "Sin nombre"}</h2>
                <div className={styles.badges}>
                  <span
                    className={styles.badge}
                    style={{
                      background: (BADGE_ESTADO[seleccionada.estado] ?? BADGE_ESTADO.abierta).bg,
                      color: (BADGE_ESTADO[seleccionada.estado] ?? BADGE_ESTADO.abierta).fg,
                    }}
                  >
                    {(BADGE_ESTADO[seleccionada.estado] ?? BADGE_ESTADO.abierta).label}
                  </span>
                  <span
                    className={styles.badge}
                    style={{
                      background: (BADGE_COBRO[seleccionada.estado_pago] ?? BADGE_COBRO.pendiente).bg,
                      color: (BADGE_COBRO[seleccionada.estado_pago] ?? BADGE_COBRO.pendiente).fg,
                    }}
                  >
                    {(BADGE_COBRO[seleccionada.estado_pago] ?? BADGE_COBRO.pendiente).label}
                  </span>
                </div>
                <div className={styles.ref}>
                  #{seleccionada.id.slice(0, 8)} · {seleccionada.dia} {seleccionada.hora}
                </div>
              </div>
              <button className={styles.closeBtn} onClick={() => setSelId(null)} aria-label="Cerrar detalle">
                ✕
              </button>
            </div>

            <div>
              {seleccionada.items.length === 0 ? (
                <div className={styles.aviso}>Sin ítems registrados.</div>
              ) : (
                seleccionada.items.map((it, i) => (
                  <div className={styles.itemFila} key={`${it.nombre}-${i}`}>
                    <span className={styles.itemCant}>{it.cantidad}×</span>
                    <span className={styles.itemNombre}>{it.nombre}</span>
                    <span className={styles.itemPrecio}>{formatColones(it.precio)}</span>
                    <span className={styles.itemTotal}>{formatColones(it.subtotal)}</span>
                  </div>
                ))
              )}
            </div>

            <div className={styles.cuentas}>
              <div className={styles.cuentaFila}>
                <span>Subtotal</span>
                <span>{formatColones(seleccionada.subtotal)}</span>
              </div>
              {seleccionada.descuento > 0 && (
                <div className={styles.cuentaFila}>
                  <span>Descuento</span>
                  <span>−{formatColones(seleccionada.descuento)}</span>
                </div>
              )}
              <div className={styles.cuentaTotal}>
                <span>Total</span>
                <span>{formatColones(seleccionada.total)}</span>
              </div>
              {seleccionada.pagado > 0 && (
                <div className={styles.cuentaFila}>
                  <span>Pagado</span>
                  <span>{formatColones(seleccionada.pagado)}</span>
                </div>
              )}
              {seleccionada.saldo > 0 && (
                <div className={styles.cuentaSaldo}>
                  <span>Saldo</span>
                  <span>{formatColones(seleccionada.saldo)}</span>
                </div>
              )}
            </div>

            {seleccionada.notas && <div className={styles.notas}>📝 {seleccionada.notas}</div>}

            <div className={styles.acciones}>
              <button className={styles.accion} onClick={() => generarPdf(seleccionada, "descargar")}>
                Descargar PDF
              </button>
              <button className={styles.accionPrimario} onClick={() => generarPdf(seleccionada, "imprimir")}>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
