import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, isValidAdminKey } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('ordenes')
      .select('id, mesa_numero, cliente_nombre, opened_at, estado, total, subtotal, descuento, tipo')
      .eq('estado', 'abierta')
      .order('opened_at', { ascending: false });
    if (error) throw error;

    const groupsMap = new Map<number, any>();
    for (const o of (data as any[]) || []) {
      const key = o.mesa_numero;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          mesa: String(key),
          ordenes: [],
          total_mesa: 0,
          fecha_primera: o.opened_at,
        });
      }
      const g = groupsMap.get(key);
      g.ordenes.push({
        orden_nu: o.id,
        cliente: o.cliente_nombre,
        fecha: o.opened_at,
        estado: o.estado,
        total: Number(o.total || 0),
        tipo: o.tipo,
      });
      g.total_mesa += Number(o.total || 0);
    }

    return NextResponse.json({
      mesa_groups: Array.from(groupsMap.values()),
      total_abiertas: (data || []).length,
    });
  } catch (err) {
    console.error('Error GET /api/admin/tables:', err);
    return NextResponse.json({ mesa_groups: [], total_abiertas: 0 }, { status: 500 });
  }
}
