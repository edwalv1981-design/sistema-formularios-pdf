const db = require('./db/index.js');

async function migrate() {
    try {
        console.log('Iniciando migracion 5 (Formato Fiel y Borradores)...');
        
        await db.query(`ALTER TABLE formularios ADD COLUMN IF NOT EXISTS campos_configurados JSONB DEFAULT '[]'::jsonb;`);
        console.log('Columna campos_configurados agregada a formularios.');

        await db.query(`ALTER TABLE formularios_llenos ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'COMPLETADO';`);
        console.log('Columna estado agregada a formularios_llenos.');

        process.exit(0);
    } catch(err) {
        console.error('Error migrando:', err);
        process.exit(1);
    }
}
migrate();
