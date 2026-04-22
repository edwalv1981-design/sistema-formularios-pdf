const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function dropUselessModules() {
    try {
        console.log("Iniciando purga de módulos obsoletos (Pool Local)...");
        await pool.query('DROP TABLE IF EXISTS documentos_personales CASCADE');
        console.log("Tabla documentos_personales eliminada.");
        await pool.query('DROP TABLE IF EXISTS formularios_firmados CASCADE');
        console.log("Tabla formularios_firmados eliminada.");
        process.exit(0);
    } catch (err) {
        console.error("Error en la purga:", err);
        process.exit(1);
    }
}

dropUselessModules();
