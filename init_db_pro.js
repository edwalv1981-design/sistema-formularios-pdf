const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- ACTUALIZACIÓN DE SEGURIDAD Y NUEVOS USUARIOS ---');
    try {
        // 1. Asegurar roles en mayúsculas (Formato Estándar)
        await db.query(`INSERT INTO roles (id, nombre) VALUES (1, 'MASTER'), (2, 'EMPRESA'), (3, 'ADICIONAL') ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`);
        
        const salt = 10;

        // 2. RE-ACTIVAR ADMIN ORIGINAL
        const adminPass = await bcrypt.hash('Admin123!', salt);
        await db.query(`
            UPDATE usuarios SET 
                id_rol = 1, rol = 'MASTER', 
                estado = 'ACTIVO', aprobado = TRUE, 
                password_hash = $1 
            WHERE identificacion = 'admin'
        `, [adminPass]);

        // 3. CREAR NUEVO MASTER: edumaster
        const eduPass = await bcrypt.hash('Master2026*', salt);
        await db.query(`
            INSERT INTO usuarios 
            (nombres_completos, identificacion, password_hash, id_rol, rol, estado, aprobado, intentos_fallidos, bloqueado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 0, false)
            ON CONFLICT (identificacion) 
            DO UPDATE SET 
                rol = EXCLUDED.rol,
                id_rol = EXCLUDED.id_rol,
                password_hash = EXCLUDED.password_hash,
                estado = 'ACTIVO',
                aprobado = TRUE
        `, ['Eduardo Master', 'edumaster', eduPass, 1, 'MASTER', 'ACTIVO', true]);

        console.log('✓ Usuario admin actualizado.');
        console.log('✓ Usuario edumaster creado con éxito.');
        console.log('--- OPERACIÓN COMPLETADA ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR:', err);
        process.exit(1);
    }
}

initialize();
