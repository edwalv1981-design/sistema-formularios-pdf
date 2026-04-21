const db = require('./db');

async function migrate() {
    try {
        console.log('Iniciando migración...');
        // Verificar si la columna ya existe para evitar errores
        const { rows } = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='usuarios' AND column_name='estado';
        `);
        
        if (rows.length === 0) {
            await db.query(`ALTER TABLE usuarios ADD COLUMN estado VARCHAR(20) DEFAULT 'PENDIENTE';`);
            await db.query(`UPDATE usuarios SET estado = 'APROBADO' WHERE aprobado = TRUE;`);
            console.log('Columna estado agregada con éxito.');
        } else {
            console.log('La columna estado ya existe.');
        }
    } catch (err) {
        console.error('Error en migración:', err);
    } finally {
        process.exit();
    }
}

migrate();
