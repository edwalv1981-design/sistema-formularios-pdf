const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');
const docx = require('docx');
const nodemailer = require('nodemailer');

const storageDir = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(__dirname, '../uploads/digitalizados');
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, 'DOC_DIGITAL_' + Date.now() + ext);
  }
});
const uploadDigit = multer({ storage: storageDir });

// Endpoint para guardar datos digitalizados en JSONB
const uploadCampos = uploadDigit.fields([{ name: 'archivo', maxCount: 1 }, { name: 'anexos', maxCount: 5 }]);

router.post('/', authenticateToken, uploadCampos, async (req, res) => {
    const { id_formulario, datos_json, estado, id_usuario_propietario, html_content_personalizado } = req.body;
    
    const VALID_STATES = ['PENDIENTE', 'PENDIENTE FIRMA', 'FINALIZADO'];
    const finalState = VALID_STATES.includes(estado) ? estado : 'PENDIENTE';

    if (!id_formulario || !datos_json) {
        return res.status(400).json({ error: 'El id_formulario y JSON transcrito son obligatorios' });
    }
    
    const reqArchivo = req.files && req.files['archivo'] ? req.files['archivo'][0] : null;
    if (finalState === 'FINALIZADO' && !reqArchivo) {
        return res.status(400).json({ error: 'Para marcar como FINALIZADO, es obligatorio adjuntar el archivo físico (PDF) con las firmas correspondientes como evidencia.' });
    }

    try {
        let ownerId = req.user.id;
        let ownerCod = null;

        if (id_usuario_propietario && req.user.rol !== 'ADICIONAL') {
            const tgtQuery = await db.query(`SELECT id, id_empresa, codigo_unico, identificacion FROM usuarios WHERE id = $1`, [id_usuario_propietario]);
            if(tgtQuery.rows.length === 0) return res.status(404).json({ error: 'Usuario propietario no encontrado' });
            
            const target = tgtQuery.rows[0];
            if (req.user.rol === 'EMPRESA') {
                const miEmpresa = req.user.id_empresa || req.user.id;
                if(target.id_empresa !== miEmpresa) return res.status(403).json({ error: 'Solo la matriz puede digitalizar para sus empleados' });
            }
            ownerId = target.id;
            ownerCod = target.codigo_unico || target.identificacion;
        } else {
            const selfQ = await db.query(`SELECT codigo_unico, identificacion FROM usuarios WHERE id = $1`, [req.user.id]);
            const self = selfQ.rows[0];
            ownerCod = self.codigo_unico || self.identificacion;
        }

        const rutaUrl = reqArchivo ? '/uploads/digitalizados/' + reqArchivo.filename : null;
        
        let anexosGuardar = [];
        if (req.files && req.files['anexos']) {
            req.files['anexos'].forEach(f => {
                anexosGuardar.push('/uploads/digitalizados/' + f.filename);
            });
        }
        
        const parsedData = typeof datos_json === 'string' ? JSON.parse(datos_json) : datos_json;
        const insertQuery = `INSERT INTO formularios_llenos (id_usuario, codigo_unico, id_formulario, datos_completados, ruta_pdf_generado, estado, anexos_adicionales, html_content_personalizado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
        
        await db.query(insertQuery, [ownerId, ownerCod, id_formulario, JSON.stringify(parsedData), rutaUrl, finalState, JSON.stringify(anexosGuardar), html_content_personalizado]);
        
        let msgBitacora = `El usuario guardó digitalización (${finalState}). (Plantilla ID: ${id_formulario})`;
        if(ownerId !== req.user.id) msgBitacora = `(Delegación) Jefe guardó digitalización (${finalState}) a nombre del operador ID:${ownerId}. Plantilla: ${id_formulario}`;

        // Registrar la matriz en la Bitacora
        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [req.user.id, 'DIGITALIZAR_FORMULARIO', msgBitacora]);

        res.json({ mensaje: `Documento procesado y digitalizado en Postgres como ${finalState} con éxito` });
    } catch(err) {
        console.error('ERROR JSONB POST:', err);
        res.status(500).json({ error: 'Error interno conectando con el motor JSONB de Postgres: ' + err.message });
    }
});

// Endpoint para ACTUALIZAR un borrador
router.put('/:id', authenticateToken, uploadCampos, async (req, res) => {
    const { id } = req.params;
    const { datos_json, estado, html_content_personalizado } = req.body;
    const VALID_STATES = ['PENDIENTE', 'PENDIENTE FIRMA', 'FINALIZADO'];
    const finalState = VALID_STATES.includes(estado) ? estado : 'PENDIENTE';

    if (!datos_json) return res.status(400).json({ error: 'JSON transcrito obligatorio' });
    
    try {
        // Verificar existencia y propiedad
        const existQ = await db.query(`SELECT * FROM formularios_llenos WHERE id = $1`, [id]);
        if (existQ.rows.length === 0) return res.status(404).json({ error: 'Digitalización no encontrada' });
        const doc = existQ.rows[0];

        const reqArchivo = req.files && req.files['archivo'] ? req.files['archivo'][0] : null;

        if (finalState === 'FINALIZADO' && !reqArchivo && !doc.ruta_pdf_generado) {
            return res.status(400).json({ error: 'Para marcar como FINALIZADO, es obligatorio adjuntar el archivo físico (PDF) con las firmas correspondientes como evidencia.' });
        }

        const rutaUrl = reqArchivo ? '/uploads/digitalizados/' + reqArchivo.filename : doc.ruta_pdf_generado;
        
        let anexosViejos = doc.anexos_adicionales || [];
        if (req.files && req.files['anexos']) {
            req.files['anexos'].forEach(f => {
                anexosViejos.push('/uploads/digitalizados/' + f.filename);
            });
        }
        const parsedData = typeof datos_json === 'string' ? JSON.parse(datos_json) : datos_json;
        await db.query(`UPDATE formularios_llenos SET datos_completados = $1, estado = $2, ruta_pdf_generado = $3, anexos_adicionales = $5, html_content_personalizado = $6 WHERE id = $4`, 
            [JSON.stringify(parsedData), finalState, rutaUrl, id, JSON.stringify(anexosViejos), html_content_personalizado]);

        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
              [req.user.id, 'ACTUALIZAR_BORRADOR', `Se actualizó el documento ID ${id} a estado ${finalState}`]);

        res.json({ mensaje: `Borrador actualizado y guardado como ${finalState} correctamente` });
    } catch(err) {
        console.error('ERROR JSONB PUT:', err);
        res.status(500).json({ error: 'Error interno actualizando borrador JSONB: ' + err.message });
    }
});

// Obtener documentos digitalizados (Con Filtros de Búsqueda)
router.get('/', authenticateToken, async (req, res) => {
    const { fecha_desde, fecha_hasta, q, estado } = req.query;

    try {
        let qs = `
            SELECT d.id, d.estado, f.tipo as plantilla_tipo, f.id as plantilla_id, u.nombres_completos as digitador, r.nombre as rol, 
                   d.datos_completados as datos_extraidos, d.ruta_pdf_generado as ruta_archivo, d.anexos_adicionales, 
                   d.fecha_guardado as fecha_registro, d.html_content_personalizado 
            FROM formularios_llenos d 
            JOIN formularios f ON d.id_formulario = f.id 
            JOIN usuarios u ON d.id_usuario = u.id 
            JOIN roles r ON u.id_rol = r.id
            WHERE d.is_deleted = FALSE
        `;
        let values = [];
        let index = 1;

        if (req.user.rol === 'EMPRESA') {
            qs += ` AND u.id_empresa = $${index++} `;
            values.push(req.user.id_empresa || req.user.id);
        } else if (req.user.rol === 'ADICIONAL') {
            qs += ` AND d.id_usuario = $${index++} `;
            values.push(req.user.id);
        }

        if (fecha_desde) {
            qs += ` AND d.fecha_guardado >= $${index++} `;
            values.push(fecha_desde + " 00:00:00");
        }
        if (fecha_hasta) {
            qs += ` AND d.fecha_guardado <= $${index++} `;
            values.push(fecha_hasta + " 23:59:59");
        }
        if (q) {
            qs += ` AND (f.tipo ILIKE $${index} OR u.nombres_completos ILIKE $${index}) `;
            values.push('%' + q + '%');
            index++;
        }
        if (estado) {
            qs += ` AND d.estado = $${index++} `;
            values.push(estado);
        }

        qs += ` ORDER BY d.fecha_guardado DESC LIMIT 200 `;

        const { rows } = await db.query(qs, values);
        res.json(rows);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Error obteniendo historial' });
    }
});

// Duplicar Registro
router.post('/duplicar/:id', authenticateToken, async (req, res) => {
    try {
        const original = await db.query(`SELECT * FROM formularios_llenos WHERE id = $1`, [req.params.id]);
        if (original.rows.length === 0) return res.status(404).json({ error: 'No existe el registro original' });

        const o = original.rows[0];
        const newDoc = await db.query(
            `INSERT INTO formularios_llenos (id_formulario, id_usuario, codigo_unico, datos_completados, estado, html_content_personalizado) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [o.id_formulario, req.user.id, o.codigo_unico, o.datos_completados, 'PENDIENTE', o.html_content_personalizado]
        );

        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`, 
            [req.user.id, 'DIGITALIZAR_FORMULARIO', `Duplicó registro #${req.params.id} -> Nuevo #${newDoc.rows[0].id}`]);

        res.json({ mensaje: 'Registro duplicado exitosamente (como borrador)', id: newDoc.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al duplicar' });
    }
});

// Borrado Lógico
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await db.query(`UPDATE formularios_llenos SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`, 
            [req.user.id, 'ELIMINAR_FORMULARIO', `Eliminó registro digitalizado ID: ${req.params.id}`]);
        res.json({ mensaje: 'Registro eliminado con éxito' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// ========================================================
// MÓDULO DE EXPORTACIÓN (PDF, Word, Email)
// ========================================================

async function generatePDFBuffer(id) {
    // Obtener documento y plantilla
    const docQuery = await db.query(`
        SELECT d.*, f.ruta_archivo 
        FROM formularios_llenos d 
        JOIN formularios f ON d.id_formulario = f.id 
        WHERE d.id = $1`, [id]);
    
    if (docQuery.rows.length === 0) throw new Error('Documento no encontrado');
    const doc = docQuery.rows[0];

    if (!doc.ruta_archivo) throw new Error('La plantilla original no tiene un archivo PDF asociado.');

    // Leer PDF original del filesystem
    const relativePath = doc.ruta_archivo.startsWith('/') ? doc.ruta_archivo.substring(1) : doc.ruta_archivo;
    const pdfPath = path.resolve(__dirname, '..', relativePath);
    
    if (!fs.existsSync(pdfPath)) {
        console.error('PDF No encontrado en:', pdfPath);
        throw new Error('Archivo PDF original no encontrado en disco en: ' + pdfPath);
    }
    const pdfBytes = fs.readFileSync(pdfPath);
    
    // Cargar PDF interactivo
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // Parsear datos
    let extraidos = [];
    try {
        if (doc.datos_completados) {
            extraidos = typeof doc.datos_completados === 'string' ? JSON.parse(doc.datos_completados) : doc.datos_completados;
            // Doble parseo si es necesario (Postgres JSONB sometimes returns stringified string)
            if (typeof extraidos === 'string') extraidos = JSON.parse(extraidos);
        }
    } catch(e) {
        console.error('Error parseando datos JSON:', e);
    }

    // Dibujar cada anotación sobre el PDF
    for (const anota of extraidos) {
        const pageNum = parseInt(anota.page || 1) - 1;
        if (pageNum >= 0 && pageNum < pages.length) {
            const page = pages[pageNum];
            
            // Si el cliente envió coordenadas NATIVAS extraidas de la matriz original PDF:
            if (anota.nx !== undefined && anota.nx !== null && anota.ny !== undefined && anota.ny !== null) {
                const nx = anota.nx;
                const ny = anota.ny; // baseline nativo 
                const nw = anota.nw || 50;

                if (anota.type === 'check') {
                    // Estandarizar si escribe una minúscula o usar X por defecto
                    const checkChar = anota.val ? anota.val.toUpperCase() : 'X';
                    // Para checkbox, anulamos el desfase lateral negativo que existía
                    // y aplicamos una compensación severa (-11pt) al baseline debido a que
                    // los iconos de checkbox por su tamaño elevan drásticamente la gravedad.
                    page.drawText(String(checkChar), { x: nx, y: ny - 10, size: 14, color: rgb(0, 0, 0) });
                } else {
                    // MÁSCARA ANTI-GHOSTING NATIIVA: Dibujamos un bloque blanco del ancho exacto del texto original impreso
                    page.drawRectangle({
                        x: nx - 1,
                        y: ny - 10, // bajamos el rectángulo a la equivalencia real para envolver la caja nativa
                        width: nw + 4,
                        height: anota.fsize ? (anota.fsize * 1.5) : 14,
                        color: rgb(1, 1, 1) // White solid block
                    });
                    // Imprimir texto de usuario ALINEADO PERFECTO A LA LÍNEA BASE ORIGINAL y AL TAMAÑO PERFECTO
                    const finalFontSize = anota.fsize ? parseFloat(anota.fsize) : 11;
                    // Conversión isométrica estricta de Top-Left (CSS) al Baseline Inverso (PDF): descender aprox el ~90% de su propia altura
                    const offsetBaseline = finalFontSize * 0.9; 
                    page.drawText(String(anota.val || ''), { x: nx, y: ny - offsetBaseline, size: finalFontSize, color: rgb(0, 0, 0) });
                }
            } else {
                // FALLBACK: Coordenadas por porcentaje CSS antiguo si no hay nativas (retrocompatibilidad)
                const px = (parseFloat(anota.x) / 100) * page.getWidth();
                const py = page.getHeight() - ((parseFloat(anota.y) / 100) * page.getHeight());

                if (anota.type === 'check') {
                    // Fallback para check
                    const checkChar = anota.val ? anota.val.toUpperCase() : 'X';
                    page.drawText(checkChar, { x: px + 2, y: py - 9, size: 14, color: rgb(0, 0, 0) });
                } else {
                    // MÁSCARA FALLBACK: Estimada, asume ancho de 250px cubriendo el ghost original
                    page.drawRectangle({
                        x: px - 2,
                        y: py - 9, // Bajada equivalente para envolver el div css
                        width: 300,
                        height: 14,
                        color: rgb(1, 1, 1)
                    });
                    // Conservamos fidelidad 1:1, asumiendo una altura de font general de ~11pt, se desciende para emular Top-Left
                    page.drawText(String(anota.val || ''), { x: px, y: py - 10, size: 11, color: rgb(0, 0, 0) });
                }
            }
        }
    }

    return await pdfDoc.save();
}

// 1. Exportar a PDF Redibujado
router.get('/export/:id/pdf', async (req, res) => {
    try {
        const pdfBuffer = await generatePDFBuffer(req.params.id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Documento_Digital_${req.params.id}.pdf`);
        res.send(Buffer.from(pdfBuffer));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generando PDF: ' + err.message);
    }
});

// 2. Exportar a Word Estructurado
router.get('/export/:id/word', async (req, res) => {
    try {
        const docQuery = await db.query(`
            SELECT d.*, f.tipo as plantilla_tipo 
            FROM formularios_llenos d 
            JOIN formularios f ON d.id_formulario = f.id 
            WHERE d.id = $1`, [req.params.id]);
        
        if (docQuery.rows.length === 0) return res.status(404).send('Documento no encontrado');
        const doc = docQuery.rows[0];

        let extraidos = [];
        if (doc.datos_completados) {
            try {
                extraidos = typeof doc.datos_completados === 'string' ? JSON.parse(doc.datos_completados) : doc.datos_completados;
                if (typeof extraidos === 'string') extraidos = JSON.parse(extraidos);
            } catch(e) {}
        }

        const tableRows = extraidos.map(item => {
            return new docx.TableRow({
                children: [
                    new docx.TableCell({ width: { size: 40, type: docx.WidthType.PERCENTAGE }, children: [new docx.Paragraph({ text: item.id, bold: true })], margins: { top: 100, bottom: 100, left: 100 } }),
                    new docx.TableCell({ width: { size: 60, type: docx.WidthType.PERCENTAGE }, children: [new docx.Paragraph(String(item.val || ''))], margins: { top: 100, bottom: 100, left: 100 } })
                ]
            });
        });

        // Tabla Header
        tableRows.unshift(new docx.TableRow({
            children: [
                new docx.TableCell({ shading: { fill: 'EEEEEE' }, children: [new docx.Paragraph({ text: 'Campo', bold: true })] }),
                new docx.TableCell({ shading: { fill: 'EEEEEE' }, children: [new docx.Paragraph({ text: 'Valor Registrado', bold: true })] })
            ]
        }));

        const wordDoc = new docx.Document({
            sections: [{
                properties: {},
                children: [
                    new docx.Paragraph({ text: `Registro Digitalizado: ${doc.plantilla_tipo}`, heading: docx.HeadingLevel.HEADING_1 }),
                    new docx.Paragraph({ text: `ID: #${doc.id} | Fecha: ${new Date(doc.fecha_guardado).toLocaleString()}` }),
                    new docx.Paragraph({ text: "" }), // Espacio
                    new docx.Table({ rows: tableRows, width: { size: 100, type: docx.WidthType.PERCENTAGE } })
                ]
            }]
        });

        const buffer = await docx.Packer.toBuffer(wordDoc);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=Registro_${req.params.id}.docx`);
        res.send(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generando Word');
    }
});

// 3. Enviar por Correo Electrónico
router.post('/export/:id/email', express.json(), async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Falta proveer un correo destino.' });

        const pdfBuffer = await generatePDFBuffer(req.params.id);

        // Usar Ethereal SMTP como predeterminado (O variables de entorno si existen)
        let transporter;
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT || 587,
                secure: false, 
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
        } else {
            // Ethereal auto-generado para pruebas si no hay SMTP
            let testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass }
            });
        }

        const info = await transporter.sendMail({
            from: '"Sistema de Formularios" <no-reply@sistema.local>',
            to: email,
            subject: `Documento Digitalizado #${req.params.id}`,
            text: 'Adjunto enviamos el documento electrónico procesado por nuestro sistema.',
            attachments: [
                { filename: `Documento_${req.params.id}.pdf`, content: Buffer.from(pdfBuffer), contentType: 'application/pdf' }
            ]
        });

        res.json({ mensaje: 'Correo enviado. Revisa la bandeja de entrada.', previewUrl: process.env.SMTP_USER ? null : nodemailer.getTestMessageUrl(info) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno al despachar correo.' });
    }
});

module.exports = router;
