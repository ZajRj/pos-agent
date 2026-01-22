import * as api from './api.js';
import { showStatus } from './utils.js';

export async function loadConfig() {
    try {
        const config = await api.fetchConfig();

        document.getElementById('interface').value = config.printer?.interface || '';
        document.getElementById('width').value = config.printer?.width || 32;
        document.getElementById('configPort').value = config.port || 3000;
        document.getElementById('testMode').checked = config.test_mode || false;
        document.getElementById('updateUrl').value = config.update_url || '';

        if (Array.isArray(config.allowed_origins)) {
            document.getElementById('origins').value = config.allowed_origins.join(',\n');
        }

        try {
            const statusData = await api.fetchAutostartStatus();
            document.getElementById('autostartToggle').checked = statusData.enabled;
        } catch (e) {
            console.warn("Could not verify autostart status:", e);
        }

    } catch (e) {
        showStatus('Error loading config', 'error');
    }
}

export async function saveConfig() {
    const config = {
        port: parseInt(document.getElementById('configPort').value),
        test_mode: document.getElementById('testMode').checked,
        allowed_origins: document.getElementById('origins').value.split(',').map(s => s.trim()).filter(Boolean),
        update_url: document.getElementById('updateUrl').value,
        printer: {
            type: 'epson',
            interface: document.getElementById('interface').value,
            width: parseInt(document.getElementById('width').value),
            characterSet: 'PC852'
        }
    };

    try {
        const data = await api.saveConfig(config);
        if (data.status === 'ok') showStatus('Saved! Restart required.', 'success');
        else showStatus(data.msg, 'error');
    } catch (e) {
        showStatus('Save failed: ' + e.message, 'error');
    }
}
