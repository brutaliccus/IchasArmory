// watch-and-compress.js - Auto-compress JSON files when they change
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const itemsDir = path.join(__dirname, 'data', 'items');

console.log('👀 Watching for changes in data/items/...\n');

// Compress a single file
function compressFile(file) {
    const filePath = path.join(itemsDir, file);
    const gzipPath = filePath + '.gz';

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const compressed = zlib.gzipSync(fileBuffer, { level: 9 });
        fs.writeFileSync(gzipPath, compressed);

        const originalKB = (fileBuffer.length / 1024).toFixed(1);
        const compressedKB = (compressed.length / 1024).toFixed(1);
        const savings = ((1 - compressed.length / fileBuffer.length) * 100).toFixed(1);

        console.log(`✓ ${new Date().toLocaleTimeString()} - Compressed ${file}: ${originalKB} KB → ${compressedKB} KB (${savings}% smaller)`);
    } catch (err) {
        console.error(`✗ Error compressing ${file}:`, err.message);
    }
}

// Watch for file changes
fs.watch(itemsDir, (eventType, filename) => {
    if (filename && filename.endsWith('.json') && !filename.endsWith('.gz')) {
        if (eventType === 'change') {
            // Small delay to ensure file write is complete
            setTimeout(() => compressFile(filename), 100);
        }
    }
});

console.log('✅ Watcher started! Any .json changes will auto-compress.');
console.log('Press Ctrl+C to stop.\n');

// Keep process alive
process.stdin.resume();
