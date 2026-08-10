// compress-items.js - Pre-compress JSON files for faster serving
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const itemsDir = path.join(__dirname, 'data', 'items');

console.log('🗜️  Compressing item JSON files...\n');

// Get all JSON files
const files = fs.readdirSync(itemsDir).filter(f => f.endsWith('.json'));

let totalOriginal = 0;
let totalCompressed = 0;

files.forEach(file => {
    const filePath = path.join(itemsDir, file);
    const gzipPath = filePath + '.gz';

    // Read original file
    const fileBuffer = fs.readFileSync(filePath);
    const originalSize = fileBuffer.length;

    // Compress with maximum compression
    const compressed = zlib.gzipSync(fileBuffer, { level: 9 });
    const compressedSize = compressed.length;

    // Write compressed file
    fs.writeFileSync(gzipPath, compressed);

    totalOriginal += originalSize;
    totalCompressed += compressedSize;

    const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    const originalKB = (originalSize / 1024).toFixed(1);
    const compressedKB = (compressedSize / 1024).toFixed(1);

    console.log(`✓ ${file.padEnd(20)} ${originalKB.padStart(8)} KB → ${compressedKB.padStart(8)} KB (${savings}% smaller)`);
});

const totalSavings = ((1 - totalCompressed / totalOriginal) * 100).toFixed(1);
const totalOriginalMB = (totalOriginal / 1024 / 1024).toFixed(2);
const totalCompressedMB = (totalCompressed / 1024 / 1024).toFixed(2);

console.log('\n' + '='.repeat(70));
console.log(`📊 Total: ${totalOriginalMB} MB → ${totalCompressedMB} MB (${totalSavings}% reduction)`);
console.log('='.repeat(70));
console.log('\n✅ Compression complete! Your load times should be 10-20x faster.\n');
