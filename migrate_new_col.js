const db = require('./db');

async function migrate() {
    try {
        console.log('Migrando base de datos...');
        await db.query(`ALTER TABLE formularios_llenos ADD COLUMN IF NOT EXISTS html_content_personalizado TEXT;`);
        console.log('Columna html_content_personalizado añadida correctamente.');
        process.exit(0);
    } catch (err) {
        console.error('Error en migración:', err);
        process.exit(1);
    }
}

migrate();
