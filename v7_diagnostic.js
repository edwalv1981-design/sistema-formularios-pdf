const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const puppeteer = require('puppeteer');
const db = require('./db');

async function diagnostic() {
    let browser = null;
    try {
        const docId = 15;
        const res = await db.query('SELECT * FROM documentos_personales WHERE id = $1', [docId]);
        const doc = res.rows[0];
        const filePath = path.resolve(doc.ruta_archivo.startsWith('/') ? '.' + doc.ruta_archivo : doc.ruta_archivo);
        
        console.log(`--- DIAGNÓSTICO PROFUNDO DOC ${docId} ---`);
        console.log(`Ruta: ${filePath}`);

        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 1.5 });
        
        const fileUrl = `file://${filePath}#toolbar=0`;
        await page.goto(fileUrl, { waitUntil: 'networkidle2' });
        
        const screenshotPath = './V7_DIAGNOSTIC_15.png';
        await page.screenshot({ path: screenshotPath });
        
        console.log('OCR Iniciado...');
        const { data: { text } } = await Tesseract.recognize(screenshotPath, 'spa');
        
        console.log('TEXTO CAPTURADO:');
        console.log('---');
        console.log(text.replace(/\s+/g, ' '));
        console.log('---');
        
        // Simular lógica de extracción V7
        const cleanText = text.toLowerCase();
        const keywords = ['vencimiento', 'vence', 'venc', 'expiracion', 'expira', 'exp', 'vveno', 'vencim', 'vancm', 'vnc'];
        
        console.log('Búsqueda de Palabras Clave:');
        keywords.forEach(k => {
            if (cleanText.includes(k)) console.log(`  [OK] Encontrada: "${k}"`);
        });
        
        const numericText = cleanText.replace(/[oOqQ]/g, '0').replace(/[iIlL|!\/]/g, '1');
        const ultraRegex = /(\d{2}[^0-9]?\d{2}[^0-9]?\d{4})|(\d{4}[^0-9]?\d{2}[^0-9]?\d{2})/g;
        const matches = numericText.match(ultraRegex);
        
        console.log('Fechas Detectadas (Regex):', matches);
        
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
        process.exit(0);
    } catch (e) {
        console.error(e);
        if (browser) await browser.close();
        process.exit(1);
    }
}
diagnostic();
