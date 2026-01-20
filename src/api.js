const fs = require('fs');
const path = require('path');
const { printTicket, printGeneric } = require('./printing');
const { createShortcut, removeShortcut, getStartupPath } = require('./utils/shortcuts');
const { checkForUpdate, downloadUpdate, installUpdate } = require('./updater');

/**
 * Register API routes
 * @param {import('express').Application} app 
 * @param {object} ctx Context 
 * @param {object} ctx.config
 * @param {string} ctx.execDir
 * @param {string[]} ctx.logBuffer
 * @param {object} ctx.pkg
 * @param {boolean} ctx.isPkg
 */
module.exports = (app, ctx) => {
    const { config, execDir, logBuffer, pkg, isPkg } = ctx;

    // Config Endpoint
    app.get('/api/config', (req, res) => {
        res.json(config);
    });

    // Logs Endpoint
    app.get('/api/logs', (req, res) => {
        res.json(logBuffer);
    });

    // Print Endpoint
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
    app.post('/print/generic', async (req, res) => {
        const data = req.body;
        console.log(`[${new Date().toLocaleTimeString()}] Nueva orden recibida`);

        try {
            await printGeneric(data);
            res.json({ status: 'ok', msg: 'Generic print success' });
        } catch (error) {
            console.error("Error:", error.message);
            res.status(500).json({ status: 'error', msg: error.message });
        }
    });

    // Save Config
    app.post('/api/config', (req, res) => {
        try {
            const newConfig = { ...config, ...req.body };

            // Auto-fix Windows Network Paths
            if (newConfig.printer && typeof newConfig.printer.interface === 'string') {
                let iface = newConfig.printer.interface;
                if (iface.startsWith('//') || iface.startsWith('\\\\')) {
                    newConfig.printer.interface = iface.replace(/\//g, '\\');
                }
            }

            // Write to config.json
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

    // Check Autostart
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
                const vbsPath = path.join(execDir, 'launcher.vbs');
                const targetExe = isPkg ? process.execPath : path.join(execDir, 'pos-agent.exe');
                const target = fs.existsSync(vbsPath) ? vbsPath : targetExe;
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

    // Auto-Updater Endpoint
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
};