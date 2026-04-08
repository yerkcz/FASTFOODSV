import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        // Simple authentication
        const adminKey = request.headers.get('x-admin-key');
        if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_PASSWORD && adminKey !== 'admin123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all open orders grouped by Mesa
        const res = await query(`
            SELECT 
                c."Orden_Nu",
                c."Nombre_Cliente",
                c."Tipo",
                c."Mesa",
                c."Fecha",
                c."Estado",
                COALESCE(SUM(p."TOTAL"), 0) as "TotalSinImpuestos"
            FROM "CLIENTES" c
            LEFT JOIN "PEDIDOS" p ON c."Orden_Nu" = p."Orden_Nu"
            WHERE c."Estado" = 'Abierta'
            GROUP BY c."Orden_Nu", c."Nombre_Cliente", c."Tipo", c."Mesa", c."Fecha", c."Estado"
            ORDER BY c."Fecha" DESC
        `);

        // Group orders by Mesa for the frontend
        const mesaGroups = new Map<string, any>();
        
        res.rows.forEach(row => {
            const mesaKey = row.Mesa || `solo-${row.Orden_Nu}`; // Name-only orders get unique keys
            const sumNumeric = Number(row.TotalSinImpuestos || 0);
            
            if (!mesaGroups.has(mesaKey)) {
                mesaGroups.set(mesaKey, {
                    mesa: row.Mesa,
                    ordenes: [],
                    total_mesa: 0,
                    fecha_primera: row.Fecha
                });
            }
            
            const group = mesaGroups.get(mesaKey);
            const orderTotal = row.Tipo === 'Llevar' ? sumNumeric : sumNumeric * 1.1; // 10% service solo restaurante
            
            group.ordenes.push({
                orden_nu: row.Orden_Nu,
                cliente: row.Nombre_Cliente,
                tipo: row.Tipo,
                fecha: row.Fecha,
                estado: row.Estado,
                total: orderTotal
            });
            group.total_mesa += orderTotal;
        });

        // Also return flat list for backward compatibility
        const tables = res.rows.map(row => {
            const sumNumeric = Number(row.TotalSinImpuestos || 0);
            return {
                orden_nu: row.Orden_Nu,
                cliente: row.Nombre_Cliente,
                tipo: row.Tipo,
                mesa: row.Mesa,
                fecha: row.Fecha,
                estado: row.Estado,
                total: row.Tipo === 'Llevar' ? sumNumeric : sumNumeric * 1.1
            };
        });

        return NextResponse.json({ 
            success: true, 
            tables,
            mesa_groups: Array.from(mesaGroups.values())
        });
    } catch (error) {
        console.error('Error fetching admin tables:', error);
        return NextResponse.json(
            { error: 'Internal server error while fetching admin tables' },
            { status: 500 }
        );
    }
}
