const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- SINCRONIZACIÓN MAESTRA DE ESQUEMAS (TOTAL SYSTEM SYNC) ---');
    try {
        // 1. TABLA: DOCUMENTOS PERSONALES
        await db.query(`
            CREATE TABLE IF NOT EXISTS documentos_personales (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                tipo TEXT,
                nombre_archivo TEXT,
                ruta_archivo TEXT,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                estado_vigencia TEXT DEFAULT 'NO DETECTADO',
                fecha_expiracion DATE
            )
        `);

        // 2. TABLA: FORMULARIOS FIRMADOS
        await db.query(`
            CREATE TABLE IF NOT EXISTS formularios_firmados (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                nombre_archivo TEXT,
                ruta_archivo TEXT,
                is_valid BOOLEAN DEFAULT FALSE,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. TABLA: DOCUMENTO_EDICIONES (Estructura oficial para Editor Maestro)
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

        // 4. TABLA: BITÁCORA (Historial inmutable)
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

        // 5. REPARACIÓN DE COLUMNAS (Mantenimiento Proactivo)
        const fixColumns = [
            ['bitacora', 'id_empresa_contexto', 'INTEGER'],
            ['documento_ediciones', 'estado_firma', 'TEXT'],
            ['documento_ediciones', 'ruta_archivo_firmado', 'TEXT']
        ];

        for (const [table, col, type] of fixColumns) {
            try {
                await db.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
                console.log(`✓ Columna añadida: ${table}.${col}`);
            } catch (e) {
                // Ya existe, todo bien
            }
        }

        // 6. GARANTIZAR ACCESO MASTER
        const salt = 10;
        const pass = await bcrypt.hash('Master2026*', salt);
        await db.query(`
            UPDATE usuarios SET 
                estado = 'ACTIVO', 
                aprobado = TRUE,
                password_hash = $1
            WHERE identificacion = 'edumaster'
        `, [pass]);

        console.log('--- SINCRONIZACIÓN COMPLETADA: SISTEMA OPERATIVO AL 100% ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ FALLO EN SINCRONIZACIÓN:', err);
        process.exit(1);
    }
}

initialize();
