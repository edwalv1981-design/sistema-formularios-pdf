
const db = require('../db');
async function test() {
    try {
        const res = await db.query('SELECT id, tipo FROM formularios WHERE is_deleted = FALSE');
        console.log('FORMULARIOS:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
