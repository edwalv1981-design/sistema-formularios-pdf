const { Pool } = require('pg');
require('dotenv').config();

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : new Pool({ user: 'postgres', host: 'localhost', database: 'sistema_formularios', password: 'postgres123', port: 5432 });

async function check() {
    try {
        const res = await pool.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'usuarios'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
check();
