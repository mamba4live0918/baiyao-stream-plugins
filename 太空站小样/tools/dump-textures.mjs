// Writes every unique embedded image of a glTF/GLB to a folder (for visual checks).
// Usage: node tools/dump-textures.mjs <model.glb> <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('usage: node tools/dump-textures.mjs <model.glb> <out-dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const seen = new Set();
for (const tex of doc.getRoot().listTextures()) {
  const image = tex.getImage();
  if (!image) continue;
  const hash = createHash('md5').update(image).digest('hex').slice(0, 8);
  if (seen.has(hash)) continue;
  seen.add(hash);
  const ext = tex.getMimeType() === 'image/jpeg' ? 'jpg' : 'png';
  const name = `${(tex.getName() || 'texture').replace(/[^\w.-]+/g, '_')}_${hash}.${ext}`;
  writeFileSync(join(outDir, name), image);
  console.log(name);
}
console.log(`unique images: ${seen.size}`);
