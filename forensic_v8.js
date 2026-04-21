const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const db = require('./db');

async function forensic() {
    try {
        const docId = 17;
        const res = await db.query('SELECT * FROM documentos_personales WHERE id = $1', [docId]);
        const doc = res.rows[0];
        console.log(`--- FORENSIC DOC ${docId} ---`);
        console.log(`Estado: ${doc.estado_vigencia}, Fecha: ${doc.fecha_expiracion}`);

        const { data: { text } } = await Tesseract.recognize('.' + doc.ruta_archivo, 'spa+eng');
        const cleanText = text.toLowerCase();
        
        console.log('TEXTO RAW:');
        console.log(text.replace(/\s+/g, ' '));
        
        // Simular regex V8
        const numericText = cleanText.replace(/[oOqQ]/g, '0').replace(/[iIlL|!\/]/g, '1');
        const ultraRegex = /(\d{2}[^0-9]?\d{2}[^0-9]?\d{4})|(\d{4}[^0-9]?\d{2}[^0-9]?\d{2})/g;
        const matches = numericText.match(ultraRegex);
        console.log('MATCHES ENCONTRADOS:', matches);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
forensic();
