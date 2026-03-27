import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { timingSafeCompare } from '@/lib/security';

export async function POST(request: Request) {
    try {
        const apiKey = request.headers.get('x-api-key');
        if (apiKey !== process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY) {
             return NextResponse.json({ error: 'Unauthorized API Key' }, { status: 401 });
        }

        const body = await request.json();
        const { mesa, session_token } = body;

        if (!mesa || !session_token) return NextResponse.json({ error: 'Mesa y session_token requeridos' }, { status: 400 });

        const res = await query(
             `SELECT "session_token" FROM "CLIENTES" WHERE "Mesa" = $1 AND "Estado" = 'Abierta' ORDER BY "Fecha" ASC LIMIT 1`,
             [mesa]
        );

        if (res.rows.length === 0) return NextResponse.json({ error: 'No order' }, { status: 404 });

        if (!timingSafeCompare(session_token, res.rows[0].session_token || '')) {
             return NextResponse.json({ error: 'No es el dueño de la mesa' }, { status: 403 });
        }

        await query(
            `UPDATE "CLIENTES" SET "Fecha_Desbloqueo" = NOW() WHERE "Mesa" = $1 AND "Estado" = 'Abierta'`,
            [mesa]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
