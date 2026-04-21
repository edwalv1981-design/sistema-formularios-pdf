const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Iniciar sesión
router.post('/login', async (req, res) => {
  const { identificacion, password } = req.body;
  try {
    // Log de diagnóstico persistente (se limpia opcionalmente)
    const fs = require('fs');
    const path = require('path');
    const loginLog = `[${new Date().toLocaleString()}] Intento: Ident=${identificacion}, PassLength=${password ? password.length : 0}\n`;
    fs.appendFileSync(path.join(__dirname, '../login_trace.log'), loginLog);

    const userQuery = await db.query(
      `SELECT u.*, r.nombre as rol 
       FROM usuarios u 
       JOIN roles r ON u.id_rol = r.id 
       WHERE LOWER(u.identificacion) = LOWER($1)`, 
      [identificacion]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o credenciales inválidas' });
    }

    const user = userQuery.rows[0];

    // Verificar si cuenta está bloqueada
    if (user.bloqueado) {
      return res.status(403).json({ 
        error: 'La cuenta se encuentra bloqueada por superar el límite de intentos. Contacte al Administrador Master.',
        isMasterBlocked: user.rol === 'MASTER'
      });
    }

    // Verificar si está aprobado (Excepto master u otras excepciones configurables)
    if (!user.aprobado && user.rol !== 'MASTER') {
      return res.status(403).json({ error: 'Usuario no ha sido aprobado aún' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      // Incrementar intentos fallidos (Control de raíz para MASTER y estándar)
      const updateQ = await db.query(
        `UPDATE usuarios 
         SET intentos_fallidos = COALESCE(intentos_fallidos, 0) + 1 
         WHERE id = $1 RETURNING intentos_fallidos`, 
        [user.id]
      );
      
      const faltas = updateQ.rows[0].intentos_fallidos;
      
      // Registrar falla en bitácora para diagnóstico de raíz
      await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
        [user.id, 'LOGIN_FALLIDO', `Intento fallido ${faltas} de 3. IP: ${req.ip}`]);

      if (faltas >= 3) {
        await db.query(`UPDATE usuarios SET bloqueado = true WHERE id = $1`, [user.id]);
        return res.status(403).json({ 
            error: 'Su cuenta ha sido bloqueada por seguridad tras 3 intentos fallidos. Contacte a un MASTER para desbloqueo.',
            isMasterBlocked: user.rol === 'MASTER'
        });
      }

      return res.status(401).json({ error: `Credenciales inválidas. Intento ${faltas} de 3.` });
    }

    // --- Control de Sesión Única y Protección de Acceso ---
    const sessionTimeout = 5 * 60 * 1000; // 5 minutos de margen
    const now = new Date();
    const lastActivity = user.ultima_actividad ? new Date(user.ultima_actividad) : new Date(0);

    // Si es MASTER, permitimos siempre ingresar (Bypass de sesión duplicada)
    // Para otros usuarios, bloqueamos si la sesión fue hace menos de 5 mins
    if (user.rol !== 'MASTER' && user.session_id && (now - lastActivity < sessionTimeout)) {
      return res.status(403).json({ error: 'Usuario ya ingresó en otro equipo. Espere 5 minutos o cierre la otra sesión.' });
    }

    // Resetear fallos en login exitoso
    await db.query(`UPDATE usuarios SET intentos_fallidos = 0, ultima_actividad = NOW() WHERE id = $1`, [user.id]);

    // Registrar en bitácora
    await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
      [user.id, 'INICIO_SESION', `Usuario ${user.identificacion} ingresó al sistema (Rol: ${user.rol})`]);

    // Generar Session ID Único
    const newSessionId = Math.random().toString(36).substring(7);
    await db.query(`UPDATE usuarios SET session_id = $1 WHERE id = $2`, [newSessionId, user.id]);

    // Generar Token
    const payload = {
      id: user.id,
      identificacion: user.identificacion,
      nombres_completos: user.nombres_completos,
      rol: user.rol,
      id_empresa: user.id_empresa
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'tu_secreto_super_seguro_aqui', { expiresIn: '8h' });

    res.json({ token, user: payload });
  } catch (error) {
    console.error(error);
    const fs = require('fs');
    const path = require('path');
    const logBatch = `[${new Date().toISOString()}] Login Error: ${error.message}\n${error.stack}\n\n`;
    fs.appendFileSync(path.join(__dirname, '../error_debug.txt'), logBatch);
    res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
  }
});

// Heartbeat: Actualizar actividad (Mantenimiento de sesión viva)
router.post('/heartbeat', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.sendStatus(401);
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_super_seguro_aqui');
        await db.query(`UPDATE usuarios SET ultima_actividad = NOW() WHERE id = $1`, [decoded.id]);
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(403);
    }
});

// Logout: Limpiar sesión en DB
router.post('/logout', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.sendStatus(200);
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_super_seguro_aqui');
        await db.query(`UPDATE usuarios SET session_id = NULL, ultima_actividad = NOW() - INTERVAL '10 minutes' WHERE id = $1`, [decoded.id]);
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(200);
    }
});

module.exports = router;
