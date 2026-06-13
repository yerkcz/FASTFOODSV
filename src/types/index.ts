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
