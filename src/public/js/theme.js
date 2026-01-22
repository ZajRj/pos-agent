export function initTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    updateThemeBtn(currentTheme);
}

export function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeBtn(next);
}

function updateThemeBtn(theme) {
    const btn = document.getElementById('themeBtn');
    if (btn) {
        btn.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
    }
}
