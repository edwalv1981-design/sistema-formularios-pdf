const db = require('./db');

async function migrate() {
    try {
        console.log('--- Ajustando Control de Unicidad en Plantillas (Soft Delete Support) ---');

        // 1. Asegurar que la columna is_deleted existe en formularios (por seguridad)
        await db.query(`ALTER TABLE formularios ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);

        // 2. Intentar remover el constraint UNIQUE tradicional si existe
        // En PostgreSQL 12+, el indice unico se suele llamar formularios_tipo_key
        try {
            await db.query(`ALTER TABLE formularios DROP CONSTRAINT IF EXISTS formularios_tipo_key`);
            console.log('✓ Constraint UNIQUE tradicional removido.');
        } catch (e) {
            console.log('! No se pudo remover el constraint (tal vez no existe o tiene otro nombre):', e.message);
        }

        // 3. Crear el Índice Único Parcial (La solución experta)
        // Esto permite que existan muchos "ABC" borrados, pero solo UN "ABC" activo.
        await db.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_formularios_tipo_active 
            ON formularios (tipo) 
            WHERE is_deleted = FALSE
        `);
        console.log('✓ Índice Único Parcial creado (Solo plantillas activas).');

        console.log('--- Migración finalizada con éxito ---');
        process.exit(0);
    } catch (err) {
        console.error('ERROR EN MIGRACIÓN:', err.message);
        process.exit(1);
    }
}

migrate();
