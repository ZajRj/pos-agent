const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Standard location for systemd user services
// We use user services to avoid needing root for everything, 
// though port 80/443 would require root. Since we default to 3000, user level is fine.
const SYSTEMD_DIR = path.join(process.env.HOME, '.config/systemd/user');
const SERVICE_FILENAME = 'pos-agent.service';

function getServicePath() {
    // Ensure dir exists
    if (!fs.existsSync(SYSTEMD_DIR)) {
        fs.mkdirSync(SYSTEMD_DIR, { recursive: true });
    }
    return path.join(SYSTEMD_DIR, SERVICE_FILENAME);
}

/**
 * Creates a systemd unit file for the agent
 * @param {string} execPath Absolute path to the executable
 */
function installService(execPath) {
    const serviceFile = getServicePath();
    const workDir = path.dirname(execPath);

    const unitContent = [
        '[Unit]',
        'Description=POS Agent Service',
        'After=network.target',
        '',
        '[Service]',
        'Type=simple',
        `ExecStart=${execPath}`,
        `WorkingDirectory=${workDir}`,
        'Restart=on-failure',
        'RestartSec=5',
        'StandardOutput=append:' + path.join(workDir, 'agent.log'),
        'StandardError=append:' + path.join(workDir, 'agent.err'),
        '',
        '[Install]',
        'WantedBy=default.target'
    ].join('\n');

    fs.writeFileSync(serviceFile, unitContent);
    console.log(`[Linux] Service file created at: ${serviceFile}`);

    // Reload daemon
    try {
        execSync('systemctl --user daemon-reload');
        console.log('[Linux] Systemd daemon reloaded.');
    } catch (e) {
        console.error('[Linux] Failed to reload systemd:', e.message);
    }
}

function enableAutostart() {
    try {
        execSync(`systemctl --user enable ${SERVICE_FILENAME}`);
        execSync(`systemctl --user start ${SERVICE_FILENAME}`);
        console.log('[Linux] Service enabled and started.');
        return true;
    } catch (e) {
        console.error('[Linux] Failed to enable autostart:', e.message);
        throw e;
    }
}

function disableAutostart() {
    try {
        execSync(`systemctl --user stop ${SERVICE_FILENAME}`);
        execSync(`systemctl --user disable ${SERVICE_FILENAME}`);
        console.log('[Linux] Service stopped and disabled.');
        return true;
    } catch (e) {
        console.error('[Linux] Failed to disable autostart:', e.message);
        throw e;
    }
}

function isAutostartEnabled() {
    try {
        // is-enabled returns 0 if enabled, non-zero if disabled
        execSync(`systemctl --user is-enabled ${SERVICE_FILENAME}`, { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    installService,
    enableAutostart,
    disableAutostart,
    isAutostartEnabled
};
