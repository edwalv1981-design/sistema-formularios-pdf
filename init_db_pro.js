const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- REPARACIÓN DE TABLA DE EDICIONES (DOCUMENTO_EDICIONES) ---');
    try {
        // 1. RE-ESTRUCTURACIÓN DE DOCUMENTO_EDICIONES (NOMBRE OFICIAL)
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

        // Sincronización de columnas manual (Seguridad extra)
        const expectedColumns = [
            ['user_id', 'INTEGER'],
            ['plantilla_id', 'INTEGER'],
            ['nombre_archivo_original', 'TEXT'],
            ['datos_json', 'JSONB'],
            ['estado_firma', 'TEXT'],
            ['ruta_archivo_firmado', 'TEXT'],
            ['fecha_creacion', 'TIMESTAMP']
        ];

        for (const [col, type] of expectedColumns) {
            try {
                await db.query(`ALTER TABLE documento_ediciones ADD COLUMN ${col} ${type}`);
            } catch (e) {}
        }
        console.log('✓ Tabla documento_ediciones sincronizada.');

        // 2. Garantizar que todos los usuarios Master estén activos
        const salt = 10;
        const masters = [
            ['admin', 'Admin123!', 'Administrador Sistema'],
            ['edumaster', 'Master2026*', 'Eduardo Master']
        ];
        for (const [ident, pass, name] of masters) {
            const hash = await bcrypt.hash(pass, salt);
            await db.query(`
                INSERT INTO usuarios 
                (nombres_completos, identificacion, password_hash, id_rol, rol, estado, aprobado)
                VALUES ($1, $2, $3, 1, 'MASTER', 'ACTIVO', true)
                ON CONFLICT (identificacion) 
                DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    rol = 'MASTER', id_rol = 1, estado = 'ACTIVO', aprobado = TRUE
            `, [name, ident, hash]);
        }
        
        console.log('✓ Usuarios Master verificados.');
        console.log('--- RESCATE DE EDICIONES COMPLETADO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ FALLO TÉCNICO:', err);
        process.exit(1);
    }
}

initialize();
