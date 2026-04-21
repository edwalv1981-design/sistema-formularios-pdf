const db = require('./db');

async function migrate() {
    try {
        console.log('Migrando tabla formularios_llenos para soft delete...');
        await db.query(`
            ALTER TABLE formularios_llenos 
            ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
        `);
        console.log('Migración completada.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrate();
