import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tables
 * 
 * Retorna las órdenes abiertas (mesas en servicio).
 * 
 * OPTIMIZACIÓN: Cache de 5 segundos para de-duplicar polls.
 * Admin pollea cada 15s, pero si hay múltiples admins o
 * si otra ruta también necesita este dato, el cache ayuda.
 */
export async function GET(request: Request) {
    try {
        const apiKey = request.headers.get('x-api-key');
        if (apiKey !== process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY && apiKey !== process.env.SELF_ORDER_API_KEY) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Intentar cache
        const cached = cache.get<{ success: boolean; tables: unknown[] }>(CACHE_KEYS.TABLES_OPEN);
        if (cached) {
            return NextResponse.json(cached, {
                headers: { 'X-Cache': 'HIT' }
            });
        }

        // 2. Cache MISS — Query a DB
        const res = await query(`
            SELECT 
                c."Orden_Nu",
                c."Nombre_Cliente",
                c."Mesa",
                c."Fecha",
                c."Estado",
                COALESCE(SUM(p."TOTAL"), 0) as "TotalSinImpuestos"
            FROM "CLIENTES" c
            LEFT JOIN "PEDIDOS" p ON c."Orden_Nu" = p."Orden_Nu"
            WHERE c."Estado" = 'Abierta'
            GROUP BY c."Orden_Nu", c."Nombre_Cliente", c."Mesa", c."Fecha", c."Estado"
            ORDER BY c."Fecha" DESC
        `);

        const tables = res.rows.map(row => ({
            orden_nu: row.Orden_Nu,
            cliente: row.Nombre_Cliente,
            mesa: row.Mesa,
            fecha: row.Fecha,
            estado: row.Estado,
            total: Number(row.TotalSinImpuestos || 0) * 1.1
        }));

        const payload = { success: true, tables };

        // 3. Guardar en cache
        cache.set(CACHE_KEYS.TABLES_OPEN, payload, CACHE_TTL.TABLES);

        return NextResponse.json(payload, {
            headers: { 'X-Cache': 'MISS' }
        });

    } catch (error) {
        console.error('Error fetching tables:', error);
        return NextResponse.json(
            { error: 'Internal server error while fetching tables' },
            { status: 500 }
        );
    }
}
