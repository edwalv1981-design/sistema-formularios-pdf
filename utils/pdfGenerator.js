const puppeteer = require('puppeteer');

/**
 * Genera un PDF a partir de contenido HTML.
 * @param {string} html - El contenido HTML a renderizar.
 * @returns {Promise<Buffer>} - El buffer del PDF generado.
 */
async function generatePDF(html) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Configurar el contenido y esperar a que cargue
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generar PDF con formato A4 y márgenes de 20mm
    const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
            top: '20mm',
            right: '20mm',
            bottom: '20mm',
            left: '20mm'
        },
        printBackground: true
    });

    await browser.close();
    return pdfBuffer;
}

module.exports = { generatePDF };
