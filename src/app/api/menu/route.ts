import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkRateLimit, validateApiKey } from '@/lib/security';

export async function GET(request: Request) {
    try {
        // 1. Security Check: API Key
        const apiKey = request.headers.get('x-api-key');
        if (!validateApiKey(apiKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Security Check: Rate Limiting (30 requests per minute for menu read)
        // Basic IP extraction (Note: in production behind load balancers, use x-forwarded-for)
        const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
        const rateLimit = checkRateLimit(`menu_${ip}`, 30);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }

        // 3. Fetch menu from Neon DB
        const res = await query('SELECT "ARTICULO" as name, "PRECIO" as price, "CATEGORIA" as category FROM "MENU" ORDER BY "CATEGORIA", "ARTICULO"');

        // Map to the expected format and filter out price <= 0 items
        const products = res.rows
            .map((row, i) => ({
                id: `DB_${i}`, // Generate a temporary ID for frontend use
                name: row.name,
                price: Number(row.price),
                category: row.category || 'Otros'
            }))
            .filter((p) => p.price > 1);

        return NextResponse.json(
            { products },
            {
                status: 200,
                headers: {
                    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                    // Basic CORS to only allow our own frontend to call this
                    'Access-Control-Allow-Origin': '*' // In a real production app, restrict this
                }
            }
        );

    } catch (error) {
        console.error('Error fetching menu:', error);
        return NextResponse.json(
            { error: 'Internal server error while fetching menu' },
            { status: 500 }
        );
    }
}
