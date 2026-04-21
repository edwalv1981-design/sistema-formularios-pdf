const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { validateDigitalSignature } = require('../utils/signature_utils');

// Almacenamiento para Ediciones Certificadas
const storageFinal = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/ediciones_finales/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-SIGNED-' + file.originalname);
    }
});
const uploadFinal = multer({ storage: storageFinal });

// GUARDAR EDICIÓN (CON LÓGICA DE REGISTRO ÚNICO POR PLANTILLA)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { plantilla_id, nombre_archivo, datos_json } = req.body;
        const userId = req.user.id; 
        const idEmpresa = req.user.id_empresa || userId;

        // VERIFICACIÓN DE AGENTE: ¿Ya existe un borrador pendiente para esta plantilla y usuario?
        const existing = await db.query(
            'SELECT id FROM documento_ediciones WHERE user_id = $1 AND plantilla_id = $2 AND estado_firma = $3',
            [userId, plantilla_id, 'PENDIENTE']
        );

        if (existing.rows.length > 0) {
            const idComp = existing.rows[0].id;
            // SOBRESCRITURA AUTOMÁTICA (MODO CONSOLIDADO)
            await db.query(
                'UPDATE documento_ediciones SET datos_json = $1, fecha_creacion = NOW() WHERE id = $2',
                [JSON.stringify(datos_json), idComp]
            );
            
            await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
                [userId, idEmpresa, 'GUARDAR_EDICION', `Borrador consolidado (sobrescrito) para: ${nombre_archivo}`]);
            
            return res.json({ message: 'Borrador actualizado correctamente', id: idComp });
        }

        const result = await db.query(
            'INSERT INTO documento_ediciones (user_id, plantilla_id, nombre_archivo_original, datos_json) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, plantilla_id, nombre_archivo, JSON.stringify(datos_json)]
        );

        // Registro en Bitácora
        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'GUARDAR_EDICION', `Nueva edición iniciada para: ${nombre_archivo}`]);

        res.json({ message: 'Guardado correctamente', id: result.rows[0].id });
    } catch (err) {
        console.error('DB_ERROR_EDICION:', err);
        res.status(500).json({ 
            error: 'Falla al guardar edición',
            detalle: err.message,
            codigo: err.code 
        });
    }
});

// ACTUALIZAR EDICIÓN (SOBRESCRITURA DE BORRADOR)
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { datos_json } = req.body;
        const userId = req.user.id; 
        const idEmpresa = req.user.id_empresa || userId;

        const result = await db.query(
            'UPDATE documento_ediciones SET datos_json = $1, fecha_creacion = NOW() WHERE id = $2 AND user_id = $3 RETURNING nombre_archivo_original',
            [JSON.stringify(datos_json), id, userId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Edición no encontrada o sin permisos' });

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'ACTUALIZAR_EDICION', `La edición fue sobrescrita en caliente para: ${result.rows[0].nombre_archivo_original}`]);

        res.json({ message: 'Edición actualizada', id: id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Falla al actualizar edición' });
    }
});

// LISTAR EDICIONES
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await db.query(
            'SELECT * FROM documento_ediciones WHERE user_id = $1 ORDER BY fecha_creacion DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al listar' });
    }
});

// ELIMINAR EDICIÓN
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const { id } = req.params;

        // Recuperar info antes de borrar para el log
        const info = await db.query('SELECT nombre_archivo_original FROM documento_ediciones WHERE id = $1 AND user_id = $2', [id, userId]);
        if (info.rows.length === 0) return res.status(404).json({ error: 'Edición no encontrada' });

        await db.query('DELETE FROM documento_ediciones WHERE id = $1 AND user_id = $2', [id, userId]);

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'ELIMINAR_EDICION', `Se eliminó la edición del documento: ${info.rows[0].nombre_archivo_original}`]);

        res.json({ message: 'Eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Falla al eliminar' });
    }
});

// ACTUALIZAR ESTADO DE FIRMA
router.patch('/:id/firma', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;
        const { id } = req.params;
        const { estado } = req.body; // 'FIRMADO' o 'PENDIENTE'

        const result = await db.query(
            'UPDATE documento_ediciones SET estado_firma = $1 WHERE id = $2 AND user_id = $3 RETURNING nombre_archivo_original',
            [estado, id, userId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Edición no encontrada' });

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'ACTUALIZAR_FIRMA', `Estado de firma cambiado a ${estado} para: ${result.rows[0].nombre_archivo_original}`]);

        res.json({ message: 'Estado de firma actualizado' });
    } catch (err) {
        res.status(500).json({ error: 'Falla al actualizar estado' });
    }
});

// CERTIFICAR Y SUBIR FIRMADO (RIGOR TÉCNICO)
router.post('/:id/certificar', authenticateToken, uploadFinal.single('archivo'), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const idEmpresa = req.user.id_empresa || userId;

        if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });

        // EL AGENTE EXPERTO VALIDA
        const isValid = await validateDigitalSignature(req.file.path);

        if (!isValid) {
            fs.unlinkSync(req.file.path); // Borrar intento fallido
            return res.status(422).json({ error: 'Diagnóstico: El Agente no detectó una firma digital válida en este documento.' });
        }

        const rutaUrl = '/' + req.file.path.replace(/\\/g, '/');
        
        await db.query(
            'UPDATE documento_ediciones SET estado_firma = $1, ruta_archivo_firmado = $2 WHERE id = $3 AND user_id = $4',
            ['FIRMADO', rutaUrl, id, userId]
        );

        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'CERTIFICAR_EDICION', `Certificación técnica exitosa para el archivo ${req.file.originalname}. Estado cambiado a FIRMADO.`]);

        res.json({ message: 'Documento certificado con éxito por el Agente Experto.', status: 'FIRMADO' });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.error(err);
        res.status(500).json({ error: 'Falla crítica en el Agente de Certificación' });
    }
});

module.exports = router;
