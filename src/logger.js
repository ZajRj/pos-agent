const fs = require('fs');
const path = require('path');

const logBuffer = [];
const MAX_LOGS = 500;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
let logCount = 0;
let debugLogPath;
let crashLogPath;

function logCrash(type, err) {
    const msg = `[${new Date().toISOString()}] [${type}] ${err.stack || err}\n`;
    try {
        if (crashLogPath) fs.appendFileSync(crashLogPath, msg);
        if (debugLogPath) fs.appendFileSync(debugLogPath, msg);
    } catch (e) {
        process.stderr.write("Failed to write to crash log: " + e + "\n");
    }
}

function captureLog(type, args) {
    const msg = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${type}] ${msg}`;

    // 1. In-Memory Buffer
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();

    // 2. Stdout
    process.stdout.write(entry + '\n');

    // 3. Persistent File Log
    if (debugLogPath) {
        logCount++;
        try {
            // Check size every 100 entries
            if (logCount % 100 === 0) {
                if (fs.existsSync(debugLogPath)) {
                    const stats = fs.statSync(debugLogPath);
                    if (stats.size > MAX_FILE_SIZE) {
                        const oldLogPath = debugLogPath + '.old';
                        if (fs.existsSync(oldLogPath)) fs.unlinkSync(oldLogPath);
                        fs.renameSync(debugLogPath, oldLogPath);
                    }
                }
            }
            fs.appendFileSync(debugLogPath, entry + '\n');
        } catch (e) {
            // Fail silently
        }
    }
}

/**
 * Initialize Logger and Override Console
 * @param {string} execDir Directory to save logs
 */
function init(execDir) {
    crashLogPath = path.join(execDir, 'crash.log');
    debugLogPath = path.join(execDir, 'debug.log');

    // Override console methods
    console.log = (...args) => captureLog('INFO', args);
    console.error = (...args) => captureLog('ERROR', args);

    process.on('uncaughtException', (err) => {
        console.error('CRASH DETECTED. Check crash.log/debug.log. Uncaught Exception:', err);
        logCrash('UNCAUGHT_EXCEPTION', err);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('CRASH DETECTED. Check crash.log/debug.log. Unhandled Rejection:', reason);
        logCrash('UNHANDLED_REJECTION', reason);
    });
}

module.exports = { init, logBuffer };
