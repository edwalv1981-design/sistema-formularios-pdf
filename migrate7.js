const db = require('./db/index.js');

async function migrate() {
    try {
        console.log('Iniciando migracion 7 (Anexos Multiples de Documentos)...');
        
        await db.query(`ALTER TABLE formularios_llenos ADD COLUMN IF NOT EXISTS anexos_adicionales JSONB DEFAULT '[]'::jsonb;`);
        console.log('Columna anexos_adicionales agregada a formularios_llenos.');

        process.exit(0);
    } catch(err) {
        console.error('Error migrando:', err);
        process.exit(1);
    }
}
migrate();
