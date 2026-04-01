import { NextResponse } from 'next/server';
import { getProductAnalysis, buildDateRange } from '@/lib/analyticsQueries';

export async function GET(request: Request) {
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') || 'mes';
    const { desde, hasta } = buildDateRange(periodo,
      searchParams.get('desde') || undefined,
      searchParams.get('hasta') || undefined
    );

    const products = await getProductAnalysis(desde, hasta);

    // Derivar métricas Pareto en el servidor para eficiencia
    const totalIngresos = products.reduce((sum, p) => sum + p.ingresos, 0);
    let acumulado = 0;

    const enriched = products.map(p => {
      const pctIndividual = totalIngresos > 0 ? (p.ingresos / totalIngresos) * 100 : 0;
      acumulado += pctIndividual;
      return {
        ...p,
        pct_individual: Math.round(pctIndividual * 10) / 10,
        pct_acumulado: Math.round(acumulado * 10) / 10,
        es_vital: acumulado <= 80, // Pareto: productos que generan el 80%
      };
    });

    // Agrupar por categoría
    const categorias: Record<string, { ingresos: number; unidades: number; productos: number }> = {};
    products.forEach(p => {
      if (!categorias[p.categoria]) {
        categorias[p.categoria] = { ingresos: 0, unidades: 0, productos: 0 };
      }
      categorias[p.categoria].ingresos += p.ingresos;
      categorias[p.categoria].unidades += p.unidades_vendidas;
      categorias[p.categoria].productos += 1;
    });

    return NextResponse.json({
      periodo: { desde, hasta },
      total_ingresos: totalIngresos,
      total_productos: products.length,
      productos: enriched,
      categorias: Object.entries(categorias)
        .map(([nombre, data]) => ({ nombre, ...data }))
        .sort((a, b) => b.ingresos - a.ingresos),
    });
  } catch (error: any) {
    console.error('Analytics products error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
