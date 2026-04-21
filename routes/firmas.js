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

        // EJECUCIÓN DEL AGENTE VALIDADOR
        const isValid = await validateDigitalSignature(fullPath);

        const result = await db.query(
            'INSERT INTO formularios_firmados (user_id, nombre_archivo, ruta_archivo, is_valid) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, req.file.originalname, rutaUrl, isValid]
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
        const userId = req.user.id;
        const result = await db.query(
            'SELECT * FROM formularios_firmados WHERE user_id = $1 ORDER BY fecha_carga DESC',
            [userId]
        );
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

module.exports = router;
