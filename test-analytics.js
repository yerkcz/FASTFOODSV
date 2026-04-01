require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM "CLIENTES" WHERE "Estado" = \'Cerrada\'');
    console.log("Total closed orders in DB:", res.rows[0].count);
    
    const res2 = await pool.query('SELECT MAX("Fecha") FROM "CLIENTES"');
    console.log("Max date in DB:", res2.rows[0].max);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
