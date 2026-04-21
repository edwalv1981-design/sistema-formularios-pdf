const db = require('./db');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        const passwordHash = await bcrypt.hash('Admin123!', 10);
        const query = `
            INSERT INTO usuarios 
            (nombres_completos, identificacion, password_hash, id_rol, estado, aprobado) 
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (identificacion) DO NOTHING
        `;
        const values = ['Administrador Sistema', 'admin', passwordHash, 1, 'ACTIVO', true];
        
        const res = await db.query(query, values);
        if (res.rowCount > 0) {
            console.log('Usuario "admin" creado con éxito (Contraseña: Admin123!)');
        } else {
            console.log('El usuario "admin" ya existía.');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error al crear admin:', err);
        process.exit(1);
    }
}

createAdmin();
