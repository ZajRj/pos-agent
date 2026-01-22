const path = require('path');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const Jimp = require('jimp');
const fs = require('fs');
const config = require('./config');

// --- Environment ---
const isPkg = typeof process.pkg !== 'undefined';
const execDir = isPkg ? path.dirname(process.execPath) : __dirname;


let printerInstance = null;
let printingLock = Promise.resolve();
let lastJob = null;

function getPrinter() {
    if (printerInstance) return printerInstance;

    let charSet = config.printer.characterSet;
    if (charSet === 'PC852') charSet = 'PC852_LATIN2';

    try {
        console.log("Initializing printer driver...");
        printerInstance = new ThermalPrinter({
            type: config.printer.type === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
            interface: config.test_mode ? 'tcp://0.0.0.0' : config.printer.interface,
            width: config.printer.width,
            characterSet: charSet,
            removeSpecialCharacters: false
        });

        return printerInstance;
    } catch (e) {
        console.error("Failed to initialize printer driver:", e.message);
        throw e;
    }
}

// --- Modular Helpers ---

async function processLogo(dataBase64) {
    const logoName = `logo_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`;
    const logoPath = path.join(execDir, logoName);
    try {
        const buffer = Buffer.from(dataBase64, 'base64');
        let image = await Jimp.read(buffer);

        // 1. Force white background
        const whiteBg = new Jimp(image.bitmap.width, image.bitmap.height, 0xFFFFFFFF);
        whiteBg.composite(image, 0, 0);
        image = whiteBg;

        // 2. Grayscale & High Contrast
        image.greyscale().contrast(0.8).posterize(2);

        // 3. Resizing (max width for thermal)
        const targetWidth = 280;
        if (image.bitmap.width > targetWidth) {
            image.resize(targetWidth, Jimp.AUTO);
        }

        await image.writeAsync(logoPath);
        const processedBase64 = await image.getBase64Async(Jimp.MIME_PNG);
        return { logoPath, processedBase64 };
    } catch (e) {
        console.error("Logo processing error:", e.message);
        return null;
    }
}

async function processCommand(printer, cmd) {
    if (!cmd || !cmd.type) return;

    switch (cmd.type) {
        case 'text':
            if (cmd.align) printer.alignLeft(); // Reset default
            if (cmd.align === 'center') printer.alignCenter();
            if (cmd.align === 'right') printer.alignRight();

            printer.bold(!!cmd.bold);
            printer.underline(!!cmd.underline);

            if (cmd.value) printer.println(cmd.value);
            else printer.newLine();

            // Reset styles
            printer.bold(false);
            printer.underline(false);
            printer.alignLeft();
            break;

        case 'table':
            if (cmd.rows && Array.isArray(cmd.rows)) {
                // Formatting rows for node-thermal-printer tableCustom
                const formattedRows = cmd.rows.map(row => {
                    return row.map((cell, idx) => {
                        const colDef = (cmd.columns && cmd.columns[idx]) || {};
                        return {
                            text: String(cell),
                            align: colDef.align || "LEFT",
                            width: colDef.width || (1 / row.length),
                            bold: !!colDef.bold
                        };
                    });
                });
                formattedRows.forEach(row => printer.tableCustom(row));
            }
            break;

        case 'image':
            if (cmd.data) {
                const result = await processLogo(cmd.data);
                if (result) {
                    const { logoPath, processedBase64 } = result;
                    cmd.data = processedBase64; // Update command for accurate preview

                    if (cmd.align === 'center') printer.alignCenter();
                    if (cmd.align === 'right') printer.alignRight();
                    await printer.printImage(logoPath);
                    printer.alignLeft();
                    if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
                }
            }
            break;

        case 'barcode':
            if (cmd.value) {
                printer.barcode(cmd.value, cmd.mode || "CODE128", cmd.options || {});
            }
            break;

        case 'qrcode':
            if (cmd.value) {
                printer.alignCenter();
                printer.printQR(cmd.value);
                printer.alignLeft();
            }
            break;

        case 'separator':
            printer.println("-".repeat(config.printer.width || 32));
            break;

        case 'newLine':
            printer.newLine();
            break;

        case 'cut':
            printer.cut();
            break;

        case 'partialCut':
            printer.partialCut();
            break;

        case 'beep':
            printer.beep();
            break;

        case 'raw':
            if (cmd.data) {
                printer.raw(Buffer.from(cmd.data));
            }
            break;

        default:
            console.warn("Unknown command type:", cmd.type);
    }
}

// --- Main Orchestrator ---

const executePrintJob = async (payload) => {
    return (printingLock = printingLock.then(async () => {
        let printer;
        try {
            printer = getPrinter();
        } catch (e) {
            console.error("Critical: Printer initialization failed.", e);
            throw new Error("Printer initialization failed: " + e.message);
        }

        printer.clear();
        // Reset left margin
        printer.raw(Buffer.from([0x1d, 0x4c, 0x00, 0x00]));

        const commands = Array.isArray(payload) ? payload : (payload.commands || []);
        lastJob = commands;

        for (const cmd of commands) {
            await processCommand(printer, cmd);
        }

        if (config.test_mode) {
            const buffer = printer.getBuffer();
            fs.writeFileSync('last_job_simulado.bin', buffer);
            console.log("Job simulado guardado en last_job_simulado.bin");
        } else {
            try {
                await printer.execute();
                console.log("Impresión enviada correctamente.");
            } catch (e) {
                console.error("Error al enviar impresión:", e.message);
                throw new Error(`Printer Error: ${e.message}`);
            }
        }
        printer.clear();
    }).catch(e => {
        console.error("Print job failed in queue:", e);
        throw e;
    }));
};

const openCashRegister = async () => {
    return (printingLock = printingLock.then(async () => {
        let printer;
        try {
            printer = getPrinter();
        } catch (e) {
            throw new Error("Printer initialization failed: " + e.message);
        }

        printer.clear();
        if (config.test_mode) {
            console.log("Cash register open sent successfully.");
        } else {
            try {
                printer.openCashDrawer();
                console.log("Cash register open sent successfully.");
            } catch (e) {
                throw new Error(`Printer Error: ${e.message}`);
            }
        }
    }));
};

const getLastJob = () => lastJob;

module.exports = { executePrintJob, openCashRegister, getLastJob };

