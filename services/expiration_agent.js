const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const puppeteer = require('puppeteer');

// ==========================================
// ARQUITECTURA MULTI-AGENTE (V22)
// ==========================================

class DocumentIngestionAgent {
    static process(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const buffer = fs.readFileSync(filePath);
        return { buffer, text: '', ext, filePath };
    }
}

class OCRExtractionAgent {
    static async process(docData, docId, worker) {
        // Native PDF
        if (docData.ext === '.pdf') {
            try {
                const pdfParserPath = path.resolve(__dirname, '../node_modules/pdf-parse/dist/pdf-parse/cjs/index.cjs');
                const pdf = require(pdfParserPath);
                const parseFunc = (typeof pdf === 'function') ? pdf : (pdf.default || pdf.PDFParse);
                if (typeof parseFunc === 'function') {
                    const data = await parseFunc(docData.buffer);
                    if (data.text && data.text.trim().length > 20) {
                        return { ...docData, text: data.text, strategy: 'native' };
                    }
                }
            } catch (e) { /* Fallback silencioso */ }
        }

        // Vision Fallback (Single Pass Adaptativo para velocidad)
        let browser = null;
        try {
            browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
            const page = await browser.newPage();
            await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2.0 });

            if (docData.ext === '.pdf') {
                await page.goto(`file://${path.resolve(docData.filePath)}#toolbar=0`, { waitUntil: 'domcontentloaded' });
            } else {
                const base64 = docData.buffer.toString('base64');
                await page.setContent(`<html><body style="margin:0;"><img src="data:image/${docData.ext.substring(1)};base64,${base64}" style="width:100%;"></body></html>`);
            }

            await page.evaluate(() => {
                const s = document.createElement('style');
                s.innerHTML = `body { filter: contrast(1.5) grayscale(1) brightness(1.1) !important; background: white !important; }`;
                document.head.appendChild(s);
            });

            const screenshotPath = path.join(path.dirname(docData.filePath), `V22_OCR_${docId}.png`);
            await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 700, width: 1200, height: 900 } });
            
            if (!worker) worker = await Tesseract.createWorker('eng');
            const { data: { text: ocrText } } = await worker.recognize(screenshotPath);
            if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
            
            return { ...docData, text: ocrText, strategy: 'ocr' };

        } finally {
            if (browser) await browser.close();
        }
    }
}

class DateDetectionAgent {
    static process(text) {
        const cleanText = text.toLowerCase();
        const numericText = cleanText.replace(/[oOqQ]/g, '0').replace(/[iIlL|!]/g, '1').replace(/[sS]/g, '5').replace(/[zZ]/g, '2');

        const candidates = [];
        const now = new Date();
        const maxFuture = new Date(); maxFuture.setFullYear(now.getFullYear() + 15);

        // A. MRZ Forense
        const mrzRegex = /(\d{6})\d[a-z](\d{6})\d[a-z]{3}/g; 
        let m;
        while ((m = mrzRegex.exec(numericText)) !== null) {
            const expPart = m[2]; 
            const yearStr = parseInt(expPart.substring(0,2)) > 50 ? '19'+expPart.substring(0,2) : '20'+expPart.substring(0,2);
            const d = new Date(parseInt(yearStr), parseInt(expPart.substring(2,4))-1, parseInt(expPart.substring(4,6)));
            if (d && !isNaN(d.getTime()) && d > new Date(1950, 0, 1)) candidates.push({ date: d, score: 3000 }); // Máxima prioridad
        }

        // B. Mapa Semántico (NLP multi-idioma)
        const dateRegex = /(\d{2}[^0-9]?\d{2}[^0-9]?\d{4})|(\d{4}[^0-9]?\d{2}[^0-9]?\d{2})/g;
        let dMatch;
        while ((dMatch = dateRegex.exec(numericText)) !== null) {
            const digits = dMatch[0].replace(/[^0-9]/g, '');
            if (digits.length === 8) {
                let d;
                if (dMatch[0].includes(digits.substring(4))) d = new Date(digits.substring(4), digits.substring(2,4)-1, digits.substring(0,2));
                else d = new Date(digits.substring(0,4), digits.substring(4,6)-1, digits.substring(6,8));

                if (d && !isNaN(d.getTime())) {
                    let score = 0;
                    if (d > now && d < maxFuture) score += 1000;
                    
                    const context = numericText.substring(Math.max(0, dMatch.index - 60), dMatch.index + 60);
                    // NLP Keywords: Español e Inglés
                    const keywords = ['vencimiento', 'caduca', 'expira', 'vigencia', 'expiration', 'expiry', 'valid until', 'vto', 'vnc'];
                    keywords.forEach(k => { if (context.includes(k)) score += 1000; });
                    
                    const negatives = ['nacimiento', 'birth', 'emision', 'issued'];
                    negatives.forEach(n => { if (context.includes(n)) score -= 1500; });
                    
                    candidates.push({ date: d, score });
                }
            }
        }
        
        candidates.sort((a, b) => b.score - a.score);
        return candidates.length > 0 && candidates[0].score > 0 ? candidates[0].date : null;
    }
}

class ValidationAgent {
    static process(expirationDate) {
        if (!expirationDate) return 'No detectado';
        const now = new Date();
        const threshold = new Date(); threshold.setDate(now.getDate() + 30); // 30 Días de regla exacta
        if (expirationDate < now) return 'Vencido';
        if (expirationDate <= threshold) return 'Próximo a vencer';
        return 'Vigente';
    }
}

class PersistenceAgent {
    static async process(docId, expirationDate, status, userId, idEmpresa) {
        // Mapeo BD legacy
        let finalState = 'VIGENTE';
        if (status === 'Vencido') finalState = 'VENCIDO';
        else if (status === 'Próximo a vencer') finalState = 'PRÓXIMO_A_VENCER';
        else if (status === 'No detectado') finalState = 'NO DETECTADO';

        // Respeto SOberanía Manual V19
        const currentDoc = await db.query('SELECT fecha_expiracion FROM documentos_personales WHERE id = $1', [docId]);
        if (currentDoc.rows.length > 0 && currentDoc.rows[0].fecha_expiracion != null) {
            return 'BYPASS_MANUAL'; // Retorna indicador para no sobrescribir, omitiendo la DB
        }

        const dateStr = expirationDate ? expirationDate.toISOString().split('T')[0] : null;
        await db.query('UPDATE documentos_personales SET estado_vigencia = $1, fecha_expiracion = $2 WHERE id = $3', [finalState, dateStr, docId]);
        
        await db.query(`INSERT INTO bitacora (id_usuario, id_empresa_contexto, accion, detalle) VALUES ($1, $2, $3, $4)`,
            [userId, idEmpresa, 'IA_MULTIAGENTE_V22', `Orchestrator V22: ${finalState} (${dateStr})`]);
            
        return finalState;
    }
}

class ResponseAgent {
    static process(fileName, expirationDate, status, startTime) {
        const processedTimeMs = Date.now() - startTime;
        return {
            file_name: fileName,
            expiration_date: expirationDate ? expirationDate.toISOString().split('T')[0] : null,
            status: status === 'No detectado' ? 'No detectado' : status,
            processed_time_ms: processedTimeMs
        };
    }
}

// Orquestador Principal que expone la misma firma para no romper nada existente (Aislamiento de Cambios)
class ExpirationAgent {
    static worker = null;
    static isInitializing = false;

    static async initWorker() {
        if (this.worker || this.isInitializing) return;
        this.isInitializing = true;
        try {
            this.worker = await Tesseract.createWorker('eng');
        } catch (e) {
            console.error(e);
        } finally {
            this.isInitializing = false;
        }
    }

    static async processDocument(docId, userId, filePath, idEmpresa, originalFileName = 'documento.pdf') {
        const startTime = Date.now();
        console.log(`[V22_ORCHESTRATOR] Iniciando Pipeline Sincrónico: ${originalFileName}`);
        
        try {
            if (!this.worker) await this.initWorker();

            const docData = DocumentIngestionAgent.process(filePath);
            const extracted = await OCRExtractionAgent.process(docData, docId, this.worker);
            const detectedDate = DateDetectionAgent.process(extracted.text);
            const status = ValidationAgent.process(detectedDate);
            const dbStatus = await PersistenceAgent.process(docId, detectedDate, status, userId, idEmpresa);

            // Si es bypass manual, reflejamos "Vigente" internamente para evitar romper UI
            const displayStatus = dbStatus === 'BYPASS_MANUAL' ? 'Revisión Manual' : status;

            return ResponseAgent.process(originalFileName, detectedDate, displayStatus, startTime);

        } catch (e) {
            console.error('[V22_PIPELINE_ERROR]', e);
            await db.query('UPDATE documentos_personales SET estado_vigencia = $1 WHERE id = $2', ['ERROR_IA', docId]);
            return ResponseAgent.process(originalFileName, null, 'No detectado', startTime);
        }
    }
}

ExpirationAgent.initWorker();
module.exports = ExpirationAgent;
