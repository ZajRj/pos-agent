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

    // Build uninstall.exe
    run(`npx pkg src/installer/uninstall.js -c package.json --target node18-win-x64 --output ${path.join(PAYLOAD_DIR, 'uninstall.exe')} --compress GZip`);

    // Copy config.json to payload
    // fs.copyFileSync(path.join(__dirname, 'src/config.json'), path.join(PAYLOAD_DIR, 'config.json'));


    // Copy launcher.vbs to payload
    fs.copyFileSync(path.join(__dirname, 'src/installer/launcher.vbs'), path.join(PAYLOAD_DIR, 'launcher.vbs'));
}

function buildSetup() {
    console.log("Building Setup Installer...");

    // Verify payload exists
    if (!fs.existsSync(path.join(PAYLOAD_DIR, 'pos-agent.exe'))) {
        throw new Error("Payload missing.");
    }

    run(`npx pkg src/installer/setup.js -c package.json --target node18-win-x64 --output ${path.join(DIST_DIR, 'POSAgent-Setup.exe')} --compress GZip`);

    console.log(`Installer ready at: ${path.join(DIST_DIR, 'POSAgent-Setup.exe')}`);

    // Clean up extra binaries generated in dist
    ['pos-agent-win.exe'].forEach(f => {
        const p = path.join(DIST_DIR, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });
}

function buildLinux() {
    console.log("Building Linux Binary...");

    // 1. Build Linux Binary (linux-x64, linux-arm64)
    run(`npx pkg . --target node18-linux-x64 --out-path ${PAYLOAD_DIR} --compress GZip`);

    // Rename output
    if (fs.existsSync(path.join(PAYLOAD_DIR, 'pos-agent-linux'))) {
        fs.renameSync(path.join(PAYLOAD_DIR, 'pos-agent-linux'), path.join(PAYLOAD_DIR, 'pos-agent'));
    }

    // 2. Prepare Linux artifacts
    const linuxDistDir = path.join(DIST_DIR, 'linux-x64');
    if (!fs.existsSync(linuxDistDir)) fs.mkdirSync(linuxDistDir);

    fs.copyFileSync(path.join(PAYLOAD_DIR, 'pos-agent'), path.join(linuxDistDir, 'pos-agent'));
    fs.copyFileSync(path.join(__dirname, 'src/installer/install.sh'), path.join(linuxDistDir, 'install.sh'));
    fs.copyFileSync(path.join(__dirname, 'src/config.json'), path.join(linuxDistDir, 'config.json'));

    console.log(`Linux artifacts ready at: ${linuxDistDir}`);

    try {
        const tarCmd = `tar -czvf "pos-agent-linux.tar.gz" -C "${path.join(DIST_DIR, 'linux-x64')}" .`;
        run(tarCmd);
        // Move tar to dist root
        fs.renameSync(path.join(process.cwd(), 'pos-agent-linux.tar.gz'), path.join(DIST_DIR, 'pos-agent-linux.tar.gz'));
        console.log(`Packet created: ${path.join(DIST_DIR, 'pos-agent-linux.tar.gz')}`);
    } catch (e) {
        console.warn("Could not create tarball automatically (tar might not be in PATH).", e.message);
        console.log("To package manually: tar -czvf pos-agent-linux.tar.gz -C dist/linux-x64 .");
    }
}

function main() {
    try {
        clean();
        buildCore();
        buildSetup();
        buildLinux();
        console.log("\nBuild Complete! Installer is at dist/POSAgent-Setup.exe");
    } catch (e) {
        console.error("Build Failed:", e.message);
        process.exit(1);
    }
}

main();
