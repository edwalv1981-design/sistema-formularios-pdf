const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const { validateDigitalSignature } = require('../utils/signature_utils');

// CONFIGURACIÓN DE MULTER
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(__dirname, '../uploads/firmados');
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, 'SIGNED_' + Date.now() + ext);
  }
});
const upload = multer({ storage: storage });

// Se eliminó la función validateDigitalSignature de aquí porque ahora se usa la de utils/

// SUBIR FORMULARIO FIRMADO
router.post('/upload', authenticateToken, upload.single('archivo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Archivo no detectado' });
        
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const fullPath = req.file.path;
        const rutaUrl = '/uploads/firmados/' + req.file.filename;

        // EJECUCIÓN DEL AGENTE VALIDADOR (No bloqueante)
        let isValid = false;
        try {
            isValid = await validateDigitalSignature(fullPath);
        } catch (vErr) {
            console.error('[SIGNATURE_AGENT_ERROR] Ignorando falla de validación para permitir carga:', vErr.message);
        }

        const archivoBase64 = fs.readFileSync(fullPath).toString('base64');
        const result = await db.query(
            'INSERT INTO formularios_firmados (user_id, nombre_archivo, ruta_archivo, is_valid, archivo_base64) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [userId, req.file.originalname, rutaUrl, isValid, archivoBase64]
        );

        // BITÁCORA
        const logAccion = isValid ? 'VALIDACION_FIRMA_EXITO' : 'VALIDACION_FIRMA_FALLO';
        const logDetalle = isValid 
            ? `Se validó firma digital criptográfica en el documento: ${req.file.originalname}`
            : `ATENCIÓN: Se subió documento sin firma detectable: ${req.file.originalname}`;
        
        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, logAccion, logDetalle]);

        res.json({ 
            message: 'Documento procesado', 
            id: result.rows[0].id,
            isValid: isValid 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Falla en el Agente de Validación' });
    }
});

// LISTAR FORMULARIOS FIRMADOS
router.get('/', authenticateToken, async (req, res) => {
    try {
        let sql = 'SELECT * FROM formularios_firmados WHERE user_id = $1 ORDER BY fecha_carga DESC';
        let params = [req.user.id];
        
        if (req.user.rol === 'MASTER') {
            sql = 'SELECT f.*, u.nombres_completos as subido_por FROM formularios_firmados f JOIN usuarios u ON f.user_id = u.id ORDER BY f.fecha_carga DESC';
            params = [];
        }
        
        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al listar' });
    }
});

// ELIMINAR FORMULARIO FIRMADO
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const { id } = req.params;

        const info = await db.query('SELECT ruta_archivo, nombre_archivo FROM formularios_firmados WHERE id = $1 AND user_id = $2', [id, userId]);
        if (info.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

        const fullPath = path.join(process.cwd(), info.rows[0].ruta_archivo.replace(/^\/+/, ''));
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

        await db.query('DELETE FROM formularios_firmados WHERE id = $1 AND user_id = $2', [id, userId]);

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'ELIMINAR_FORM_FIRMADO', `Se eliminó el formulario firmado: ${info.rows[0].nombre_archivo}`]);

        res.json({ message: 'Eliminado correctamente' });
    } catch (err) {
        res.status(500).json({ error: 'Falla al eliminar' });
    }
});

// VISUALIZAR Y RECUPERAR FORMULARIO FIRMADO (Motor de Resiliencia)
router.get('/view/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        let sql = 'SELECT ruta_archivo, nombre_archivo FROM formularios_firmados WHERE id = $1 AND user_id = $2';
        let params = [id, userId];
        
        if (req.user.rol === 'MASTER') {
            sql = 'SELECT ruta_archivo, nombre_archivo FROM formularios_firmados WHERE id = $1';
            params = [id];
        }
        
        const result = await db.query(sql, params);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado o sin acceso' });
        
        const info = result.rows[0];
        const rutaLimpia = info.ruta_archivo.replace(/^\/+/, '');
        const fullPath = path.join(process.cwd(), rutaLimpia);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`[RECOVERY_SIGNED] Reconstruyendo binario firmado desde DB...`);
            const recovery = await db.query('SELECT archivo_base64 FROM formularios_firmados WHERE id = $1', [id]);
            if (recovery.rows.length > 0 && recovery.rows[0].archivo_base64) {
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(fullPath, Buffer.from(recovery.rows[0].archivo_base64, 'base64'));
            } else {
                return res.status(404).json({ error: 'Archivo no recuperable en este momento' });
            }
        }
        
        const safeName = info.nombre_archivo;
        res.download(fullPath, safeName, (err) => {
            if (err) {
                console.error(`[DOWNLOAD_ERROR] ${err.message}`);
                if(!res.headersSent) res.status(500).json({ error: 'Error al transferir el archivo' });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al servir el documento firmado' });
    }
});

module.exports = router;
