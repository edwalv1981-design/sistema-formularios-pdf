const db = require('./db');
const bcrypt = require('bcryptjs');

async function resetMaster() {
    try {
        const hash = await bcrypt.hash('Admin.2024*', 10);
        const res = await db.query(
            `UPDATE usuarios SET password_hash = $1, bloqueado = false, intentos_fallidos = 0 WHERE identificacion = $2`,
            [hash, '1713470050']
        );
        console.log('Update result:', res.rowCount);
        process.exit(0);
    } catch (err) {
        console.error('FAIL:', err);
        process.exit(1);
    }
}

resetMaster();
