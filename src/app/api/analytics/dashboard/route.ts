import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonOk, jsonError } from '@/lib/supabase/server-api';
import { getPeriodRange, getPrevPeriodRange } from '@/lib/analytics';
import {
  buildDashboard,
  fetchMonthlyHistory,
  fetchPrevCategoryMix,
  fetchSalesTotals,
  loadAnalyticsCore,
} from '@/lib/analyticsData';

export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  anio: 'Este año',
  año: 'Este año',
};

export async function GET(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;

    const periodo = request.nextUrl.searchParams.get('periodo') || 'mes';
    const { start, end } = getPeriodRange(periodo);
    const prev = getPrevPeriodRange(periodo);
    const supabase = getServerSupabase();

    // Comparar un mes en curso contra el mes anterior completo castiga las
    // ventas: se recorta el período anterior a la misma duración transcurrida.
    const duracion = new Date(end).getTime() - new Date(start).getTime();
    const prevEnd = new Date(
      Math.min(new Date(prev.end).getTime(), new Date(prev.start).getTime() + duracion)
    ).toISOString();

    const [core, prevTotals, prevCategories, monthly] = await Promise.all([
      loadAnalyticsCore(supabase, start, end),
      fetchSalesTotals(supabase, prev.start, prevEnd),
      fetchPrevCategoryMix(supabase, prev.start, prevEnd),
      fetchMonthlyHistory(supabase, 4),
    ]);

    const dashboard = buildDashboard(core, prevTotals, {
      periodo,
      prevCategories,
      monthly,
    });

    return jsonOk({
      ...dashboard,
      periodo: {
        ...dashboard.periodo,
        label: LABELS[periodo] || 'Periodo',
      },
    });
  } catch (err) {
    console.error('Error GET /api/analytics/dashboard:', err);
    return jsonError('Error al cargar dashboard', 500);
  }
}
