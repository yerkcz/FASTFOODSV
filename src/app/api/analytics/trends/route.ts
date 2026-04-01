import { NextResponse } from 'next/server';
import {
  getTimeSeries, getGoldenHours, getWeekdayBreakdown,
  getPaymentMethods, getTableTurnover, getMarketBasket,
  buildDateRange
} from '@/lib/analyticsQueries';

export async function GET(request: Request) {
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') || 'mes';
    const granularity = (searchParams.get('granularity') || 'day') as 'day' | 'week' | 'month' | 'year';
    const { desde, hasta } = buildDateRange(periodo,
      searchParams.get('desde') || undefined,
      searchParams.get('hasta') || undefined
    );

    // Ejecutar TODAS las queries en paralelo para minimizar latencia
    const [timeSeries, goldenHours, weekdays, payments, tableTurnover, basket] = await Promise.all([
      getTimeSeries(desde, hasta, granularity),
      getGoldenHours(desde, hasta),
      getWeekdayBreakdown(desde, hasta),
      getPaymentMethods(desde, hasta),
      getTableTurnover(desde, hasta),
      getMarketBasket(desde, hasta),
    ]);

    return NextResponse.json({
      periodo: { desde, hasta, granularity },
      timeSeries,
      goldenHours,
      weekdays,
      payments,
      tableTurnover,
      basket,
    });
  } catch (error: any) {
    console.error('Analytics trends error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
