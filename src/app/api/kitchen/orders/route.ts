import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Obtenemos los pedidos pendientes (LISTO = false o sin despachar todos)
        // Agrupados por Orden_Nu
        
        const res = await query(`
            SELECT 
                p."ID",
                p."Orden_Nu",
                p."ARTICULO",
                p."CANTIDAD",
                p."NOTAS",
                p."LISTO",
                p."HoraRegistro",
                c."Nombre_Cliente",
                c."Mesa",
                c."Fecha" as "HoraApertura",
                m."CATEGORIA"
            FROM "PEDIDOS" p
            JOIN "CLIENTES" c ON p."Orden_Nu" = c."Orden_Nu"
            LEFT JOIN "MENU" m ON p."ARTICULO" = m."ARTICULO"
            WHERE c."Estado" = 'Abierta'
            ORDER BY c."Fecha" ASC, p."HoraRegistro" ASC
        `);

        // Agrupar por Cliente/Orden
        const ordersMap = new Map();

        res.rows.forEach(row => {
            if (!ordersMap.has(row.Orden_Nu)) {
                ordersMap.set(row.Orden_Nu, {
                    orden_nu: row.Orden_Nu,
                    cliente: row.Nombre_Cliente,
                    hora_apertura: row.HoraApertura,
                    items: []
                });
            }
            ordersMap.get(row.Orden_Nu).items.push({
                id: row.ID,
                articulo: row.ARTICULO,
                cantidad: row.CANTIDAD,
                notas: row.NOTAS,
                listo: row.LISTO,
                hora_registro: row.HoraRegistro,
                categoria: row.CATEGORIA || 'Cocina',
                mesa: row.Mesa || row.Nombre_Cliente || ''
            });
        });

        const orders = Array.from(ordersMap.values()).filter(order => order.items.some((item: any) => !item.listo));

        return NextResponse.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching kitchen orders:', error);
        return NextResponse.json(
            { error: 'Internal server error while fetching kitchen orders' },
            { status: 500 }
        );
    }
}
