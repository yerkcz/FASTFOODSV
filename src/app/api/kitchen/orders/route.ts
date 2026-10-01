import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonOk } from '@/lib/supabase/server-api';
import type {
  CategoriaRow,
  OrdenItemRow,
  OrdenRow,
  PostgrestError,
  ProductoRow,
} from '@/types/db';

export const dynamic = 'force-dynamic';

/**
 * Fila proyectada por el select embebido de esta ruta.
 *
 * `Database` declara las `Relationships` de forma genérica, así que el parser
 * de Supabase no resuelve `ordenes:orden_id!inner` / `productos:producto_id`
 * y tipa `data` como `never`. Este es el tipo real de cada fila: columnas
 * seleccionadas + los joins.
 */
type ItemOrdenCocina = Pick<
  OrdenItemRow,
  'id' | 'nombre_producto' | 'cantidad' | 'notas' | 'listo' | 'estado_kds' | 'hora_registro'
> & {
  // `!inner`: la fila de la orden siempre existe.
  ordenes: Pick<OrdenRow, 'id' | 'mesa_numero' | 'cliente_nombre' | 'opened_at' | 'estado' | 'tipo'>;
  productos:
    | (Pick<ProductoRow, 'id'> & { categorias: Pick<CategoriaRow, 'id' | 'nombre'> | null })
    | null;
};

/** Item de comanda tal como lo responde el KDS (con los campos renombrados). */
type ItemCocina = {
  id: string;
  articulo: string;
  cantidad: number;
  notas: string | null;
  listo: boolean | null;
  estado_kds: OrdenItemRow['estado_kds'];
  hora_registro: string;
  categoria: string;
};

/** Orden abierta agrupada en el mapa del KDS. */
type OrdenCocina = {
  orden_nu: string;
  mesa: string;
  cliente: string | null;
  hora_apertura: string | null;
  tipo: OrdenRow['tipo'];
  items: ItemCocina[];
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data, error } = (await supabase
      .from('orden_items')
      .select(`
        id, nombre_producto, cantidad, notas, listo, estado_kds, hora_registro,
        ordenes:orden_id!inner ( id, mesa_numero, cliente_nombre, opened_at, estado, tipo ),
        productos:producto_id (
          id,
          categorias:categoria_id (
            id,
            nombre
          )
        )
      `)
      .in('estado_kds', ['pendiente', 'preparando', 'listo'])
      .eq('ordenes.estado', 'abierta')
      .order('hora_registro')) as {
      data: ItemOrdenCocina[] | null;
      error: PostgrestError | null;
    };
    if (error) throw error;

    const ordenesMap = new Map<string, OrdenCocina>();
    for (const item of data || []) {
      const oid = item.ordenes.id;
      if (!ordenesMap.has(oid)) {
        ordenesMap.set(oid, {
          orden_nu: oid,
          mesa: String(item.ordenes.mesa_numero),
          cliente: item.ordenes.cliente_nombre,
          hora_apertura: item.ordenes.opened_at,
          tipo: item.ordenes.tipo,
          items: [],
        });
      }
      
      // Get category name
      const prod = item.productos;
      const catName = prod?.categorias?.nombre || 'Otros';

      // `oid` acaba de insertarse en el mapa, así que el valor siempre existe.
      ordenesMap.get(oid)!.items.push({
        id: item.id,
        articulo: item.nombre_producto,
        cantidad: item.cantidad,
        notas: item.notas,
        listo: item.listo,
        estado_kds: item.estado_kds,
        hora_registro: item.hora_registro,
        categoria: catName,
      });
    }

    return jsonOk({ orders: Array.from(ordenesMap.values()) });
  } catch (err) {
    console.error('Error GET /api/kitchen/orders:', err);
    return NextResponse.json({ orders: [] }, { status: 500 });
  }
}
