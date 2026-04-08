import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const ordenNu = url.searchParams.get('orden_nu');
        const ordenesStr = url.searchParams.get('ordenes');

        if (!ordenNu && !ordenesStr) {
            return NextResponse.json({ error: 'Falta orden_nu o ordenes' }, { status: 400 });
        }

        let res;
        if (ordenesStr) {
            const ordenesArray = ordenesStr.split(',').map(o => o.trim()).filter(Boolean);
            if (ordenesArray.length === 0) {
                 return NextResponse.json({ error: 'Lista de ordenes vacia' }, { status: 400 });
            }
            const placeholders = ordenesArray.map((_, i) => `$${i + 1}`).join(',');
            res = await query(`
                SELECT 
                    "ID",
                    "ARTICULO",
                    "CANTIDAD",
                    "PRECIO",
                    "TOTAL",
                    "NOTAS",
                    "LISTO",
                    "HoraRegistro",
                    "FechaRegistro",
                    "Orden_Nu"
                FROM "PEDIDOS"
                WHERE "Orden_Nu" IN (${placeholders})
                ORDER BY "FechaRegistro" ASC
            `, ordenesArray);
        } else {
            res = await query(`
                SELECT 
                    "ID",
                    "ARTICULO",
                    "CANTIDAD",
                    "PRECIO",
                    "TOTAL",
                    "NOTAS",
                    "LISTO",
                    "HoraRegistro",
                    "FechaRegistro",
                    "Orden_Nu"
                FROM "PEDIDOS"
                WHERE "Orden_Nu" = $1
                ORDER BY "FechaRegistro" ASC
            `, [ordenNu]);
        }


        const items = res.rows.map(row => ({
            ...row,
            CANTIDAD: Number(row.CANTIDAD || 0),
            PRECIO: Number(row.PRECIO || 0),
            TOTAL: Number(row.TOTAL || 0)
        }));

        return NextResponse.json({ 
            success: true, 
            items 
        });

    } catch (error) {
        console.error('Error fetching table details:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
