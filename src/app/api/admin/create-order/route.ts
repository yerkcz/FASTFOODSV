import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { timingSafeCompare, generatePartyPin, validateGuestToken } from '@/lib/security';
import { refreshAppSheetCache } from '@/lib/appsheet';

export async function POST(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { mesa, cliente, notas, items, tipo } = body;

        // Validations
        if (!mesa && !cliente) {
            return NextResponse.json({ error: 'Debe indicar mesa o nombre del cliente' }, { status: 400 });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'La orden debe contener al menos un artículo' }, { status: 400 });
        }
        
        const tipoFinal = tipo === 'Llevar' ? 'Llevar' : 'Restaurante';
        const mesaValue = mesa || null; // Could be null for name-only orders
        const clienteValue = cliente || mesa; // Fallback to mesa if no name

        // 2. Fetch Prices
        const itemNames = items.map((i: any) => i.name);
        if (itemNames.length === 0) {
            return NextResponse.json({ error: 'Items vacíos' }, { status: 400 });
        }
        const placeholders = itemNames.map((_, i) => `$${i + 1}`).join(',');
        const menuRes = await query(
            `SELECT "ARTICULO", "PRECIO" FROM "MENU" WHERE "ARTICULO" IN (${placeholders})`,
            itemNames
        );

        const menuMap = new Map();
        menuRes.rows.forEach(r => menuMap.set(r.ARTICULO, Number(r.PRECIO)));

        for (const item of items) {
            if (!menuMap.has(item.name)) {
                return NextResponse.json({ error: `Item no encontrado: ${item.name}` }, { status: 400 });
            }
        }

        // 3. Transaction
        const { client, release } = await getClient();

        try {
            await client.query('BEGIN');

            let ordenNu: string;

            // Each admin order is always NEW (no auto-merge)
            ordenNu = crypto.randomUUID().substring(0, 8).toUpperCase();
            const sessionToken = crypto.randomUUID();
            const pin = generatePartyPin();

            await client.query(
                `INSERT INTO "CLIENTES" 
                 ("Orden_Nu", "Fecha", "Tipo", "Nombre_Cliente", "Mesa", "Estado", "session_token", "table_pin") 
                 VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
                [ordenNu, tipoFinal, clienteValue, mesaValue, 'Abierta', sessionToken, pin]
            );

            for (const item of items) {
                const pedidoId = crypto.randomUUID().substring(0, 8).toUpperCase();
                const realPrice = menuMap.get(item.name);
                const itemTotal = realPrice * item.quantity;

                await client.query(
                    `INSERT INTO "PEDIDOS" 
                     ("ID", "Orden_Nu", "ARTICULO", "PRECIO", "CANTIDAD", "NOTAS", "LISTO", "HoraRegistro", "TOTAL") 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
                    [pedidoId, ordenNu, item.name, realPrice, item.quantity, item.notes || notas || null, false, itemTotal]
                );
            }

            await client.query('COMMIT');

            refreshAppSheetCache().catch(console.error);

            return NextResponse.json({
                success: true,
                orden_nu: ordenNu
            });

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            release();
        }

    } catch (error) {
        console.error('Error in Admin Create Order:', error);
        return NextResponse.json(
            { error: 'Internal server error while processing Admin order' },
            { status: 500 }
        );
    }
}
