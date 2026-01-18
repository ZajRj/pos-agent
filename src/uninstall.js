const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_NAME = "POS Agent";
const INSTALL_DIR_NAME = "POSAgent";
const TARGET_DIR = path.join(process.env.LOCALAPPDATA, INSTALL_DIR_NAME);

function log(msg) {
    console.log(`[UNINSTALL] ${msg}`);
}

async function waitExit() {
    console.log("\nPress any key to exit...");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    return new Promise(resolve => process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.exit(0);
    }));
}

function checkAdmin() {
    try {
        execSync('net session', { stdio: 'ignore' });
        log("Running with Administrator privileges.");
        return true;
    } catch (e) {
        console.error("[ERROR] This uninstaller requires Administrator privileges to remove certificates.");
        console.error("Please right-click and 'Run as administrator'.");
        return false;
    }
}

function removeCertificates() {
    log("Removing Certificate from Trusted Root Store...");
    try {
        execSync('certutil -delstore "Root" "localhost"');
        log("Certificate removed (or process completed).");
    } catch (e) {
        log("Warning: Could not remove certificate automatically. Use certmgr.msc to remove 'localhost' manually.");
    }
}

function removeShortcuts() {
    log("Removing Shortcuts...");
    const getSpecialFolder = (folderName) => {
        try {
            const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::GetFolderPath('${folderName}')"`;
            return execSync(cmd).toString().trim();
        } catch (e) {
            return null;
        }
    };

    const desktopPath = getSpecialFolder('Desktop') || path.join(process.env.USERPROFILE, 'Desktop');
    const startMenuPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');

    const shortcutName = `${APP_NAME}.lnk`;
    const uninstallName = `Uninstall ${APP_NAME}.lnk`;

    [
        path.join(desktopPath, shortcutName),
        path.join(desktopPath, uninstallName),
        path.join(startMenuPath, shortcutName)
    ].forEach(p => {
        if (fs.existsSync(p)) {
            try {
                fs.unlinkSync(p);
                log(`Removed: ${p}`);
            } catch (e) {
                log(`Failed to remove ${p}: ${e.message}`);
            }
        }
    });
}

function cleanupFiles() {
    log("Cleaning up files...");

    if (fs.existsSync(TARGET_DIR)) {
        try {
            fs.readdirSync(TARGET_DIR).forEach(file => {
                const curPath = path.join(TARGET_DIR, file);

                try {
                    if (path.basename(process.execPath).toLowerCase() !== file.toLowerCase() || file.toLowerCase() === 'launcher.vbs') {
                        fs.unlinkSync(curPath);
                    }
                } catch (e) { }
            });

            // Try to remove dir
            try {
                fs.rmdirSync(TARGET_DIR);
            } catch (e) {
                log("Could not remove installation folder completely (likely in use). It will remain until manual deletion.");
            }
        } catch (e) {
            log("Error cleaning up files: " + e.message);
        }
    }
}

async function main() {
    console.log("==========================================");
    console.log(`      ${APP_NAME} Uninstaller`);
    console.log("==========================================");

    try {
        if (!checkAdmin()) {
            await waitExit();
            return;
        }

        removeCertificates();
        removeShortcuts();
        cleanupFiles();

        log("Uninstallation Completed.");
        console.log("Note: Any remaining files in AppData/POSAgent can be manually deleted.");

        await waitExit();

    } catch (e) {
        console.error("Uninstallation Error: " + e.message);
        await waitExit();
    }
}

main();
