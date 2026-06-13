import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('cierres_caja')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ cierres: data || [] });
  } catch (err) {
    return NextResponse.json({ cierres: [] }, { status: 500 });
  }
}
