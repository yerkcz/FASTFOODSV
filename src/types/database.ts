/**
 * Tipo `Database` de Supabase, escrito a mano.
 *
 * ## Por qué existe
 * `getServerSupabase()` creaba el cliente sin genéricos, así que el tipo de
 * `Database` era `any`. Eso tenía dos consecuencias que parecían pereza del
 * código original pero no lo eran:
 *
 *  1. `.from('x').insert({...})` resolvía su parámetro como `never[]`, y por
 *     eso las rutas tenían que escribir `(supabase.from('x') as any)`.
 *  2. Todo llegaba como `any`, así que se añadían casts redundantes del tipo
 *     `as { data: any[]; error: any }`.
 *
 * Con este tipo, Supabase devuelve filas reales y los builders ya no necesitan
 * el cast: se borran y el código queda mejor tipado que antes.
 *
 * ## De dónde salen las columnas
 * Del esquema publicado por PostgREST (`GET /rest/v1/` con
 * `Accept: application/openapi+json`), no de memoria. Las `Row` están en
 * `@/types/db`.
 *
 * ## Nullabilidad
 * Se declara `| null` solo donde el código ya hacía chequeo de nulo
 * (p. ej. `estado_kds`, que `sumaRealOrden` filtra con `!= null`); el resto
 * va sin `| null` para reflejar el uso actual y no romper el build.
 */
import type {
  CategoriaRow,
  CierreCajaRow,
  ComprobanteRow,
  MesaRow,
  OrdenItemRow,
  OrdenRow,
  PagoRow,
  ProductoRow,
} from './db';

/** FK declarada para que el recurso embebido (`ordenes:orden_id`) tipé. */
type Relacion = {
  foreignKeyName: string;
  columns: string[];
  referencedRelation: string;
  referencedColumns: string[];
};

/**
 * `Insert`/`Update` son `Partial<Row>` a propósito: es más laxo que el tipo
 * generado por Supabase (que marca como obligatorias las columnas NOT NULL),
 * así el build no se queja por columnas que el código hoy omite.
 */
type Tabla<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: Relacion[];
};

export interface Database {
  public: {
    Tables: {
      categorias: Tabla<CategoriaRow>;
      cierres_caja: Tabla<CierreCajaRow>;
      comprobantes: Tabla<ComprobanteRow>;
      mesas: Tabla<MesaRow>;
      orden_items: Tabla<OrdenItemRow>;
      ordenes: Tabla<OrdenRow>;
      pagos: Tabla<PagoRow>;
      productos: Tabla<ProductoRow>;
    };
    Views: Record<string, never>;
    Functions: {
      /** Consecutivo simple de comprobante (régimen simplificado). */
      get_siguiente_numero_comprobante: {
        Args: { p_fecha: string };
        Returns: number;
      };
    };
  };
}
