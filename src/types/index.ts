// Global TypeScript Definitions for Fast Food San Vicente POS

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl?: string;
  available?: boolean;
};

export type CartItem = Product & {
  quantity: number;
  notas?: string;
  notes?: string; // Aliases for backward compatibility in some components
};

export type OrderStatus = 'pendiente' | 'en_cocina' | 'listo' | 'entregado';

export type OrderMeta = {
  mesa: string;
  cliente: string;
  cliente_cedula?: string;
  cliente_telefono?: string;
  cliente_email?: string;
};

export type Order = {
  id: string;
  tableId: string | number;
  items: CartItem[];
  status: OrderStatus;
  createdAt: string;
  total: number;
};

export type TableStatus = 'libre' | 'ocupada' | 'cuenta';

export type Table = {
  id: string | number;
  number: number;
  status: TableStatus;
  openedAt?: string;
};

// ══════════════════════════════════════════════════════════
// Tipos del flujo Admin (post migración 0006)
// ══════════════════════════════════════════════════════════

export type FormaPago = 'efectivo' | 'tarjeta' | 'sinpe';

export interface AdminOrder {
  id: string;
  mesa_numero: number | null;
  cliente_nombre: string | null;
  cliente_cedula?: string | null;
  cliente_telefono?: string | null;
  cliente_email?: string | null;
  tipo: 'mesa' | 'llevar';
  estado: 'abierta' | 'cerrada' | 'cancelada';
  total: number;
  subtotal: number;
  descuento: number;
  opened_at: string;
  closed_at: string | null;
}

export interface AdminOrderItem {
  id: string;
  orden_id: string;
  producto_id: string | null;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string | null;
  estado_kds: 'pendiente' | 'preparando' | 'listo' | 'cancelado';
  created_at: string;
}

export interface CierreCaja {
  id: string;
  fecha: string;
  total_ingresos: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_sinpe: number;
  total_ordenes: number;
  total_descuentos: number;
  efectivo_contado: number | null;
  diferencia: number | null;
  observaciones: string | null;
  cerrado_at: string;
}

// Para impresión térmica (Bematech LR2000E - milestone futuro)
export interface PrintJobPayload {
  items: Array<{ cantidad: number; nombre: string; subtotal: number }>;
  total: number;
  meta: {
    mesa: string;
    cliente_nombre: string;
    cliente_cedula?: string;
    cliente_telefono?: string;
    consecutivo?: number;
    forma_pago?: string;
    referencia?: string;
    fecha: string;
  };
}

