import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkRateLimit, validateApiKey, timingSafeCompare, validateGuestToken, generateGuestToken } from '@/lib/security';

export async function GET(request: Request) {
    try {
        // 1. Security Check: API Key
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Security Check: Rate Limiting
        const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
        const rateLimit = checkRateLimit(`table_status_${ip}`, 60);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }

        // 3. Parse table name and tokens from URL
        const url = new URL(request.url);
        const mesa = url.searchParams.get('mesa');
        const sessionToken = url.searchParams.get('session_token');
        const guestToken = url.searchParams.get('guest_token');

        if (!mesa || typeof mesa !== 'string' || mesa.length > 50) {
            return NextResponse.json({ error: 'Invalid or missing "mesa" parameter' }, { status: 400 });
        }

        // 4. Check database for an open order for this table
        const res = await query(
            `SELECT "Orden_Nu", "session_token", "table_pin", "Fecha" 
             FROM "CLIENTES" 
             WHERE ("Nombre_Cliente" = $1 OR "Nombre_Cliente" LIKE $2) 
             AND "Estado" = 'Abierta'
             LIMIT 1`,
            [mesa, `${mesa} - %`]
        );

        const isOccupied = res.rows.length > 0;

        if (!isOccupied) {
            return NextResponse.json(
                { isOccupied: false, isOwner: false, isGuest: false, mesa },
                {
                    status: 200,
                    headers: {
                        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            );
        }

        // Table is occupied — check if the tokens match
        const order = res.rows[0];
        const isOwner = sessionToken && timingSafeCompare(sessionToken, order.session_token || '');

        let isGuest = false;
        if (!isOwner && guestToken && order.table_pin) {
            isGuest = await validateGuestToken(guestToken, order.table_pin, mesa, order.Orden_Nu);
        }

        let newGuestToken = undefined;
        // Frictionless 15-minute auto-join grace period
        if (!isOwner && !isGuest && order.table_pin && order.Fecha) {
            const orderTime = new Date(order.Fecha).getTime();
            const now = Date.now();
            const elapsedMins = (now - orderTime) / (1000 * 60);

            if (elapsedMins <= 15) {
                newGuestToken = await generateGuestToken(order.table_pin, mesa, order.Orden_Nu);
                isGuest = true;
            }
        }

        // Return detailed status
        return NextResponse.json(
            { 
                isOccupied: true, 
                isOwner, 
                isGuest,
                guest_token: newGuestToken,
                orden_nu: (isOwner || isGuest) ? order.Orden_Nu : undefined,
                mesa,
                table_pin: isOwner ? order.table_pin : undefined // Only reveal PIN to owner
            },
            {
                status: 200,
                headers: {
                    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                    'Access-Control-Allow-Origin': '*'
                }
            }
        );

    } catch (error) {
        console.error('Error checking table status:', error);
        return NextResponse.json(
            { error: 'Internal server error while checking table status' },
            { status: 500 }
        );
    }
}
