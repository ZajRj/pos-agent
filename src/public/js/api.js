const API_BASE = window.location.origin + '/api';

export async function fetchConfig() {
    const res = await fetch(`${API_BASE}/config`);
    return res.json();
}

export async function saveConfig(config) {
    const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    return res.json();
}

export async function fetchLogs() {
    const res = await fetch(`${API_BASE}/logs`);
    return res.json();
}

export async function fetchLastJob() {
    const res = await fetch(`${API_BASE}/last-job`);
    return res.json();
}

export async function triggerUpdate() {
    const res = await fetch(`${API_BASE}/service/update`, { method: 'POST' });
    return res.json();
}

export async function stopService() {
    const res = await fetch(`${API_BASE}/service/stop`, { method: 'POST' });
    return res.json();
}

export async function setAutostart(enabled) {
    const res = await fetch(`${API_BASE}/service/autostart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: enabled })
    });
    return res.json();
}

export async function fetchAutostartStatus() {
    const res = await fetch(`${API_BASE}/service/autostart`);
    return res.json();
}
