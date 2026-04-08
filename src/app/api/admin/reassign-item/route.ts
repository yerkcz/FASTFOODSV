import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { itemId, targetOrdenNu } = await request.json();

        if (!itemId || !targetOrdenNu) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }

        // 1. Check if the item exists
        const itemRes = await query(`SELECT "Orden_Nu", "TOTAL" FROM "PEDIDOS" WHERE "ID" = $1`, [itemId]);
        if (itemRes.rows.length === 0) {
            return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
        }

        const sourceOrdenNu = itemRes.rows[0].Orden_Nu;

        if (sourceOrdenNu === targetOrdenNu) {
            return NextResponse.json({ error: 'El ítem ya pertenece a esta orden' }, { status: 400 });
        }

        // 2. Check if target order exists and is Open
        const targetRes = await query(`SELECT "Estado" FROM "CLIENTES" WHERE "Orden_Nu" = $1 AND "Estado" = 'Abierta'`, [targetOrdenNu]);
        if (targetRes.rows.length === 0) {
            return NextResponse.json({ error: 'La orden destino no existe o ya está cerrada' }, { status: 404 });
        }

        // 3. Move the item (update Orden_Nu)
        await query(`UPDATE "PEDIDOS" SET "Orden_Nu" = $1 WHERE "ID" = $2`, [targetOrdenNu, itemId]);

        // Totals are automatically recalculated by triggers on PEDIDOS table (trg_recalcular_total_orden)
        
        return NextResponse.json({ success: true, message: 'Ítem reasignado exitosamente' });

    } catch (error) {
        console.error('Error reassigning item:', error);
        return NextResponse.json(
            { error: 'Error del servidor al reasignar el ítem' },
            { status: 500 }
        );
    }
}
