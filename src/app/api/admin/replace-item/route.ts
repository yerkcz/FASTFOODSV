import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { refreshAppSheetCache } from '@/lib/appsheet';

export async function POST(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { itemId, newArticulo, cantidad, nota } = body;

        if (!itemId || !newArticulo) {
            return NextResponse.json({ error: 'Faltan parámetros: itemId y newArticulo requeridos' }, { status: 400 });
        }

        // 1. Verify item exists and get current quantity
        const itemRes = await query(
            `SELECT "ID", "Orden_Nu", "CANTIDAD" FROM "PEDIDOS" WHERE "ID" = $1`,
            [itemId]
        );

        if (itemRes.rows.length === 0) {
            return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
        }

        const currentItem = itemRes.rows[0];
        const finalCantidad = cantidad && cantidad > 0 ? cantidad : currentItem.CANTIDAD;

        // 2. Verify the order is still open
        const orderRes = await query(
            `SELECT "Estado" FROM "CLIENTES" WHERE "Orden_Nu" = $1`,
            [currentItem.Orden_Nu]
        );

        if (orderRes.rows.length === 0 || orderRes.rows[0].Estado !== 'Abierta') {
            return NextResponse.json({ error: 'La orden ya está cerrada' }, { status: 400 });
        }

        // 3. Get the new article's price from MENU
        const menuRes = await query(
            `SELECT "ARTICULO", "PRECIO" FROM "MENU" WHERE "ARTICULO" = $1`,
            [newArticulo]
        );

        if (menuRes.rows.length === 0) {
            return NextResponse.json({ error: `Artículo no encontrado en el menú: ${newArticulo}` }, { status: 404 });
        }

        const newPrice = Number(menuRes.rows[0].PRECIO);
        const newTotal = newPrice * finalCantidad;

        // 4. Update the item in place (preserves ID, Orden_Nu, HoraRegistro)
        await query(
            `UPDATE "PEDIDOS" 
             SET "ARTICULO" = $1, "PRECIO" = $2, "TOTAL" = $3, "CANTIDAD" = $4, "NOTAS" = $5, "LISTO" = false 
             WHERE "ID" = $6`,
            [newArticulo, newPrice, newTotal, finalCantidad, nota || null, itemId]
        );

        // 5. Sync AppSheet
        refreshAppSheetCache().catch(console.error);

        return NextResponse.json({
            success: true,
            message: 'Artículo reemplazado exitosamente',
            replaced: {
                itemId,
                newArticulo,
                newPrice,
                newTotal,
                cantidad: finalCantidad,
                nota: nota || null
            }
        });

    } catch (error) {
        console.error('Error replacing item:', error);
        return NextResponse.json(
            { error: 'Error interno al reemplazar el artículo' },
            { status: 500 }
        );
    }
}
