import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';
import { sanitize } from '@/lib/security';
import type { PostgrestError } from '@/types/db';

export const dynamic = 'force-dynamic';

type EstadoPago = 'pendiente' | 'parcial' | 'pagado';

/**
 * Lista de PEDIDOS (no de comprobantes) para el registro del día.
 *
 * ## Por qué existe y no se reutiliza `closed-orders`
 * `closed-orders` pivota desde `comprobantes`: da 1 fila por PERSONA PAGADA y
 * solo lo cobrado de hoy. El registro que necesita `/inicio` es 1 fila por
 * PEDIDO e incluye también los que siguen abiertos. Son dos ejes distintos.
 *
 * ## La trampa de `ordenes.total` en pedidos cerrados
 * Al cobrar, `close-table` **borra los `orden_items` pagados** (es el rastro de
 * lo que ya se vendió) y el trigger recalcula → `ordenes.total` queda en 0 en
 * los pedidos cerrados por división de cuenta. Por eso, para pedidos CERRADOS
 * la verdad sale de `comprobantes.items_snapshot` y de la suma de sus totales;
 * para pedidos ABIERTOS sale de `ordenes` + `orden_items`. Mezclarlos daría
 * tarjetas en ₡0.
 *
 * ## Fecha
 * Filtro por día en COSTA RICA (UTC-6, sin DST): medianoche CR = 06:00 UTC.
 * Usar el `current_date` del servidor (UTC) metería los pedidos de la noche
 * anterior en el día equivocado entre las 6pm y medianoche.
 */

type ItemLista = { nombre: string; cantidad: number; precio: number; subtotal: number };

type OrdenFila = {
  id: string;
  tipo: 'mesa' | 'llevar' | 'individual';
  mesa_numero: number | null;
  cliente_nombre: string | null;
  estado: 'abierta' | 'cerrada' | 'cancelada';
  estado_pago: EstadoPago;
  subtotal: number;
  descuento: number;
  total: number;
  notas: string | null;
  created_at: string;
  closed_at: string | null;
  orden_items: {
    nombre_producto: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    estado_kds: string | null;
  }[] | null;
  comprobantes: {
    total: number;
    items_snapshot: {
      nombre: string;
      nombre_producto?: string;
      cantidad: number;
      precio_unitario: number;
      subtotal: number;
    }[] | null;
  }[] | null;
  pagos: {
    id: string;
    monto: number;
    forma_pago: string | null;
    monto_recibido: number | null;
    vuelto: number | null;
  }[] | null;
};

/** `[Y, M, D]` de un `YYYY-MM-DD` -> rango UTC del día completo en CR. */
function rangoDelDiaCR(fecha: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 6, 0, 0));
  const end = new Date(start.getTime() + 86399999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** `YYYY-MM-DD` de HOY en CR, sin depender de la zona del servidor. */
/**
 * Día en Costa Rica (`AAAA-MM-DD`) de una fecha ISO o de ahora mismo.
 * Se usa para el filtro (`hoyCR`) Y para el `dia` propio de cada tarjeta: con
 * `fecha=todas` la vista no puede reusar el valor del filtro, porque ahí
 * dice literalmente "todas".
 */
function diaCR(fecha: string | Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(fecha));
}
function hoyCR(): string {
  return diaCR();
}

/** Hora `HH:MM` en CR a partir de un timestamptz de la DB. */
function horaCR(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

export async function GET(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const sp = request.nextUrl.searchParams;

    // AGENTS.md: toda API sanitiza sus inputs. Ademas cada valor se valida
    // contra un whitelist cerrado, asi que no hay forma de colar SQL.
    //
    // `fecha` admite ademas el literal `todas` para ver el registro completo
    // en vez de un dia suelto; por defecto es HOY, que es lo que muestra la
    // pantalla de entrada.
    const fechaRaw = sanitize(sp.get('fecha') || hoyCR(), 10).trim().toLowerCase();
    const estadoRaw = sanitize(sp.get('estado') || '', 20).trim().toLowerCase();
    const pagoRaw = sanitize(sp.get('pago') || '', 40).trim().toLowerCase();

    const todasLasFechas = fechaRaw === 'todas';
    const rango = todasLasFechas ? null : rangoDelDiaCR(fechaRaw);
    // `rango === null` es legítimo cuando se pidió `todas` a propósito: solo es
    // un error si además NO se pidió el literal.
    if (!todasLasFechas && !rango) return jsonError('fecha inválida (usa AAAA-MM-DD o "todas")');

    const ESTADOS = ['abierta', 'cerrada'] as const;
    type FiltroEstado = (typeof ESTADOS)[number];
    const PAGOS = ['pendiente', 'parcial', 'pagado'] as const;
    type FiltroPago = (typeof PAGOS)[number];

    // Se validan contra un whitelist cerrado ANTES de tocar el builder: asi el
    // `.eq()` recibe un tipo estrecho y no un `string` suelto.
    let estado: FiltroEstado | null = null;
    if (estadoRaw) {
      if (!(ESTADOS as readonly string[]).includes(estadoRaw)) {
        return jsonError(`estado inválido. Válidos: ${ESTADOS.join(', ')}`);
      }
      estado = estadoRaw as FiltroEstado;
    }
    let pagosFiltro: FiltroPago[] | null = null;
    if (pagoRaw) {
      // Se admite lista "pendiente,parcial": es la única forma de pedir
      // "lo que todavía no está cobrado" sin meter lógica de negocio en la UI.
      const partes = pagoRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const malos = partes.filter((p) => !(PAGOS as readonly string[]).includes(p));
      if (partes.length === 0 || malos.length > 0) {
        return jsonError(
          `pago inválido (${malos.join(', ') || 'vacío'}). Válidos: ${PAGOS.join(', ')} — se admite lista con coma`,
        );
      }
      pagosFiltro = partes as FiltroPago[];
    }

    const supabase = getServerSupabase();

    let query = supabase
      .from('ordenes')
      .select(`
        id, tipo, mesa_numero, cliente_nombre, estado, estado_pago,
        subtotal, descuento, total, notas, created_at, closed_at,
        orden_items!orden_items_orden_id_fkey ( nombre_producto, cantidad, precio_unitario, subtotal, estado_kds ),
        comprobantes ( total, items_snapshot ),
        pagos ( id, monto, forma_pago, monto_recibido, vuelto )
      `);

    // Los filtros van ANTES de `.order()`: eso devuelve un TransformBuilder
    // que ya no acepta `.gte()/.eq()`.
    if (rango) query = query.gte('created_at', rango.start).lte('created_at', rango.end);
    if (estado) query = query.eq('estado', estado);
    if (pagosFiltro?.length === 1) query = query.eq('estado_pago', pagosFiltro[0]);
    else if (pagosFiltro) query = query.in('estado_pago', pagosFiltro);

    const { data, error } = (await query.order('created_at', { ascending: true })) as {
      data: OrdenFila[] | null;
      error: PostgrestError | null;
    };
    if (error) throw error;

    const orders = (data || []).map((o) => {
      const cerrada = o.estado === 'cerrada';
      const comps = o.comprobantes || [];

      // Snapshot del comprobante: puede llamarlo `nombre` (pagina) o
      // `nombre_producto` (tabla). Se normaliza aca para no ramificar la UI.
      const delSnapshot = comps.flatMap((c) => (c.items_snapshot || []).map((s) => ({
        nombre: s.nombre || s.nombre_producto || '(sin nombre)',
        cantidad: Number(s.cantidad || 0),
        precio: Number(s.precio_unitario || 0),
        subtotal: Number(s.subtotal || 0),
      })));

      const delStock = (o.orden_items || [])
        .filter((i) => i.estado_kds !== 'cancelado' && i.estado_kds != null)
        .map((i) => ({
          nombre: i.nombre_producto,
          cantidad: Number(i.cantidad),
          precio: Number(i.precio_unitario),
          subtotal: Number(i.subtotal),
        }));

      // Pedido abierto = lo que hay en mesa. Pedido cerrado = lo que se
      // cobro (los items pueden ya no estar en `orden_items`).
      const items: ItemLista[] = cerrada
        ? (delSnapshot.length > 0 ? delSnapshot : delStock)
        : delStock;

      const pagos = o.pagos || [];
      const pagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);

      const subtotal = cerrada
        ? items.reduce((s, i) => s + i.subtotal, 0)
        : Number(o.subtotal || 0);
      const total = cerrada
        ? comps.reduce((s, c) => s + Number(c.total || 0), 0)
        : Number(o.total || 0);
      const descuento = cerrada
        ? Math.max(0, subtotal - total)
        : Number(o.descuento || 0);

      // Datos para el bloque de pago del PDF. Solo si la orden se pagó EN UNA
      // sola vez: con varias partes de la cuenta no hay UNA "forma de pago"
      // verdadera, y el ticket en vez de eso sale sin ese bloque antes que
      // afirmar algo falso.
      const pago = pagos.length === 1 ? pagos[0] : null;

      return {
        id: o.id,
        hora: horaCR(o.created_at),
        dia: diaCR(o.created_at),
        fecha: fechaRaw,
        cliente: o.cliente_nombre || '(sin nombre)',
        tipo: o.tipo,
        mesa_numero: o.mesa_numero,
        estado: o.estado,
        estado_pago: o.estado_pago,
        items_count: items.length,
        cantidad_total: items.reduce((s, i) => s + i.cantidad, 0),
        subtotal,
        // En pedidos cerrados el descuento ya esta aplicado dentro de los
        // comprobantes; se muestra derivado para que la tarjeta cuadre.
        descuento,
        total,
        pagado,
        saldo: Math.max(0, total - pagado),
        notas: o.notas,
        created_at: o.created_at,
        closed_at: o.closed_at,
        items,
        pago: pago
          ? {
              forma_pago: String(pago.forma_pago || 'efectivo').toLowerCase() as
                'efectivo' | 'tarjeta' | 'sinpe' | 'mixto',
              recibido: Number(pago.monto_recibido ?? pago.monto ?? 0),
              vuelto: Number(pago.vuelto ?? 0),
            }
          : null,
      };
    });

    const resumen = {
      pedidos: orders.length,
      abiertas: orders.filter((o) => o.estado === 'abierta').length,
      cobradas: orders.filter((o) => o.estado === 'cerrada').length,
      pendientes: orders.filter((o) => o.estado_pago === 'pendiente').length,
      parciales: orders.filter((o) => o.estado_pago === 'parcial').length,
      pagadas: orders.filter((o) => o.estado_pago === 'pagado').length,
      total: orders.reduce((s, o) => s + o.total, 0),
      pagado: orders.reduce((s, o) => s + o.pagado, 0),
    };

    return jsonOk({ fecha: fechaRaw, orders, resumen });
  } catch (err) {
    console.error('Error GET /api/admin/orders:', err);
    return jsonError('Error al obtener los pedidos', 500);
  }
}
