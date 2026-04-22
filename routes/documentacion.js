const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const ExpirationAgent = require('../services/expiration_agent');

// Configuración de Multer para Documentos Personales (PDF + Imágenes)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(__dirname, '../uploads/personal');
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, 'DOC_' + Date.now() + '_' + Math.round(Math.random() * 1E9) + ext);
  }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no soportado. Use PDF o Imágenes.'));
        }
    }
});

// SUBIR DOCUMENTO PERSONAL
router.post('/upload', authenticateToken, upload.single('archivo'), async (req, res) => {
    try {
        const { tipo } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No se adjuntó archivo' });
        
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const rutaUrl = '/uploads/personal/' + req.file.filename;

        const archivoBase64 = fs.readFileSync(req.file.path).toString('base64');
        const result = await db.query(
            'INSERT INTO documentos_personales (user_id, tipo, nombre_archivo, ruta_archivo, fecha_carga, estado_vigencia, archivo_base64) VALUES ($1, $2, $3, $4, NOW(), \'NO DETECTADO\', $5) RETURNING id',
            [userId, tipo, req.file.originalname, rutaUrl, archivoBase64]
        );
        const docId = result.rows[0].id;

        // Bitácora
        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'SUBIR_DOC_PERSONAL', `Se subió documento tipo ${tipo}: ${req.file.originalname}`]);

        // Retornamos la respuesta rápida
        res.json({ message: 'Documento subido con éxito', estado: 'NO DETECTADO' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Falla en el servidor de base de datos', detalle: err.message });
    }
});

// LISTAR DOCUMENTOS PERSONALES
router.get('/', authenticateToken, async (req, res) => {
    try {
        let sql = 'SELECT * FROM documentos_personales WHERE user_id = $1 ORDER BY fecha_carga DESC';
        let params = [req.user.id];

        if (req.user.rol === 'MASTER') {
            sql = 'SELECT d.*, u.nombres_completos as perteneciente_a FROM documentos_personales d JOIN usuarios u ON d.user_id = u.id ORDER BY d.fecha_carga DESC';
            params = [];
        }

        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al listar documentos' });
    }
});

// ELIMINAR DOCUMENTO PERSONAL
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const { id } = req.params;

        // Recuperar info para borrar archivo físico y bitácora
        const info = await db.query('SELECT ruta_archivo, nombre_archivo FROM documentos_personales WHERE id = $1 AND user_id = $2', [id, userId]);
        if (info.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });

        const fullPath = path.join(process.cwd(), info.rows[0].ruta_archivo.replace(/^\/+/, ''));
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

        await db.query('DELETE FROM documentos_personales WHERE id = $1 AND user_id = $2', [id, userId]);

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'ELIMINAR_DOC_PERSONAL', `Se eliminó el documento: ${info.rows[0].nombre_archivo}`]);

        res.json({ message: 'Documento eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// EDITAR (REEMPLAZAR) DOCUMENTO
router.put('/:id', authenticateToken, upload.single('archivo'), async (req, res) => {
    try {
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const { id } = req.params;
        const { tipo } = req.body;

        const old = await db.query('SELECT ruta_archivo FROM documentos_personales WHERE id = $1 AND user_id = $2', [id, userId]);
        if (old.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });

        let query = 'UPDATE documentos_personales SET tipo = $1 WHERE id = $2 AND user_id = $3';
        let params = [tipo, id, userId];

        if (req.file) {
            // Borrar archivo anterior
            const oldPath = path.join(process.cwd(), old.rows[0].ruta_archivo.replace(/^\/+/, ''));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            
            const rutaUrl = '/uploads/personal/' + req.file.filename;
            query = 'UPDATE documentos_personales SET tipo = $1, nombre_archivo = $2, ruta_archivo = $3, estado_vigencia = \'NO DETECTADO\', fecha_expiracion = NULL WHERE id = $4 AND user_id = $5';
            params = [tipo, req.file.originalname, rutaUrl, id, userId];
        }

        await db.query(query, params);

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'REEMPLAZAR_DOC_PERSONAL', `Se actualizó el documento ID: ${id}`]);

        res.json({ message: 'Documento actualizado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

// SERVIR DOCUMENTO (Túnel seguro)
router.get('/view/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        
        let sql = 'SELECT ruta_archivo, nombre_archivo FROM documentos_personales WHERE id = $1 AND user_id = $2';
        let params = [id, userId];

        if (req.user.rol === 'MASTER') {
            sql = 'SELECT ruta_archivo, nombre_archivo FROM documentos_personales WHERE id = $1';
            params = [id];
        }

        const result = await db.query(sql, params);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado o sin acceso' });
        
        const info = result.rows[0];
        const fullPath = path.join(process.cwd(), info.ruta_archivo.replace(/^\/+/, ''));
        
        if (!fs.existsSync(fullPath)) {
            console.log(`[RECOVERY_DOCS] Reconstruyendo documento personal desde Base64...`);
            const recovery = await db.query('SELECT archivo_base64 FROM documentos_personales WHERE id = $1', [id]);
            if (recovery.rows.length > 0 && recovery.rows[0].archivo_base64) {
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(fullPath, Buffer.from(recovery.rows[0].archivo_base64, 'base64'));
            } else {
                return res.status(404).json({ error: 'Archivo irreparable. Por favor suba de nuevo.' });
            }
        }
        
        const ext = path.extname(info.nombre_archivo).toLowerCase();
        let contentType = 'application/pdf';
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.webp') contentType = 'image/webp';

        const safeName = info.nombre_archivo;
        res.download(fullPath, safeName, (err) => {
            if (err) {
                console.error(`[DOWNLOAD_DOCS_ERROR] ${err.message}`);
                if(!res.headersSent) res.status(500).json({ error: 'Error al transferir el documento personal' });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al visualizar' });
    }
});

// ACTUALIZAR FECHA DE EXPIRACIÓN MANUALMENTE (V19)
router.patch('/:id/manual-date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const { id } = req.params;
        const { fecha_expiracion } = req.body;

        if (!fecha_expiracion) return res.status(400).json({ error: 'Fecha requerida' });

        // Calculemos el estado según la fecha manual
        const dateObj = new Date(fecha_expiracion);
        const now = new Date();
        const threshold = new Date();
        threshold.setDate(now.getDate() + 60);

        let finalState = 'VIGENTE';
        if (dateObj < now) finalState = 'VENCIDO';
        else if (dateObj <= threshold) finalState = 'PRÓXIMO_A_VENCER';

        await db.query(
            'UPDATE documentos_personales SET fecha_expiracion = $1, estado_vigencia = $2 WHERE id = $3 AND user_id = $4',
            [fecha_expiracion, finalState, id, userId]
        );

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'MANUAL_DATE_UPDATE', `Usuario estableció fecha manual: ${fecha_expiracion} para el doc ID: ${id}`]);

        res.json({ message: 'Fecha actualizada correctamente', estado: finalState });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar fecha manualmente' });
    }
});

module.exports = router;
