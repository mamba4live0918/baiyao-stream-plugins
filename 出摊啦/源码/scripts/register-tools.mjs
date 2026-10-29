import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
const path = resolve(assetsRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const at = (name, x, y) => ({ name, x: x * 2, y: y * 2, units: 'source-px' });
const potFrames = ['pot', 'pot_water', 'pot_noodles_1', 'pot_noodles_2', 'pot_noodles_3'];
const bowlFrames = ['bowl_empty', 'bowl_noodles_1', 'bowl_noodles_2', 'bowl_noodles_3'];
const fishFrames = ['salmon_block_1', 'salmon_block_2', 'salmon_block_3'];
const scoopFrames = ['strainer', 'strainer_noodles'];
const definitions = [
  ['noodle_box', '面饼木箱', 100, 100, at('bottom-center', 50, 94), [at('contents-center', 50, 39)]],
  ['stove', '蓝火灶台', 240, 90, at('pot-support-center', 120, 24), [at('bottom-center', 120, 84)]],
  ...potFrames.map((id, index) => [id, ['空汤锅', '锅内水面', '锅内面条·少', '锅内面条·中', '锅内面条·满'][index], 220, 140, at('pot-mouth-center', 110, 42), [at('bottom-center', 110, 126)], potFrames]),
  ...scoopFrames.map((id, index) => [id, index ? '漏勺·一两面' : '空漏勺', 110, 70, at('grip', 97, 56), [at('basket-center', 29, 25)], scoopFrames]),
  ...bowlFrames.map((id, index) => [id, index ? `面碗·${index}两` : '空面碗', 110, 85, at('bowl-mouth-center', 55, 30), [at('bottom-center', 55, 73)], bowlFrames]),
  ['fish_box', '鱼块泡沫箱', 100, 90, at('bottom-center', 50, 85), [at('contents-center', 50, 34)]],
  ['cutting_board', '长案板', 330, 60, at('surface-center', 165, 26), [at('bottom-center', 165, 58)]],
  ...fishFrames.map((id, index) => [id, ['三文鱼块·满', '三文鱼块·半份', '三文鱼块·剩一点'][index], 220, 60, at('left-bottom', 44, 52), [at('cutting-center', 110, 30)], fishFrames]),
  ['salmon_slice', '整齐鱼片', 50, 30, at('center', 25, 15), []],
  ['salmon_slice_broken', '切碎鱼片', 50, 30, at('center', 25, 15), []],
  ['knife', '刺身刀', 170, 50, at('grip', 147, 35), [at('blade-tip', 18, 13)]],
  ['plate', '白瓷盘与紫苏叶', 180, 60, at('plate-center', 90, 30), [at('food-center', 105, 25)]],
];

for (const [id, label, width, height, anchor, anchors, sequence = [id]] of definitions) {
  const entry = {
    id, group: 'tools', batch: 2, label,
    src: `src/tools/${id}.png`, webp: `webp/tools/${id}.webp`,
    rawSource: `raw/tools/${id}.png`, rawSources: [`raw/tools/${id}.png`],
    sourceSize: { width: width * 2, height: height * 2 }, displaySize: { width, height },
    anchor, anchors, frameSequence: sequence,
    provenance: { promptFile: 'prompts/tools-batch2.json', recordFile: 'prompts/generation-records.json', generationFamily: sequence[0], recordAssetId: id, rawSources: [`raw/tools/${id}.png`] },
    derivation: { kind: 'whole-generated-source-frame', cropTransparentBorder: false, preserveFullSourceCanvas: true, resize: true, drawn: false, recolored: false, operations: ['preserve-full-source-canvas', 'proportional-resize', 'transparent-contain-padding'] },
  };
  if (id === 'pot') entry.opening = { cx: 220, cy: 84, rx: 120, ry: 30, units: 'source-px' };
  if (id === 'cutting_board') entry.derivation = { ...entry.derivation, cropTransparentBorder: true, preserveFullSourceCanvas: false,
    registrationRevision: 1, transparentPaddingSourcePx: 4,
    operations: ['crop-generated-alpha-padding', 'proportional-resize', 'transparent-padding-4-source-px'] };
  const index = manifest.assets.findIndex(asset => asset.id === id);
  if (index < 0) manifest.assets.push(entry);
  else manifest.assets[index] = { ...manifest.assets[index], ...entry, derivation: { ...manifest.assets[index].derivation, ...entry.derivation } };
}
if (!manifest.groups.some(group => group.id === 'tools')) manifest.groups.push({ id: 'tools', label: '面馆与日料店工具' });
const sequences = [
  { id: 'pot_layers', kind: 'layers', loop: false, frames: potFrames, alignment: 'identical-canvas-and-pot-mouth-anchor', renderOrder: ['pot', 'pot_water', 'one-selected-noodle-layer'] },
  { id: 'bowl_quantity', kind: 'states', loop: false, frames: bowlFrames, stateNames: ['empty', '1', '2', '3'], alignment: 'identical-bowl-body-and-bottom' },
  { id: 'salmon_remaining', kind: 'states', loop: false, frames: fishFrames, stateNames: ['full', 'half', 'small'], alignment: 'identical-left-edge-and-canvas' },
  { id: 'strainer_quantity', kind: 'states', loop: false, frames: scoopFrames, stateNames: ['empty', '1'], alignment: 'identical-grip-and-canvas' },
];
for (const sequence of sequences) {
  const index = manifest.sequences.findIndex(item => item.id === sequence.id);
  if (index < 0) manifest.sequences.push(sequence); else manifest.sequences[index] = sequence;
}
manifest.batch = 2;
manifest.batches = [1, 2];
manifest.title = '出摊啦 · 第1–2批图片素材';
manifest.inlineBudgetAccounting = 'Runtime independent payload selected by src/runtime-assets.js; individual PNG/WebP and all input payloads are retained.';
manifest.approvedAssetPolicy.scope = 'all-batch-1-assets';
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
console.log(`工具清单已登记：${definitions.length}张；总计${manifest.assets.length}张。`);
