import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, isValidAdminKey } from '@/lib/supabase/server-api';
import type { OrdenRow } from '@/types/db';

export const dynamic = 'force-dynamic';

/** Una orden dentro del grupo de mesa (es lo que se serializa a JSON). */
type OrdenEnMesa = {
  orden_nu: string;
  cliente: string | null;
  fecha: string | null;
  estado: OrdenRow['estado'];
  total: number;
  tipo: OrdenRow['tipo'];
};

/** Agrupación de las órdenes abiertas por número de mesa. */
type MesaGroup = {
  mesa: string;
  ordenes: OrdenEnMesa[];
  total_mesa: number;
  fecha_primera: string | null;
};

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

    // `mesa_numero` es nullable en `ordenes` (p. ej. pedidos "para llevar"):
    // la clave del Map lo refleja para no cambiar cómo se agrupan hoy.
    const groupsMap = new Map<number | null, MesaGroup>();
    for (const o of data || []) {
      const totalOrder = Number(o.total || 0);
      if (totalOrder <= 0) continue;
      const key = o.mesa_numero;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          mesa: String(key),
          ordenes: [],
          total_mesa: 0,
          fecha_primera: o.opened_at,
        });
      }
      // Ya existe o se acaba de crear arriba: siempre hay grupo.
      const g = groupsMap.get(key)!;
      g.ordenes.push({
        orden_nu: o.id,
        cliente: o.cliente_nombre,
        fecha: o.opened_at,
        estado: o.estado,
        total: totalOrder,
        tipo: o.tipo,
      });
      g.total_mesa += totalOrder;
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
