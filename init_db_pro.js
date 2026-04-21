const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- INICIANDO RESCATE DE ESQUEMA COMPLETO ---');
    try {
        // 1. Crear tabla de roles
        await db.query(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE)`);
        await db.query(`INSERT INTO roles (id, nombre) VALUES (1, 'Master'), (2, 'Administrador'), (3, 'Usuario') ON CONFLICT DO NOTHING`);
        console.log('✓ Tablas de roles verificada.');

        // 2. Crear tabla de usuarios con ESQUEMA TOTAL (UHD COMPATIBLE)
        await db.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombres_completos TEXT,
                identificacion TEXT UNIQUE,
                direccion TEXT,
                telefono TEXT,
                tipo_formulario TEXT,
                codigo_unico TEXT,
                id_rol INTEGER REFERENCES roles(id),
                id_empresa INTEGER,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                aprobado BOOLEAN DEFAULT TRUE,
                password_hash TEXT,
                estado TEXT DEFAULT 'ACTIVO',
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP,
                intentos_fallidos INTEGER DEFAULT 0,
                bloqueado BOOLEAN DEFAULT FALSE,
                ultima_actividad TIMESTAMP,
                session_id TEXT,
                email TEXT,
                recovery_code TEXT
            )
        `);
        console.log('✓ Tabla de usuarios con esquema completo verificada.');

        // 3. Crear/Actualizar usuario Admin con todas las banderas de seguridad
        const passwordHash = await bcrypt.hash('Admin123!', 10);
        await db.query(`
            INSERT INTO usuarios 
            (nombres_completos, identificacion, password_hash, id_rol, estado, aprobado, intentos_fallidos, bloqueado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (identificacion) 
            DO UPDATE SET 
                password_hash = EXCLUDED.password_hash, 
                estado = 'ACTIVO', 
                aprobado = TRUE,
                intentos_fallidos = 0,
                bloqueado = FALSE
        `, ['Administrador Master', 'admin', passwordHash, 1, 'ACTIVO', true, 0, false]);
        
        console.log('✓ Acceso Maestro "admin" sincronizado al 100%.');
        console.log('--- SISTEMA LISTO PARA OPERAR ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR EN INICIALIZACIÓN:', err);
        process.exit(1);
    }
}

initialize();
