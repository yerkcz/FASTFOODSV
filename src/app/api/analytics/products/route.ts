import { NextRequest } from 'next/server';
import { getServerSupabase, jsonOk, jsonError } from '@/lib/supabase/server-api';
import { getPeriodRange } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const periodo = request.nextUrl.searchParams.get('periodo') || 'mes';
    const { start, end } = getPeriodRange(periodo);

    const supabase = getServerSupabase();

    const { data: items } = await supabase
      .from('orden_items')
      .select(`
        nombre_producto, cantidad, subtotal,
        ordenes!inner ( created_at ),
        productos:producto_id ( categoria_id )
      `)
      .gte('ordenes.created_at', start)
      .lte('ordenes.created_at', end);

    const { data: cats } = await supabase
      .from('categorias')
      .select('id, nombre');

    const catMap = new Map((cats || []).map((c: any) => [c.id, c.nombre]));

    const prodMap = new Map<string, { producto: string; categoria: string; unidades_vendidas: number; ingresos: number }>();
    const catMap2 = new Map<string, number>();
    let totalIngresos = 0;

    for (const item of (items || []) as any[]) {
      const name = item.nombre_producto || 'Sin nombre';
      const catId = item.productos?.categoria_id;
      const catName = catMap.get(catId) || 'Otros';
      const ingreso = Number(item.subtotal || 0);
      const cant = item.cantidad || 0;

      totalIngresos += ingreso;

      const p = prodMap.get(name) || { producto: name, categoria: catName, unidades_vendidas: 0, ingresos: 0 };
      p.unidades_vendidas += cant;
      p.ingresos += ingreso;
      prodMap.set(name, p);

      catMap2.set(catName, (catMap2.get(catName) || 0) + ingreso);
    }

    const productos = Array.from(prodMap.values())
      .map((p) => ({
        ...p,
        rotacion_diaria: 0,
        pct_individual: totalIngresos > 0 ? (p.ingresos / totalIngresos) * 100 : 0,
      }))
      .sort((a, b) => b.ingresos - a.ingresos);

    const categorias = Array.from(catMap2.entries())
      .map(([nombre, ingresos]) => ({ nombre, ingresos }))
      .sort((a, b) => b.ingresos - a.ingresos);

    return jsonOk({ productos, categorias, total_ingresos: totalIngresos });
  } catch (err) {
    console.error('Error GET /api/analytics/products:', err);
    return jsonError('Error al cargar productos', 500);
  }
}
