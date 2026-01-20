const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const selfsigned = require('selfsigned');

// --- Configuration ---
const APP_NAME = "POS Agent";
const INSTALL_DIR_NAME = "POSAgent";
const EXE_NAME = "pos-agent.exe";
const UNINSTALLER_NAME = "uninstall.exe";

const IS_PKG = process.pkg !== undefined;

const TARGET_DIR = path.join(process.env.LOCALAPPDATA, INSTALL_DIR_NAME);
const TARGET_EXE = path.join(TARGET_DIR, EXE_NAME);
const TARGET_UNINSTALLER = path.join(TARGET_DIR, UNINSTALLER_NAME);

function log(msg) {
    console.log(`[SETUP] ${msg}`);
}

function error(msg) {
    console.error(`[ERROR] ${msg}`);
    // Keep window open for a bit
    setTimeout(() => process.exit(1), 5000);
}


function checkAdmin() {
    try {
        execSync('net session', { stdio: 'ignore' });
        log("Running with Administrator privileges.");
    } catch (e) {
        error("This installer requires Administrator privileges. Please right-click and 'Run as administrator'.");
        throw new Error("Not Admin");
    }
}


async function setupCertificates() {
    log("Generating SSL Certificates...");
    const attrs = [{ name: 'commonName', value: 'localhost' }];


    const pems = await selfsigned.generate(attrs, { days: 3650 });

    const keyPath = path.join(TARGET_DIR, 'key.pem');
    const certPath = path.join(TARGET_DIR, 'cert.pem');

    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    log("Keys generated.");

    try {
        execSync(`certutil -addstore -f "Root" "${certPath}"`);
        log("Certificate registered.");
    } catch (e) {
        log("Certificate warning: " + e.message);
    }
}



async function main() {
    console.log("==========================================");
    console.log(`      ${APP_NAME} Installer`);
    console.log("==========================================");

    try {
        checkAdmin();

        // Create Directory
        if (!fs.existsSync(TARGET_DIR)) {
            fs.mkdirSync(TARGET_DIR, { recursive: true });
            log(`Created installation directory: ${TARGET_DIR}`);
        }

        // Resolve Source Directory (Payload)
        let sourceDir;
        if (IS_PKG) {
            // In pkg snapshot, we are at src/installer/setup.js
            // payload is at root /payload
            // So we need to go up two levels: ../../payload
            const payloadInSnapshot = path.join(__dirname, '..', '..', 'payload');

            if (fs.existsSync(payloadInSnapshot)) {
                sourceDir = payloadInSnapshot;
            } else {
                // Fallback or debug
                sourceDir = path.join(__dirname, 'payload');
            }
        } else {
            // In dev: src/installer/setup.js -> root/payload is ../../payload
            sourceDir = path.join(__dirname, '..', '..', 'payload');
        }

        const sourceExe = path.join(sourceDir, 'pos-agent.exe');
        const sourceUninstall = path.join(sourceDir, 'uninstall.exe');

        if (!fs.existsSync(sourceExe)) {
            if (!IS_PKG && sourceDir === __dirname) {
                log("DEV MODE warning: pos-agent.exe not found.");
            } else {
                throw new Error(`pos-agent.exe not found at: ${sourceExe}`);
            }
        } else {
            log("Copying application files...");

            try {
                log(`Copying ${sourceExe} to ${TARGET_EXE}...`);
                fs.copyFileSync(sourceExe, TARGET_EXE);

                if (fs.existsSync(sourceUninstall)) {
                    log(`Copying ${sourceUninstall} to ${TARGET_UNINSTALLER}...`);
                    fs.copyFileSync(sourceUninstall, TARGET_UNINSTALLER);
                }

                let configToCopy = null;

                // 1. Check for config.json beside the installer (External Config)
                // In pkg (EXE), process.execPath is the EXE itself. dirname is the folder containing the EXE.
                // In node (Dev), process.execPath is node.exe. The script is setup.js.
                // useful for bundled installers where users drop a config.json next to the setup.exe

                let potentialExternalDir;
                if (IS_PKG) {
                    potentialExternalDir = path.dirname(process.execPath);
                } else {
                    // In Dev, we might want to check the root of the project or just skip foreign config check
                    // for simplicity, let's check the project root relative to this script
                    potentialExternalDir = path.join(__dirname, '..', '..');
                }

                const externalConfig = path.join(potentialExternalDir, 'config.json');
                const bundledConfig = path.join(sourceDir, 'config.json');

                log(`Checking for external config at: ${externalConfig}`);

                if (fs.existsSync(externalConfig)) {
                    log("Found external config.json. Using it.");
                    configToCopy = externalConfig;
                } else if (fs.existsSync(bundledConfig)) {
                    log(`External config not found. Checking bundled config at: ${bundledConfig}`);
                    if (fs.existsSync(bundledConfig)) {
                        log("Found bundled config.json. Using it.");
                        configToCopy = bundledConfig;
                    }
                } else {
                    log("No config.json found (neither external nor bundled). Using defaults.");
                }

                if (configToCopy) {
                    const targetConfigPath = path.join(TARGET_DIR, 'config.json');
                    log(`Copying config from ${configToCopy} to ${targetConfigPath}...`);
                    try {
                        fs.copyFileSync(configToCopy, targetConfigPath);
                        log("Config copied successfully.");
                    } catch (err) {
                        log("Error copying config: " + err.message);
                    }
                }

                const sourceLauncher = path.join(sourceDir, 'launcher.vbs');
                if (fs.existsSync(sourceLauncher)) {
                    log(`Copying ${sourceLauncher} to ${path.join(TARGET_DIR, 'launcher.vbs')}...`);
                    fs.copyFileSync(sourceLauncher, path.join(TARGET_DIR, 'launcher.vbs'));
                }

            } catch (err) {
                log("Error during file copy: " + err.message);
                throw err;
            }

            await setupCertificates();

            if (IS_PKG) {
                const { createShortcut, getStartupPath, getDesktopPath } = require('../utils/shortcuts');

                // Update: Point shortcuts to launcher.vbs instead of exe for headless mode
                const vbsPath = path.join(TARGET_DIR, 'launcher.vbs');
                const vbsTarget = fs.existsSync(vbsPath) ? vbsPath : TARGET_EXE;
                const desc = "Start POS Agent (Background)";

                log("Creating Shortcuts...");

                const desktopPath = getDesktopPath();
                const startMenuPath = getStartupPath();

                log(`Desktop Path: ${desktopPath}`);
                log(`Startup Path: ${startMenuPath}`);

                // Main App Shortcut on Desktop (points to VBS)
                createShortcut(vbsTarget, path.join(desktopPath, `${APP_NAME}.lnk`), desc, TARGET_EXE);
                log("Desktop shortcut created.");

                // Auto-start Shortcut (points to VBS)
                createShortcut(vbsTarget, path.join(startMenuPath, `${APP_NAME}.lnk`), desc, TARGET_EXE);
                log("Startup shortcut created.");

                // Uninstall Shortcut (keeps pointing to uninstall.exe)
                createShortcut(TARGET_UNINSTALLER, path.join(desktopPath, `Uninstall ${APP_NAME}.lnk`), "Uninstall POS Agent");
                log("Uninstall shortcut created.");

                log("Shortcuts process finished.");
            }

            log("Installation Completed Successfully!");

            // Auto-start the service
            const vbsPath = path.join(TARGET_DIR, 'launcher.vbs');
            if (fs.existsSync(vbsPath)) {
                log("Starting POS Agent...");
                try {
                    // Use wscript explicitly to ensure hidden window
                    execSync(`wscript.exe "${vbsPath}"`);
                    log("Service started.");
                } catch (e) {
                    log("Warning: Could not auto-start service: " + e.message);
                }
            }

            log("You can now start the agent from your Desktop.");

            console.log("\nPress any key to exit...");
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', process.exit.bind(process, 0));
        }

    } catch (e) {
        error("Installation Failed: " + e.message);
    }
}

main();
