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
            
            if (req.file) { 
                const rutaUrl = '/uploads/formularios/' + req.file.filename;
                const archivoBase64 = fs.readFileSync(req.file.path).toString('base64');
                query = `UPDATE formularios SET tipo = $1, prefijo = $2, nombre_archivo = $3, ruta_archivo = $4, fecha_carga = CURRENT_TIMESTAMP, campos_configurados = $6, html_content = $7, archivo_base64 = $8 WHERE id = $5`;
                params = [tipo, prefijo, req.file.originalname, rutaUrl, id, campos_configurados, html_content, archivoBase64];
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

            const archivoBase64 = fs.readFileSync(req.file.path).toString('base64');
            await db.query(`INSERT INTO formularios (tipo, nombre_archivo, ruta_archivo, prefijo, campos_configurados, html_content, archivo_base64) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [tipo, nombreArchivo, rutaUrl, prefijo, campos_configurados, html_content, archivoBase64]);
            
            // Bitácora
            await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [req.user.id, 'CREAR_PLANTILLA', `Master creó nueva plantilla: ${tipo} (${prefijo})`]);
              
            res.json({ mensaje: 'Plantilla creada con éxito' });
        }
    } catch (err) {
        console.error('DB_ERROR:', err);
        res.status(500).json({ 
            error: 'Error del servidor al procesar el archivo', 
            detalle: err.message,
            codigo: err.code 
        });
    }
});

// Obtener plantillas (Público para el Registro y Dashboard)
router.get('/', authenticateTokenOpcional, async (req, res) => {
    try {
        let rows = [];
        const baseQuery = await db.query(`SELECT id, tipo, prefijo, nombre_archivo, ruta_archivo, fecha_carga, campos_configurados, html_content FROM formularios WHERE is_deleted = FALSE ORDER BY fecha_carga DESC`);
        rows = baseQuery.rows;

        // --- DIAGNÓSTICO DE RAÍZ: LOGS DE FILTRADO ---
        const userContext = req.user ? `[User:${req.user.id} Rol:${req.user.rol} Empresa:${req.user.id_empresa}]` : '[Público]';
        console.log(`[FORMS_REQ] ${userContext} Solicitando catálogo de formularios...`);

        // Filtrar según el Rol
        if (req.user && req.user.rol === 'ADICIONAL') {
            const parentId = req.user.id_empresa; 
            if(!parentId) {
                console.warn(`[FORMS_WARN] Adicional ${req.user.id} no tiene id_empresa definido. Acceso denegado.`);
                rows = []; 
            } else {
                const parentQuery = await db.query(`SELECT tipo_formulario FROM usuarios WHERE id = $1`, [parentId]);
                const parentBaseType = parentQuery.rows.length ? parentQuery.rows[0].tipo_formulario : null;

                const parentExtendedPerms = await db.query(`SELECT tipo_formulario FROM usuario_permisos_formulario WHERE id_usuario = $1`, [parentId]);
                const parentPermittedTypes = parentExtendedPerms.rows.map(r => r.tipo_formulario.toLowerCase().trim());

                const selfExtendedPerms = await db.query(`SELECT tipo_formulario FROM usuario_permisos_formulario WHERE id_usuario = $1`, [req.user.id]);
                const selfPermittedTypes = selfExtendedPerms.rows.map(r => r.tipo_formulario.toLowerCase().trim());

                const normParentBase = parentBaseType ? parentBaseType.toLowerCase().trim() : null;

                rows = rows.filter(f => {
                   const normForm = f.tipo.toLowerCase().trim();
                   const isBase = normForm === normParentBase;
                   const inParentPerms = parentPermittedTypes.includes(normForm);
                   const inSelfPerms = selfPermittedTypes.includes(normForm);
                   return isBase || inParentPerms || inSelfPerms;
                });
                console.log(`[FORMS_RESULT] Adicional ${req.user.id} heredó ${rows.length} formularios de empresa ${parentId}`);
            }
        } else if (req.user && (req.user.rol === 'EMPRESA')) {
            const usrQ = await db.query(`SELECT tipo_formulario FROM usuarios WHERE id = $1`, [req.user.id]);
            const baseType = usrQ.rows.length ? usrQ.rows[0].tipo_formulario : null;
            
            const extendedPerms = await db.query(`SELECT tipo_formulario FROM usuario_permisos_formulario WHERE id_usuario = $1`, [req.user.id]);
            const permittedTypes = extendedPerms.rows.map(r => r.tipo_formulario.toLowerCase().trim());
            
            const normBase = baseType ? baseType.toLowerCase().trim() : null;

            rows = rows.filter(f => {
                const normForm = f.tipo.toLowerCase().trim();
                return normForm === normBase || permittedTypes.includes(normForm);
            });
            console.log(`[FORMS_RESULT] Empresa ${req.user.id} tiene acceso a ${rows.length} formularios`);
        } else if (req.user && req.user.rol === 'MASTER') {
            console.log(`[FORMS_RESULT] Master ${req.user.id} tiene acceso TOTAL (${rows.length} formularios)`);
        } else {
            console.log(`[FORMS_RESULT] Acceso Público/Invitado: Retornando catálogo total (${rows.length} formularios)`);
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
        // Usar process.cwd() para entornos productivos (Railway)
        const fullPath = path.join(process.cwd(), rutaLimpia);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`[RECOVERY_ENGINE] El archivo físico no existe. Intentando reconstrucción desde Base64...`);
            const recovery = await db.query('SELECT archivo_base64 FROM formularios WHERE id = $1', [id]);
            
            if (recovery.rows.length > 0 && recovery.rows[0].archivo_base64) {
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(fullPath, Buffer.from(recovery.rows[0].archivo_base64, 'base64'));
                console.log(`[RECOVERY_ENGINE] ÉXITO: Archivo reconstruido en ${fullPath}`);
            } else {
                console.error(`[RECOVERY_ENGINE] FALLO: No hay backup Base64 para esta plantilla.`);
                return res.status(404).json({ 
                    error: 'Error de persistencia persistente',
                    detalle: 'No fue posible reconstruir el archivo. Por favor, vuelva a subir la plantilla.',
                    codigo: 'FATAL_FILE_LOSS'
                });
            }
        }
        
        res.setHeader('Content-Type', 'application/pdf');
        const fileStream = fs.createReadStream(fullPath);
        fileStream.on('error', (err) => {
            console.error(`[STREAM_ERROR] ${err.message}`);
            if(!res.headersSent) res.status(500).json({ error: 'Error al transmitir el documento', detalle: err.message });
        });
        fileStream.pipe(res);
    } catch (err) {
        console.error('[CRITICAL_PDF_VIEW]', err);
        res.status(500).json({ error: 'Error interno sirviendo PDF', detalle: err.message });
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
