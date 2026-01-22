const { printTicket } = require('./src/printing');
const fs = require('fs');

const payload = JSON.parse(fs.readFileSync('./test_payload.json', 'utf8'));

async function test() {
    console.log("Starting concurrency test...");

    // Send 3 requests simultaneously
    const p1 = printTicket(payload);
    const p2 = printTicket(payload);
    const p3 = printTicket(payload);

    await Promise.all([p1, p2, p3]);

    console.log("All print jobs finished.");
}

test().catch(console.error);
