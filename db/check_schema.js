const { Pool } = require('pg');
require('dotenv').config();

const conn = process.env.DATABASE_URL || `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const pool = new Pool({ 
    connectionString: conn,
    ssl: conn.includes('railway') ? { rejectUnauthorized: false } : false
});

async function run() {
    try {
        console.log('--- BUSQUEDA AGRESIVA POR PATRON ---');
        
        // Buscar cualquier cosa que se parezca o contenga los numeros
        const res = await pool.query("SELECT id, identificacion, nombres_completos FROM usuarios WHERE identificacion LIKE '%171347%' OR nombres_completos ILIKE '%alex%'");
        console.log('Coincidencias encontradas:', res.rows);

        if (res.rows.length > 0) {
            console.log('Procediendo a la PURGA COMPLETA de estos registros para asegurar disponibilidad.');
            for (const u of res.rows) {
                if (u.id !== 1) { // NO BORRAR AL MASTER EDWIN (ID 1)
                    await pool.query("DELETE FROM usuarios WHERE id = $1", [u.id]);
                    console.log(`Usuario ${u.identificacion} (${u.nombres_completos}) ELIMINADO FISICAMENTE.`);
                } else {
                    console.log(`Saltando Master: ${u.identificacion}`);
                }
            }
        } else {
            console.log('No se encontraron coincidencias sospechosas.');
        }

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await pool.end();
    }
}
run();
