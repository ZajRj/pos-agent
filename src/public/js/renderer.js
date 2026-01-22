import * as api from './api.js';
import { showStatus } from './utils.js';

export async function openPreview() {
    try {
        const data = await api.fetchLastJob();

        if (!data.commands || data.commands.length === 0) {
            showStatus('No recent print job found', 'error');
            return;
        }

        renderPreview(data.commands);
        document.body.style.overflow = 'hidden';
        document.getElementById('preview-modal').style.display = 'flex';
    } catch (e) {
        showStatus('Error loading preview', 'error');
    }
}

export function closePreview() {
    document.body.style.overflow = 'auto';
    document.getElementById('preview-modal').style.display = 'none';
}

function renderPreview(commands) {
    const container = document.getElementById('receipt-content');
    container.innerHTML = '';

    commands.forEach(cmd => {
        const div = document.createElement('div');
        div.className = 'receipt-item';

        if (cmd.align === 'center') div.classList.add('receipt-center');
        if (cmd.align === 'right') div.classList.add('receipt-right');
        if (cmd.bold) div.classList.add('receipt-bold');
        if (cmd.underline) div.classList.add('receipt-underline');

        switch (cmd.type) {
            case 'text':
                div.textContent = cmd.value || '';
                if (!cmd.value) div.innerHTML = '&nbsp;';
                break;
            case 'separator':
                div.textContent = '-'.repeat(32);
                break;
            case 'newLine':
                div.innerHTML = '&nbsp;';
                break;
            case 'image':
                const img = document.createElement('img');
                img.src = cmd.data.startsWith('data:') ? cmd.data : `data:image/png;base64,${cmd.data}`;
                img.className = 'receipt-img';
                div.appendChild(img);
                break;
            case 'qrcode':
            case 'barcode':
                const code = document.createElement('div');
                code.style.border = '1px dashed #ccc';
                code.style.padding = '10px';
                code.style.margin = '5px 0';
                code.style.textAlign = 'center';
                code.style.fontSize = '10px';
                code.textContent = `[${cmd.type.toUpperCase()}: ${cmd.value}]`;
                div.appendChild(code);
                break;
            case 'table':
                if (cmd.rows) {
                    cmd.rows.forEach(row => {
                        const tableRow = document.createElement('div');
                        tableRow.className = 'receipt-table';
                        row.forEach((cell, idx) => {
                            const span = document.createElement('span');
                            const text = typeof cell === 'object' ? cell.text : cell;
                            span.textContent = text;

                            const colDef = cmd.columns ? cmd.columns[idx] : null;
                            if (colDef) {
                                span.style.width = (colDef.width * 100) + '%';
                                if (colDef.align === 'RIGHT') span.style.textAlign = 'right';
                                if (colDef.bold) span.style.fontWeight = 'bold';
                            }
                            tableRow.appendChild(span);
                        });
                        div.appendChild(tableRow);
                    });
                }
                break;
        }
        container.appendChild(div);
    });
}
