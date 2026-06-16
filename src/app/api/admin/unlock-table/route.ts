import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError('No autorizado', 401);

    const body = await request.json();
    const { mesa } = body;
    if (!mesa) return jsonError('mesa requerido');

    const supabase = getServerSupabase();
    const mesaNum = Number(mesa);
    await (supabase.from('mesas') as any)
      .update({ estado: 'ocupada' })
      .eq('numero', mesaNum);
    return jsonOk({ success: true, message: `Mesa ${mesaNum} desbloqueada.` });
  } catch (err) {
    return jsonError('Error al desbloquear mesa', 500);
  }
}
