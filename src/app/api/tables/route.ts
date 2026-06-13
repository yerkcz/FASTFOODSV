import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonOk } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('ordenes')
      .select('id, mesa_numero, cliente_nombre, opened_at, estado, total, subtotal, descuento, tipo')
      .eq('estado', 'abierta')
      .eq('tipo', 'mesa')
      .order('opened_at', { ascending: false });
    if (error) throw error;

    const tables = (data || []).map((o: any) => ({
      orden_nu: o.id,
      mesa: String(o.mesa_numero),
      cliente: o.cliente_nombre,
      fecha: o.opened_at,
      estado: o.estado,
      total: Number(o.total || 0),
    }));

    return jsonOk({ success: true, tables });
  } catch (err) {
    console.error('Error GET /api/tables:', err);
    return NextResponse.json({ success: false, tables: [], error: 'Error' }, { status: 500 });
  }
}
