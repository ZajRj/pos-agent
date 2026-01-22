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
    // Output to DIST_DIR first to avoid pkg scanning 'payload' while writing to it (circular issue with assets)
    run(`npx pkg . --target node18-win-x64 --out-path ${DIST_DIR} --compress GZip`);

    // Helper to rename if exists
    // Helper to rename if exists
    const rename = (src, dest) => {
        if (fs.existsSync(src)) fs.renameSync(src, dest);
    };

    // Move from DIST_DIR to PAYLOAD_DIR and rename
    // pkg might output 'pos-agent-win.exe' or 'pos-agent.exe' depending on env/config
    const possibleNames = ['pos-agent-win.exe', 'pos-agent.exe'];
    let moved = false;
    for (const name of possibleNames) {
        const src = path.join(DIST_DIR, name);
        if (fs.existsSync(src)) {
            rename(src, path.join(PAYLOAD_DIR, 'pos-agent.exe'));
            moved = true;
            break;
        }
    }
    if (!moved) {
        console.warn("Warning: Could not find pos-agent executable in dist to move!");
    }

    // Build uninstall.exe - this can go directly to payload as it doesn't include payload itself (usually)
    // But to be safe, let's output to DIST and move
    run(`npx pkg src/installer/uninstall.js -c package.json --target node18-win-x64 --output ${path.join(DIST_DIR, 'uninstall.exe')} --compress GZip`);
    rename(path.join(DIST_DIR, 'uninstall.exe'), path.join(PAYLOAD_DIR, 'uninstall.exe'));

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
    // Output to DIST first
    run(`npx pkg . --target node18-linux-x64 --out-path ${DIST_DIR} --compress GZip`);

    // Move and rename
    // pkg might output 'pos-agent-linux' or 'pos-agent'
    const possibleLinuxNames = ['pos-agent-linux', 'pos-agent'];
    let movedLinux = false;
    for (const name of possibleLinuxNames) {
        const src = path.join(DIST_DIR, name);
        if (fs.existsSync(src)) {
            // Determine destination
            fs.renameSync(src, path.join(PAYLOAD_DIR, 'pos-agent'));
            movedLinux = true;
            break;
        }
    }
    if (!movedLinux) {
        console.warn("Warning: Could not find pos-agent linux binary in dist to move!");
    }

    // 2. Prepare Linux artifacts
    const linuxDistDir = path.join(DIST_DIR, 'linux-x64');
    if (!fs.existsSync(linuxDistDir)) fs.mkdirSync(linuxDistDir);

    fs.copyFileSync(path.join(PAYLOAD_DIR, 'pos-agent'), path.join(linuxDistDir, 'pos-agent'));
    fs.copyFileSync(path.join(__dirname, 'src/installer/install.sh'), path.join(linuxDistDir, 'install.sh'));

    // Generate default config.json for Linux 
    const defaultConfig = {
        port: 3000,
        test_mode: true,
        update_url: "https://ticofacturacr.com/downloads/pos-agent/version.json",
        allowed_origins: [],
        printer: {
            type: 'epson',
            interface: 'printer:POS-58',
            width: 32,
            removeSpecialCharacters: false,
            options: {
                timeout: 5000
            }
        }
    };
    fs.writeFileSync(path.join(linuxDistDir, 'config.json'), JSON.stringify(defaultConfig, null, 2));



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
