const fs = require('fs');
const { deflateSync } = require('zlib');

function crc32(buf) {
  let table = new Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const chunkData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(chunkData), 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, chunkData, crc]);
}

function createSolidPNG(size, r, g, b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const row = Buffer.alloc(size * 3 + 1);
  row[0] = 0;
  for (let i = 1; i < row.length; i += 3) {
    row[i] = r; row[i+1] = g; row[i+2] = b;
  }

  const imageData = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    row.copy(imageData, y * (size * 3 + 1));
  }

  const chunks = [];
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunks.push(makeChunk('IHDR', ihdr));
  chunks.push(makeChunk('IDAT', deflateSync(imageData)));
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
sizes.forEach(size => {
  const png = createSolidPNG(size, 15, 23, 42);
  fs.writeFileSync(`public/icons/icon-${size}.png`, png);
  console.log(`Created icon-${size}.png (${png.length} bytes)`);
});
console.log('All icons created');
