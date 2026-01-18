const fs = require('fs');
const path = require('path');

const defaults = {
    port: 3000,
    test_mode: true,
    allowed_origins: [], // Empty = Allow All
    printer: {
        type: 'epson',
        interface: 'printer:POS-58',
        width: 48,
        characterSet: 'PC852_LATIN2',
        removeSpecialCharacters: false,
        options: {
            timeout: 5000
        }
    }
};

function loadConfig() {
    let config = { ...defaults };

    // Determine where the executable is running
    const isPkg = typeof process.pkg !== 'undefined';
    const execDir = isPkg ? path.dirname(process.execPath) : __dirname;
    const configPath = path.join(execDir, 'config.json');

    console.log(`[CONFIG] Looking for config at: ${configPath}`);

    if (fs.existsSync(configPath)) {
        try {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            const userConfig = JSON.parse(fileContent);

            // Deep merge logic or simple override
            // For simplicity, we'll do top-level overrides and printer object override
            config = {
                ...config,
                ...userConfig,
                printer: {
                    ...config.printer,
                    ...(userConfig.printer || {})
                }
            };
            console.log("[CONFIG] Loaded external configuration.");
        } catch (e) {
            console.error("[CONFIG] Error parsing config.json:", e.message);
            console.error("[CONFIG] Using default configuration.");
        }
    } else {
        console.log("[CONFIG] No config.json found. Using defaults.");
    }

    return config;
}

module.exports = loadConfig();
