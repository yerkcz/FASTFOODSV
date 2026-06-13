import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
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

    const catMap = new Map((cats || []).map((c: any) => [c.id, c.nombre]));

    const products = (data || []).map((p: any) => ({
      id: p.id,
      name: p.nombre,
      category: catMap.get(p.categoria_id) || 'Otros',
      price: Number(p.precio) || 0,
      menu: p.menu_origen,
    })).filter((p) => p.name && p.name.trim() !== '');

    return jsonOk({ products });
  } catch (err) {
    console.error('Error GET /api/menu:', err);
    return jsonError('Error al cargar el menú', 500);
  }
}
