// Run: node migrations/run_v2.mjs
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
});

const pool = new pg.Pool({ connectionString: process.env.NEXT_PUBLIC_SUPABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration v2...');
        
        // 1. Add Mesa column
        await client.query(`ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS "Mesa" TEXT`);
        console.log('✅ Column "Mesa" added (or already exists)');

        // 2. Populate Mesa from Nombre_Cliente
        const pop = await client.query(`
            UPDATE "CLIENTES" 
            SET "Mesa" = CASE
                WHEN "Nombre_Cliente" LIKE 'Mesa % - %' 
                    THEN TRIM(SUBSTRING("Nombre_Cliente" FROM 'Mesa\\s+(.+?)\\s*-'))
                WHEN "Nombre_Cliente" LIKE 'Mesa %' 
                    THEN TRIM(SUBSTRING("Nombre_Cliente" FROM 'Mesa\\s+(.+)$'))
                ELSE NULL
            END
            WHERE "Mesa" IS NULL
        `);
        console.log(`✅ Populated Mesa for ${pop.rowCount} rows`);

        // 3. Clean up Nombre_Cliente
        const clean = await client.query(`
            UPDATE "CLIENTES"
            SET "Nombre_Cliente" = TRIM(SUBSTRING("Nombre_Cliente" FROM '- (.+)$'))
            WHERE "Nombre_Cliente" LIKE '% - %' AND "Mesa" IS NOT NULL
        `);
        console.log(`✅ Cleaned Nombre_Cliente for ${clean.rowCount} rows`);

        // 4. Verify
        const check = await client.query(`SELECT "Orden_Nu", "Mesa", "Nombre_Cliente", "Estado" FROM "CLIENTES" ORDER BY "Fecha" DESC LIMIT 10`);
        console.log('\n📋 Sample data:');
        check.rows.forEach(r => console.log(`  ${r.Orden_Nu} | Mesa: ${r.Mesa || '(null)'} | Cliente: ${r.Nombre_Cliente} | ${r.Estado}`));

        console.log('\n🎉 Migration v2 complete!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
