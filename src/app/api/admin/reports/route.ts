import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('cierres_caja')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(30) as { data: any[]; error: any };

    return jsonOk({ reports: data || [] });
  } catch (err) {
    return jsonError('Error al obtener reportes', 500);
  }
}
