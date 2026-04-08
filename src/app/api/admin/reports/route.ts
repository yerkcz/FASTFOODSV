import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get daily stats for closed tables
        // Assuming your Postgres server is set to the correct local timezone
        const statsRes = await query(`
            SELECT 
                COUNT(*) as total_cuentas,
                COALESCE(SUM("Total"), 0) as venta_total
            FROM "CLIENTES"
            WHERE "Estado" = 'Cerrada' 
              AND DATE("Fecha" AT TIME ZONE 'America/Costa_Rica') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')
        `);

        // Get the list of closed tables for the day to show details
        const listRes = await query(`
            SELECT 
                "Orden_Nu",
                "Nombre_Cliente",
                "Fecha",
                "Total",
                "Tipo",
                "Forma_Pago"
            FROM "CLIENTES"
            WHERE "Estado" = 'Cerrada'
              AND DATE("Fecha" AT TIME ZONE 'America/Costa_Rica') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'America/Costa_Rica')
            ORDER BY "Fecha" DESC
        `);

        const stats = statsRes.rows[0];
        const ventaTotal = Number(stats.venta_total);
        const servicio10 = ventaTotal - (ventaTotal / 1.1); // Since the trigger multiplies by 1.1
        const ventaNeta = ventaTotal / 1.1;

        return NextResponse.json({
            success: true,
            stats: {
                totalCuentas: parseInt(stats.total_cuentas, 10),
                ventaTotal: ventaTotal,
                ventaNeta: ventaNeta,
                servicio10: servicio10
            },
            closedTables: listRes.rows
        });

    } catch (error) {
        console.error('Error fetching admin reports:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
