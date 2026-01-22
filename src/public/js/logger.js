import * as api from './api.js';

export async function fetchAndDisplayLogs() {
    try {
        const logs = await api.fetchLogs();
        const logBox = document.getElementById('logBox');
        if (!logBox) return;

        const wasAtBottom = logBox.scrollHeight - logBox.clientHeight <= logBox.scrollTop + 50;
        logBox.textContent = logs.join('\n');
        if (wasAtBottom) logBox.scrollTop = logBox.scrollHeight;
    } catch (e) { }
}

export function startLogPolling(interval = 2000) {
    fetchAndDisplayLogs();
    return setInterval(fetchAndDisplayLogs, interval);
}
