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

// 1. Check Admin
function checkAdmin() {
    try {
        execSync('net session', { stdio: 'ignore' });
        log("Running with Administrator privileges.");
    } catch (e) {
        error("This installer requires Administrator privileges. Please right-click and 'Run as administrator'.");
        throw new Error("Not Admin");
    }
}

// 2. Generate and Trust Certificate
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

function createShortcuts() {
    log("Creating Shortcuts...");
    const getSpecialFolder = (folderName) => {
        try {
            const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::GetFolderPath('${folderName}')"`;
            return execSync(cmd).toString().trim();
        } catch (e) {
            log(`Error getting folder ${folderName}: ${e.message}`);
            return null;
        }
    };

    const desktopPath = getSpecialFolder('Desktop') || path.join(process.env.USERPROFILE, 'Desktop');
    const startMenuPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');

    log(`Desktop Path Resolved: ${desktopPath}`);
    log(`Startup Path Resolved: ${startMenuPath}`);

    const createShortcutPs = (target, shortcutPath, desc) => {
        log(`Creating shortcut: ${shortcutPath}`);
        log(`-> Target: ${target}`);

        const script = `$s=(New-Object -COM WScript.Shell).CreateShortcut('${shortcutPath}');$s.TargetPath='${target}';$s.Description='${desc}';$s.WorkingDirectory='${path.dirname(target)}';$s.Save()`;

        try {
            execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { stdio: 'inherit' });

            if (fs.existsSync(shortcutPath)) {
                log("Shortcut created successfully.");
            } else {
                log("Warning: Shortcut file not found after creation command.");
            }
        } catch (e) {
            log(`Error creating shortcut: ${e.message}`);
        }
    };

    // Main App Shortcut on Desktop
    createShortcutPs(TARGET_EXE, path.join(desktopPath, `${APP_NAME}.lnk`), "Start POS Agent");

    // Auto-start Shortcut
    createShortcutPs(TARGET_EXE, path.join(startMenuPath, `${APP_NAME}.lnk`), "Start POS Agent");

    // Uninstall Shortcut in Install Dir (or Start Menu if we made a folder there, but keeping it simple)
    createShortcutPs(TARGET_UNINSTALLER, path.join(desktopPath, `Uninstall ${APP_NAME}.lnk`), "Uninstall POS Agent");

    log("Shortcuts process finished.");
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

        // 3. Resolve Source Directory (Payload)
        let sourceDir;
        if (IS_PKG) {
            const payloadInDir = path.join(__dirname, 'payload');
            const payloadUp = path.join(__dirname, '..', 'payload');

            if (fs.existsSync(payloadInDir)) {
                sourceDir = payloadInDir;
            } else if (fs.existsSync(payloadUp)) {
                sourceDir = payloadUp;
            } else {
                sourceDir = payloadInDir;
            }
        } else {
            sourceDir = path.join(__dirname, '..', 'payload');
        }

        const sourceExe = path.join(sourceDir, 'pos-agent.exe');
        const sourceUninstall = path.join(sourceDir, 'uninstall.exe');
        const sourceConfig = path.join(sourceDir, 'config.json');

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
                const externalConfig = path.join(path.dirname(process.execPath), 'config.json');
                const bundledConfig = path.join(sourceDir, 'config.json');

                if (configToCopy) {
                    log(`Copying config to ${path.join(TARGET_DIR, 'config.json')}...`);
                    fs.copyFileSync(configToCopy, path.join(TARGET_DIR, 'config.json'));
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
                createShortcuts();
            }

            log("Installation Completed Successfully!");

            // Auto-start the service
            const vbsPath = path.join(TARGET_DIR, 'launcher.vbs');
            if (fs.existsSync(vbsPath)) {
                log("Starting POS Agent...");
                try {
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
