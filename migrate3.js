const db = require('./db');

async function migrate() {
    try {
        console.log('Iniciando migración 3 (Plantillas dinámicas)...');
        
        const { rows } = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='formularios' AND column_name='prefijo';
        `);
        
        if (rows.length === 0) {
            await db.query(`ALTER TABLE formularios ADD COLUMN prefijo VARCHAR(20);`);
            console.log('Columna prefijo agregada a formularios con éxito.');
        } else {
            console.log('La columna prefijo ya existe.');
        }
    } catch (err) {
        console.error('Error en migración 3:', err);
    } finally {
        process.exit();
    }
}

migrate();
