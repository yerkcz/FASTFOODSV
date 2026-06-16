import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const { searchParams } = new URL(request.url);
    const ordenesParam = searchParams.get('ordenes');
    const ordenNu = searchParams.get('orden_nu');
    const ordenesStr = ordenesParam || ordenNu;
    if (!ordenesStr) return jsonError('ordenes requerido');

    const ordenesList = ordenesStr.split(',').filter(Boolean);
    const supabase = getServerSupabase();

    const { data: items, error } = await supabase
      .from('orden_items')
      .select('*')
      .in('orden_id', ordenesList)
      .order('hora_registro', { ascending: true }) as { data: any[]; error: any };
    if (error) throw error;

    const mapped = (items || []).map((i: any) => ({
      ID: i.id,
      ARTICULO: i.nombre_producto,
      CANTIDAD: i.cantidad,
      PRECIO: Number(i.precio_unitario),
      TOTAL: Number(i.subtotal),
      NOTAS: i.notas,
      LISTO: i.listo,
      HoraRegistro: i.hora_registro,
      FechaRegistro: i.hora_registro,
      Orden_Nu: i.orden_id,
    }));

    return jsonOk({ items: mapped });
  } catch (err) {
    console.error('Error GET /api/admin/table-details:', err);
    return jsonError('Error al obtener detalles', 500);
  }
}
