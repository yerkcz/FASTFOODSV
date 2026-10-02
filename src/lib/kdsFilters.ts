/**
 * KDS Category Filters — Single source of truth para clasificar
 * a qué pantalla KDS va cada producto según su categoría.
 *
 * IMPORTANTE: usar match EXACTO contra la lista de categorías
 * conocidas (whitelist). NO usar `.includes("cafe")` u otros
 * substrings porque hacen match con cosas no deseadas:
 *   - "Especialidades Cafeteras" (comida) incluye "cafe"
 *   - "Bebidas Frías (Cafetero)" (fría) incluye "cafe"
 *   ← ambas se filtraban como bebida caliente por error.
 *
 * Si se agrega una categoría nueva en BD, actualizar las
 * constantes COLD_CATEGORIES o HOT_CATEGORIES de abajo.
 */

/** Normaliza: trim + lowercase + colapsa espacios. */
function norm(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Categorías que van al KDS de Bebidas Frías. */
const COLD_CATEGORIES: ReadonlySet<string> = new Set([
  'batidos en agua',
  'batidos en leche',
  'milkshakes',
  'gaseosas',
  'tropicales',
  'agua y otros',
  'bebidas frías (cafetero)',
  'bebidas frias (cafetero)',
]);

/** Categorías que van al KDS de Bebidas Calientes. */
const HOT_CATEGORIES: ReadonlySet<string> = new Set([
  'bebidas calientes',
  'bebidas calientes (cafetero)',
]);

/** ¿Esta categoría es una bebida fría? */
export function isColdDrink(categoria: string | null | undefined): boolean {
  return COLD_CATEGORIES.has(norm(categoria));
}

/** ¿Esta categoría es una bebida caliente? */
export function isHotDrink(categoria: string | null | undefined): boolean {
  return HOT_CATEGORIES.has(norm(categoria));
}

/**
 * ¿Esta categoría va al KDS de Cocina (todo lo que NO sea bebida)?
 * Incluye: Arroces, Comida Rápida, Ceviches, Helados, Postres y Helados,
 * Postres, Especialidades Cafeteras, y cualquier categoría nueva
 * que no esté en las whitelists de bebidas.
 */
export function isKitchenFood(categoria: string | null | undefined): boolean {
  const c = norm(categoria);
  if (!c) return true; // si no tiene categoría, va a cocina por defecto
  return !COLD_CATEGORIES.has(c) && !HOT_CATEGORIES.has(c);
}
