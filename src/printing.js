const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const fs = require('fs');
const config = require('./config');

// --- Configuration ---
const LINE_WIDTH = config.printer.width || 32; // Default to 32 for POS-58
const TABLE_LAYOUT = [
    { text: "CAN", align: "LEFT", width: 0.20, bold: true },
    { text: "PRECIO", align: "RIGHT", width: 0.40, bold: true },
    { text: "TOTAL", align: "RIGHT", width: 0.40, bold: true }
];


let printerInstance = null;

function getPrinter() {
    if (printerInstance) return printerInstance;

    try {
        printerInstance = new ThermalPrinter({
            type: config.printer.type === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
            interface: config.test_mode ? 'tcp://0.0.0.0' : config.printer.interface,
            width: config.printer.width,
            characterSet: config.printer.characterSet,
            removeSpecialCharacters: false
        });
        return printerInstance;
    } catch (e) {
        console.error("Failed to initialize printer driver:", e.message);
        throw e;
    }
}

const normalizePayload = (input) => {
    // If it already matches the internal structure (has 'document' and 'items' at root), return it.
    if (input.document && input.items) return input;

    // Handle the nested structure from the user request
    const rootData = input.data || {};
    const company = rootData.company || {};
    const rawItems = rootData.data || [];

    // Format date nicely if possible
    let formattedDate = rootData.created_at;
    try {
        const dateObj = new Date(rootData.created_at);
        if (!isNaN(dateObj.getTime())) {
            formattedDate = dateObj.toLocaleString('es-CR');
        }
    } catch (e) { }

    return {
        company: {
            commercial_name: company.name || "N/A",
            identification: company.identification || "",
            phone: company.phone || "",
            activity_code: company.activity_code || "",
            resolution: company.resolution
        },
        document: {
            consecutive: rootData.consecutive || "",
            key: rootData.key || "",
            version: '4.3',
            created_at: formattedDate,
            observations: ""
        },
        items: rawItems.map(item => {
            const qty = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.price) || 0;
            const total = qty * price;
            return {
                name: item.name || "Item",
                quantity: qty,
                price: price.toFixed(2),
                total: total.toFixed(2),
                tax_label: item.tax ? (item.tax.name || "IMP") : "EXENTO"
            };
        }),
        totals: {
            subtotal: input.subtotal,
            taxes: input.taxes,
            total: input.calculated_total || input.total,
            exento: input.exento,
            gravado: input.gravado,
            descuento: input.discounts,
            iva: input.taxes,
            vuelto: 0
        }
    };
};

// --- Modular Print Functions ---

function printSeparator(printer) {
    printer.println("-".repeat(LINE_WIDTH));
}

function printHeader(printer, company) {
    printer.alignCenter();
    printer.bold(true);
    printer.println(company.commercial_name);
    printer.bold(false);
    printer.println(`CED: ${company.identification}`);
    printer.println(`Tel: ${company.phone}`);
    if (company.activity_code) {
        printer.println(`Cod. Actividad Económica: ${company.activity_code}`);
    }
    printer.newLine();
}

function printDocumentInfo(printer, doc) {
    printer.alignLeft();
    printer.println(`Tiquete electrónico: ${doc.consecutive}`);
    printer.println(`Versión del documento: ${doc.version || '4.3'}`);
    printer.println(`Fecha: ${doc.created_at}`);

    if (doc.observations) {
        printer.println(`Observaciones:`);
        printer.println(doc.observations);
    }
    printSeparator(printer);
}

function printItems(printer, items) {
    // Headers
    printer.tableCustom(TABLE_LAYOUT);
    printSeparator(printer);

    // Rows
    if (items && items.length > 0) {
        items.forEach(item => {
            // 1. Name
            printer.bold(true);
            printer.alignLeft();
            printer.println(item.name);
            printer.bold(false);

            // 2. Details (using same width distribution as headers for alignment)
            printer.tableCustom([
                { text: item.quantity.toString(), align: "LEFT", width: TABLE_LAYOUT[0].width },
                { text: item.price, align: "RIGHT", width: TABLE_LAYOUT[1].width },
                { text: item.total, align: "RIGHT", width: TABLE_LAYOUT[2].width }
            ]);
        });
    }
    printSeparator(printer);
}

function printTotals(printer, totals, itemCount) {
    printer.alignLeft();
    printer.println(`Numero de Items ${itemCount}.00`);

    const printLine = (label, value) => printer.println(`${label} ${value}`);

    if (totals) {
        if (totals.exento) printLine("EXENTO", totals.exento);
        if (totals.gravado) printLine("GRAVADO", totals.gravado);
        if (totals.descuento) printLine("DESCUENTO", totals.descuento);
        if (totals.exonerado) printLine("TOTAL EXONERADO", totals.exonerado);
        if (totals.iva) printLine("IVA", totals.iva);

        printer.bold(true);
        printLine("TOTAL COMPROBANTE", totals.total);
        printer.bold(false);

        if (totals.vuelto) {
            printer.bold(true);
            printLine("Vuelto", totals.vuelto);
            printer.bold(false);
        }
    }
    printSeparator(printer);
    printer.newLine();
}

function printFooter(printer, data) {
    // Key
    printer.alignLeft();
    printer.println("Clave Numérica");
    printer.println(data.document.key);
    printer.newLine();

    // Resolution
    printer.alignCenter();
    printer.bold(true);
    printer.println("Autorizada mediante resolución No");
    printer.println(data.company.resolution || "MH-DGT-RES-0027-2024 del 19 de noviembre de 2024");
    printer.bold(false);
    printer.newLine();
    printer.newLine();
}

// --- Main Orchestrator ---

const printTicket = async (rawData) => {
    const data = normalizePayload(rawData);

    let printer;
    try {
        printer = getPrinter();
    } catch (e) {
        console.error("Critical: Printer initialization failed.", e);
        throw new Error("Printer initialization failed: " + e.message);
    }

    printer.clear();

    printHeader(printer, data.company);
    printDocumentInfo(printer, data.document);
    printItems(printer, data.items);
    printTotals(printer, data.totals, data.items ? data.items.length : 0);
    printFooter(printer, data);

    printer.cut();
    if (!config.test_mode) {
        printer.beep();
    }

    if (config.test_mode) {
        const buffer = printer.getBuffer();
        fs.writeFileSync('ticket_simulado.bin', buffer);
        console.log("Ticket guardado en ticket_simulado.bin");
    } else {
        try {
            await printer.execute();
            console.log("Impresión enviada correctamente.");
        } catch (e) {
            console.error("Error al enviar impresión:", e.message);
            console.error("Verifique que la impresora esté encendida y conectada.");
            throw new Error(`Printer Error: ${e.message}`);
        }
    }
};

const printGeneric = async (data) => {
    let printer;
    try {
        printer = getPrinter();
    } catch (e) {
        console.error("Critical: Printer initialization failed.", e);
        throw new Error("Printer initialization failed: " + e.message);
    }

    printer.clear();

    //expected json {lines: ["line1", "line2"]}
    data.lines.forEach(line => {
        printer.println(line);
    });

    printer.newLine();
    
    printer.cut();

    if (!config.test_mode) {
        printer.beep();
    }

    if (config.test_mode) {
        const buffer = printer.getBuffer();
        fs.writeFileSync('ticket_simulado.bin', buffer);
        console.log("Ticket guardado en ticket_simulado.bin");
    } else {
        try {
            await printer.execute();
            console.log("Impresión enviada correctamente.");
        } catch (e) {
            console.error("Error al enviar impresión:", e.message);
            console.error("Verifique que la impresora esté encendida y conectada.");
            throw new Error(`Printer Error: ${e.message}`);
        }
    }
};

module.exports = { printTicket, printGeneric };
