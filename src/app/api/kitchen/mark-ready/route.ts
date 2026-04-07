export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { refreshAppSheetCache } from '@/lib/appsheet';
import { cache, CACHE_KEYS } from '@/lib/cache';
import { validateApiKey } from '@/lib/security';

/**
 * POST /api/kitchen/mark-ready
 * 
 * Marca un item como listo (o deshace). Toggle de LISTO.
 * 
 * OPTIMIZACIÓN: Un solo query con UPDATE...RETURNING en vez de 
 * SELECT + UPDATE separados. Reduce de 2 queries a 1.
 * También invalida el cache de kitchen para que los KDS
 * vean el cambio en su próximo poll.
 */
export async function POST(request: Request) {
    try {
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { itemId } = body;

        if (!itemId) {
            return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
        }

        // Un solo query: toggle LISTO y retornar el nuevo valor
        const result = await query(
            `UPDATE "PEDIDOS" 
             SET "LISTO" = NOT COALESCE("LISTO", false)
             WHERE "ID" = $1
             RETURNING "LISTO"`,
            [itemId]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        const newListo = result.rows[0].LISTO;

        // Invalidar cache de kitchen para que los KDS vean el cambio
        cache.invalidate(CACHE_KEYS.KITCHEN_ORDERS);

        // Notify AppSheet cache if needed (fire and forget)
        refreshAppSheetCache().catch(console.error);

        return NextResponse.json({ success: true, listo: newListo });
    } catch (error) {
        console.error('Error in mark-ready endpoint:', error);
        return NextResponse.json(
            { error: 'Internal server error while toggling item ready status' },
            { status: 500 }
        );
    }
}
