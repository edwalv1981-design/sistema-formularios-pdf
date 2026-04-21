const db = require('./db');
const bcrypt = require('bcryptjs');

async function createBypass() {
    try {
        const hash = await bcrypt.hash('admin', 10);
        await db.query(
            `INSERT INTO usuarios (nombres_completos, identificacion, password_hash, id_rol, aprobado) 
             VALUES ($1, $2, $3, $4, $5) 
             ON CONFLICT (identificacion) DO UPDATE SET password_hash = $3, id_rol = $4, aprobado = $5`,
            ['Admin Bypass', 'admin', hash, 1, true]
        );
        console.log('MASTER BYPASS UPDATED: admin / admin');
        process.exit(0);
    } catch (err) {
        console.error('FAIL:', err);
        process.exit(1);
    }
}

createBypass();
