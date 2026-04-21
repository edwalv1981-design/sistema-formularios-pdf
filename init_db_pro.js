const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- REFUERZO DE SEGURIDAD Y ESTADOS ---');
    try {
        // 1. COLUMNA PARA CONTROL DE SESIÓN ÚNICA
        try {
            await db.query('ALTER TABLE usuarios ADD COLUMN token_sesion_activa TEXT');
            console.log('✓ Control de sesión única habilitado.');
        } catch (e) {}

        // 2. SINCRONIZACIÓN DE ESQUEMAS PREVIOS
        await db.query(`
            CREATE TABLE IF NOT EXISTS formularios (
                id SERIAL PRIMARY KEY,
                tipo TEXT,
                prefijo TEXT,
                nombre_archivo TEXT,
                ruta_archivo TEXT,
                archivo_base64 TEXT,
                is_deleted BOOLEAN DEFAULT FALSE,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        try { await db.query('ALTER TABLE formularios ADD COLUMN archivo_base64 TEXT'); } catch(e){}

        // 3. ASEGURAR QUE LOS ADMINS EXISTENTES ESTÉN ACTIVOS
        await db.query(`
            UPDATE usuarios 
            SET estado = 'ACTIVO', aprobado = true 
            WHERE rol IN ('MASTER', 'EMPRESA')
        `);
        console.log('✓ Administradores y Empresas activados masivamente.');

        // 4. GARANTIZAR USUARIOS MAESTROS (edumaster y admin)
        const salt = 10;
        const passEdu = await bcrypt.hash('Master2026*', salt);
        const passAdmin = await bcrypt.hash('Admin123!', salt);

        await db.query(`
            INSERT INTO usuarios (nombres_completos, identificacion, password_hash, rol, id_rol, estado, aprobado)
            VALUES ('Eduardo Master', 'edumaster', $1, 'MASTER', 1, 'ACTIVO', true)
            ON CONFLICT (identificacion) DO UPDATE SET estado = 'ACTIVO', aprobado = true, rol = 'MASTER'
        `, [passEdu]);

        await db.query(`
            INSERT INTO usuarios (nombres_completos, identificacion, password_hash, rol, id_rol, estado, aprobado)
            VALUES ('Admin Sistema', 'admin', $1, 'MASTER', 1, 'ACTIVO', true)
            ON CONFLICT (identificacion) DO UPDATE SET estado = 'ACTIVO', aprobado = true, rol = 'MASTER'
        `, [passAdmin]);

        process.exit(0);
    } catch (err) {
        console.error('❌ FALLO:', err);
        process.exit(1);
    }
}

initialize();
