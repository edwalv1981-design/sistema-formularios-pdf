const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function repairSchema() {
    try {
        console.log("Iniciando reparación de esquema...");
        
        // Corregir documentos_personales
        await pool.query(`ALTER TABLE documentos_personales ADD COLUMN IF NOT EXISTS estado_vigencia VARCHAR(30) DEFAULT 'NO DETECTADO'`);
        
        // Corregir formularios_firmados
        await pool.query(`ALTER TABLE formularios_firmados ADD COLUMN IF NOT EXISTS validador_metadata JSONB`);
        
        console.log("Esquema reparado con éxito localmente.");
        process.exit(0);
    } catch (err) {
        console.error("Error en reparación:", err);
        process.exit(1);
    }
}

repairSchema();
