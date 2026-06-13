import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const ordenNu = url.searchParams.get('orden_nu');
    const ordenesParam = url.searchParams.get('ordenes');

    const supabase = getServerSupabase();
    const ordenIds: string[] = [];
    if (ordenNu) ordenIds.push(ordenNu);
    if (ordenesParam) ordenIds.push(...ordenesParam.split(',').filter(Boolean));

    if (ordenIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const { data, error } = await supabase
      .from('orden_items')
      .select('id, orden_id, nombre_producto, precio_unitario, cantidad, subtotal, notas, estado_kds, listo, hora_registro')
      .in('orden_id', ordenIds)
      .order('hora_registro');
    if (error) throw error;

    return NextResponse.json({ items: data || [] });
  } catch (err) {
    console.error('Error GET /api/admin/table-details:', err);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
