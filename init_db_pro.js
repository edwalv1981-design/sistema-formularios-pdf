const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- INICIANDO RESCATE DE ESQUEMA UNIVERSAL ---');
    try {
        // 1. Roles
        await db.query(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE)`);
        await db.query(`INSERT INTO roles (id, nombre) VALUES (1, 'Master'), (2, 'Administrador'), (3, 'Usuario') ON CONFLICT DO NOTHING`);
        
        // 2. Bitácora (El error actual)
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
        console.log('✓ Tabla bitacora creada.');

        // 3. Usuarios (Asegurar esquema completo)
        await db.query(`CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, identificacion TEXT UNIQUE)`);
        const userColumns = [
            'nombres_completos TEXT',
            'id_rol INTEGER REFERENCES roles(id)',
            'password_hash TEXT',
            'estado TEXT DEFAULT \'ACTIVO\'',
            'aprobado BOOLEAN DEFAULT TRUE',
            'intentos_fallidos INTEGER DEFAULT 0',
            'bloqueado BOOLEAN DEFAULT FALSE'
        ];
        for (const col of userColumns) {
            try { await db.query(`ALTER TABLE usuarios ADD COLUMN ${col}`); } catch (e) {}
        }

        // 4. Formularios y Ediciones (Para que el sistema funcione por dentro)
        await db.query(`
            CREATE TABLE IF NOT EXISTS formularios (
                id SERIAL PRIMARY KEY,
                nombre TEXT,
                datos JSONB,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS ediciones (
                id SERIAL PRIMARY KEY,
                id_formulario INTEGER REFERENCES formularios(id),
                id_usuario INTEGER,
                cambios JSONB,
                fecha_edicion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Tablas de formularios y ediciones verificadas.');

        // 5. Usuario Admin
        const passwordHash = await bcrypt.hash('Admin123!', 10);
        await db.query(`
            INSERT INTO usuarios (nombres_completos, identificacion, password_hash, id_rol, estado, aprobado)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (identificacion) DO UPDATE SET password_hash = EXCLUDED.password_hash
        `, ['Administrador Root', 'admin', passwordHash, 1, 'ACTIVO', true]);

        console.log('--- RESCATE UNIVERSAL COMPLETADO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR CRÍTICO:', err);
        process.exit(1);
    }
}

initialize();
