const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- ACTIVANDO MENÚ Y PERMISOS ---');
    try {
        // 1. Tablas de estructura de navegación
        await db.query(`CREATE TABLE IF NOT EXISTS modulos (id SERIAL PRIMARY KEY, nombre TEXT, icono TEXT, ruta TEXT, orden INTEGER)`);
        await db.query(`CREATE TABLE IF NOT EXISTS permisos (id_rol INTEGER, id_modulo INTEGER, PRIMARY KEY(id_rol, id_modulo))`);
        
        // 2. Insertar Módulos Básicos
        const modulos = [
            [1, 'Escritorio', 'fas fa-home', '/dashboard', 1],
            [2, 'Formularios', 'fas fa-file-alt', '/formularios', 2],
            [3, 'Ediciones', 'fas fa-edit', '/ediciones', 3],
            [4, 'Usuarios', 'fas fa-users', '/usuarios', 4],
            [5, 'Configuración', 'fas fa-cog', '/configuracion', 5]
        ];

        for (const mod of modulos) {
            await db.query(`
                INSERT INTO modulos (id, nombre, icono, ruta, orden) 
                VALUES ($1, $2, $3, $4, $5) 
                ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, icono = EXCLUDED.icono, ruta = EXCLUDED.ruta
            `, mod);
        }

        // 3. Asignar Permisos al Rol Master (ID: 1)
        for (let i = 1; i <= 5; i++) {
            await db.query(`INSERT INTO permisos (id_rol, id_modulo) VALUES (1, ${i}) ON CONFLICT DO NOTHING`);
        }

        // 4. Asegurar que el usuario admin tenga el rol Master
        await db.query(`UPDATE usuarios SET id_rol = 1 WHERE identificacion = 'admin'`);

        console.log('✓ Menú y permisos inyectados con éxito.');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR AL ACTIVAR MENÚ:', err);
        process.exit(1);
    }
}

initialize();
