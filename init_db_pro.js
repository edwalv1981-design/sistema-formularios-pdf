const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- REPARACIÓN INTEGRAL DE ESQUEMA DE FORMULARIOS ---');
    try {
        // 1. Asegurar tabla de formularios con ESQUEMA REAL
        await db.query(`CREATE TABLE IF NOT EXISTS formularios (id SERIAL PRIMARY KEY, tipo TEXT)`);
        
        const formColumns = [
            'nombre_archivo TEXT',
            'ruta_archivo TEXT',
            'prefijo TEXT',
            'campos_configurados TEXT DEFAULT \'[]\'',
            'html_content TEXT',
            'is_deleted BOOLEAN DEFAULT FALSE',
            'fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ];

        for (const col of formColumns) {
            try {
                await db.query(`ALTER TABLE formularios ADD COLUMN ${col}`);
                console.log(`✓ Columna inyectada en formularios: ${col.split(' ')[0]}`);
            } catch (e) {
                // Ya existe
            }
        }

        // 2. Asegurar que los usuarios Master existan y estén activos
        const masters = [
            ['admin', 'Admin123!', 'Administrador Sistema'],
            ['edumaster', 'Master2026*', 'Eduardo Master']
        ];
        const salt = 10;
        for (const [ident, pass, name] of masters) {
            const hash = await bcrypt.hash(pass, salt);
            await db.query(`
                INSERT INTO usuarios 
                (nombres_completos, identificacion, password_hash, id_rol, rol, estado, aprobado, intentos_fallidos, bloqueado)
                VALUES ($1, $2, $3, 1, 'MASTER', 'ACTIVO', true, 0, false)
                ON CONFLICT (identificacion) 
                DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    rol = 'MASTER', id_rol = 1, estado = 'ACTIVO', aprobado = TRUE
            `, [name, ident, hash]);
        }

        console.log('--- ESQUEMA SINCRONIZADO AL 100% ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR CRÍTICO:', err);
        process.exit(1);
    }
}

initialize();
