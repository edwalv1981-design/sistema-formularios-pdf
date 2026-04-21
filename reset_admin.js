const db = require('./db');
const bcrypt = require('bcryptjs');

async function reset() {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin123', salt);
    await db.query(`
      UPDATE usuarios 
      SET password_hash = $1, 
          bloqueado = false, 
          intentos_fallidos = 0, 
          session_id = NULL, 
          aprobado = true, 
          ultima_actividad = NOW() - INTERVAL '1 hour' 
      WHERE identificacion = 'admin'
    `, [hash]);
    console.log("Admin fully unlocked and reset to 'admin123'");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
reset();
