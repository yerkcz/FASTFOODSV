import { NextRequest, NextResponse } from 'next/server';
import { jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return jsonOk({ success: true, message: 'Mesa desbloqueada', mesa: body.mesa });
  } catch (err) {
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
