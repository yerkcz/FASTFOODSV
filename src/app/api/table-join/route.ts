import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkRateLimit, validateApiKey, timingSafeCompare, validatePinFormat, generateGuestToken } from '@/lib/security';

// Separate rate limiter for PIN attempts (5 attempts per IP+Mesa in 5 minutes)
const pinAttemptLimits = new Map<string, { attempts: number; resetTime: number }>();

function checkPinAttemptLimit(ip: string, mesa: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const key = `${ip}:${mesa}`;
    const record = pinAttemptLimits.get(key) || { attempts: 0, resetTime: now + 5 * 60 * 1000 };

    if (now > record.resetTime) {
        record.attempts = 0;
        record.resetTime = now + 5 * 60 * 1000;
    }

    record.attempts += 1;
    pinAttemptLimits.set(key, record);

    return {
        allowed: record.attempts <= 5,
        remaining: Math.max(0, 5 - record.attempts),
    };
}

export async function POST(request: Request) {
    try {
        // 1. Security Check: API Key
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Security Check: PIN Attempt Rate Limiting (stricter than normal)
        const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
        const body = await request.json();
        const mesa = typeof body.mesa === 'string' ? body.mesa : '';

        const pinLimit = checkPinAttemptLimit(ip, mesa);

        if (!pinLimit.allowed) {
            return NextResponse.json(
                { 
                    error: 'Demasiados intentos. Por favor solicita asistencia a un mesero.',
                    retry_after: 300
                },
                { status: 429, headers: { 'Retry-After': '300' } }
            );
        }

        // 3. Validate request body
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const { mesa: mesaInput, pin } = body;

        if (!mesaInput || typeof mesaInput !== 'string' || mesaInput.length > 50) {
            return NextResponse.json({ error: 'Invalid or missing "mesa"' }, { status: 400 });
        }

        if (!pin || typeof pin !== 'string') {
            return NextResponse.json({ error: 'Invalid or missing "pin"' }, { status: 400 });
        }

        // 4. Validate PIN format (must be exactly 4 digits)
        if (!validatePinFormat(pin)) {
            return NextResponse.json(
                { error: 'El PIN debe ser de 4 dígitos numéricos', attempts_remaining: pinLimit.remaining },
                { status: 400 }
            );
        }

        // 5. Find open order for this table
        const res = await query(
            `SELECT "Orden_Nu", "table_pin" 
             FROM "CLIENTES" 
             WHERE ("Nombre_Cliente" = $1 OR "Nombre_Cliente" LIKE $2) 
             AND "Estado" = 'Abierta'
             LIMIT 1`,
            [mesaInput, `${mesaInput} - %`]
        );

        if (res.rows.length === 0) {
            return NextResponse.json(
                { error: 'No hay una orden activa para esta mesa' },
                { status: 404 }
            );
        }

        const order = res.rows[0];

        // 6. Verify PIN (timing-safe comparison)
        if (!order.table_pin || !timingSafeCompare(pin, order.table_pin)) {
            return NextResponse.json(
                { 
                    error: 'PIN incorrecto',
                    attempts_remaining: pinLimit.remaining - 1
                },
                { status: 401 }
            );
        }

        // 7. PIN is correct — generate guest token
        const guestToken = await generateGuestToken(pin, mesaInput, order.Orden_Nu);

        return NextResponse.json({
            success: true,
            guest_token: guestToken,
            orden_nu: order.Orden_Nu,
            mesa: mesaInput
        });

    } catch (error) {
        console.error('Error in table-join:', error);
        return NextResponse.json(
            { error: 'Internal server error while joining table' },
            { status: 500 }
        );
    }
}
