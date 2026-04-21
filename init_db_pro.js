const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- BLINDAJE DE PERSISTENCIA TOTAL (BASE64 BACKUP) ---');
    try {
        // 1. ACTUALIZAR TABLA FORMULARIOS PARA PERSISTENCIA BINARIA
        try {
            await db.query('ALTER TABLE formularios ADD COLUMN archivo_base64 TEXT');
            console.log('✓ Columna archivo_base64 añadida a formularios.');
        } catch (e) {
            // Ya existe
        }

        // 2. SINCRONIZACIÓN DE RESTO DE TABLAS
        await db.query(`
            CREATE TABLE IF NOT EXISTS documento_ediciones (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                plantilla_id INTEGER,
                nombre_archivo_original TEXT,
                datos_json JSONB DEFAULT '{}',
                estado_firma TEXT DEFAULT 'PENDIENTE',
                ruta_archivo_firmado TEXT,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS bitacora (
                id SERIAL PRIMARY KEY,
                id_usuario INTEGER,
                id_empresa_contexto INTEGER,
                accion TEXT,
                detalle TEXT,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. ASEGURAR COLUMNAS DE EDICIONES
        try { await db.query('ALTER TABLE documento_ediciones ADD COLUMN estado_firma TEXT'); } catch(e){}
        try { await db.query('ALTER TABLE documento_ediciones ADD COLUMN ruta_archivo_firmado TEXT'); } catch(e){}

        console.log('--- BLINDAJE COMPLETADO: EL SISTEMA AHORA ES RESILIENTE A REINICIOS ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR EN BLINDAJE:', err);
        process.exit(1);
    }
}

initialize();
