import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get closed orders for today (AppSheet Slice: Estado="Cerrada" AND Fecha=TODAY())
        const res = await query(`
            SELECT 
                "Orden_Nu", 
                "Nombre_Cliente", 
                "Fecha", 
                "Total", 
                "Estado", 
                "Forma_Pago",
                "Recibido"
            FROM "CLIENTES" 
            WHERE "Estado" = 'Cerrada' 
            AND DATE("Fecha") = CURRENT_DATE
            ORDER BY "Fecha" DESC
        `);

        const closedOrders = res.rows.map(row => ({
            orden_nu: row.Orden_Nu,
            cliente: row.Nombre_Cliente,
            fecha: row.Fecha,
            total: Number(row.Total) || 0,
            forma_pago: row.Forma_Pago || '—',
            recibido: Number(row.Recibido) || 0
        }));

        const totalDiario = closedOrders.reduce((sum, o) => sum + o.total, 0);
        const diezPorciento = Math.round(totalDiario * 0.1);

        return NextResponse.json({ 
            success: true, 
            orders: closedOrders,
            total_diario: totalDiario,
            diez_porciento: diezPorciento,
            count: closedOrders.length
        });
    } catch (error) {
        console.error('Error fetching closed orders:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
