const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const generarCodigoUnico = async (tipo_formulario) => {
  let prefijo = 'GEN';
  try {
     const resPrefijo = await db.query(`SELECT prefijo FROM formularios WHERE tipo = $1`, [tipo_formulario]);
     if (resPrefijo.rows.length > 0) prefijo = resPrefijo.rows[0].prefijo;
  } catch(e) {}

  const hoy = new Date();
  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, '0');
  const day = String(hoy.getDate()).padStart(2, '0');
  const fechaStr = `${year}${month}${day}`;

  const baseCodigo = `${prefijo}${fechaStr}`;

  // Buscar el ultimo secuencial de hoy
  const q = `SELECT codigo_unico FROM usuarios WHERE codigo_unico LIKE $1 ORDER BY codigo_unico DESC LIMIT 1`;
  const result = await db.query(q, [`${baseCodigo}%`]);

  let nextNum = 1;
  if(result.rows.length > 0) {
    const lastCode = result.rows[0].codigo_unico;
    const lastSeq = parseInt(lastCode.replace(baseCodigo, ''));
    if(!isNaN(lastSeq)) {
      nextNum = lastSeq + 1;
    }
  }

  const secuencialStr = String(nextNum).padStart(6, '0');
  return `${baseCodigo}${secuencialStr}`;
};

// Registro de usuario nuevo
router.post('/registro', async (req, res) => {
  const { nombres_completos, identificacion, direccion, telefono, tipo_formulario, password, id_empresa, es_adicional } = req.body;
  
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    let id_rol_asignado = null;
    let codigo_unico_generado = null;
    let id_empresa_asignado = null;

    if (es_adicional) {
      // Validar que manden la empresa si es un usuario adicional
      if (!id_empresa) return res.status(400).json({ error: 'Un usuario adicional debe pertenecer a una empresa.' });
      
      const resRole = await db.query(`SELECT id FROM roles WHERE nombre = 'ADICIONAL'`);
      id_rol_asignado = resRole.rows[0].id;
      id_empresa_asignado = id_empresa;
    } else {
      // Es una Empresa Principal
      if(!tipo_formulario) return res.status(400).json({ error: 'Debe seleccionar un tipo de formulario.' });

      const resRole = await db.query(`SELECT id FROM roles WHERE nombre = 'EMPRESA'`);
      id_rol_asignado = resRole.rows[0].id;
      codigo_unico_generado = await generarCodigoUnico(tipo_formulario);
    }

    const sql = `INSERT INTO usuarios 
      (nombres_completos, identificacion, direccion, telefono, tipo_formulario, codigo_unico, id_rol, id_empresa, password_hash, aprobado, estado) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`;
    
    // Las empresas SIEMPRE requieren aprobación del Master (Seguridad de raíz)
    const params = [nombres_completos, identificacion, direccion, telefono, tipo_formulario, codigo_unico_generado, id_rol_asignado, id_empresa_asignado, password_hash, false, 'PENDIENTE'];
    
    const { rows } = await db.query(sql, params);
    const nuevoUserId = rows[0].id;
    
    // Si es empresa, actualizamos para que su id_empresa sea el mismo
    if (!es_adicional) {
       await db.query(`UPDATE usuarios SET id_empresa = $1 WHERE id = $1`, [nuevoUserId]);
       id_empresa_asignado = nuevoUserId;
    }

    await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
      [nuevoUserId, id_empresa_asignado, 'REGISTRO_USUARIO', 'Usuario registrado en el sistema. Esperando aprobación del MASTER.']);

    res.status(201).json({ 
      mensaje: 'Registro exitoso. Su cuenta ha sido creada y está en espera de aprobación por el Administrador MASTER.', 
      codigo_unico: codigo_unico_generado 
    });

  } catch (err) {
    console.error(err);
    if(err.code === '23505') { // Uniqu constraint violation
        return res.status(400).json({ error: 'La identificación ya está registrada.' });
    }
    res.status(500).json({ error: 'Error registrando el usuario' });
  }
});

// Obtener todos los usuarios
router.get('/', authenticateToken, async (req, res) => {
  try {
    let q = `SELECT u.id, u.nombres_completos, u.identificacion, u.codigo_unico, r.nombre as rol, u.aprobado, u.estado, u.bloqueado, u.fecha_registro FROM usuarios u JOIN roles r ON u.id_rol = r.id WHERE u.is_deleted = FALSE `;
    let values = [];
    if (req.user.rol === 'EMPRESA') {
       q += `AND u.id_empresa = $1 `;
       values.push(req.user.id_empresa || req.user.id);
    } // Si es adicional tal vez no tenga acceso a esto.
    q += `ORDER BY u.fecha_registro DESC`;

    const { rows } = await db.query(q, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

// Registrar usuario adicional internamente (Empresa crea su propio operador sin aprobación)
router.post('/adicional', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'EMPRESA') return res.status(403).json({ error: 'Solo empresas pueden crear operativos adicionales' });
    const { nombres_completos, identificacion, direccion, telefono, password } = req.body;
    
        console.log(`[CREATE_ADD] Empresa ${req.user.id} intentando crear operador: ${identificacion}`);
        
        const resRole = await db.query(`SELECT id FROM roles WHERE nombre = 'ADICIONAL'`);
        if (resRole.rows.length === 0) {
            console.error('[CREATE_ADD_ERR] No se encontró el rol ADICIONAL en la base de datos.');
            return res.status(500).json({ error: 'Configuración de roles incompleta en el servidor.' });
        }
        const id_rol_asignado = resRole.rows[0].id;
        const id_empresa_asignado = req.user.id_empresa || req.user.id; 

        const resEmp = await db.query(`SELECT codigo_unico FROM usuarios WHERE id = $1`, [id_empresa_asignado]);
        if (resEmp.rows.length === 0) {
            console.error(`[CREATE_ADD_ERR] No se encontró la empresa matriz con ID ${id_empresa_asignado}`);
            return res.status(404).json({ error: 'No se pudo localizar la cuenta de empresa matriz.' });
        }
        const codigo_heredado = resEmp.rows[0].codigo_unico || 'SIN_CODIGO';

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const sql = `INSERT INTO usuarios 
          (nombres_completos, identificacion, direccion, telefono, id_rol, id_empresa, password_hash, aprobado, estado, codigo_unico) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 'ACTIVO', $8) RETURNING id`;
        
        const params = [nombres_completos, identificacion, direccion, telefono, id_rol_asignado, id_empresa_asignado, password_hash, codigo_heredado];
        const { rows } = await db.query(sql, params);

        console.log(`[CREATE_ADD_OK] Operador ${identificacion} creado exitosamente con ID ${rows[0].id}`);

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
          [req.user.id, id_empresa_asignado, 'CREAR_ADICIONAL', `Operador Adicional ${identificacion} creado exitosamente`]);

        res.status(201).json({ mensaje: 'Operador Adicional registrado y habilitado exitosamente.' });
    } catch(err) {
        console.error('[CREATE_ADD_CRITICAL]', err);
        if(err.code === '23505') return res.status(400).json({ error: 'La identificación ya está registrada en el sistema.' });
        res.status(500).json({ error: 'Falla técnica al procesar el alta: ' + err.message });
    }
});

// Aprobar usuario
router.put('/:id/aprobar', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT estado, id_rol, id_empresa FROM usuarios WHERE id = $1`, [req.params.id]);
    if (rows.length > 0) {
        // Si no es Master, asegurar que sea una Empresa aprobando a SU Adicional
        if (req.user.rol !== 'MASTER') {
            const resMiRol = await db.query(`SELECT nombre FROM roles WHERE id = $1`, [rows[0].id_rol]);
            if (resMiRol.rows[0].nombre !== 'ADICIONAL') return res.status(403).json({ error: 'Permisos insuficientes' });
        }
    }
    await db.query(`UPDATE usuarios SET aprobado = TRUE, estado = 'ACTIVO' WHERE id = $1`, [req.params.id]);
    
    // LOG DE AUDITORÍA
    const idEmpresa = req.user.id_empresa || req.user.id;
    await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
        [req.user.id, idEmpresa, 'APROBAR_USUARIO', `Se aprobó y activó el acceso para el usuario con ID ${req.params.id}`]);

    res.json({ mensaje: 'Aprobado/Admitido exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al aprobar' });
  }
});

// Rechazar/Suspender usuario
router.put('/:id/rechazar', authenticateToken, async (req, res) => {
  try {
    await db.query(`UPDATE usuarios SET aprobado = FALSE, estado = 'RECHAZADO' WHERE id = $1`, [req.params.id]);
    
    // LOG DE AUDITORÍA
    const idEmpresa = req.user.id_empresa || req.user.id;
    await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
        [req.user.id, idEmpresa, 'RECHAZAR_USUARIO', `Se suspendió/rechazó el acceso para el usuario con ID ${req.params.id}`]);

    res.json({ mensaje: 'Permiso Suspendido/Rechazado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al rechazar' });
  }
});

// Desbloquear usuario (Exclusivo Master)
router.put('/:id/desbloquear', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'MASTER') return res.status(403).json({ error: 'Solo el administrador Master puede desbloquear cuentas por intentos fallidos' });
    try {
        await db.query(`UPDATE usuarios SET bloqueado = false, intentos_fallidos = 0 WHERE id = $1`, [req.params.id]);
        
        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [req.user.id, 'DESBLOQUEO_CUENTA', `El Master desbloqueó manualmente al usuario de ID ${req.params.id}`]);

        res.json({ mensaje: 'Cuenta desbloqueada satisfactoriamente. Puede volver a intentar acceder.' });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno restableciendo acceso' });
    }
});

// Update Password
router.put('/:id/password', authenticateToken, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });

    try {
        const { rows } = await db.query(`SELECT id_rol, id_empresa, identificacion FROM usuarios WHERE id = $1`, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        const target = rows[0];

        // Regla: Solo un MASTER puede cambiar la clave de un MASTER
        if (target.id_rol === 1 && req.user.rol !== 'MASTER') {
            return res.status(403).json({ error: 'Solo un usuario MASTER puede modificar a otro MASTER.' });
        }

        // Permitir que cualquier usuario (excepto ADICIONAL por política previa) cambie su PROPIA clave
        if (req.user.id !== parseInt(req.params.id)) {
            if (req.user.rol === 'ADICIONAL') return res.status(403).json({ error: 'Permisos insuficientes' });
            
            if (req.user.rol === 'EMPRESA') {
                const miEmpresa = req.user.id_empresa || req.user.id;
                // Validar jerarquía: la empresa solo puede cambiar clave a sus ADICIONALES (id_rol = 3) q pertenezcan a ella misma.
                if (target.id_empresa !== miEmpresa || target.id_rol !== 3) {
                    return res.status(403).json({ error: 'Solo puede modificar contraseñas de sus propios Operadores' });
                }
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await db.query(`UPDATE usuarios SET password_hash = $1 WHERE id = $2`, [hash, req.params.id]);
        
        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [req.user.id, 'CAMBIO_CLAVE', `Modificación administrativa de clave para el usuario: ${target.identificacion}`]);

        res.json({ mensaje: 'Contraseña actualizada de forma segura' });
    } catch(err) {
        res.status(500).json({ error: 'Error actualizando clave' });
    }
});

// Actualizar Perfil (Exclusivo MASTER para su propia cuenta o administradores)
async function handleMasterProfileUpdate(req, res) {
    const { nombres_completos, identificacion, codigo_unico, email } = req.body;
    const { id } = req.params;

    try {
        if (req.user.rol !== 'MASTER') return res.status(403).json({ error: 'Solo el MASTER puede editar perfiles de alto nivel' });

        // Verificar duplicados de identificación si cambió
        const checkQ = await db.query(`SELECT id FROM usuarios WHERE identificacion = $1 AND id <> $2`, [identificacion, id]);
        if (checkQ.rows.length > 0) return res.status(400).json({ error: 'La identificación ya está en uso por otro usuario.' });

        const sql = `UPDATE usuarios SET nombres_completos = $1, identificacion = $2, codigo_unico = $3, email = $4 WHERE id = $5 RETURNING id, nombres_completos, identificacion, codigo_unico, email`;
        const { rows } = await db.query(sql, [nombres_completos, identificacion, codigo_unico, email, id]);
        
        if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [req.user.id, 'ACTUALIZAR_PERFIL', `El Master actualizó sus datos de perfil (incluyendo email) o los del ID ${id}`]);

        res.json({ mensaje: 'Perfil actualizado correctamente', user: rows[0] });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno actualizando perfil' });
    }
}
router.put('/:id/perfil', authenticateToken, handleMasterProfileUpdate);

// Eliminar usuario (Soft Delete para mantener historico)
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Validaciones técnicas de seguridad
    const checkQ = await db.query(`SELECT id_empresa, id_rol FROM usuarios WHERE id = $1`, [id]);
    if (checkQ.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    const target = checkQ.rows[0];
    const miEmpresa = req.user.id_empresa || req.user.id;

    if (req.user.rol === 'EMPRESA') {
        // La empresa solo borra sus propios operadores
        if (target.id_empresa !== miEmpresa || target.id_rol !== 3) {
            return res.status(403).json({ error: 'No tiene permisos para eliminar a este usuario' });
        }
    } else if (req.user.rol !== 'MASTER') {
        return res.status(403).json({ error: 'Solo administradores pueden realizar esta acción' });
    }

    console.log(`[DELETE_REQ] Iniciando baja para ID ${id}. Ejecutado por ${req.user.id} (${req.user.rol})`);
    await db.query(`UPDATE usuarios SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    
    // LOG DE AUDITORÍA
    await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
        [req.user.id, miEmpresa, 'ELIMINAR_USUARIO', `Se realizó el borrado lógico del usuario con ID ${id}`]);

    console.log(`[DELETE_OK] Usuario ${id} dado de baja exitosamente.`);
    res.json({ mensaje: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('[DELETE_USER_ERR] ERROR CRÍTICO:', err);
    res.status(500).json({ error: 'Error interno al procesar la baja: ' + err.message });
  }
});


// ==== FIN DE GESTIÓN DE SEGURIDAD ====


const nodemailer = require('nodemailer');

// ... [rest of imports]

// Endpoint para solicitar código de desbloqueo (Solo MASTER)
router.post('/request-unlock', async (req, res) => {
    const { identificacion } = req.body;
    try {
        const query = await db.query(`
            SELECT u.*, r.nombre as rol_nombre 
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id 
            WHERE u.identificacion = $1 AND r.nombre = 'MASTER'
        `, [identificacion]);

        if (query.rows.length === 0) return res.status(404).json({ error: 'Usuario Master no encontrado o identificación incorrecta.' });
        const user = query.rows[0];

        if (!user.bloqueado) return res.status(400).json({ error: 'El usuario no se encuentra bloqueado.' });
        if (!user.email) return res.status(400).json({ error: 'No tiene un correo electrónico configurado para recuperación. Contacte a soporte técnico.' });

        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        await db.query(`UPDATE usuarios SET recovery_code = $1 WHERE id = $2`, [pin, user.id]);

        // Configurar Transporter (Lógica similar a digit.js)
        let transporter;
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com', port: process.env.SMTP_PORT || 587,
                secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
        } else {
            let testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email", port: 587, secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass }
            });
        }

        const info = await transporter.sendMail({
            from: '"Seguridad Sistema" <no-reply@sistema.local>',
            to: user.email,
            subject: 'Código de Desbloqueo de Cuenta Master',
            html: `<h3>Recuperación de Acceso</h3>
                   <p>Usted ha solicitado el desbloqueo de su cuenta administrativa.</p>
                   <p>Su código de seguridad es: <b style="font-size:1.5rem; color:#ef4444;">${pin}</b></p>
                   <p>Ingrese este código en la plataforma para establecer una nueva contraseña.</p>`
        });

        res.json({ 
            mensaje: 'Código enviado exitosamente a su correo registrado.',
            previewUrl: process.env.SMTP_USER ? null : nodemailer.getTestMessageUrl(info) 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error procesando solicitud de desbloqueo' });
    }
});

// Endpoint para verificar código y resetear clave
router.post('/verify-unlock', async (req, res) => {
    const { identificacion, code, newPassword } = req.body;
    try {
        const query = await db.query(`SELECT * FROM usuarios WHERE identificacion = $1 AND recovery_code = $2`, [identificacion, code]);
        if (query.rows.length === 0) return res.status(400).json({ error: 'Código inválido o identificación incorrecta.' });
        
        const user = query.rows[0];
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await db.query(`
            UPDATE usuarios 
            SET password_hash = $1, bloqueado = FALSE, intentos_fallidos = 0, recovery_code = NULL 
            WHERE id = $2
        `, [hash, user.id]);

        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [user.id, 'DESBLOQUEO_MASTER', `El usuario Master recuperó su cuenta exitosamente`]);

        res.json({ mensaje: 'Cuenta desbloqueada satisfactoriamente. Use su nueva contraseña para ingresar.' });
    } catch (err) {
        res.status(500).json({ error: 'Error finalizando desbloqueo' });
    }
});

module.exports = router;
