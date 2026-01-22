const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const https = require('https');
const path = require('path');

// --- Logger ---
const { init: initLogger, logBuffer } = require('./logger');

// Check isPkg logic early.
const isPkg = typeof process.pkg !== 'undefined';
const execDir = isPkg ? path.dirname(process.execPath) : __dirname;

initLogger(execDir);


const config = require('./config');
const pkg = require('../package.json');

// Config is already loaded by require('./config')
console.log(`[SERVER] Config loaded based on: ${execDir}`);


const app = express();

// Middleware
const corsOptions = require('./cors')(config);
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));


// Ruta de estado
app.use(express.static(path.join(__dirname, 'public')));

// Register API Routes
require('./api')(app, { config, execDir, logBuffer, pkg, isPkg });

// --- Auto-Updater Polling ---
// --- Auto-Updater Polling ---
const { checkForUpdate, downloadUpdate, installUpdate } = require('./updater');

async function performUpdateCheck() {
    if (!config.update_url) return;
    try {
        console.log(`[Auto-Update] Checking ${config.update_url}...`);
        const update = await checkForUpdate(config.update_url, pkg.version);
        if (update.available) {
            console.log(`[Auto-Update] Found version ${update.version}. Downloading...`);
            const ext = process.platform === 'win32' ? '.exe' : '';
            const tempFile = path.join(execDir, `update.tmp${ext}`);
            await downloadUpdate(update.url, tempFile);
            installUpdate(tempFile);
        }
    } catch (e) {
        console.error("[Auto-Update] Check failed:", e.message);
    }
}

// Poll for updates if configured
if (config.update_url) {
    console.log(`Auto-updater active. Polling ${config.update_url}`);
    setInterval(performUpdateCheck, 1000 * 60 * 60 * 12); // 12 hours
}

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

            performUpdateCheck();

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