const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const https = require('https');
const path = require('path');

// --- Crash Logger (Initialize Early) ---
// We need to know where to write. check isPkg logic early.
const isPkg = typeof process.pkg !== 'undefined';
const execDir = isPkg ? path.dirname(process.execPath) : __dirname;
const crashLogPath = path.join(execDir, 'crash.log');
const debugLogPath = path.join(execDir, 'debug.log');

function logCrash(type, err) {
    const msg = `[${new Date().toISOString()}] [${type}] ${err.stack || err}\n`;
    try {
        fs.appendFileSync(crashLogPath, msg);
        fs.appendFileSync(debugLogPath, msg); // Also write to debug logs
    } catch (e) {
        console.error("Failed to write to crash log:", e);
    }
}

process.on('uncaughtException', (err) => {
    console.error('CRASH DETECTED. Check crash.log/debug.log. Uncaught Exception:', err);
    logCrash('UNCAUGHT_EXCEPTION', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRASH DETECTED. Check crash.log/debug.log. Unhandled Rejection:', reason);
    logCrash('UNHANDLED_REJECTION', reason);
});
// --------------------

const { printTicket } = require('./printing');
const config = require('./config');
const pkg = require('../package.json');

// Config is already loaded by require('./config')
console.log(`[SERVER] Config loaded based on: ${execDir}`);


const app = express();

// 2. Middleware
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // HARDCODED: Always allow localhost/127.0.0.1 to prevent lockout
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }

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
// debugLogPath is already defined at the top

function captureLog(type, args) {
    const msg = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${type}] ${msg}`;

    // 1. In-Memory Buffer
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();

    // 2. Stdout
    process.stdout.write(entry + '\n');

    // 3. Persistent File Log
    try {
        fs.appendFileSync(debugLogPath, entry + '\n');
    } catch (e) {
        // Fail silently if we can't write to log file to avoid infinite loop
    }
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

// --- System Management APIs ---
const { createShortcut, removeShortcut, getStartupPath } = require('./utils/shortcuts');

// Save Config
app.post('/api/config', (req, res) => {
    try {
        const newConfig = { ...config, ...req.body };

        // Auto-fix Windows Network Paths (e.g. //localhost/POS-58 -> \\localhost\POS-58)
        if (newConfig.printer && typeof newConfig.printer.interface === 'string') {
            let iface = newConfig.printer.interface;
            if (iface.startsWith('//') || iface.startsWith('\\\\')) {
                newConfig.printer.interface = iface.replace(/\//g, '\\');
            }
        }

        // Write to config.json next to executable/script
        const configPath = path.join(execDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

        // Update in-memory config
        Object.assign(config, newConfig);

        console.log("Config updated.");
        res.json({ status: 'ok', msg: 'Configuración guardada.' });
    } catch (e) {
        console.error("Error saving config:", e);
        res.status(500).json({ status: 'error', msg: e.message });
    }
});

// Stop Service
app.post('/api/service/stop', (req, res) => {
    console.log("Stop request received.");
    res.json({ status: 'ok', msg: 'Deteniendo servicio...' });
    setTimeout(() => {
        console.log("Exiting...");
        process.exit(0);
    }, 1000);
});

// Check Autostart Status
app.get('/api/service/autostart', (req, res) => {
    try {
        const startupPath = getStartupPath();
        const linkPath = path.join(startupPath, 'POS Agent.lnk');
        const isEnabled = fs.existsSync(linkPath);
        res.json({ status: 'ok', enabled: isEnabled });
    } catch (e) {
        res.status(500).json({ status: 'error', msg: e.message });
    }
});

// Toggle Autostart
app.post('/api/service/autostart', (req, res) => {
    const { enable } = req.body;
    const startupPath = getStartupPath();
    const linkPath = path.join(startupPath, 'POS Agent.lnk');

    try {
        if (enable) {
            // Re-create shortcut
            const vbsPath = path.join(execDir, 'launcher.vbs');
            // If running as pkg, process.execPath is the exe.
            // If running node, process.execPath is node.exe
            const targetExe = isPkg ? process.execPath : path.join(execDir, 'pos-agent.exe'); // Fallback logic

            const target = fs.existsSync(vbsPath) ? vbsPath : targetExe;

            // Icon
            const icon = isPkg ? process.execPath : undefined;

            createShortcut(target, linkPath, "Start POS Agent (Background)", icon);
            console.log("Autostart Enabled.");
            res.json({ status: 'ok', enabled: true, msg: 'Inicio automático activado' });
        } else {
            removeShortcut(linkPath);
            console.log("Autostart Disabled.");
            res.json({ status: 'ok', enabled: false, msg: 'Inicio automático desactivado' });
        }
    } catch (e) {
        console.error("Autostart toggle error:", e);
        res.status(500).json({ status: 'error', msg: e.message });
    }
});


// --- Auto-Updater ---
const { checkForUpdate, downloadUpdate, installUpdate } = require('./updater');

app.post('/api/service/update', async (req, res) => {
    const updateUrl = config.update_url;
    if (!updateUrl) return res.status(400).json({ status: 'error', msg: 'No update_url configured' });

    try {
        console.log(`Checking for updates from ${updateUrl}...`);
        const update = await checkForUpdate(updateUrl, pkg.version);

        if (update.available) {
            console.log(`Update found: ${update.version}. Downloading...`);
            const tempFile = path.join(execDir, 'update.tmp.exe');
            await downloadUpdate(update.url, tempFile);

            console.log("Download complete. Installing...");
            res.json({ status: 'ok', msg: 'Downloading update... Agent will restart.' });

            // Allow response to flush
            setTimeout(() => installUpdate(tempFile), 1000);
        } else {
            console.log("No updates available.");
            res.json({ status: 'ok', msg: 'You are on the latest version.' });
        }
    } catch (e) {
        console.error("Update failed:", e);
        res.status(500).json({ status: 'error', msg: e.message });
    }
});

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