const db = require('./index');

async function migrate() {
    console.log('[MIGRATION] Verificando esquema de la tabla "usuarios"...');
    try {
        // Asegurar que exista is_deleted
        await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
        console.log('[MIGRATION] Columna "is_deleted" verificada/creada.');

        // Asegurar que exista deleted_at
        await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE`);
        console.log('[MIGRATION] Columna "deleted_at" verificada/creada.');

        console.log('[MIGRATION] ¡Esquema actualizado con éxito!');
        process.exit(0);
    } catch (err) {
        console.error('[MIGRATION_ERROR] Falla crítica al actualizar esquema:', err);
        process.exit(1);
    }
}

migrate();
