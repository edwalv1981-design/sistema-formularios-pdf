
const db = require('../db');
async function test() {
    try {
        const res = await db.query('SELECT id, nombres_completos, tipo_formulario, id_rol FROM usuarios WHERE id_rol = 2');
        console.log('EMPRESAS:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
