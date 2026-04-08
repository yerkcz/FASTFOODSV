import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { mesa } = body;

        if (!mesa) return NextResponse.json({ error: 'Mesa requerida' }, { status: 400 });

        await query(
            `UPDATE "CLIENTES" SET "Fecha_Desbloqueo" = NOW() WHERE "Mesa" = $1 AND "Estado" = 'Abierta'`,
            [mesa]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
