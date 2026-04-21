const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- INICIANDO RESCATE DE BASE DE DATOS ---');
    try {
        // 1. Crear tabla de roles
        await db.query(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE)`);
        await db.query(`INSERT INTO roles (id, nombre) VALUES (1, 'Master'), (2, 'Administrador'), (3, 'Usuario') ON CONFLICT DO NOTHING`);
        console.log('✓ Tablas de roles verificada.');

        // 2. Crear tabla de usuarios con esquema completo
        await db.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombres_completos TEXT,
                identificacion TEXT UNIQUE,
                password_hash TEXT,
                id_rol INTEGER REFERENCES roles(id),
                estado TEXT DEFAULT 'ACTIVO',
                aprobado BOOLEAN DEFAULT TRUE,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Tabla de usuarios verificada.');

        // 3. Crear usuario Admin
        const passwordHash = await bcrypt.hash('Admin123!', 10);
        await db.query(`
            INSERT INTO usuarios (nombres_completos, identificacion, password_hash, id_rol, estado, aprobado)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (identificacion) 
            DO UPDATE SET password_hash = EXCLUDED.password_hash, estado = 'ACTIVO', aprobado = TRUE
        `, ['Administrador Root', 'admin', passwordHash, 1, 'ACTIVO', true]);
        
        console.log('✓ Usuario Maestro "admin" creado/actualizado.');
        console.log('--- RESCATE COMPLETADO CON ÉXITO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR CRÍTICO EN RESCATE:', err);
        process.exit(1);
    }
}

initialize();
