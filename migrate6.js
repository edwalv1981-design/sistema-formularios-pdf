const db = require('./db/index.js');

async function migrate() {
    try {
        console.log('Iniciando migracion 6 (Bloqueo de cuentas)...');
        
        await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INT DEFAULT 0;`);
        console.log('Columna intentos_fallidos agregada a usuarios.');

        await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT false;`);
        console.log('Columna bloqueado agregada a usuarios.');

        process.exit(0);
    } catch(err) {
        console.error('Error migrando:', err);
        process.exit(1);
    }
}
migrate();
