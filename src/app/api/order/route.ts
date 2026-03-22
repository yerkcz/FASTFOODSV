import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { checkRateLimit, validateApiKey, validateOrderPayload, checkOperatingHours, timingSafeCompare, generatePartyPin, validateGuestToken } from '@/lib/security';
import { refreshAppSheetCache } from '@/lib/appsheet';

export async function POST(request: Request) {
    try {
        // 1. Security Check: API Key
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Security Check: Operating Hours
        const opsCheck = checkOperatingHours();
        if (!opsCheck.isOpen) {
            return NextResponse.json(
                { error: 'El restaurante se encuentra fuera de horario. ¡Gracias por tu preferencia!' },
                { status: 403 }
            );
        }

        // 3. Security Check: Rate Limiting (10 orders per minute per IP)
        const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
        const rateLimit = checkRateLimit(`order_${ip}`, 10);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }

        // 4. Parse & Validate Payload
        const body = await request.json();
        // Validation inside validateOrderPayload should realistically allow unknown keys to exist, 
        // or we can manually extract waiter_mode here. We will just extract it from body.
        const validation = validateOrderPayload(body);

        if (!validation.valid || !validation.data) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const { mesa, cliente, items, session_token, guest_token } = validation.data;
        const waiter_mode = body.waiter_mode === true;

        // 4.5. Table Lock — Check if THIS user already has an open order for this table
        let existingOrdenNu: string | null = null;
        let isAddingToExisting = false;
        let generatedSessionToken: string | undefined;
        let generatedPin: string | undefined;

        if (session_token) {
            // Owner returning to add more items to their own order
            const lockRes = await query(
                `SELECT "Orden_Nu" FROM "CLIENTES" 
                 WHERE "session_token" = $1 AND "Estado" = 'Abierta' LIMIT 1`,
                [session_token]
            );
            if (lockRes.rows.length > 0) {
                existingOrdenNu = lockRes.rows[0].Orden_Nu;
                isAddingToExisting = true;
            }
        } else if (guest_token) {
            // Guest adding to an existing order they joined
            const lockRes = await query(
                `SELECT "Orden_Nu", "table_pin" FROM "CLIENTES" 
                 WHERE "Mesa" = $1 AND "Estado" = 'Abierta' LIMIT 1`,
                [mesa]
            );
            if (lockRes.rows.length > 0) {
                const existingOrder = lockRes.rows[0];
                const isGuest = await validateGuestToken(guest_token, existingOrder.table_pin, mesa, existingOrder.Orden_Nu);
                if (isGuest) {
                    existingOrdenNu = existingOrder.Orden_Nu;
                    isAddingToExisting = true;
                }
            }
        }
        // If waiter_mode or new customer: always create a new order (no merge)

        // 5. Server-side price & item validation mechanism
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

        // 6. Database Transaction (All or Nothing)
        const { client, release } = await getClient();

        try {
            await client.query('BEGIN');

            let ordenNu: string;

            if (isAddingToExisting && existingOrdenNu) {
                // 6a. Adding to existing order — skip CLIENTES insert, just add PEDIDOS
                ordenNu = existingOrdenNu;
            } else {
                // 6a. Create new order in CLIENTES with Party PIN
                ordenNu = crypto.randomUUID().substring(0, 8).toUpperCase();
                generatedSessionToken = crypto.randomUUID();
                generatedPin = generatePartyPin();

                const combinedClienteName = cliente || mesa;

                await client.query(
                    `INSERT INTO "CLIENTES" 
                     ("Orden_Nu", "Fecha", "Tipo", "Nombre_Cliente", "Mesa", "Estado", "session_token", "table_pin") 
                     VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
                    [ordenNu, 'Restaurante', combinedClienteName, mesa, 'Abierta', generatedSessionToken, generatedPin]
                );
            }

            // 6b. Insert each item into PEDIDOS (The Order Lines)
            let orderTotal = 0;
            for (const item of items) {
                const pedidoId = crypto.randomUUID().substring(0, 8).toUpperCase();
                const realPrice = menuMap.get(item.name);
                const itemTotal = realPrice * item.quantity;
                orderTotal += itemTotal;

                await client.query(
                    `INSERT INTO "PEDIDOS" 
                     ("ID", "Orden_Nu", "ARTICULO", "PRECIO", "CANTIDAD", "NOTAS", "LISTO", "HoraRegistro", "TOTAL") 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
                    [pedidoId, ordenNu, item.name, realPrice, item.quantity, item.notas || null, false, itemTotal]
                );
            }

            // 6c. Total is recalculated automatically by trigger trg_recalcular_total_orden
            // No manual update needed - trigger handles SUM(PEDIDOS.TOTAL) * 1.1

            // Commit the transaction
            await client.query('COMMIT');

            // 7. Force AppSheet to refresh its cache from Neon (fire and forget)
            refreshAppSheetCache().catch(err =>
                console.error('AppSheet refresh error:', err)
            );

            // 8. Success Response
            return NextResponse.json({
                success: true,
                message: isAddingToExisting ? 'Items agregados a tu orden' : 'Orden recibida correctamente',
                orden_nu: ordenNu,
                session_token: generatedSessionToken,
                table_pin: generatedPin, // Only present for new orders
                added_to_existing: isAddingToExisting
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
