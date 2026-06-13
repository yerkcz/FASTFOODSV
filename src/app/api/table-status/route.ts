import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonOk } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const mesa = url.searchParams.get('mesa');
    if (!mesa) return NextResponse.json({ isOccupied: false, isOwner: false, isGuest: false, mesa });

    const supabase = getServerSupabase();
    const { data } = await supabase
      .from('ordenes')
      .select('id, opened_at, mesa_numero')
      .eq('mesa_numero', parseInt(mesa) || 0)
      .eq('estado', 'abierta')
      .order('opened_at', { ascending: false })
      .limit(1) as { data: any[]; error: any };

    if (!data || data.length === 0) {
      return jsonOk({ isOccupied: false, isOwner: false, isGuest: false, mesa });
    }
    return jsonOk({
      isOccupied: true,
      isOwner: true,
      isGuest: false,
      orden_nu: data[0].id,
      mesa,
    });
  } catch (err) {
    return NextResponse.json({ isOccupied: false, isOwner: false, isGuest: false }, { status: 500 });
  }
}
