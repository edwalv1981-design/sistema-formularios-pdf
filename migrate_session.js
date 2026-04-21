const db = require('./db');

async function migrate() {
    try {
        console.log('Migrando tabla usuarios para control de sesiones...');
        
        // Agregar columna de última actividad para detectar inactividad desde el servidor si es necesario
        await db.query(`
            ALTER TABLE usuarios 
            ADD COLUMN IF NOT EXISTS ultima_actividad TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS session_id TEXT
        `);

        console.log('Migración completada exitosamente.');
        process.exit(0);
    } catch (err) {
        console.error('Error en migración:', err);
        process.exit(1);
    }
}

migrate();
