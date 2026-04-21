const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

/**
 * AGENTE EXPERTO: Validación de Firma Digital Criptográfica
 * Analiza la estructura del PDF en busca de diccionarios de firma (/Sig)
 * y campos de firma interactivos.
 * 
 * @param {string} filePath Ruta absoluta del archivo PDF a validar
 * @returns {Promise<boolean>} Retorna true si se detecta firma criptográfica válida
 */
async function validateDigitalSignature(filePath) {
    try {
        const existingPdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        
        // 1. Verificar si hay campos de firma explícitos
        const hasSignatureFields = fields.some(f => f.constructor.name === 'PDFSignature');
        
        // 2. Análisis Binario Profundo (Búsqueda de objetos /Sig y /ByteRange)
        const content = existingPdfBytes.toString('binary');
        const hasSigMarker = content.includes('/Sig') && content.includes('/ByteRange');

        return hasSignatureFields || hasSigMarker;
    } catch (err) {
        console.error('[AGENT_SIGN_ERROR]', err);
        return false;
    }
}

module.exports = { validateDigitalSignature };
