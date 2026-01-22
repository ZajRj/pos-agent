import * as theme from './theme.js';
import * as config from './config.js';
import * as renderer from './renderer.js';
import * as logger from './logger.js';
import * as api from './api.js';
import { showStatus } from './utils.js';

// --- Global Actions (attached to window for HTML onclick compatibility) ---
window.toggleTheme = theme.toggleTheme;
window.saveConfig = config.saveConfig;
window.openPreview = renderer.openPreview;
window.closePreview = renderer.closePreview;

window.checkUpdate = async () => {
    showStatus('Checking for updates...', 'success');
    try {
        const data = await api.triggerUpdate();
        showStatus(data.msg, data.status === 'ok' ? 'success' : 'error');
    } catch (e) {
        showStatus(e.message, 'error');
    }
};

window.stopService = async () => {
    if (!confirm("Stop service?")) return;
    try {
        await api.stopService();
        showStatus('Service stopped.', 'error');
    } catch (e) { }
};

// --- Event Listeners ---
document.getElementById('autostartToggle')?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
        const data = await api.setAutostart(enabled);
        if (data.status === 'ok') showStatus(data.msg, 'success');
        else {
            showStatus(data.msg, 'error');
            e.target.checked = !enabled;
        }
    } catch (error) {
        e.target.checked = !enabled;
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    theme.initTheme();
    config.loadConfig();
    logger.startLogPolling();
});
