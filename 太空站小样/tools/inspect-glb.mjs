// Prints a compact structural summary of a glTF/GLB file.
// Usage: node tools/inspect-glb.mjs <path-to-model>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/inspect-glb.mjs <model.glb>');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();

const triCount = (mesh) =>
  mesh.listPrimitives().reduce((sum, prim) => {
    const idx = prim.getIndices();
    const pos = prim.getAttribute('POSITION');
    return sum + (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
  }, 0);

const scene = root.listScenes()[0];
const top = scene.listChildren();
console.log(`scenes=${root.listScenes().length} nodes=${root.listNodes().length} meshes=${root.listMeshes().length} materials=${root.listMaterials().length} textures=${root.listTextures().length} animations=${root.listAnimations().length}`);
console.log(`top-level children: ${top.length}`);

const describe = (node, depth, maxDepth) => {
  const mesh = node.getMesh();
  const kids = node.listChildren();
  const tris = mesh ? Math.round(triCount(mesh)) : 0;
  console.log(`${'  '.repeat(depth)}- ${node.getName() || '(unnamed)'}${mesh ? ` [mesh ${tris} tris]` : ''}${kids.length ? ` (${kids.length} children)` : ''}`);
  if (depth < maxDepth) kids.slice(0, 40).forEach((k) => describe(k, depth + 1, maxDepth));
};
top.slice(0, 60).forEach((n) => describe(n, 1, Number(process.argv[3] || 2)));

const totalTris = root.listMeshes().reduce((s, m) => s + triCount(m), 0);
console.log(`total triangles (unique meshes): ${Math.round(totalTris)}`);
console.log('materials:', root.listMaterials().map((m) => m.getName()).slice(0, 40).join(' | '));
for (const tex of root.listTextures()) {
  const size = tex.getSize();
  console.log(`texture ${tex.getName() || tex.getURI() || '(embedded)'} ${tex.getMimeType()} ${size ? size.join('x') : '?'} ${(tex.getImage()?.byteLength / 1024 || 0).toFixed(0)}KB`);
}
