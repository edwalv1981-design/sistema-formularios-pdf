const express = require('express');
const router = express.Router();
const db = require('../db'); // Asumiendo que existe db.js en la raíz o similar
const { generatePDF } = require('../utils/pdfGenerator');
const { generateWord } = require('../utils/wordGenerator');
const { sendEmailWithAttachment } = require('../utils/mailer');

// Middleware para validar que el usuario está autenticado (asumiendo que existe)
const { authenticateToken } = require('../middleware/auth'); // Ajustar ruta si es necesario

// Helper para obtener datos del documento y su plantilla
async function getDocumentData(id) {
    const query = `
        SELECT dl.id, dl.datos_completados as datos, f.tipo as plantilla_tipo, f.html_content as plantilla_html
        FROM formularios_llenos dl
        JOIN formularios f ON dl.id_formulario = f.id
        WHERE dl.id = $1
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0];
}

// Generar HTML final inyectando datos en la plantilla
function buildFinalHtml(plantillaHtml, datos) {
    if (!plantillaHtml) return `<p>Sin contenido</p>`;
    let html = plantillaHtml;
    // Simple placeholder replacement if needed, or structured table if template is empty
    if (datos && Array.isArray(datos)) {
        datos.forEach(campo => {
            // Buscamos inputs o placeholders específicos si el sistema los usa
            const regex = new RegExp(`name="${campo.id}"[^>]*value="[^"]*"|placeholder="${campo.id}"`, 'g');
            html = html.replace(regex, (match) => {
                return `value="${campo.val}"`;
            });
        });
    }
    return html;
}

// 1. Exportar PDF
router.get('/:id/pdf', authenticateToken, async (req, res) => {
    try {
        const doc = await getDocumentData(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

        const finalHtml = buildFinalHtml(doc.plantilla_html, doc.datos);
        const pdfBuffer = await generatePDF(finalHtml);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=documento_${req.params.id}.pdf`);
        // Registro en Bitácora
        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
          [req.user.id, 'EXPORT_PDF', `Usuario exportó PDF del documento ID ${req.params.id}`]);

        res.send(pdfBuffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error generando PDF' });
    }
});

// 2. Exportar Word
router.get('/:id/word', authenticateToken, async (req, res) => {
    try {
        const doc = await getDocumentData(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

        const wordBuffer = await generateWord(doc.plantilla_tipo, doc.datos);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=documento_${req.params.id}.docx`);
        // Registro en Bitácora
        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
          [req.user.id, 'EXPORT_WORD', `Usuario exportó Word del documento ID ${req.params.id}`]);

        res.send(wordBuffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error generando Word' });
    }
});

// 3. Enviar por Correo
router.post('/:id/enviar-correo', authenticateToken, async (req, res) => {
    const { email, asunto, mensaje } = req.body;
    if (!email) return res.status(400).json({ error: 'El correo es obligatorio' });

    try {
        const doc = await getDocumentData(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

        const finalHtml = buildFinalHtml(doc.plantilla_html, doc.datos);
        const pdfBuffer = await generatePDF(finalHtml);

        await sendEmailWithAttachment(email, asunto || 'Documento Adjunto', mensaje || 'Adjuntamos el documento solicitado.', {
            filename: `${doc.plantilla_tipo}.pdf`,
            content: pdfBuffer
        });

        // Registro en Bitácora
        await db.query(`INSERT INTO bitacora (id_usuario, accion, detalle) VALUES ($1, $2, $3)`,
          [req.user.id, 'ENVIAR_CORREO', `Usuario envió el documento ID ${req.params.id} al correo ${email}`]);

        res.json({ mensaje: 'Correo enviado con éxito' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error enviando correo' });
    }
});

module.exports = router;
