import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkRateLimit, validateApiKey } from '@/lib/security';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';

/**
 * GET /api/menu
 * 
 * Retorna la lista completa de productos del menú.
 * 
 * OPTIMIZACIÓN: Cache en memoria de 5 minutos + HTTP Cache-Control.
 * El menú rara vez cambia durante el servicio, así que cachearlo
 * reduce drásticamente las consultas a Neon DB.
 * 
 * Antes:  ~50+ queries/hora (cada carga de página)
 * Después: ~12 queries/hora (1 cada 5 min por instancia)
 */
export async function GET(request: Request) {
    try {
        // 1. Security Check: API Key
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Security Check: Rate Limiting (30 requests per minute for menu read)
        const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
        const rateLimit = checkRateLimit(`menu_${ip}`, 30);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }

        // 3. Intentar obtener del cache primero
        const cached = cache.get<{ products: unknown[] }>(CACHE_KEYS.MENU);
        if (cached) {
            return NextResponse.json(
                cached,
                {
                    status: 200,
                    headers: {
                        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                        'X-Cache': 'HIT',
                        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            );
        }

        // 4. Cache MISS — Fetch menu from Neon DB
        const res = await query('SELECT "ARTICULO" as name, "PRECIO" as price, "CATEGORIA" as category FROM "MENU" ORDER BY "CATEGORIA", "ARTICULO"');

        // Map to the expected format - return ALL products, frontend handles filtering
        const products = res.rows
            .map((row, i) => ({
                id: `DB_${i}`,
                name: row.name,
                price: Number(row.price) || 0,
                category: row.category || 'Otros'
            }))
            .filter((p) => p.name && p.name.trim() !== '');

        const payload = { products };

        // 5. Guardar en cache por 5 minutos
        cache.set(CACHE_KEYS.MENU, payload, CACHE_TTL.MENU);

        return NextResponse.json(
            payload,
            {
                status: 200,
                headers: {
                    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                    'X-Cache': 'MISS',
                    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        );

    } catch (error) {
        console.error('Error fetching menu:', error);
        return NextResponse.json(
            { error: 'Internal server error while fetching menu' },
            { status: 500 }
        );
    }
}
