const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- REPARANDO FORMATO DE ROLES (COMPATIBILIDAD JS) ---');
    try {
        // 1. Asegurar tablas base
        await db.query(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE)`);
        await db.query(`INSERT INTO roles (id, nombre) VALUES (1, 'MASTER'), (2, 'EMPRESA'), (3, 'ADICIONAL') ON CONFLICT DO NOTHING`);
        
        // 2. Asegurar que la columna 'rol' en usuarios sea TEXT para compatibilidad con app.js
        // Si tu tabla usa id_rol (entero), necesitamos que la lógica de login devuelva el nombre del rol.
        // Pero para ir a lo seguro y rápido, forzaremos que el usuario admin tenga el rol esperado.
        
        const passwordHash = await bcrypt.hash('Admin123!', 10);
        
        // Intentamos insertar/actualizar al admin con el rol Master
        // Nota: Si tu sistema usa una columna 'rol' tipo TEXT en lugar de id_rol, este comando lo arregla.
        try {
            await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT`);
        } catch(e) {}

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
        `, ['Administrador Sistema', 'admin', passwordHash, 1, 'MASTER', 'ACTIVO', true]);

        console.log('✓ Roles sincronizados: 1 = MASTER.');
        console.log('--- SISTEMA LISTO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR:', err);
        process.exit(1);
    }
}

initialize();
