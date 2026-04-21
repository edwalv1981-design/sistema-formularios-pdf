const db = require('./db');

async function migrate() {
    try {
        console.log('--- MIGRACIÓN DE EDICIONES ---');
        await db.query(`
            CREATE TABLE IF NOT EXISTS documento_ediciones (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                plantilla_id INTEGER,
                nombre_archivo_original TEXT,
                datos_json TEXT,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabla documento_ediciones creada o ya existente.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error en migración:', err);
        process.exit(1);
    }
}

migrate();
