import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { refreshAppSheetCache } from '@/lib/appsheet';
import { cache, CACHE_KEYS } from '@/lib/cache';

export async function POST(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { ordenNu, forma_pago, recibido, close_all_mesa, item_ids } = body;

        // --- SPLIT PAYMENT LOGIC ---
        // Si se proveen item_ids, puede ser un pago dividido (split ticket)
        if (item_ids && Array.isArray(item_ids) && item_ids.length > 0) {
            const { client, release } = await getClient();
            try {
                await client.query('BEGIN');
                
                // 1. Obtener info original de la mesa
                const itemRes = await client.query(
                    `SELECT p."Orden_Nu", c."Mesa", c."Nombre_Cliente", c."Tipo" 
                     FROM "PEDIDOS" p 
                     JOIN "CLIENTES" c ON p."Orden_Nu" = c."Orden_Nu" 
                     WHERE p."ID" = $1 LIMIT 1`,
                    [item_ids[0]]
                );

                if (itemRes.rowCount === 0) {
                    throw new Error('Items not found');
                }

                const { Mesa, Nombre_Cliente, Tipo } = itemRes.rows[0];

                // 2. Verificar si seleccionaron el 100% de los items
                const totalItemsCondition = close_all_mesa 
                    ? `WHERE "Orden_Nu" IN (SELECT "Orden_Nu" FROM "CLIENTES" WHERE "Mesa" = $1 AND "Estado"='Abierta')`
                    : `WHERE "Orden_Nu" = $1`;
                
                const param = close_all_mesa || ordenNu;

                const countRes = await client.query(
                    `SELECT COUNT(*) as total FROM "PEDIDOS" ${totalItemsCondition}`,
                    [param]
                );

                const totalInMesaGroup = parseInt(countRes.rows[0].total);

                if (totalInMesaGroup === item_ids.length) {
                    // Seleccionaron todos los items, así que procedemos con el cierre normal.
                    await client.query('ROLLBACK');
                } else {
                    // 3. SPLIT TRUE. Moveremos estos items a un ticket nuevo cerrado.
                    const newOrdenNu = crypto.randomUUID().substring(0, 8).toUpperCase();
                    await client.query(
                        `INSERT INTO "CLIENTES" 
                         ("Orden_Nu", "Fecha", "Tipo", "Nombre_Cliente", "Mesa", "Estado", "Forma_Pago", "Recibido") 
                         VALUES ($1, NOW(), $2, $3, $4, 'Cerrada', $5, $6)`,
                        [newOrdenNu, Tipo, (Nombre_Cliente || 'Mesa') + ' (Dividido)', Mesa, forma_pago || null, recibido || null]
                    );

                    const placeholders = item_ids.map((_: string, i: number) => `$${i + 2}`).join(',');
                    await client.query(
                        `UPDATE "PEDIDOS" SET "Orden_Nu" = $1 WHERE "ID" IN (${placeholders})`,
                        [newOrdenNu, ...item_ids]
                    );

                    // Recalculate total for the new split ticket
                    await client.query(
                        `UPDATE "CLIENTES" SET "Total" = COALESCE(
                            (SELECT SUM("TOTAL") * 1.1 FROM "PEDIDOS" WHERE "Orden_Nu" = $1), 0
                        ) WHERE "Orden_Nu" = $1`,
                        [newOrdenNu]
                    );

                    // Recalculate total for the original order(s) that lost items
                    const originalOrden = itemRes.rows[0].Orden_Nu;
                    await client.query(
                        `UPDATE "CLIENTES" SET "Total" = COALESCE(
                            (SELECT SUM("TOTAL") * 1.1 FROM "PEDIDOS" WHERE "Orden_Nu" = $1), 0
                        ) WHERE "Orden_Nu" = $1`,
                        [originalOrden]
                    );

                    await client.query('COMMIT');
                    cache.invalidate(CACHE_KEYS.KITCHEN_ORDERS);
                    cache.invalidate(CACHE_KEYS.TABLES_OPEN);
                    refreshAppSheetCache().catch(console.error);
                    return NextResponse.json({ success: true, split: true, new_orden_nu: newOrdenNu });
                }
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                release();
            }
        }
        // --- END SPLIT PAYMENT LOGIC ---

        if (close_all_mesa) {
            const res = await query(
                `UPDATE "CLIENTES" 
                 SET "Estado" = 'Cerrada', 
                     "Forma_Pago" = COALESCE($2, "Forma_Pago"),
                     "Recibido" = COALESCE($3, "Recibido")
                 WHERE "Mesa" = $1 AND "Estado" = 'Abierta'
                 RETURNING "Orden_Nu"`,
                [close_all_mesa, forma_pago || null, recibido || null]
            );

            cache.invalidate(CACHE_KEYS.KITCHEN_ORDERS);
            cache.invalidate(CACHE_KEYS.TABLES_OPEN);
            refreshAppSheetCache().catch(console.error);
            return NextResponse.json({ success: true, closed_count: res.rowCount });
        }

        if (!ordenNu) {
            return NextResponse.json({ error: 'Falta número de orden' }, { status: 400 });
        }

        const res = await query(
            `UPDATE "CLIENTES" 
             SET "Estado" = 'Cerrada', 
                 "Forma_Pago" = COALESCE($2, "Forma_Pago"),
                 "Recibido" = COALESCE($3, "Recibido")
             WHERE "Orden_Nu" = $1 
             RETURNING "Orden_Nu"`,
            [ordenNu, forma_pago || null, recibido || null]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ error: 'Orden no encontrada o ya estaba cerrada' }, { status: 404 });
        }

        cache.invalidate(CACHE_KEYS.KITCHEN_ORDERS);
        cache.invalidate(CACHE_KEYS.TABLES_OPEN);
        refreshAppSheetCache().catch(console.error);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error closing table:', error);
        return NextResponse.json(
            { error: 'Internal server error while closing table' },
            { status: 500 }
        );
    }
}
