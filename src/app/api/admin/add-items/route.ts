import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { refreshAppSheetCache } from '@/lib/appsheet';
import { cache, CACHE_KEYS } from '@/lib/cache';

export async function POST(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { orden_nu, items } = body;

        if (!orden_nu) {
            return NextResponse.json({ error: 'Debe indicar el número de orden' }, { status: 400 });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'Debe incluir al menos un artículo' }, { status: 400 });
        }

        const ordenRes = await query(
            `SELECT "Orden_Nu", "Estado" FROM "CLIENTES" WHERE "Orden_Nu" = $1`,
            [orden_nu]
        );

        if (ordenRes.rows.length === 0) {
            return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
        }

        if (ordenRes.rows[0].Estado !== 'Abierta') {
            return NextResponse.json({ error: 'La orden ya está cerrada' }, { status: 400 });
        }

        const itemNames = items.map((i: any) => i.name);
        const placeholders = itemNames.map((_, i) => `$${i + 1}`).join(',');
        const menuRes = await query(
            `SELECT "ARTICULO", "PRECIO" FROM "MENU" WHERE "ARTICULO" IN (${placeholders})`,
            itemNames
        );

        const menuMap = new Map();
        menuRes.rows.forEach(r => menuMap.set(r.ARTICULO, Number(r.PRECIO)));

        for (const item of items) {
            if (!menuMap.has(item.name)) {
                return NextResponse.json({ error: `Artículo no encontrado en el menú: ${item.name}` }, { status: 400 });
            }
        }

        const { client, release } = await getClient();

        try {
            await client.query('BEGIN');

            for (const item of items) {
                const pedidoId = crypto.randomUUID().substring(0, 8).toUpperCase();
                const realPrice = menuMap.get(item.name);
                const itemTotal = realPrice * item.quantity;

                await client.query(
                    `INSERT INTO "PEDIDOS" 
                     ("ID", "Orden_Nu", "ARTICULO", "PRECIO", "CANTIDAD", "NOTAS", "LISTO", "HoraRegistro", "TOTAL") 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
                    [pedidoId, orden_nu, item.name, realPrice, item.quantity, item.notes || null, false, itemTotal]
                );
            }

            await client.query('COMMIT');

            cache.invalidate(CACHE_KEYS.KITCHEN_ORDERS);
            cache.invalidate(CACHE_KEYS.TABLES_OPEN);
            refreshAppSheetCache().catch(console.error);

            return NextResponse.json({
                success: true,
                orden_nu,
                items_added: items.length
            });

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            release();
        }

    } catch (error) {
        console.error('Error adding items to order:', error);
        return NextResponse.json(
            { error: 'Error interno al agregar artículos' },
            { status: 500 }
        );
    }
}
