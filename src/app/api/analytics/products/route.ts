import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonOk, jsonError } from '@/lib/supabase/server-api';
import { getPeriodRange } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

type SnapshotItem = {
  nombre?: string;
  producto_nombre?: string;
  ARTICULO?: string;
  cantidad?: number;
  CANTIDAD?: number;
  subtotal?: number;
  precio_unitario?: number;
  PRECIO?: number;
};

type Comprobante = {
  total: number;
  created_at: string;
  items_snapshot: SnapshotItem[] | null;
};

/**
 * Productos vendidos desde el snapshot del comprobante.
 *
 * `orden_items` se borra al cobrar (y el trigger deja la orden en 0), así que
 * leer esa tabla para reportes históricos siempre daba cero. El snapshot es la
 * fuente de verdad que ya se guarda para reimprimir facturas.
 */
export async function GET(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;

    const periodo = request.nextUrl.searchParams.get('periodo') || 'mes';
    const { start, end } = getPeriodRange(periodo);

    const supabase = getServerSupabase();

    const { data: comprobantes, error: compError } = await supabase
      .from('comprobantes')
      .select('total, created_at, items_snapshot')
      .gte('created_at', start)
      .lte('created_at', end);
    if (compError) throw compError;

    const { data: products } = await supabase
      .from('productos')
      .select('nombre, categoria_id');
    const { data: cats } = await supabase
      .from('categorias')
      .select('id, nombre');

    const catMap = new Map<string, string>((cats || []).map((c) => [c.id, c.nombre]));
    const productCategory = new Map<string, string>(
      (products || []).map((p) => [
        p.nombre,
        catMap.get(p.categoria_id as string) || 'Otros',
      ])
    );

    const prodMap = new Map<string, { producto: string; categoria: string; unidades_vendidas: number; ingresos: number }>();
    const catTotals = new Map<string, number>();
    let totalIngresos = 0;

    for (const comprobante of (comprobantes || []) as Comprobante[]) {
      const snapshot = Array.isArray(comprobante.items_snapshot) ? comprobante.items_snapshot : [];
      for (const item of snapshot) {
        const name = item.nombre || item.producto_nombre || item.ARTICULO || 'Sin nombre';
        const quantity = Number(item.cantidad ?? item.CANTIDAD ?? 0);
        const unitPrice = Number(item.precio_unitario ?? item.PRECIO ?? 0);
        const revenue = Number(item.subtotal ?? unitPrice * quantity);
        const category = productCategory.get(name) || 'Otros';

        totalIngresos += revenue;
        const current = prodMap.get(name) || {
          producto: name,
          categoria: category,
          unidades_vendidas: 0,
          ingresos: 0,
        };
        current.unidades_vendidas += quantity;
        current.ingresos += revenue;
        prodMap.set(name, current);
        catTotals.set(category, (catTotals.get(category) || 0) + revenue);
      }
    }

    const productos = Array.from(prodMap.values())
      .map((product) => ({
        ...product,
        rotacion_diaria: 0,
        pct_individual: totalIngresos > 0 ? (product.ingresos / totalIngresos) * 100 : 0,
      }))
      .sort((a, b) => b.ingresos - a.ingresos);

    const categorias = Array.from(catTotals.entries())
      .map(([nombre, ingresos]) => ({ nombre, ingresos }))
      .sort((a, b) => b.ingresos - a.ingresos);

    return jsonOk({ productos, categorias, total_ingresos: totalIngresos });
  } catch (err) {
    console.error('Error GET /api/analytics/products:', err);
    return jsonError('Error al cargar productos', 500);
  }
}
