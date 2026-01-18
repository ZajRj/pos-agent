const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { printTicket } = require('./printing');


const config = require('./config');
const isPkg = typeof process.pkg !== 'undefined';
const execDir = isPkg ? path.dirname(process.execPath) : __dirname;

// Config is already loaded by require('./config')
console.log(`[SERVER] Config loaded based on: ${execDir}`);

const app = express();

// 2. Middleware
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // If allowed_origins is defined in config, enforce it
        if (config.allowed_origins && Array.isArray(config.allowed_origins) && config.allowed_origins.length > 0) {
            if (config.allowed_origins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`Blocked CORS request from: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        } else {
            // Default: Allow all if not configured
            callback(null, true);
        }
    }
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// --- Log Capture ---
const logBuffer = [];
const MAX_LOGS = 500;

function captureLog(type, args) {
    const msg = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    const entry = `[${new Date().toLocaleTimeString()}] [${type}] ${msg}`;
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();

    // Original output
    process.stdout.write(entry + '\n');
}

// Override console methods
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => captureLog('INFO', args);
console.error = (...args) => captureLog('ERROR', args);

// --- End Log Capture ---

// Ruta de estado
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
    // Hide sensitive info if necessary, for now returning full config
    res.json(config);
});

// Logs Endpoint
app.get('/api/logs', (req, res) => {
    res.json(logBuffer);
});

// 3. Ruta de Impresión
app.post('/imprimir', async (req, res) => {
    const data = req.body;

    console.log(`[${new Date().toLocaleTimeString()}] Nueva orden recibida`);

    try {
        await printTicket(data);

        res.json({ status: 'ok', msg: 'Ticket procesado' });

    } catch (error) {
        console.error("Error:", error.message);

        res.status(500).json({ status: 'error', msg: error.message });
    }
});

// Iniciar Servidor (HTTPS con fallback a HTTP)
const startServer = () => {
    const certPath = path.join(execDir, 'cert.pem');
    const keyPath = path.join(execDir, 'key.pem');

    console.log(`Buscando certificados en: ${execDir}`);

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        try {
            const httpsOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };
            https.createServer(httpsOptions, app).listen(config.port, () => {
                console.log(`Agente de impresión (HTTPS) corriendo en puerto ${config.port}`);
                console.log(`Modo: ${config.test_mode ? 'TEST (Archivo)' : 'PRODUCCIÓN (Hardware)'}`);
            });
        } catch (e) {
            console.error("Error iniciando HTTPS:", e.message);
            startHttp(); // Fallback
        }
    } else {
        console.warn("Certificados SSL no encontrados. Iniciando en modo HTTP no seguro.");
        startHttp();
    }
};

const startHttp = () => {
    app.listen(config.port, () => {
        console.log(`Agente de impresión (HTTP) corriendo en puerto ${config.port}`);
        console.log(`Modo: ${config.test_mode ? 'TEST (Archivo)' : 'PRODUCCIÓN (Hardware)'}`);
    });
};

startServer();