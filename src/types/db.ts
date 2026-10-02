/**
 * Filas crudas de Supabase.
 *
 * El cliente se crea SIN genérico `Database` (ver `getServerSupabase()`), así
 * que todo llega como `any` implícito. Estas interfaces son el contrato real:
 * se derivan del esquema publicado por PostgREST (`GET /rest/v1/` con
 * `Accept: application/openapi+json`), no de memoria.
 *
 * Nota: `orden_items` tiene `nombre_producto` (no `producto_nombre`). El
 * `AdminOrderItem` de `@/types` es una vista YA mapeada; este es el crudo.
 */
import type { PostgrestError } from '@supabase/supabase-js';

export type { PostgrestError };

export type OrdenRow = {
  id: string;
  mesa_id: string | null;
  /**
   * `NULL` = pedido individual (sin mesa). Antes de 0011 era NOT NULL y
   * eso obligaba a clavar 99 en toda orden sin mesa — el bug "Mesa 99".
   */
  mesa_numero: number | null;
  /** `individual` = pedido suelto a nombre de una persona (modelo nuevo). */
  tipo: 'mesa' | 'llevar' | 'individual';
  cliente_nombre: string | null;
  cliente_cedula: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  mesero_id: string | null;
  estado: 'abierta' | 'cerrada' | 'cancelada';
  /**
   * Estado de pago, mantenido por el trigger `trg_pagos_estado_pago`
   * a partir de la suma de `pagos`. Se separa de `estado`: una orden
   * puede estar abierta y ya pagada.
   */
  estado_pago: 'pendiente' | 'parcial' | 'pagado';
  subtotal: number;
  /** Monto YA RESUELTO que descuenta el trigger (no capturado a mano). */
  descuento: number;
  /** Intención capturada en el formulario: `monto` (₡) o `porcentaje` (%). */
  descuento_tipo: 'monto' | 'porcentaje';
  descuento_valor: number;
  descuento_motivo: string | null;
  total: number;
  notas: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export type OrdenItemRow = {
  id: string;
  orden_id: string;
  producto_id: string | null;
  nombre_producto: string;
  precio_unitario: number;
  cantidad: number;
  notas: string | null;
  subtotal: number;
  /**
   * `item` = producto del menú · `extra` = cargo personalizado agregado
   * en el formulario. Los extras van como línea para que entren solos en
   * `SUM(subtotal)` y el guard de cobro siga cuadrando sin trucos.
   */
  tipo_linea: 'item' | 'extra';
  /**
   * `entregado` lo restaura 0015 (venía en 0001 y el check vivo lo perdió).
   * Es el estado de los `tipo_linea='extra'`: **no hay nada que preparar**,
   * así que queda fuera de `in ('pendiente','preparando','listo')` de la KDS
   * pero sigue contando en `Σitems` porque el trigger solo excluye 'cancelado'.
   */
  estado_kds: 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cancelado' | null;
  listo: boolean | null;
  hora_registro: string;
  created_at: string;
  transferido_desde: string | null;
  transferido_at: string | null;
}

export type ComprobanteRow = {
  id: string;
  numero: number;
  /** Fecha de negocio en CR (la guarda close-table); NO es el instante. */
  fecha: string;
  orden_id: string | null;
  pago_id: string | null;
  total: number;
  subtotal: number;
  descuento: number;
  created_at: string;
  /** Array de items: `close-table` lo escribe así y se lee con `|| []`. */
  items_snapshot: ComprobanteSnapshot[] | null;
}

/**
 * Snapshot de items guardado en `comprobantes.items_snapshot` para poder
 * reimprimir el comprobante aunque la orden se borre.
 */
export type ComprobanteSnapshot = {
  cantidad?: number;
  nombre?: string;
  producto_nombre?: string;
  subtotal?: number;
  precio_unitario?: number;
  [clave: string]: unknown;
}

export type PagoRow = {
  id: string;
  orden_id: string | null;
  forma_pago: 'efectivo' | 'tarjeta' | 'sinpe';
  monto: number;
  monto_recibido: number | null;
  vuelto: number | null;
  referencia: string | null;
  referencia_pago: string | null;
  cajero_id: string | null;
  notas: string | null;
  created_at: string;
}

export type MesaRow = {
  id: string;
  numero: number;
  capacidad: number;
  zona: string | null;
  estado: string;
  orden_actual_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export type ProductoRow = {
  id: string;
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponible: boolean;
  orden: number | null;
  menu_origen: string;
  created_at: string;
  updated_at: string | null;
}

export type CategoriaRow = {
  id: string;
  nombre: string;
  orden: number | null;
  icono: string | null;
  activo: boolean;
  created_at: string;
}

export type CierreCajaRow = {
  id: string;
  fecha: string;
  cajero_id: string | null;
  total_ordenes: number;
  total_ingresos: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_sinpe: number;
  total_descuentos: number;
  observaciones: string | null;
  created_at: string;
  efectivo_contado: number | null;
  diferencia: number | null;
  cerrado_at: string | null;
}

export type CuentaDivisionRow = {
  id: string;
  orden_id: string;
  numero_persona: number;
  nombre_persona: string | null;
  tipo_division: string;
  items_asignados: unknown;
  monto_asignado: number;
  pago_id: string | null;
  created_at: string;
}
