// Builds a contact sheet of image regions so scrub rectangles can be checked by eye.
// Usage: node tools/crop-check.mjs <out.png> <image>:<x>,<y>,<w>,<h> [<image>:<x>,<y>,<w>,<h> ...]
import sharp from 'sharp';

const [out, ...specs] = process.argv.slice(2);
if (!out || specs.length === 0) {
  console.error('usage: node tools/crop-check.mjs <out.png> <image>:<x>,<y>,<w>,<h> ...');
  process.exit(1);
}

const GAP = 12;
const crops = [];
for (const spec of specs) {
  const cut = spec.lastIndexOf(':');
  const file = spec.slice(0, cut);
  const [left, top, width, height] = spec.slice(cut + 1).split(',').map(Number);
  const buf = await sharp(file).extract({ left, top, width, height }).png().toBuffer();
  crops.push({ buf, width, height });
}

const sheetWidth = crops.reduce((s, c) => s + c.width + GAP, GAP);
const sheetHeight = Math.max(...crops.map((c) => c.height)) + GAP * 2;
let x = GAP;
const layers = crops.map((c) => {
  const layer = { input: c.buf, left: x, top: GAP };
  x += c.width + GAP;
  return layer;
});

await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 3, background: '#ff00ff' } })
  .composite(layers)
  .png()
  .toFile(out);
console.log(`wrote ${out} (${sheetWidth}x${sheetHeight})`);
