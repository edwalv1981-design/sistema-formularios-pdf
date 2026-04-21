const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- REPARACIÓN INTEGRAL DE BASE DE DATOS (FASE BITÁCORA) ---');
    try {
        // 1. REPARAR TABLA BITÁCORA (Falta columna de contexto)
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

        // Sincronización manual de columnas para Bitácora
        try {
            await db.query('ALTER TABLE bitacora ADD COLUMN id_empresa_contexto INTEGER');
        } catch (e) {
            // Ya existe, ignorar
        }
        console.log('✓ Tabla bitacora sincronizada.');

        // 2. ASEGURAR TABLA DOCUMENTO_EDICIONES (Nombres oficiales)
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
        console.log('✓ Tabla documento_ediciones verificada.');

        // 3. RE-ACTIVACIÓN DE USUARIOS MASTER
        const salt = 10;
        const hashAdmin = await bcrypt.hash('Admin123!', salt);
        const hashEdu = await bcrypt.hash('Master2026*', salt);

        await db.query(`
            INSERT INTO usuarios 
            (nombres_completos, identificacion, password_hash, id_rol, rol, estado, aprobado)
            VALUES ($1, $2, $3, 1, 'MASTER', 'ACTIVO', true)
            ON CONFLICT (identificacion) 
            DO UPDATE SET estado = 'ACTIVO', aprobado = TRUE, rol = 'MASTER', id_rol = 1
        `, ['Administrador Sistema', 'admin', hashAdmin]);

        await db.query(`
            INSERT INTO usuarios 
            (nombres_completos, identificacion, password_hash, id_rol, rol, estado, aprobado)
            VALUES ($1, $2, $3, 1, 'MASTER', 'ACTIVO', true)
            ON CONFLICT (identificacion) 
            DO UPDATE SET estado = 'ACTIVO', aprobado = TRUE, rol = 'MASTER', id_rol = 1
        `, ['Eduardo Master', 'edumaster', hashEdu]);

        console.log('✓ Usuarios Master garantizados.');
        console.log('--- REPARACIÓN COMPLETADA CON ÉXITO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ FALLO CRÍTICO:', err);
        process.exit(1);
    }
}

initialize();
