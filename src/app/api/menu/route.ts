import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, precio, categoria_id, menu_origen, disponible')
      .eq('disponible', true)
      .order('categoria_id')
      .order('orden');
    if (error) throw error;

    const { data: cats } = await supabase
      .from('categorias')
      .select('id, nombre, orden, activo')
      .eq('activo', true)
      .order('orden');

    const activeCategoryIds = new Set((cats || []).map((c) => c.id));
    const catMap = new Map<string, string>((cats || []).map((c) => [c.id, c.nombre]));
    const categoryOrder = new Map<string, number>(
      (cats || []).map((c, index) => [c.nombre, c.orden ?? index])
    );

    const products = (data || [])
      .filter((p) => p.categoria_id && activeCategoryIds.has(p.categoria_id))
      .map((p) => ({
      id: p.id,
      name: p.nombre,
      // `categoria_id` es anulable: el cast es solo de tipos (`get(null)` ya
      // devolvía `undefined` y caía en 'Otros').
      category: catMap.get(p.categoria_id as string) || 'Otros',
      price: Number(p.precio) || 0,
      menu: p.menu_origen,
    })).filter((p) => p.name && p.name.trim() !== '');

    products.sort((a, b) => {
      const orderA = categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER;
      const orderB = categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, 'es');
    });

    const categoryNames = Array.from(new Set(products.map((p) => p.category)));

    return jsonOk({ products, categories: categoryNames });
  } catch (err) {
    console.error('Error GET /api/menu:', err);
    return jsonError('Error al cargar el menú', 500);
  }
}
