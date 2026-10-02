import type { CartItem, OrderMeta } from "@/types";

/**
 * Única fuente de verdad de CÓMO se arma un ticket, compartida por
 * `/admin` (reimpresión de un comprobante cobrado) y `/inicio` (PDF por
 * pedido del registro). Sin esto los dos papeles se iban divergiendo: era
 * prácticamente el mismo `map()` copiado y pegado en dos archivos.
 *
 * Régimen Simplificado: sin IVA desglosado, sin servicio 10%.
 */

/**
 * Encabezado del ticket.
 *
 * Antes imprimía `"Llevar"` / `"Restaurante"` (el *tipo* de la orden, herencia
 * de las mesas). Con ventas individuales el dato que aporta algo es QUIÉN
 * pidió, así que la etiqueta es siempre `PEDIDO: <cliente>`; si no hay nombre
 * queda en `PEDIDO` a secas para no dejar la línea en blanco.
 */
export function metaPedido(cliente: string | null | undefined): OrderMeta {
  const nombre = String(cliente ?? "").trim();
  return { encabezado: nombre ? `PEDIDO: ${nombre}` : "PEDIDO" };
}

/**
 * Fila de ítems admitida. La base guarda el mismo hecho en tres estilos de
 * columna distintos y el reporte PDF usa unos cuantos alias en MAYÚSCULAS:
 *
 *   · `comprobantes.items_snapshot` → `nombre`, `precio_unitario`, `cantidad`
 *   · `GET /api/admin/orders`       → `nombre`, `precio`, `cantidad`
 *   · reporte / cierres             → `ARTICULO`, `PRECIO`, `CANTIDAD`
 */
export type FilaFactura = {
  id?: string;
  nombre?: string | null;
  ARTICULO?: string | null;
  name?: string | null;
  precio_unitario?: number | null;
  precio?: number | null;
  PRECIO?: number | null;
  cantidad?: number | null;
  CANTIDAD?: number | null;
  notas?: string | null;
  NOTAS?: string | null;
};

const nombreDe = (f: FilaFactura): string =>
  (f.nombre ?? f.ARTICULO ?? f.name ?? "").trim() || "(sin nombre)";

const precioDe = (f: FilaFactura): number => {
  const p = f.precio_unitario ?? f.precio ?? f.PRECIO ?? 0;
  const n = Number(p);
  return Number.isFinite(n) ? n : 0;
};

const cantidadDe = (f: FilaFactura): number => {
  const c = f.cantidad ?? f.CANTIDAD ?? 0;
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Convierte cualquier fila de ítems al `CartItem` que dibuja el ticket y
 * devuelve el total que esas líneas suman.
 *
 * El total SE CALCULA de los ítems y no se toma del renglón `total`: en un
 * pedido cerrado con descuento el `total` es el neto cobrado mientras que los
 * ítems son el bruto, y el ticket necesita mostrar ambos renglones sin que
 * cuadren mal. Quien decide cuál usar es quien llama, por eso se devuelven
 * los dos.
 */
export function itemsParaFactura(src: FilaFactura[] | null | undefined): {
  items: CartItem[];
  total: number;
} {
  const arr = Array.isArray(src) ? src : [];
  const items: CartItem[] = arr.map((f, i) => {
    const notas = f.notas ?? f.NOTAS ?? undefined;
    return {
      id: f.id || `item-${i}`,
      name: nombreDe(f),
      price: precioDe(f),
      quantity: cantidadDe(f),
      category: "",
      ...(notas ? { notas } : {}),
    };
  });
  return { items, total: items.reduce((s, it) => s + it.price * it.quantity, 0) };
}
