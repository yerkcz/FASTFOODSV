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

        // 4. Check database — query consolidada (1 query en vez de 3 sub-selects)
        // Usa aggregate functions para obtener todo en una sola pasada
        const res = await query(
            `SELECT 
                MIN("Orden_Nu") as "Orden_Nu",
                MIN("session_token") as "session_token",
                MIN("Fecha") as "Fecha",
                MAX("Fecha_Desbloqueo") as "Fecha_Desbloqueo",
                MAX("Ultima_Actividad") as "Ultima_Actividad"
             FROM "CLIENTES" 
             WHERE "Mesa" = $1 
             AND "Estado" = 'Abierta'`,
            [mesa]
        );

        // Aggregate siempre retorna 1 row; si no hay datos, Orden_Nu es null
        const isOccupied = res.rows.length > 0 && res.rows[0].Orden_Nu !== null;

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
        if (!isOwner && guestToken) {
            isGuest = await validateGuestToken(guestToken, mesa, order.Orden_Nu);
        }

        let newGuestToken = undefined;
        let isBlocked = true;

        // Verificar ventana inicial de 40 minutos desde primer pedido
        if (order.Fecha) {
            const orderTime = new Date(order.Fecha).getTime();
            const now = Date.now();
            const elapsedMins = (now - orderTime) / (1000 * 60);

            if (elapsedMins <= 40) {
                isBlocked = false;
            }
        }

        // Verificar extensión por actividad (30 min desde último pedido)
        // Si alguien pidió algo en los últimos 30 minutos, la mesa sigue accesible
        if (isBlocked && order.Ultima_Actividad) {
            const lastActivityTime = new Date(order.Ultima_Actividad).getTime();
            const now = Date.now();
            const elapsedSinceActivity = (now - lastActivityTime) / (1000 * 60);
            
            if (elapsedSinceActivity <= 30) {
                isBlocked = false;
            }
        }

        // Verificar desbloqueo manual de 5 minutos (existente)
        if (isBlocked && order.Fecha_Desbloqueo) {
            const unlockTime = new Date(order.Fecha_Desbloqueo).getTime();
            const now = Date.now();
            const elapsedSinceUnlock = (now - unlockTime) / (1000 * 60);
            if (elapsedSinceUnlock <= 5) {
                isBlocked = false;
            }
        }

        // Frictionless auto-join grace period
        if (!isOwner && !isGuest && !isBlocked) {
            newGuestToken = await generateGuestToken(mesa, order.Orden_Nu);
            isGuest = true;
        }

        // Return detailed status
        return NextResponse.json(
            { 
                isOccupied: true, 
                isOwner, 
                isGuest,
                guest_token: newGuestToken,
                orden_nu: (isOwner || isGuest) ? order.Orden_Nu : undefined,
                mesa
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
