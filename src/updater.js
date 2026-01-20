const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Determine if we are running as a packaged executable
const isPkg = typeof process.pkg !== 'undefined';
const execPath = isPkg ? process.execPath : process.argv[1];
const execDir = path.dirname(execPath);

/**
 * Compare semantic versions (simple implementation)
 * Returns true if remote > local
 */
function isNewer(local, remote) {
    const l = local.split('.').map(Number);
    const r = remote.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (r[i] > l[i]) return true;
        if (r[i] < l[i]) return false;
    }
    return false; // Equal
}

/**
 * Check for updates
 * @param {string} updateUrl - URL to version.json (e.g. https://example.com/version.json)
 * @param {string} currentVersion - Current app version
 * @returns {Promise<{available: boolean, version: string, url: string}>}
 */
/**
 * Check for updates (supports redirects)
 * @param {string} updateUrl 
 * @param {string} currentVersion 
 */
function checkForUpdate(updateUrl, currentVersion) {
    return new Promise((resolve, reject) => {
        if (!updateUrl) return resolve({ available: false });

        const get = (url, redirectCount = 0) => {
            if (redirectCount > 5) return reject(new Error('Too many redirects'));

            https.get(url, (res) => {
                // Handle Redirects
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    return get(res.headers.location, redirectCount + 1);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`Failed to check update. Status: ${res.statusCode}`));
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const info = JSON.parse(data);
                        if (isNewer(currentVersion, info.version)) {
                            resolve({ available: true, version: info.version, url: info.url });
                        } else {
                            resolve({ available: false, version: info.version });
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', (e) => reject(e));
        };
        get(updateUrl);
    });
}

/**
 * Download the update file
 * @param {string} fileUrl 
 * @param {string} destPath 
 */
/**
 * Download the update file (supports redirects)
 * @param {string} fileUrl 
 * @param {string} destPath 
 */
function downloadUpdate(fileUrl, destPath) {
    return new Promise((resolve, reject) => {
        const get = (url, redirectCount = 0) => {
            if (redirectCount > 5) return reject(new Error('Too many redirects'));

            https.get(url, (res) => {
                // Handle Redirects
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    console.log(`[Updater] Redirect (${res.statusCode}) -> ${res.headers.location}`);
                    return get(res.headers.location, redirectCount + 1);
                }

                console.log(`[Updater] Response: ${res.statusCode}. Content-Length: ${res.headers['content-length']}`);

                if (res.statusCode !== 200) {
                    return reject(new Error(`Download failed. Status: ${res.statusCode}`));
                }

                const file = fs.createWriteStream(destPath);
                res.pipe(file);

                let downloaded = 0;
                res.on('data', chunk => downloaded += chunk.length);

                file.on('finish', () => {
                    console.log(`[Updater] Download finished. Total: ${downloaded} bytes.`);
                    file.close(resolve);
                });
            }).on('error', (err) => {
                try { fs.unlinkSync(destPath); } catch (e) { }
                reject(err);
            });
        };
        get(fileUrl);
    });
}

/**
 * Generate Batch script and kill self
 * @param {string} updateFile Path to the new downloaded exe
 */
function installUpdate(updateFile) {
    const batFile = path.join(execDir, 'update.bat');
    const appExe = path.basename(execPath);
    const updateExe = path.basename(updateFile);

    // Batch script logic:
    // 1. Wait for this process to exit
    // 2. Delete current exe
    // 3. Move new exe to current name
    // 4. Start current exe
    // 5. Delete self (bat)
    const script = `
@echo off
timeout /t 3 /nobreak > NUL
del "${appExe}"
move "${updateExe}" "${appExe}"
start "" "${appExe}"
del "%~f0"
    `;

    try {
        fs.writeFileSync(batFile, script);

        // Spawn detached process
        const child = spawn('cmd.exe', ['/c', batFile], {
            detached: true,
            cwd: execDir,
            stdio: 'ignore'
        });

        child.unref();

        console.log("Update initiated. Exiting...");
        process.exit(0);

    } catch (e) {
        console.error("Failed to install update:", e);
        throw e;
    }
}

module.exports = { checkForUpdate, downloadUpdate, installUpdate };
