const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { printTicket } = require('./printing');


const isPkg = typeof process.pkg !== 'undefined';
const execDir = isPkg ? path.dirname(process.execPath) : __dirname;

// 1. Cargar Configuración
let config;
const configPathExternal = path.join(execDir, 'config.json');
const configPathInternal = path.join(__dirname, 'config.json');

try {
    if (fs.existsSync(configPathExternal)) {
        console.log(`Cargando configuración desde: ${configPathExternal}`);
        config = JSON.parse(fs.readFileSync(configPathExternal));
    } else {
        console.log(`Cargando configuración interna`);
        config = JSON.parse(fs.readFileSync(configPathInternal));
    }
} catch (error) {
    console.error("Error leyendo config.json. Usando valores por defecto.");
    config = { port: 3000, test_mode: true, printer: { type: 'epson', width: 48 } };
}

const app = express();

// 2. Middleware
app.use(cors());
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