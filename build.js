const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'dist');
const PAYLOAD_DIR = path.join(__dirname, 'payload');

function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
}

function clean() {
    console.log("Cleaning...");
    if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
    if (fs.existsSync(PAYLOAD_DIR)) fs.rmSync(PAYLOAD_DIR, { recursive: true, force: true });
    fs.mkdirSync(DIST_DIR);
    fs.mkdirSync(PAYLOAD_DIR);
}

function buildCore() {
    console.log("Building Core Executables...");

    // Use 'pkg .' to let pkg manage the directory structure/snapshot correctly based on package.json
    // This outputs [bin-key]-win.exe files to the payload directory
    run(`npx pkg . --target node18-win-x64 --out-path ${PAYLOAD_DIR} --compress GZip`);

    // Helper to rename if exists
    const rename = (src, dest) => {
        if (fs.existsSync(src)) fs.renameSync(src, dest);
    };

    // Rename outputs to match expected filenames
    rename(path.join(PAYLOAD_DIR, 'pos-agent-win.exe'), path.join(PAYLOAD_DIR, 'pos-agent.exe'));
    rename(path.join(PAYLOAD_DIR, 'uninstall-win.exe'), path.join(PAYLOAD_DIR, 'uninstall.exe'));

    // Delete the setup artifact from payload (it will be built separately as the installer)
    if (fs.existsSync(path.join(PAYLOAD_DIR, 'setup-win.exe'))) {
        fs.unlinkSync(path.join(PAYLOAD_DIR, 'setup-win.exe'));
    }

    // Copy config.json to payload
    fs.copyFileSync(path.join(__dirname, 'src/config.json'), path.join(PAYLOAD_DIR, 'config.json'));
    // Copy launcher.vbs to payload
    fs.copyFileSync(path.join(__dirname, 'src/launcher.vbs'), path.join(PAYLOAD_DIR, 'launcher.vbs'));
}

function buildSetup() {
    console.log("Building Setup Installer...");

    // Verify payload exists
    if (!fs.existsSync(path.join(PAYLOAD_DIR, 'pos-agent.exe'))) {
        throw new Error("Payload missing.");
    }

    run(`npx pkg src/setup.js -c package.json --target node18-win-x64 --output ${path.join(DIST_DIR, 'POSAgent-Setup.exe')} --compress GZip`);

    console.log(`Installer ready at: ${path.join(DIST_DIR, 'POSAgent-Setup.exe')}`);

    // Clean up extra binaries generated in dist
    ['pos-agent-win.exe', 'uninstall-win.exe'].forEach(f => {
        const p = path.join(DIST_DIR, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });
}

function main() {
    try {
        clean();
        buildCore();
        buildSetup();
        console.log("\nBuild Complete! Installer is at dist/POSAgent-Setup.exe");
    } catch (e) {
        console.error("Build Failed:", e.message);
        process.exit(1);
    }
}

main();
