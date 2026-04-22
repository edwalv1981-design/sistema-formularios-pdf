const { Pool } = require('pg');
require('dotenv').config();

const conn = process.env.DATABASE_URL || `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const pool = new Pool({ 
    connectionString: conn,
    ssl: conn.includes('railway') ? { rejectUnauthorized: false } : false
});

async function run() {
    try {
        console.log('--- OPERACIÓN EXTERMINIO DE FANTASMAS ---');
        
        // 1. Ver cuántos hay
        const resCheck = await pool.query("SELECT id, identificacion, nombres_completos FROM usuarios WHERE is_deleted = TRUE");
        console.log(`Se encontraron ${resCheck.rows.length} registros marcados como eliminados.`);
        console.log('Detalle:', resCheck.rows);

        if (resCheck.rows.length > 0) {
            // 2. Borrar físicamente
            const resDel = await pool.query("DELETE FROM usuarios WHERE is_deleted = TRUE");
            console.log(`ÉXITO: Se han eliminado FÍSICAMENTE ${resDel.rowCount} usuarios del sistema.`);
            console.log('Las identificaciones ahora están disponibles para nuevos registros.');
        } else {
            console.log('ESTADO: No hay registros fantasma en este momento.');
        }

    } catch (err) {
        console.error('FALLA CRÍTICA EN OPERACIÓN:', err);
    } finally {
        await pool.end();
    }
}
run();
