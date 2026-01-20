const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function createShortcut(target, shortcutPath, desc, iconPath) {
    if (!target || !shortcutPath) {
        throw new Error("Target and shortcut path are required.");
    }

    // PowerShell script to create shortcut
    let iconScript = "";
    if (iconPath) {
        // WScript.Shell IconLocation requires "Path,Index" (e.g. "path/to/exe,0")
        const iconValue = iconPath.includes(',') ? iconPath : `${iconPath},0`;
        iconScript = `$s.IconLocation='${iconValue}';`;
    }

    const script = `$s=(New-Object -COM WScript.Shell).CreateShortcut('${shortcutPath}');$s.TargetPath='${target}';$s.Description='${desc || ""}';$s.WorkingDirectory='${path.dirname(target)}';${iconScript}$s.Save()`;

    try {
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { stdio: 'pipe' });

        if (fs.existsSync(shortcutPath)) {
            return true;
        } else {
            console.warn(`Warning: Shortcut file not found after creation: ${shortcutPath}`);
            return false;
        }
    } catch (e) {
        console.error(`Error creating shortcut: ${e.message}`);
        if (e.stderr) {
            console.error(`PowerShell Error: ${e.stderr.toString()}`);
        }
        throw e;
    }
}

function removeShortcut(shortcutPath) {
    if (fs.existsSync(shortcutPath)) {
        try {
            fs.unlinkSync(shortcutPath);
            return true;
        } catch (e) {
            console.error(`Error deleting shortcut: ${e.message}`);
            return false;
        }
    }
    return false; // Did not exist
}

function getStartupPath() {
    try {
        const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::GetFolderPath('Startup')"`;
        return execSync(cmd).toString().trim() || path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    } catch (e) {
        return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    }
}

function getDesktopPath() {
    try {
        const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::GetFolderPath('Desktop')"`;
        const p = execSync(cmd).toString().trim();
        return p || path.join(process.env.USERPROFILE, 'Desktop');
    } catch (e) {
        return path.join(process.env.USERPROFILE, 'Desktop');
    }
}

module.exports = { createShortcut, removeShortcut, getStartupPath, getDesktopPath };
