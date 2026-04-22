const db = require('./index');

async function migrate() {
    console.log('[MIGRATION] Verificando esquema de la tabla "usuarios"...');
    try {
        // Asegurar columnas en la tabla USUARIOS
        await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE`);
        console.log('[MIGRATION] Esquema de "usuarios" verificado.');

        // Asegurar columnas en la tabla FORMULARIOS
        await db.query(`ALTER TABLE formularios ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE formularios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE`);
        
        // Actualizar registros existentes que tengan NULL en is_deleted
        await db.query(`UPDATE formularios SET is_deleted = FALSE WHERE is_deleted IS NULL`);
        await db.query(`UPDATE usuarios SET is_deleted = FALSE WHERE is_deleted IS NULL`);
        
        console.log('[MIGRATION] Esquema de "formularios" verificado y normalizado.');

        console.log('[MIGRATION] ¡Esquema actualizado con éxito!');
        process.exit(0);
    } catch (err) {
        console.error('[MIGRATION_ERROR] Falla crítica al actualizar esquema:', err);
        process.exit(1);
    }
}

migrate();
