export function showStatus(msg, type) {
    const el = document.getElementById('status-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = type;
    setTimeout(() => {
        el.textContent = '';
        el.className = '';
    }, 3000);
}
