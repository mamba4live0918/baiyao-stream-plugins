// Lays transparent frames side by side on a dark background for a quick look.
// Usage: node tools/contact-sheet.mjs <out.png> <frame.png> [<frame.png> ...]
import sharp from 'sharp';

const [out, ...frames] = process.argv.slice(2);
if (!out || frames.length === 0) {
  console.error('usage: node tools/contact-sheet.mjs <out.png> <frame.png> ...');
  process.exit(1);
}

const GAP = 8;
const metas = await Promise.all(frames.map((f) => sharp(f).metadata()));
const height = Math.max(...metas.map((m) => m.height)) + GAP * 2;
let x = GAP;
const layers = [];
for (let i = 0; i < frames.length; i++) {
  layers.push({ input: await sharp(frames[i]).png().toBuffer(), left: x, top: GAP });
  x += metas[i].width + GAP;
}
await sharp({ create: { width: x, height, channels: 4, background: '#1b2433' } }).composite(layers).png().toFile(out);
console.log(`wrote ${out}`);
