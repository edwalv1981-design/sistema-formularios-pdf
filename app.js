const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./db');

// Asegurar carpeta de uploads (Crítico para Railway)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const formRoutes = require('./routes/forms');
const digitRoutes = require('./routes/digit');

// === SINCRONIZACIÓN DE BASE DE DATOS (Auto-Migración) ===
async function initDB() {
    try {
        console.log('Validando esquema de base de datos...');
        // Asegurar tablas y columnas nuevas
        await db.query(`
            CREATE TABLE IF NOT EXISTS documentos_personales (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                tipo VARCHAR(50),
                nombre_archivo TEXT,
                ruta_archivo TEXT,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_expiracion DATE,
                archivo_base64 TEXT,
                estado_vigencia VARCHAR(30) DEFAULT 'NO DETECTADO'
            )
        `);
        await db.query(`ALTER TABLE documentos_personales ADD COLUMN IF NOT EXISTS estado_vigencia VARCHAR(30) DEFAULT 'NO DETECTADO'`);
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS formularios_firmados (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                nombre_archivo TEXT,
                ruta_archivo TEXT,
                is_valid BOOLEAN DEFAULT FALSE,
                fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                validador_metadata JSONB,
                archivo_base64 TEXT
            )
        `);
        await db.query(`ALTER TABLE formularios_firmados ADD COLUMN IF NOT EXISTS validador_metadata JSONB`);
        
        console.log('Esquema de base de datos sincronizado.');
    } catch (err) {
        console.error('ERROR CRÍTICO EN SINCRONIZACIÓN DB:', err);
    }
}
initDB();

const app = express();

// Middleware de Registro Global (Diagnóstico Root)
app.use((req, res, next) => {
    const fs = require('fs');
    const path = require('path');
    const logBatch = `[${new Date().toLocaleString()}] ${req.method} ${req.url} - IP: ${req.ip}\n`;
    fs.appendFileSync(path.join(__dirname, 'server_access.log'), logBatch);
    next();
});

// Middleware de Supervisión Crítica (Diagnóstico Nivel 0)
app.use((req, res, next) => {
    const fs = require('fs');
    fs.appendFileSync('raw_requests.log', `[${new Date().toISOString()}] ${req.method} ${req.url}\n`);
    next();
});

// Middlewares Estándar
app.use(cors());
app.use(express.json());
// Rutas de API (Prioridad Alta)
app.get('/status', async (req, res) => {
    try {
        const dbTest = await db.query('SELECT NOW()');
        res.json({ status: 'ONLINE', database: 'CONNECTED', db_time: dbTest.rows[0].now });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', database: 'DISCONNECTED', error: err.message });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', userRoutes);
app.use('/api/formularios', formRoutes);
app.use('/api/digitalizacion', digitRoutes);
app.use('/api/bitacora', require('./routes/bita'));
app.use('/api/documentos', require('./routes/documentos_export'));
app.use('/api/ediciones', require('./routes/ediciones'));
app.use('/api/documentacion-personal', require('./routes/documentacion'));
app.use('/api/formularios-firmados', require('./routes/firmas'));
app.get('/api/ping', (req, res) => res.send('pong'));

// Archivos Estáticos (Fallback)
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Middleware Centralizado de Errores (Prevención de Colapso en Producción)
app.use((err, req, res, next) => {
    console.error('CRITICAL ERROR:', err.stack);
    const fs = require('fs');
    fs.appendFileSync('error_critical.log', `[${new Date().toISOString()}] ${err.message}\n${err.stack}\n\n`);
    res.status(500).json({ error: 'Error interno del servidor. El sistema se mantiene estable.' });
});

// Iniciar Servidor (Binding explícito a 0.0.0.0 para máxima compatibilidad)
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR OPERATIVO`);
    console.log(`- Local: http://localhost:${PORT}`);
    console.log(`- Red: http://0.0.0.0:${PORT}`);
});

// Manejo de Cierre Ordenado (Evita Procesos Fantasma)
const gracefulShutdown = () => {
    console.log('Cerrando servidor de forma ordenada...');
    server.close(() => {
        console.log('Servidor cerrado. Puerto liberado.');
        process.exit(0);
    });
    // Si no cierra en 10s, forzar
    setTimeout(() => {
        console.error('Cierre forzado tras timeout.');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
