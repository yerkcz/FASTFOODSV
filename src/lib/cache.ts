/**
 * Cache en Memoria con TTL — Fast Food San Vicente POS
 *
 * Estrategia Stale-While-Revalidate para reducir consultas a Supabase.
 * Cada clave de cache tiene un TTL configurable. Cuando el TTL expira,
 * la siguiente solicitud obtiene el dato fresco y lo re-cachea.
 * 
 * IMPORTANTE: Este cache vive en memoria del proceso Node.js.
 * En Vercel Serverless, cada instancia tiene su propio cache.
 * Esto sigue siendo efectivo porque:
 * - Múltiples requests pueden reutilizar la misma instancia (warm function)
 * - Evita queries duplicadas cuando varias pantallas KDS piden lo mismo
 *   en la misma ventana de tiempo
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  staleAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private stats = {
    menu: { hits: 0, misses: 0 },
    kitchen: { hits: 0, misses: 0 },
    tables: { hits: 0, misses: 0 }
  };

  /**
   * Obtiene un valor del cache si existe y no ha expirado.
   * @param key - Clave del cache
   * @returns El dato cacheado o null si expiró/no existe
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.trackMiss(key);
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.store.delete(key);
      this.trackMiss(key);
      return null;
    }

    this.trackHit(key);
    return entry.data as T;
  }

  private trackHit(key: string): void {
    if (key.includes('menu')) this.stats.menu.hits++;
    else if (key.includes('kitchen')) this.stats.kitchen.hits++;
    else if (key.includes('tables')) this.stats.tables.hits++;
  }

  private trackMiss(key: string): void {
    if (key.includes('menu')) this.stats.menu.misses++;
    else if (key.includes('kitchen')) this.stats.kitchen.misses++;
    else if (key.includes('tables')) this.stats.tables.misses++;
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = {
      menu: { hits: 0, misses: 0 },
      kitchen: { hits: 0, misses: 0 },
      tables: { hits: 0, misses: 0 }
    };
  }

  /**
   * Verifica si un dato está "stale" (fresco pero próximo a expirar).
   * Útil para stale-while-revalidate.
   */
  isStale(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    return Date.now() > entry.staleAt;
  }

  /**
   * Almacena un valor en cache.
   * @param key       - Clave del cache
   * @param data      - Dato a cachear
   * @param ttlMs     - Tiempo de vida en milisegundos
   * @param stalePct  - Porcentaje del TTL después del cual se considera "stale" (default 0.7 = 70%)
   */
  set<T>(key: string, data: T, ttlMs: number, stalePct: number = 0.7): void {
    const now = Date.now();
    this.store.set(key, {
      data,
      expiresAt: now + ttlMs,
      staleAt: now + Math.round(ttlMs * stalePct),
    });
  }

  /**
   * Invalida una o varias claves de cache.
   * Acepta un string exacto o un prefijo con wildcard.
   */
  invalidate(keyOrPrefix: string): void {
    if (keyOrPrefix.endsWith('*')) {
      const prefix = keyOrPrefix.slice(0, -1);
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.delete(keyOrPrefix);
    }
  }

  /** Limpia todo el cache */
  clear(): void {
    this.store.clear();
  }

  /** Número de entradas activas (para debugging) */
  get size(): number {
    return this.store.size;
  }
}

// ——— Singleton global del cache ———
// Usamos globalThis para sobrevivir a hot-reloads en desarrollo
const globalKey = '__ffsv_cache__';

function getGlobalCache(): MemoryCache {
  if (!(globalThis as Record<string, unknown>)[globalKey]) {
    (globalThis as Record<string, unknown>)[globalKey] = new MemoryCache();
  }
  return (globalThis as Record<string, unknown>)[globalKey] as MemoryCache;
}

export const cache = getGlobalCache();

// ——— Claves de cache predefinidas ———
export const CACHE_KEYS = {
  MENU: 'menu:all',
  KITCHEN_ORDERS: 'kitchen:orders',
  TABLES_OPEN: 'tables:open',
} as const;

// ——— TTLs en milisegundos ———
export const CACHE_TTL = {
  /** Menú: 5 minutos — datos que rara vez cambian durante el servicio */
  MENU: 5 * 60 * 1000,
  /** Kitchen orders: 3 segundos — de-duplica queries de múltiples KDS */
  KITCHEN_ORDERS: 3 * 1000,
  /** Mesas abiertas: 5 segundos */
  TABLES: 5 * 1000,
} as const;
