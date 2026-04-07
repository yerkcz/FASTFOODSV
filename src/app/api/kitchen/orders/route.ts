import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { validateApiKey } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kitchen/orders
 * 
 * Retorna pedidos pendientes agrupados por orden.
 * 
 * OPTIMIZACIONES:
 * 1. WHERE "LISTO" = false — Filtra directamente en SQL en vez de traer todo
 *    y filtrar en el frontend. Reduce drásticamente el volumen de datos.
 * 2. Cache de 3 segundos — De-duplica cuando 3+ pantallas KDS consultan
 *    simultáneamente (cocina, bebidas frías, bebidas calientes).
 * 
 * Antes:  ~720 queries/hora (3 KDS × polling cada 5s)
 * Después: ~240 queries/hora (cache absorbe duplicados)
 */
export async function GET(request: Request) {
    try {
        // Auth: require API key
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Intentar cache primero (de-duplica múltiples KDS)
        const cached = cache.get<{ success: boolean; orders: unknown[] }>(CACHE_KEYS.KITCHEN_ORDERS);
        if (cached) {
            return NextResponse.json(cached, {
                headers: {
                    'X-Cache': 'HIT',
                    'Cache-Control': 'private, max-age=3',
                }
            });
        }

        // 2. Cache MISS — Query optimizada con WHERE LISTO = false
        const res = await query(`
            SELECT 
                p."ID",
                p."Orden_Nu",
                p."ARTICULO",
                p."CANTIDAD",
                p."NOTAS",
                p."LISTO",
                p."HoraRegistro",
                c."Nombre_Cliente",
                c."Mesa",
                c."Fecha" as "HoraApertura",
                m."CATEGORIA"
            FROM "PEDIDOS" p
            JOIN "CLIENTES" c ON p."Orden_Nu" = c."Orden_Nu"
            LEFT JOIN "MENU" m ON p."ARTICULO" = m."ARTICULO"
            WHERE c."Estado" = 'Abierta'
              AND (p."LISTO" = false OR p."LISTO" IS NULL)
            ORDER BY c."Fecha" ASC, p."HoraRegistro" ASC
        `);

        // 3. Agrupar por Cliente/Orden
        const ordersMap = new Map();

        res.rows.forEach(row => {
            if (!ordersMap.has(row.Orden_Nu)) {
                ordersMap.set(row.Orden_Nu, {
                    orden_nu: row.Orden_Nu,
                    cliente: row.Nombre_Cliente,
                    hora_apertura: row.HoraApertura,
                    items: []
                });
            }
            ordersMap.get(row.Orden_Nu).items.push({
                id: row.ID,
                articulo: row.ARTICULO,
                cantidad: row.CANTIDAD,
                notas: row.NOTAS,
                listo: row.LISTO,
                hora_registro: row.HoraRegistro,
                categoria: row.CATEGORIA || 'Cocina',
                mesa: row.Mesa || row.Nombre_Cliente || ''
            });
        });

        const orders = Array.from(ordersMap.values());
        const payload = { success: true, orders };

        // 4. Guardar en cache por 3 segundos
        cache.set(CACHE_KEYS.KITCHEN_ORDERS, payload, CACHE_TTL.KITCHEN_ORDERS);

        return NextResponse.json(payload, {
            headers: {
                'X-Cache': 'MISS',
                'Cache-Control': 'private, max-age=3',
            }
        });
    } catch (error) {
        console.error('Error fetching kitchen orders:', error);
        return NextResponse.json(
            { error: 'Internal server error while fetching kitchen orders' },
            { status: 500 }
        );
    }
}
