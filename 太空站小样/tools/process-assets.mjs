// Turns the raw downloads into small, web-ready assets in src/assets.
// Usage: node tools/process-assets.mjs <raw-dir> <out-dir>
// Raw layout is the one created by the download step (iss/, bennu/, moonrock/,
// earth/, starmap/, unity-*/x/, jangafx/frames/, smiley-sans/x/).
// Run a subset with ONLY=unity,fonts node tools/process-assets.mjs ...
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt, weld, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { subsetFonts } from './subset-fonts.mjs';

const [rawDir, outDir] = process.argv.slice(2);
if (!rawDir || !outDir) {
  console.error('usage: node tools/process-assets.mjs <raw-dir> <out-dir>');
  process.exit(1);
}
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const out = (...p) => {
  const file = join(outDir, ...p);
  mkdirSync(dirname(file), { recursive: true });
  return file;
};
const raw = (...p) => join(rawDir, ...p);
const kb = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});

// ---------------------------------------------------------------------------
// Texture scrubbing: paint over agency logos, wordmarks, mission patches and
// photos of identifiable people that are baked into the NASA ISS textures.
// Coordinates are in 1024x1024 texture space.
const GLASS = '#15181e';
const SCRUB_PLANS = [
  {
    match: (name) => name === 'ISS_01.jpg',
    regions: [
      { rect: [680, 52, 62, 36] }, // ESA logo
      { rect: [824, 42, 54, 54] }, // NASA insignia
    ],
  },
  {
    match: (name) => /^ISS_03\.(jpg|png)/.test(name),
    regions: [
      { rect: [624, 110, 130, 44] }, // "Canada" wordmark
      { rect: [486, 700, 40, 42] }, // arm lettering
    ],
  },
  {
    match: (name) => name === 'ISS_04.jpg',
    regions: [
      { rect: [462, 60, 124, 100], color: GLASS }, // window with person
      { rect: [450, 203, 68, 92] }, // mission patch
      { rect: [528, 203, 68, 92] }, // mission patch
      { rect: [22, 238, 116, 100], color: GLASS }, // window with person
      { rect: [168, 238, 118, 100], color: GLASS }, // window with person
      { rect: [178, 782, 122, 92], color: GLASS }, // window with person
      { poly: [[285, 851], [405, 845], [417, 937], [295, 945]], color: GLASS },
      { poly: [[700, 790], [760, 858], [672, 910], [618, 838]], color: GLASS },
    ],
  },
];

async function meanColorAround(image, [x, y, w, h]) {
  const meta = await sharp(image).metadata();
  const pad = 6;
  const left = Math.max(0, x - pad);
  const top = Math.max(0, y - pad);
  const width = Math.min(meta.width - left, w + pad * 2);
  const height = Math.min(meta.height - top, h + pad * 2);
  // Average of the padded box minus the inner box approximates the ring colour.
  const outer = await sharp(image).extract({ left, top, width, height }).stats();
  const inner = await sharp(image).extract({ left: x, top: y, width: w, height: h }).stats();
  const outerArea = width * height;
  const innerArea = w * h;
  const ch = (i) => {
    const sum = outer.channels[i].mean * outerArea - inner.channels[i].mean * innerArea;
    return Math.round(Math.min(255, Math.max(0, sum / (outerArea - innerArea))));
  };
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

async function scrubImage(image, regions) {
  const meta = await sharp(image).metadata();
  const shapes = [];
  for (const region of regions) {
    if (region.rect) {
      const [x, y, w, h] = region.rect;
      const color = region.color || (await meanColorAround(image, region.rect));
      shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${color}"/>`);
    } else {
      const pts = region.poly.map((p) => p.join(',')).join(' ');
      shapes.push(`<polygon points="${pts}" fill="${region.color}"/>`);
    }
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${shapes.join('')}</svg>`,
  );
  return sharp(image).composite([{ input: svg }]).png().toBuffer();
}

// ---------------------------------------------------------------------------
async function processStation() {
  const doc = await io.read(raw('iss', 'ISS_stationary.glb'));
  await doc.transform(dedup(), prune());
  let scrubbed = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const plan = SCRUB_PLANS.find((p) => p.match(tex.getName()));
    if (!plan) continue;
    tex.setImage(await scrubImage(tex.getImage(), plan.regions)).setMimeType('image/png');
    writeFileSync(raw(`scrubbed_${tex.getName().replace(/[^\w.-]+/g, '_')}.png`), tex.getImage());
    scrubbed++;
  }
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const file = out('models', 'station.glb');
  await io.write(file, doc);
  console.log(`station.glb ${kb(file)} (scrubbed ${scrubbed} textures)`);
}

async function processBennu() {
  const doc = await io.read(raw('bennu', 'Bennu_1_1.glb'));
  await doc.transform(
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const file = out('models', 'bennu.glb');
  await io.write(file, doc);
  console.log(`bennu.glb ${kb(file)}`);
}

async function processRock() {
  await MeshoptSimplifier.ready;
  const doc = await io.read(raw('moonrock', 'moon_rock_05_1k.gltf'));
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.002 }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const file = out('models', 'rock.glb');
  await io.write(file, doc);
  console.log(`rock.glb ${kb(file)}`);
}

async function processEarth() {
  const jobs = [
    ['8k_earth_daymap.jpg', 'earth_day.webp', 4096, 82, false],
    ['8k_earth_nightmap.jpg', 'earth_night.webp', 4096, 72, false],
    ['8k_earth_clouds.jpg', 'earth_clouds.webp', 4096, 70, true],
  ];
  for (const [src, dst, width, quality, grey] of jobs) {
    let img = sharp(raw('earth', src)).resize(width, width / 2, { kernel: 'lanczos3' });
    if (grey) img = img.greyscale();
    const file = out('textures', dst);
    await img.webp({ quality }).toFile(file);
    console.log(`${dst} ${kb(file)}`);
  }
}

async function processStarmap() {
  const tmpPng = raw('starmap', 'starmap_srgb16.png');
  execFileSync(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-apply_trc', 'iec61966_2_1', '-i', raw('starmap', 'starmap_2020_4k.exr'), '-pix_fmt', 'rgb48le', tmpPng],
    { stdio: 'inherit' },
  );
  const file = out('textures', 'starmap.webp');
  // A gentle lift so the Milky Way band reads on screen; bright stars clip to white.
  await sharp(tmpPng).linear(1.35, 0).toColourspace('srgb').webp({ quality: 86 }).toFile(file);
  console.log(`starmap.webp ${kb(file)}`);
}

// Unity Labs VFX flipbooks (CC0): TGA sheets -> WebP. Explosions keep their
// alpha (smoke must darken what is behind it); the fireball loop is additive RGB.
async function processUnity() {
  const jobs = [
    ['unity-Explosion01/x/Explosion01_5x5.tga', 'explosion01_5x5.webp'],
    ['unity-Explosion02/x/Explosion02_5x5.tga', 'explosion02_5x5.webp'],
    ['unity-FireBall01/x/FireBall01_8x8.tga', 'fireball_8x8.webp'],
  ];
  for (const [src, dst] of jobs) {
    const png = raw(src.replace(/\.tga$/, '.png'));
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw(src), png], { stdio: 'inherit' });
    const file = out('textures', dst);
    await sharp(png).webp({ quality: 85, alphaQuality: 90 }).toFile(file);
    console.log(`${dst} ${kb(file)}`);
  }
}

// JangaFX mid-air explosion, rendered from VDB by tools/render-vdb-flipbook.py
// into frame_000.png ... frame_063.png, packed into one 8x8 sheet.
async function processJanga() {
  const frames = 64;
  const cols = 8;
  const cell = 256;
  const layers = [];
  for (let i = 0; i < frames; i++) {
    const src = raw('jangafx', 'frames', `frame_${String(i).padStart(3, '0')}.png`);
    const input = await sharp(src).resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    layers.push({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * cell });
  }
  const size = cols * cell;
  const file = out('textures', 'janga_explosion_8x8.webp');
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .webp({ quality: 86, alphaQuality: 92 })
    .toFile(file);
  console.log(`janga_explosion_8x8.webp ${kb(file)}`);
}

// Fonts come from assets-src/fonts (kept in the project), not the raw downloads.
async function processFonts() {
  await subsetFonts(outDir);
}

await MeshoptEncoder.ready;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const steps = {
  station: processStation,
  bennu: processBennu,
  rock: processRock,
  earth: processEarth,
  starmap: processStarmap,
  unity: processUnity,
  janga: processJanga,
  fonts: processFonts,
};
for (const [name, step] of Object.entries(steps)) {
  if (only && !only.includes(name)) continue;
  await step();
}
