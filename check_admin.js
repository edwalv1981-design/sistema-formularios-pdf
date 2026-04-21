const db = require('./db');
async function check() {
  try {
    const r = await db.query("SELECT id, id_rol, identificacion FROM usuarios WHERE identificacion = 'admin'");
    console.log(JSON.stringify(r.rows[0], null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
check();
