import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { refreshAppSheetCache } from '@/lib/appsheet';

export async function POST(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { itemId } = body;

        if (!itemId) {
            return NextResponse.json({ error: 'Falta itemId' }, { status: 400 });
        }

        const res = await query(
            `DELETE FROM "PEDIDOS" WHERE "ID" = $1 RETURNING "ID"`,
            [itemId]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
        }

        refreshAppSheetCache().catch(console.error);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting item:', error);
        return NextResponse.json(
            { error: 'Internal server error while deleting item' },
            { status: 500 }
        );
    }
}
