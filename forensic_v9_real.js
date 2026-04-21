const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const puppeteer = require('puppeteer');
const db = require('./db');

async function forensic() {
    let browser = null;
    try {
        const docId = 17;
        const res = await db.query('SELECT * FROM documentos_personales WHERE id = $1', [docId]);
        const doc = res.rows[0];
        const filePath = path.resolve('.' + doc.ruta_archivo);
        
        console.log(`--- FORENSIC V9 DOC ${docId} ---`);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2.0 });
        
        await page.goto(`file://${filePath}#toolbar=0`, { waitUntil: 'networkidle2' });
        const screenshotPath = './forensic_v9.png';
        await page.screenshot({ path: screenshotPath });
        
        const { data: { text } } = await Tesseract.recognize(screenshotPath, 'spa+eng');
        const cleanText = text.toLowerCase();
        
        console.log('TEXTO CAPTURADO:');
        console.log(text.replace(/\s+/g, ' '));

        const numericText = cleanText.replace(/[oOqQ]/g, '0').replace(/[iIlL|!\/]/g, '1');
        // El regex que causó el error 7007
        const v8Regex = /(\d{2}[^0-9]?\d{2}[^0-9]?\d{4})|(\d{4}[^0-9]?\d{2}[^0-9]?\d{2})/g;
        const matches = numericText.match(v8Regex);
        
        console.log('--- ANÁLISIS DE MATCHES ---');
        matches.forEach(m => {
            console.log(`Match: "${m}"`);
            const digits = m.replace(/[^0-9]/g, '');
            console.log(`  Dígitos: ${digits}`);
        });

        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
        process.exit(0);
    } catch (e) {
        console.error(e);
        if (browser) await browser.close();
        process.exit(1);
    }
}
forensic();
