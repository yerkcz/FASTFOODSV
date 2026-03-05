export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  image?: string;
};

export const categories = [
  "Todos",
  "Cocina",
  "Bebidas Frias",
  "Bebidas Calientes",
  "Postres",
  "Otros"
];

// Provide an empty initial state. The client side will fetch this.
export const productsList: Product[] = [];
