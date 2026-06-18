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

    let mapped = (items || []).map((i: any) => ({
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

    if (mapped.length === 0) {
      const { data: comps } = await supabase
        .from('comprobantes')
        .select('id, orden_id, items_snapshot, created_at, numero')
        .in('orden_id', ordenesList)
        .order('created_at', { ascending: true }) as { data: any[]; error: any };
      mapped = (comps || []).flatMap((c: any) => {
        const snap = Array.isArray(c.items_snapshot) ? c.items_snapshot : [];
        return snap.map((it: any, idx: number) => ({
          ID: `${c.id}-${idx}`,
          ARTICULO: it.nombre,
          CANTIDAD: it.cantidad,
          PRECIO: Number(it.precio_unitario),
          TOTAL: Number(it.subtotal),
          NOTAS: it.notas || null,
          LISTO: true,
          HoraRegistro: c.created_at,
          FechaRegistro: c.created_at,
          Orden_Nu: c.orden_id,
        }));
      });
    }

    return jsonOk({ items: mapped });
  } catch (err) {
    console.error('Error GET /api/admin/table-details:', err);
    return jsonError('Error al obtener detalles', 500);
  }
}
