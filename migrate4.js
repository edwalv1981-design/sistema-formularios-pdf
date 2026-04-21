const db = require('./db/index.js');

async function migrate() {
    try {
        console.log('Creando tabla usuario_permisos_formulario...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS usuario_permisos_formulario (
                id_usuario INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo_formulario VARCHAR(255),
                PRIMARY KEY (id_usuario, tipo_formulario)
            )
        `);
        console.log('Migracion completada.');
        process.exit(0);
    } catch(err) {
        console.error('Error migrando:', err);
        process.exit(1);
    }
}
migrate();
