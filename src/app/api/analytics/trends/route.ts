import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonOk, jsonError } from '@/lib/supabase/server-api';
import { getPeriodRange } from '@/lib/analytics';
import { buildTrends, loadAnalyticsCore } from '@/lib/analyticsData';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;

    const periodo = request.nextUrl.searchParams.get('periodo') || 'mes';
    const { start, end } = getPeriodRange(periodo);
    const supabase = getServerSupabase();
    const core = await loadAnalyticsCore(supabase, start, end);

    return jsonOk(buildTrends(core));
  } catch (err) {
    console.error('Error GET /api/analytics/trends:', err);
    return jsonError('Error al cargar tendencias', 500);
  }
}
