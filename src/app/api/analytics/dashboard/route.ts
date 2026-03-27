import { NextResponse } from 'next/server';
import { getKPIs, getComparativa, buildDateRange, buildPreviousPeriod } from '@/lib/analyticsQueries';

export async function GET(request: Request) {
  // Auth
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey !== 'admin123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') || 'hoy';
    const customDesde = searchParams.get('desde') || undefined;
    const customHasta = searchParams.get('hasta') || undefined;

    const { desde, hasta } = buildDateRange(periodo, customDesde, customHasta);
    const prev = buildPreviousPeriod(desde, hasta);

    // Parallel execution
    const [kpis, comparativa] = await Promise.all([
      getKPIs(desde, hasta),
      getComparativa(desde, hasta, prev.desde, prev.hasta),
    ]);

    return NextResponse.json({
      periodo: { desde, hasta },
      kpis,
      comparativa,
    });
  } catch (error: any) {
    console.error('Analytics dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
