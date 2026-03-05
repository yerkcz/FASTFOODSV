import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { checkRateLimit, validateApiKey, validateOrderPayload } from '@/lib/security';

export async function POST(request: Request) {
    try {
        // 1. Security Check: API Key
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Security Check: Rate Limiting (10 orders per minute per IP)
        const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
        const rateLimit = checkRateLimit(`order_${ip}`, 10);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }

        // 3. Parse & Validate Payload
        const body = await request.json();
        const validation = validateOrderPayload(body);

        if (!validation.valid || !validation.data) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const { mesa, cliente, notas, items } = validation.data;

        // 4. Server-side price & item validation mechanism
        // Get canonical prices from the database 
        const itemNames = items.map(i => i.name);

        // Parameterized query is safe from SQL injection
        // Generate placeholders like $1, $2, $3 for the IN clause
        const placeholders = itemNames.map((_, i) => `$${i + 1}`).join(',');
        const menuRes = await query(
            `SELECT "ARTICULO", "PRECIO" FROM "MENU" WHERE "ARTICULO" IN (${placeholders})`,
            itemNames
        );

        // Create a map of valid items and their real prices
        const menuMap = new Map();
        menuRes.rows.forEach(r => menuMap.set(r.ARTICULO, Number(r.PRECIO)));

        // Verify all requested items exist
        for (const item of items) {
            if (!menuMap.has(item.name)) {
                return NextResponse.json(
                    { error: `Item no encontrado en el menú: ${item.name}` },
                    { status: 400 }
                );
            }
        }

        // 5. Database Transaction (All or Nothing)
        const { client, release } = await getClient();

        try {
            await client.query('BEGIN');

            // Generate UNIQUEID() equivalent like AppSheet
            const ordenNu = crypto.randomUUID().substring(0, 8).toUpperCase();

            const combinedClienteName = cliente ? `${mesa} - ${cliente}` : mesa;

            // 5a. Insert into CLIENTES (The Order Header)
            await client.query(
                `INSERT INTO "CLIENTES" 
         ("Orden_Nu", "Fecha", "Tipo", "Nombre_Cliente", "Estado") 
         VALUES ($1, NOW(), $2, $3, $4)`,
                [ordenNu, 'Restaurante', combinedClienteName, 'Abierta']
            );

            // 5b. Insert each item into PEDIDOS (The Order Lines)
            for (const item of items) {
                const pedidoId = crypto.randomUUID().substring(0, 8).toUpperCase();
                // Force the price to be the one from the database, ignore client price
                const realPrice = menuMap.get(item.name);

                await client.query(
                    `INSERT INTO "PEDIDOS" 
           ("ID", "Orden_Nu", "ARTICULO", "PRECIO", "CANTIDAD", "NOTAS", "LISTO", "HoraRegistro") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                    [pedidoId, ordenNu, item.name, realPrice, item.quantity, notas, false]
                );
            }

            // Commit the transaction
            await client.query('COMMIT');

            // 6. Success Response
            return NextResponse.json({
                success: true,
                message: 'Orden recibida correctamente',
                orden_nu: ordenNu
            });

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError; // Rethrow to let the main catch block handle it
        } finally {
            release();
        }

    } catch (error) {
        console.error('Error processing order:', error);
        return NextResponse.json(
            { error: 'Internal server error while processing order' },
            { status: 500 }
        );
    }
}
