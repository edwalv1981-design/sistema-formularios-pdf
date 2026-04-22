const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function setupTables() {
    try {
        console.log("Recreando tablas desde cero...");
        
        // Tabla de Documentos Personales
        await pool.query(`
            CREATE TABLE IF NOT EXISTS documentos_personales (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo VARCHAR(50) NOT NULL,
                nombre_archivo TEXT NOT NULL,
                ruta_archivo TEXT NOT NULL,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_expiracion DATE,
                archivo_base64 TEXT -- Respaldo inmutable
            )
        `);

        // Tabla de Formularios Firmados
        await pool.query(`
            CREATE TABLE IF NOT EXISTS formularios_firmados (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                nombre_archivo TEXT NOT NULL,
                ruta_archivo TEXT NOT NULL,
                is_valid BOOLEAN DEFAULT FALSE,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                validador_metadata JSONB, -- Detalles técnicos de la firma
                archivo_base64 TEXT
            )
        `);

        console.log("Tablas creadas con éxito.");
        process.exit(0);
    } catch (err) {
        console.error("Error al crear tablas:", err);
        process.exit(1);
    }
}

setupTables();
