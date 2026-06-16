import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const { itemId } = body;
    if (!itemId) return jsonError('itemId requerido');

    const supabase = getServerSupabase();
    const { error } = await (supabase.from('orden_items') as any).delete().eq('id', itemId);
    if (error) throw error;
    return jsonOk({ success: true });
  } catch (err) {
    return jsonError('Error al eliminar', 500);
  }
}
