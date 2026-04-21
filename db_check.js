const db = require('./db');
async function check() {
    try {
        const ff = await db.query('SELECT count(*) FROM formularios_firmados');
        const dp = await db.query('SELECT count(*) FROM documentos_personales');
        console.log('--- DB SUMMARY ---');
        console.log('Formularios Firmados:', ff.rows[0].count);
        console.log('Documentos Personales:', dp.rows[0].count);
        
        const latestF = await db.query('SELECT id, nombre_archivo, is_valid, length(archivo_base64) as b64_len FROM formularios_firmados ORDER BY id DESC LIMIT 2');
        console.log('Latest Firmados:', latestF.rows);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
