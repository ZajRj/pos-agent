const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const fs = require('fs');
const config = require('./config');

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
            // driver: require('printer') // Needs 'printer' or 'electron-printer' for 'printer:' interface
        });
        return printerInstance;
    } catch (e) {
        // Log error but don't crash app yet
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
            resolution: company.resolution // Might be missing, will fallback in print logic
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
                tax_label: item.tax ? (item.tax.name || "IMP") : "EXENTO" // Fallback
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
            vuelto: 0 // Not in payload usually
        }
    };
};

const printTicket = async (rawData) => {
    const data = normalizePayload(rawData);

    let printer;
    try {
        printer = getPrinter();
    } catch (e) {
        console.error("Critical: Printer initialization failed. Check config or missing drivers.");
        throw new Error("Printer initialization failed: " + e.message);
    }

    printer.clear();

    // --- Header ---
    printer.alignCenter();
    printer.bold(true);
    printer.println(data.company.commercial_name);
    printer.bold(false);
    printer.println(`CED: ${data.company.identification}`);
    printer.println(`Tel: ${data.company.phone}`);
    if (data.company.activity_code) {
        printer.println(`Cod. Actividad Económica: ${data.company.activity_code}`);
    }
    printer.newLine();

    // --- Document Info ---
    printer.alignLeft();
    printer.println(`Tiquete electrónico: ${data.document.consecutive}`);
    printer.println(`Versión del documento: ${data.document.version || '4.3'}`);
    printer.println(`Fecha: ${data.document.created_at}`);

    if (data.document.observations) {
        printer.println(`Observaciones:`);
        printer.println(data.document.observations);
    }

    printer.println("-".repeat(config.printer.width || 48));

    // --- Items Table Headers ---
    printer.tableCustom([
        { text: "DES", align: "LEFT", width: 0.45, bold: true },
        { text: "CAN", align: "RIGHT", width: 0.15, bold: true },
        { text: "PRECIO", align: "RIGHT", width: 0.20, bold: true },
        { text: "TOTAL", align: "RIGHT", width: 0.20, bold: true }
    ]);

    printer.println("-".repeat(config.printer.width || 48));

    // --- Items Detail ---
    if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
            // First print name
            printer.bold(true);
            printer.alignLeft();
            printer.println(item.name);
            printer.bold(false);

            // Then details in a new row
            printer.tableCustom([
                { text: item.tax_label || "GRAVADO", align: "LEFT", width: 0.45 },
                { text: item.quantity.toString(), align: "RIGHT", width: 0.15 },
                { text: item.price, align: "RIGHT", width: 0.20 },
                { text: item.total, align: "RIGHT", width: 0.20 }
            ]);
        });
    }

    printer.println("-".repeat(config.printer.width || 48));

    // --- Totals Section ---
    printer.alignLeft();
    printer.println(`Numero de Items ${data.items ? data.items.length : 0}.00`);

    const printTotalLine = (label, value) => {
        printer.println(`${label} ${value}`);
    };

    if (data.totals) {
        if (data.totals.exento) printTotalLine("EXENTO", data.totals.exento);
        if (data.totals.gravado) printTotalLine("GRAVADO", data.totals.gravado);
        if (data.totals.descuento) printTotalLine("DESCUENTO", data.totals.descuento);
        if (data.totals.exonerado) printTotalLine("TOTAL EXONERADO", data.totals.exonerado);
        if (data.totals.iva) printTotalLine("IVA", data.totals.iva);

        printer.bold(true);
        printTotalLine("TOTAL COMPROBANTE", data.totals.total);
        printer.bold(false);

        if (data.totals.vuelto) {
            printer.bold(true);
            printTotalLine("Vuelto", data.totals.vuelto);
            printer.bold(false);
        }
    }

    printer.println("-".repeat(config.printer.width || 48));
    printer.newLine();

    // --- Clave Key ---
    printer.alignLeft();
    printer.println("Clave Numérica");
    printer.println(data.document.key);
    printer.newLine();

    // --- Resolution Footer ---
    printer.alignCenter();
    printer.bold(true);
    printer.println("Autorizada mediante resolución No");
    printer.println(data.company.resolution || "MH-DGT-RES-0027-2024 del 19 de noviembre de 2024");
    printer.bold(false);
    printer.newLine();
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
            console.error("Error al enviar impresión a la impresora:", e.message);
            console.error("Verifique que la impresora esté encendida y conectada.");
            // Re-throw to inform server.js
            throw new Error(`Printer Error: ${e.message}`);
        }
    }
};

module.exports = { printTicket };
