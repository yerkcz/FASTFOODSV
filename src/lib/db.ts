import { Pool } from "pg";

/**
 * Pool de conexiones optimizado para Vercel Serverless + Neon DB.
 * 
 * - max: 5 — Serverless no necesita muchas conexiones concurrentes;
 *   Neon tiene un límite y cada instancia tiene su propio pool.
 * - idleTimeoutMillis: 20s — Libera conexiones idle más rápido en serverless.
 * - connectionTimeoutMillis: 5s — Fail-fast si Neon no responde.
 * 
 * NOTA: No usamos statement_timeout en connection string porque Neon no lo soporta.
 * Se puede configurar por-query si es necesario.
 */
const pool = new Pool({
    connectionString: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 5000,
});

/** Umbral en ms para loggear queries lentas */
const SLOW_QUERY_THRESHOLD_MS = 500;

export async function query(text: string, params?: unknown[]) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Loggear queries lentas (>500ms) — detecta problemas de rendimiento temprano
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
        console.warn(`[SLOW QUERY] ${duration}ms | rows: ${res.rowCount} | ${text.substring(0, 120)}`);
    }

    return res;
}

export async function getClient() {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;
    return { client, query, release };
}
