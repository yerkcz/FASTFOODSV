export type Categoria = {
  id: string;
  nombre: string;
  orden: number;
  icono: string | null;
  activo: boolean;
};

export type Producto = {
  id: string;
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponible: boolean;
  orden: number;
  menu_origen: 'menu1' | 'menu2';
};

export type Mesa = {
  id: string;
  numero: number;
  capacidad: number;
  zona: string | null;
  estado: 'libre' | 'ocupada' | 'cuenta' | 'mantenimiento';
  orden_actual_id: string | null;
};

export type Orden = {
  id: string;
  mesa_id: string | null;
  mesa_numero: number;
  cliente_nombre: string | null;
  cliente_cedula: string | null;
  mesero_id: string | null;
  estado: 'abierta' | 'cerrada' | 'cancelada';
  subtotal: number;
  descuento: number;
  descuento_motivo: string | null;
  total: number;
  notas: string | null;
  opened_at: string;
  closed_at: string | null;
};

export type OrdenItem = {
  id: string;
  orden_id: string;
  producto_id: string | null;
  nombre_producto: string;
  precio_unitario: number;
  cantidad: number;
  notas: string | null;
  subtotal: number;
  estado_kds: 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cancelado';
  listo: boolean;
  hora_registro: string;
};

export type Pago = {
  id: string;
  orden_id: string;
  forma_pago: 'efectivo' | 'tarjeta' | 'sinpe' | 'mixto';
  monto: number;
  monto_recibido: number | null;
  vuelto: number;
  referencia: string | null;
  cajero_id: string | null;
  notas: string | null;
  created_at: string;
};

export type Comprobante = {
  id: string;
  numero: number;
  fecha: string;
  orden_id: string;
  pago_id: string | null;
  total: number;
  subtotal: number;
  descuento: number;
  created_at: string;
};

export type Dispositivo = {
  id: string;
  nombre: string;
  rol: 'admin' | 'cajero' | 'mesero' | 'cocina';
  pin_hash: string;
  activo: boolean;
};

export type Configuracion = {
  clave: string;
  valor: string;
  descripcion: string | null;
  updated_at: string;
};

export type CierreCaja = {
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
};
