import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ASSET_IDS, isRuntimeAsset } from '../src/runtime-assets.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
const json = file => JSON.parse(readFileSync(resolve(root, file), 'utf8').replace(/^\uFEFF/, ''));
const manifest = json('manifest.json');
const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
const toolMeta = (await import('../assets/tool-meta.mjs')).default;
const sha = value => createHash('sha256').update(value).digest('hex');

test('batch two contains all 22 independently generated tool assets with exact 2x frames', () => {
  const tools = manifest.assets.filter(asset => asset.batch === 2);
  assert.equal(tools.length, 22);
  assert.deepEqual(tools.map(asset => asset.id).sort(), [...TOOL_ASSET_IDS].sort());
  const records = json('prompts/tools-batch2.json').filter(record => record.selected);
  const combined = json('prompts/generation-records.json');
  assert.equal(combined.selectedCoverage, manifest.assets.length, 'merged provenance must cover the current manifest, not a stale earlier batch file');
  const covered = new Set(combined.records.filter(record => record.selected).flatMap(record => record.assetIds));
  assert.ok(manifest.assets.every(asset => covered.has(asset.id)));
  assert.equal(records.length, 22);
  assert.equal(new Set(records.map(record => record.sourcePath)).size, 22, 'every requested image/variant has its own image_gen output');
  for (const asset of tools) {
    assert.equal(asset.group, 'tools');
    assert.equal(asset.sourceSize.width, asset.displaySize.width * 2, asset.id);
    assert.equal(asset.sourceSize.height, asset.displaySize.height * 2, asset.id);
    assert.equal(asset.anchor.units, 'source-px');
    assert.deepEqual(toolMeta[asset.id], Object.fromEntries(['id', 'displaySize', 'sourceSize', 'anchor', 'anchors', ...(asset.opening ? ['opening'] : [])].map(key => [key, asset[key]])));
    const record = records.find(entry => entry.id === asset.id);
    assert.ok(record?.prompt && record.tool === 'image_gen built-in', asset.id);
    const raw = readFileSync(resolve(root, asset.rawSource));
    assert.equal(sha(raw), sha(readFileSync(record.sourcePath)), `${asset.id}: preserve original generated PNG bytes`);
    const png = readFileSync(resolve(root, asset.src));
    assert.equal(png.readUInt32BE(16), asset.sourceSize.width, asset.id);
    assert.equal(png.readUInt32BE(20), asset.sourceSize.height, asset.id);
    assert.equal(asset.derivation.drawn, false);
    assert.equal(asset.derivation.recolored, false);
  }
});

test('layered pot, bowl states and salmon remnants retain a fixed registration frame', () => {
  for (const ids of [
    ['pot', 'pot_water', 'pot_noodles_1', 'pot_noodles_2', 'pot_noodles_3'],
    ['bowl_empty', 'bowl_noodles_1', 'bowl_noodles_2', 'bowl_noodles_3'],
    ['salmon_block_1', 'salmon_block_2', 'salmon_block_3'],
    ['strainer', 'strainer_noodles'],
  ]) {
    const first = byId.get(ids[0]);
    assert.ok(first, ids[0]);
    for (const id of ids) {
      const asset = byId.get(id);
      assert.ok(asset, id);
      assert.deepEqual(asset.sourceSize, first.sourceSize, id);
      assert.deepEqual(asset.anchor, first.anchor, id);
      assert.equal(asset.derivation.preserveFullSourceCanvas, true, id);
      assert.equal(asset.derivation.cropTransparentBorder, false, id);
    }
  }
  assert.equal(byId.get('knife').anchor.name, 'grip');
  assert.equal(byId.get('strainer').anchor.name, 'grip');
});

test('all previously approved raw and 93 PNG/WebP files retain their frozen bytes', () => {
  const baseline = json('approved-batch1-hashes.json');
  assert.equal(baseline.length, 271);
  for (const entry of baseline) {
    const value = readFileSync(resolve(root, entry.path));
    assert.equal(value.length, entry.bytes, entry.path);
    assert.equal(sha(value), entry.sha256, entry.path);
  }
});

test('pot opening clip is registered in source pixels and exported for runtime and preview', () => {
  const pot = byId.get('pot');
  assert.ok(pot.opening, 'water and noodles need an opening clip to protect the front lip');
  const { cx, cy, rx, ry, units } = pot.opening;
  assert.equal(units, 'source-px');
  assert.equal(cx, pot.anchor.x);
  assert.equal(cy, pot.anchor.y);
  assert.ok(rx > 0 && ry > 0);
  assert.ok(cx - rx > 0 && cx + rx < pot.sourceSize.width);
  assert.ok(cy - ry > 0 && cy + ry < pot.sourceSize.height);
  assert.deepEqual(toolMeta.pot.opening, pot.opening);
});

test('all source inputs remain complete while runtime-only payload fits current budget', () => {
  assert.ok(manifest.assets.length >= 115);
  const report = json('processing-report.json');
  assert.equal(report.readyAssets, manifest.assets.length);
  const source = readFileSync(resolve(root, 'inline-assets.mjs'), 'utf8');
  const payload = JSON.parse(source.slice(source.indexOf('export default ') + 15, source.lastIndexOf(';')));
  assert.equal(Object.keys(payload).length, manifest.assets.length, 'retain every source input; build alone selects runtime payloads');
  const selected = Object.fromEntries(Object.entries(payload).filter(([id]) => isRuntimeAsset(id)));
  const actualBytes = Buffer.byteLength('export default ' + JSON.stringify(selected) + ';');
  assert.equal(report.runtimeSelectedModuleBytes, actualBytes);
  assert.ok(actualBytes <= manifest.inlineBudgetBytes, 'unique selected runtime payload must fit current image budget');
  assert.ok(report.inlineEstimatedBytes >= report.runtimeInlineEstimatedBytes);
  assert.equal(report.frozenBatch1Checks.length, 271);
  assert.ok(report.frozenBatch1Checks.every(check => check.status === 'unchanged'));
});
