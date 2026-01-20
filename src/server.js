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
app.use(bodyParser.json());


// Ruta de estado
app.use(express.static(path.join(__dirname, 'public')));

// Register API Routes
require('./api')(app, { config, execDir, logBuffer, pkg, isPkg });

// --- Auto-Updater Polling ---
const { checkForUpdate, downloadUpdate, installUpdate } = require('./updater');

// Poll for updates if configured
if (config.update_url) {
    console.log(`Auto-updater active. Polling ${config.update_url}`);
    setInterval(async () => {
        try {
            const update = await checkForUpdate(config.update_url, pkg.version);
            if (update.available) {
                const tempFile = path.join(execDir, 'update.tmp.exe');
                await downloadUpdate(update.url, tempFile);
                installUpdate(tempFile);
            }
        } catch (e) { /* silent fail */ }
    }, 1000 * 60 * (60 * 12)); // 12 hours
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

            checkForUpdate(config.update_url, pkg.version);
            
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