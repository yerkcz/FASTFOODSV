import { Pool } from "pg";

// Create a single connection pool
const pool = new Pool({
    connectionString: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
    // Basic pool settings
    max: 10,
    idleTimeoutMillis: 30000,
});

export async function query(text: string, params?: unknown[]) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // Optional: Add logging for slow queries in development
    // console.log("executed query", { text, duration, rows: res.rowCount });
    return res;
}

export async function getClient() {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;
    return { client, query, release };
}
