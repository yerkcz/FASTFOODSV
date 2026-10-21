import { requireStaff } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

/**
 * Órdenes abiertas en formato plano para el monitor de mesas.
 * Solo staff autenticado; no expone tokens ni claves.
 */
export async function GET(request: NextRequest) {
  const authError = requireStaff(request);
  if (authError) return authError;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('ordenes')
      .select('id, mesa_numero, cliente_nombre, opened_at, estado, total, tipo')
      .eq('estado', 'abierta')
      .order('opened_at', { ascending: true });
    if (error) throw error;

    const tables = (data || []).map((order) => ({
      orden_nu: order.id,
      cliente: order.cliente_nombre,
      mesa: order.mesa_numero == null ? null : String(order.mesa_numero),
      fecha: order.opened_at,
      estado: order.estado,
      total: Number(order.total || 0),
      tipo: order.tipo,
    }));

    return NextResponse.json({ tables });
  } catch (error) {
    console.error('Error GET /api/tables:', error);
    return NextResponse.json({ tables: [] }, { status: 500 });
  }
}
