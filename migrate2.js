const db = require('./db');

async function migrate() {
    try {
        console.log('Iniciando migración 2 (Soft Delete)...');
        
        const { rows } = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='usuarios' AND column_name='is_deleted';
        `);
        
        if (rows.length === 0) {
            await db.query(`ALTER TABLE usuarios ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;`);
            await db.query(`ALTER TABLE usuarios ADD COLUMN deleted_at TIMESTAMP;`);
            console.log('Columnas is_deleted y deleted_at agregadas con éxito.');
        } else {
            console.log('Las columnas de eliminación ya existen.');
        }
    } catch (err) {
        console.error('Error en migración:', err);
    } finally {
        process.exit();
    }
}

migrate();
