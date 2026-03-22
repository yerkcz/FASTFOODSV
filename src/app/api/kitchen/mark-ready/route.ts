export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { refreshAppSheetCache } from '@/lib/appsheet';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { itemId } = body;

        if (!itemId) {
            return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
        }

        // Fetch current status
        const selectResult = await query(
            `SELECT "LISTO" FROM "PEDIDOS" WHERE "ID" = $1`,
            [itemId]
        );

        if (selectResult.rows.length === 0) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        const currentListo = selectResult.rows[0].LISTO;
        // If it's null or undefined, default to false, then invert it.
        // Wait, currentListo could be a string 'TRUE' / 'FALSE' if Appsheet synced it?
        // Let's handle string vs boolean just in case
        const isListo = currentListo === true || currentListo === 'TRUE' || currentListo === 'true';
        const newListo = !isListo;

        // Toggle the LISTO status for the item
        await query(
            `UPDATE "PEDIDOS" SET "LISTO" = $1 WHERE "ID" = $2`,
            [newListo, itemId]
        );

        // Notify AppSheet cache if needed
        refreshAppSheetCache().catch(console.error);

        return NextResponse.json({ success: true, listo: newListo });
    } catch (error) {
        console.error('Error in mark-ready endpoint:', error);
        return NextResponse.json(
            { error: 'Internal server error while toggling item ready status' },
            { status: 500 }
        );
    }
}
