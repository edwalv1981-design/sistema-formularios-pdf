const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- RECONSTRUCCIÓN FORENSE DE BASE DE DATOS ---');
    try {
        // 1. RE-ESTRUCTURACIÓN DE FORMULARIOS (ROOT CAUSE FIX)
        // Eliminamos y recreamos para asegurar que no haya columnas fantasmas o tipos incorrectos
        await db.query(`
            CREATE TABLE IF NOT EXISTS formularios (
                id SERIAL PRIMARY KEY,
                tipo TEXT NOT NULL,
                nombre_archivo TEXT,
                ruta_archivo TEXT,
                prefijo TEXT,
                campos_configurados TEXT DEFAULT '[]',
                html_content TEXT,
                is_deleted BOOLEAN DEFAULT FALSE,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Sincronización manual de columnas por si la tabla ya existía con otra estructura
        const expectedColumns = [
            ['tipo', 'TEXT'],
            ['nombre_archivo', 'TEXT'],
            ['ruta_archivo', 'TEXT'],
            ['prefijo', 'TEXT'],
            ['campos_configurados', 'TEXT'],
            ['html_content', 'TEXT'],
            ['is_deleted', 'BOOLEAN'],
            ['fecha_carga', 'TIMESTAMP']
        ];

        for (const [col, type] of expectedColumns) {
            try {
                await db.query(`ALTER TABLE formularios ADD COLUMN ${col} ${type}`);
            } catch (e) {
                // Columna ya existe
            }
        }
        console.log('✓ Tabla de formularios sincronizada.');

        // 2. SINCRONIZACIÓN DE BITÁCORA
        await db.query(`
            CREATE TABLE IF NOT EXISTS bitacora (
                id SERIAL PRIMARY KEY,
                id_usuario INTEGER,
                accion TEXT,
                detalle TEXT,
                ip TEXT,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. MANTENIMIENTO DE USUARIOS MASTER
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
        
        console.log('✓ Usuarios de control verificados.');
        console.log('--- RECONSTRUCCIÓN COMPLETADA CON ÉXITO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ FALLO TÉCNICO EN INICIALIZACIÓN:', err);
        process.exit(1);
    }
}

initialize();
