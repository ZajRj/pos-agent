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

// Ruta de estado con UI básica
app.get('/', (req, res) => {
    const configDisplay = { ...config };

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>POS Agent Status</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f9; color: #333; display: flex; justify-content: center; padding-top: 20px; box-sizing: border-box; }
            .container { background: white; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 800px; width: 95%; display: flex; flex-direction: column; height: 90vh; }
            h1 { color: #2c3e50; margin-top: 0; margin-bottom: 10px; }
            .status { display: inline-block; padding: 5px 10px; border-radius: 4px; background-color: #2ecc71; color: white; font-weight: bold; font-size: 0.9em; }
            .section { margin-bottom: 20px; }
            .config-box { background: #2d3436; color: #dfe6e9; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; max-height: 150px; }
            .logs-box { background: #1e1e1e; color: #00ff00; padding: 10px; border-radius: 4px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 0.85em; flex-grow: 1; white-space: pre-wrap; word-wrap: break-word; }
            pre { margin: 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>POS Agent <span class="status">Running</span></h1>
                <p style="margin: 0 0 10px;">Listening on port <strong>${config.port}</strong></p>
            </div>
            
            <div class="section">
                <h3>Configuration</h3>
                <div class="config-box">
                    <pre>${JSON.stringify(configDisplay, null, 2)}</pre>
                </div>
            </div>

            <div class="section" style="display: flex; flex-direction: column; flex-grow: 1;">
                <h3>Live Logs</h3>
                <div class="logs-box" id="logContainer">Loading logs...</div>
            </div>
        </div>

        <script>
            function fetchLogs() {
                fetch('/api/logs')
                    .then(response => response.json())
                    .then(data => {
                        const container = document.getElementById('logContainer');
                        container.textContent = data.join('\\n');
                        // Auto-scroll but allow user to scroll up? For now simple auto-scroll
                        container.scrollTop = container.scrollHeight;
                    })
                    .catch(err => console.error('Failed to fetch logs', err));
            }

            // Poll every 2 seconds
            setInterval(fetchLogs, 2000);
            fetchLogs();
        </script>
    </body>
    </html>
    `;
    res.send(html);
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