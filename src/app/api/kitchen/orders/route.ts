import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonOk } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('orden_items')
      .select(`
        id, nombre_producto, cantidad, notas, listo, estado_kds, hora_registro,
        ordenes!inner ( id, mesa_numero, cliente_nombre, opened_at, estado, tipo ),
        productos (
          id,
          categorias (
            id,
            nombre
          )
        )
      `)
      .in('estado_kds', ['pendiente', 'preparando', 'listo'])
      .eq('ordenes.estado', 'abierta')
      .order('hora_registro');
    if (error) throw error;

    const ordenesMap = new Map<string, any>();
    for (const item of (data as any[]) || []) {
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

      ordenesMap.get(oid).items.push({
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
