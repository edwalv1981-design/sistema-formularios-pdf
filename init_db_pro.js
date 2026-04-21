const db = require('./db');
const bcrypt = require('bcryptjs');

async function initialize() {
    console.log('--- INICIANDO RESCATE AGRESIVO DE ESQUEMA ---');
    try {
        // 1. Asegurar tabla de roles
        await db.query(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE)`);
        await db.query(`INSERT INTO roles (id, nombre) VALUES (1, 'Master'), (2, 'Administrador'), (3, 'Usuario') ON CONFLICT DO NOTHING`);
        
        // 2. Asegurar tabla de usuarios
        await db.query(`CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, identificacion TEXT UNIQUE)`);
        
        // 3. INYECCIÓN FORZADA DE COLUMNAS (Una por una para evitar fallos si ya existen)
        const columns = [
            'nombres_completos TEXT',
            'direccion TEXT',
            'telefono TEXT',
            'tipo_formulario TEXT',
            'codigo_unico TEXT',
            'id_rol INTEGER REFERENCES roles(id)',
            'id_empresa INTEGER',
            'fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'aprobado BOOLEAN DEFAULT TRUE',
            'password_hash TEXT',
            'estado TEXT DEFAULT \'ACTIVO\'',
            'is_deleted BOOLEAN DEFAULT FALSE',
            'intentos_fallidos INTEGER DEFAULT 0',
            'bloqueado BOOLEAN DEFAULT FALSE',
            'email TEXT'
        ];

        for (const col of columns) {
            const colName = col.split(' ')[0];
            try {
                await db.query(`ALTER TABLE usuarios ADD COLUMN ${col}`);
                console.log(`✓ Columna inyectada: ${colName}`);
            } catch (e) {
                // Ignoramos si la columna ya existe
                if (e.code !== '42701') console.log(`ℹ Columna ya presente: ${colName}`);
            }
        }

        // 4. Crear/Actualizar usuario Admin
        const passwordHash = await bcrypt.hash('Admin123!', 10);
        await db.query(`
            INSERT INTO usuarios 
            (nombres_completos, identificacion, password_hash, id_rol, estado, aprobado, intentos_fallidos, bloqueado)
            VALUES ($1, $2, $3, $4, $5, $6, 0, false)
            ON CONFLICT (identificacion) 
            DO UPDATE SET 
                password_hash = EXCLUDED.password_hash, 
                estado = 'ACTIVO', 
                aprobado = TRUE,
                intentos_fallidos = 0,
                bloqueado = FALSE
        `, ['Administrador Master', 'admin', passwordHash, 1, 'ACTIVO', true]);
        
        console.log('✓ Operación completada: Base de Datos y Usuario sincronizados.');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR CRÍTICO:', err);
        process.exit(1);
    }
}

initialize();
