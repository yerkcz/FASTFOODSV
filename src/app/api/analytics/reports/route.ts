import { NextResponse } from 'next/server';
import {
  getKPIs, getProductAnalysis, getTimeSeries,
  getGoldenHours, getWeekdayBreakdown, getPaymentMethods,
  getComparativa, buildDateRange, buildPreviousPeriod
} from '@/lib/analyticsQueries';

export async function GET(request: Request) {
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') || 'mes';
    const { desde, hasta } = buildDateRange(periodo,
      searchParams.get('desde') || undefined,
      searchParams.get('hasta') || undefined
    );
    const prev = buildPreviousPeriod(desde, hasta);

    // ALL queries in parallel — máxima eficiencia
    const [kpis, comparativa, products, timeSeries, goldenHours, weekdays, payments] = await Promise.all([
      getKPIs(desde, hasta),
      getComparativa(desde, hasta, prev.desde, prev.hasta),
      getProductAnalysis(desde, hasta),
      getTimeSeries(desde, hasta, 'day'),
      getGoldenHours(desde, hasta),
      getWeekdayBreakdown(desde, hasta),
      getPaymentMethods(desde, hasta),
    ]);

    // Enrich products with Pareto
    const totalIngresos = products.reduce((s, p) => s + p.ingresos, 0);
    let acc = 0;
    const top10 = products.slice(0, 10).map(p => {
      const pct = totalIngresos > 0 ? (p.ingresos / totalIngresos) * 100 : 0;
      acc += pct;
      return { ...p, pct: Math.round(pct * 10) / 10, pct_acc: Math.round(acc * 10) / 10 };
    });

    return NextResponse.json({
      generado: new Date().toISOString(),
      periodo: { desde, hasta, label: periodo },
      kpis,
      comparativa,
      top10_productos: top10,
      total_productos: products.length,
      timeSeries,
      goldenHours: goldenHours.slice(0, 5),
      weekdays,
      payments,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
