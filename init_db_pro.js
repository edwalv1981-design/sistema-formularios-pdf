const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- ACTIVACIÓN MASIVA Y MANTENIMIENTO DE USUARIOS ---');
    try {
        // 1. Asegurar consistencia de roles técnicos
        await db.query(`INSERT INTO roles (id, nombre) VALUES (1, 'MASTER'), (2, 'EMPRESA'), (3, 'ADICIONAL') ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`);
        
        // 2. ACTIVACIÓN MASIVA: Todos los usuarios a ACTIVO y APROBADO
        await db.query(`
            UPDATE usuarios 
            SET estado = 'ACTIVO', 
                aprobado = TRUE, 
                intentos_fallidos = 0, 
                bloqueado = FALSE
            WHERE is_deleted = FALSE OR is_deleted IS NULL
        `);
        console.log('✓ Todos los usuarios han sido marcados como ACTIVO y APROBADOS.');

        // 3. Garantizar accesos Master actualizados
        const salt = 10;
        const masters = [
            ['admin', 'Admin123!', 'Administrador Sistema'],
            ['edumaster', 'Master2026*', 'Eduardo Master']
        ];

        for (const [ident, pass, name] of masters) {
            const hash = await bcrypt.hash(pass, salt);
            await db.query(`
                INSERT INTO usuarios 
                (nombres_completos, identificacion, password_hash, id_rol, rol, estado, aprobado, intentos_fallidos, bloqueado)
                VALUES ($1, $2, $3, 1, 'MASTER', 'ACTIVO', true, 0, false)
                ON CONFLICT (identificacion) 
                DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    rol = 'MASTER',
                    id_rol = 1,
                    estado = 'ACTIVO',
                    aprobado = TRUE
            `, [name, ident, hash]);
        }

        console.log('✓ Credenciales Master sincronizadas.');
        console.log('--- PROCESO COMPLETADO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR CRÍTICO:', err);
        process.exit(1);
    }
}

initialize();
