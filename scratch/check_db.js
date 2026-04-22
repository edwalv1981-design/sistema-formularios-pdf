
const db = require('../db');
async function test() {
    try {
        const res = await db.query('SELECT * FROM roles');
        console.log('ROLES:', res.rows);
        const resU = await db.query('SELECT id, nombres_completos, id_rol, id_empresa, rol FROM (SELECT u.*, r.nombre as rol FROM usuarios u JOIN roles r ON u.id_rol = r.id) x WHERE rol = \'ADICIONAL\' LIMIT 5');
        console.log('ADICIONAL USERS:', resU.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
