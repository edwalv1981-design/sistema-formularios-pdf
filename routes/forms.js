const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { authenticateToken, authenticateTokenOpcional } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const formStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(__dirname, '../uploads/formularios');
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, req.body.tipo + '_' + Date.now() + ext);
  }
});
const uploadForm = multer({ storage: formStorage });

// Subir/Actualizar plantilla (MASTER) - MODIFICADO PARA HTML
router.post('/upload', authenticateToken, uploadForm.single('archivo'), async (req, res) => {
    if (req.user.rol !== 'MASTER') return res.status(403).json({ error: 'Operación permitida solo para el MASTER' });
    
    let { id, tipo, prefijo, campos_configurados, html_content } = req.body;
    if (!tipo || !prefijo) return res.status(400).json({ error: 'Falta nombre o prefijo' });
    if (!campos_configurados) campos_configurados = '[]';
    // Se elimina la obligatoriedad de html_content para permitir el auto-generado desde pines en el frontend

    try {
        if (id) {
            // Edit mode - Verificar que el nuevo nombre no choque con otra activa
            const conflictQuery = await db.query('SELECT id FROM formularios WHERE tipo = $1 AND is_deleted = FALSE AND id <> $2', [tipo, id]);
            if (conflictQuery.rows.length > 0) return res.status(400).json({ error: 'Ya existe otra plantilla activa con ese nombre.' });

            let query = `UPDATE formularios SET tipo = $1, prefijo = $2, fecha_carga = CURRENT_TIMESTAMP, campos_configurados = $4, html_content = $5 WHERE id = $3`;
            let params = [tipo, prefijo, id, campos_configurados, html_content];
            
            if (req.file) { // Por si acaso algún fallback sube un archivo
                const rutaUrl = '/uploads/formularios/' + req.file.filename;
                query = `UPDATE formularios SET tipo = $1, prefijo = $2, nombre_archivo = $3, ruta_archivo = $4, fecha_carga = CURRENT_TIMESTAMP, campos_configurados = $6, html_content = $7 WHERE id = $5`;
                params = [tipo, prefijo, req.file.originalname, rutaUrl, id, campos_configurados, html_content];
            }
            
            await db.query(query, params);
            await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`, [req.user.id, 'ACTUALIZAR_PLANTILLA', `Master actualizó la plantilla ID: ${id}`]);
            res.json({ mensaje: 'Plantilla actualizada con éxito' });
        } else {
            // Create mode
            const existQuery = await db.query('SELECT id FROM formularios WHERE tipo = $1 AND is_deleted = FALSE', [tipo]);
            if (existQuery.rows.length > 0) return res.status(400).json({ error: 'Ya existe una plantilla activa con ese nombre. Modifica la existente o usa otro nombre.' });

            let nombreArchivo = null;
            let rutaUrl = null;
            if (req.file) {
                nombreArchivo = req.file.originalname;
                rutaUrl = '/uploads/formularios/' + req.file.filename;
            } else {
                return res.status(400).json({ error: 'Debe adjuntar obligatoriamente un archivo de referencia (PDF) para crear la plantilla.' });
            }

            await db.query(`INSERT INTO formularios (tipo, nombre_archivo, ruta_archivo, prefijo, campos_configurados, html_content) VALUES ($1, $2, $3, $4, $5, $6)`, [tipo, nombreArchivo, rutaUrl, prefijo, campos_configurados, html_content]);
            
            // Bitácora
            await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [req.user.id, 'CREAR_PLANTILLA', `Master creó nueva plantilla: ${tipo} (${prefijo})`]);
              
            res.json({ mensaje: 'Plantilla creada con éxito' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor al procesar el archivo' });
    }
});

// Obtener plantillas (Público para el Registro y Dashboard)
router.get('/', authenticateTokenOpcional, async (req, res) => {
    try {
        let rows = [];
        const baseQuery = await db.query(`SELECT id, tipo, prefijo, nombre_archivo, ruta_archivo, fecha_carga, campos_configurados, html_content FROM formularios WHERE is_deleted = FALSE ORDER BY fecha_carga DESC`);
        rows = baseQuery.rows;

        // Filtrar según el Rol
        if (req.user && req.user.rol === 'ADICIONAL') {
            // Check Extended permissions from Checkboxes
            const permQ = await db.query(`SELECT tipo_formulario FROM usuario_permisos_formulario WHERE id_usuario = $1`, [req.user.id]);
            const permittedTypes = permQ.rows.map(r => r.tipo_formulario);

            // Filter strictly by granted permissions
            rows = rows.filter(f => permittedTypes.includes(f.tipo));
        } else if (req.user && req.user.rol === 'EMPRESA') {
            // El administrador de empresa solo ve la plantilla original con la que se registró
            const usrQ = await db.query(`SELECT tipo_formulario FROM usuarios WHERE id = $1`, [req.user.id]);
            const baseType = usrQ.rows.length ? usrQ.rows[0].tipo_formulario : null;
            rows = rows.filter(f => f.tipo === baseType);
        }

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error obteniendo plantillas' });
    }
});

// Servir PDF de plantilla (Protegido) - MOVIDO AQUÍ PARA EVITAR SHADOWING
router.get('/view/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('SELECT ruta_archivo FROM formularios WHERE id = $1::int AND is_deleted = FALSE', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Plantilla no encontrada' });
        
        const rutaOriginal = result.rows[0].ruta_archivo;
        const rutaLimpia = rutaOriginal.replace(/^\/+/, '');
        const fullPath = path.join(process.cwd(), rutaLimpia);
        
        if (!fs.existsSync(fullPath)) {
            console.error(`[PDF_VIEW] Archivo no existe en: ${fullPath}`);
            return res.status(404).json({ error: 'Archivo físico no encontrado' });
        }
        
        res.setHeader('Content-Type', 'application/pdf');
        const fileStream = fs.createReadStream(fullPath);
        fileStream.on('error', (err) => {
            console.error(`[STREAM_ERROR] ${err.message}`);
            if(!res.headersSent) res.status(500).json({ error: 'Error al transmitir el documento' });
        });
        fileStream.pipe(res);
    } catch (err) {
        console.error('[CRITICAL_PDF_VIEW]', err);
        res.status(500).json({ error: 'Error interno sirviendo PDF' });
    }
});

// Obtener una plantilla específica
router.get('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    console.log(`[DEBUG_HIT] Consultando metadata para ID: ${id} (Usuario: ${req.user.id}, Rol: ${req.user.rol})`);
    
    try {
        const result = await db.query('SELECT id, tipo, prefijo, nombre_archivo, ruta_archivo, campos_configurados FROM formularios WHERE id = $1::int AND is_deleted = FALSE', [id]);
        
        if (result.rows.length === 0) {
            console.warn(`[METADATA_NOT_FOUND] No se encontró plantilla activa con ID: ${id}`);
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }
        
        console.log(`[METADATA_SUCCESS] Plantilla encontrada: ${result.rows[0].tipo}`);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[GET_METADATA_ERROR]', err);
        res.status(500).json({ error: 'Error obteniendo metadata de plantilla (Falla DB/Cast)' });
    }
});

// Eliminar Plantilla (Soft Delete)
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'MASTER') return res.status(403).json({ error: 'Operación permitida solo para el MASTER' });
    
    const { id } = req.params;
    try {
        console.log(`[DELETE] Intentando eliminar plantilla ID: ${id} por MASTER: ${req.user.identificacion}`);
        
        // 1. Marcar como borrada (Usando comillas y cast para máxima compatibilidad)
        const result = await db.query('UPDATE "formularios" SET "is_deleted" = true WHERE "id" = $1::int RETURNING "tipo"', [id]);
        
        if (result.rows.length === 0) {
            console.warn(`[DELETE] No se encontró la plantilla con ID: ${id}`);
            return res.status(404).json({ error: 'La plantilla no existe o su identificador es inválido.' });
        }

        const tipo = result.rows[0].tipo;
        console.log(`[DELETE] Plantilla "${tipo}" marcada como eliminada.`);

        // 2. Bitácora silenciada (Para que no bloquee el éxito si falla)
        db.query('INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)',
            [req.user.id, 'ELIMINAR_PLANTILLA', `Master eliminó plantilla: ${tipo}`])
            .catch(e => console.error('Error silencioso en bitácora:', e.message));

        res.json({ mensaje: 'Plantilla eliminada correctamente.' });
    } catch (err) {
        console.error('ERROR CRÍTICO AL ELIMINAR:', err);
        const fs = require('fs');
        const path = require('path');
        fs.appendFileSync(path.join(__dirname, '../debug_delete_error.txt'), `[${new Date().toLocaleString()}] ID: ${id} - Error: ${err.message}\n`);
        res.status(500).json({ error: `Fallo interno de base de datos: ${err.message}` });
    }
});


module.exports = router;
