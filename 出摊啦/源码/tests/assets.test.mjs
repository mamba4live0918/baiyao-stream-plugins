import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const assetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
const manifest = JSON.parse(readFileSync(resolve(assetsRoot, 'manifest.json'), 'utf8'));
const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));

test('first batch contains every required image exactly once at 2× display size', () => {
  assert.equal(manifest.assets.filter(asset => asset.batch === 1).length, 93);
  assert.equal(byId.size, manifest.assets.length);
  for (const asset of manifest.assets) {
    assert.equal(asset.sourceSize.width, asset.displaySize.width * 2, asset.id);
    assert.equal(asset.sourceSize.height, asset.displaySize.height * 2, asset.id);
    assert.equal(asset.src, `src/${asset.group}/${asset.id}.png`);
    assert.equal(asset.webp, `webp/${asset.group}/${asset.id}.webp`);
    assert.equal(asset.anchor.units, 'source-px');
    assert.ok(asset.anchor.x >= 0 && asset.anchor.x <= asset.sourceSize.width, asset.id);
    assert.ok(asset.anchor.y >= 0 && asset.anchor.y <= asset.sourceSize.height, asset.id);
    assert.ok(readFileSync(resolve(assetsRoot, asset.provenance.promptFile), 'utf8').length > 0);
    assert.ok(JSON.parse(readFileSync(resolve(assetsRoot, asset.provenance.recordFile), 'utf8')));
  }
});

test('all customer states and layered jar assets share their frame and attachment point', () => {
  const states = ['happy', 'neutral', 'impatient', 'angry'];
  for (let index = 1; index <= 16; index += 1) {
    const family = `customer_${String(index).padStart(2, '0')}`;
    const expected = states.map(state => `${family}_${state}`);
    const frames = expected.map(id => byId.get(id));
    for (const asset of frames) {
      assert.ok(asset, family);
      assert.deepEqual(asset.sourceSize, { width: 220, height: 260 });
      assert.deepEqual(asset.anchor, frames[0].anchor);
      assert.deepEqual(asset.frameSequence, expected);
    }
    assert.deepEqual(manifest.sequences.find(sequence => sequence.id === family).frames, expected);
  }
  const jar = byId.get('coin_jar'), top = byId.get('coin_jar_top');
  assert.deepEqual(jar.sourceSize, { width: 280, height: 300 });
  assert.deepEqual(top.sourceSize, jar.sourceSize);
  assert.deepEqual(top.anchor, jar.anchor);
  assert.deepEqual(top.anchors.find(anchor => anchor.name === 'jar-mouth-center'), jar.anchors.find(anchor => anchor.name === 'jar-mouth-center'));
});

test('counter assets retain fixed source frames and an illustrated tile derivation', () => {
  assert.equal(manifest.counterRevision, 2);
  for (const shop of ['noodle', 'pancake', 'tea', 'sushi']) {
    for (const slice of ['left', 'mid', 'right']) {
      const asset = byId.get(`counter_${shop}_${slice}`);
      assert.deepEqual(asset.sourceSize, { width: slice === 'mid' ? 512 : 256, height: 420 });
      assert.deepEqual(asset.anchors.map(anchor => [anchor.x, anchor.y]), [[0, 0], [asset.sourceSize.width, 0]]);
      assert.equal(asset.rawSource, `raw/counters-v2/counter_${shop}_master.png`);
      assert.equal(asset.derivation.singleColumnStretch, false);
      assert.equal(asset.derivation.preparedRevision, 2);
      assert.equal(asset.approval.status, 'approved');
      assert.equal(asset.derivation.rawSourceSha256, createHash('sha256').update(readFileSync(resolve(assetsRoot, asset.rawSource))).digest('hex'), `${asset.id}: 导出必须对应当前批准母图`);
    }
    assert.deepEqual(byId.get(`counter_${shop}_sign`).sourceSize, { width: 240, height: 240 });
  }
});

test('the 77 approved raw images still match the fixed user-approval hash baseline', () => {
  const baseline = JSON.parse(readFileSync(resolve(assetsRoot, '../qa/步骤1复审/已批准原图哈希.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(baseline.length, 77);
  for (const entry of baseline) {
    const content = readFileSync(entry.Path);
    assert.equal(content.length, entry.Bytes, entry.Path);
    assert.equal(createHash('sha256').update(content).digest('hex'), entry.SHA256.toLowerCase(), entry.Path);
  }
});

test('offline browser manifest mirror is identical to the JSON source', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(resolve(assetsRoot, 'manifest.js'), 'utf8'), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.CHUTAN_ASSETS)), manifest);
});

test('all source PNGs exist, use exact frame sizes, and contain a transparency channel', () => {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const asset of manifest.assets) {
    const image = readFileSync(resolve(assetsRoot, asset.src));
    assert.ok(image.subarray(0, 8).equals(pngSignature), `${asset.id}: PNG signature`);
    assert.equal(image.toString('ascii', 12, 16), 'IHDR', asset.id);
    assert.equal(image.readUInt32BE(16), asset.sourceSize.width, `${asset.id}: width`);
    assert.equal(image.readUInt32BE(20), asset.sourceSize.height, `${asset.id}: height`);
    const colorType = image[25];
    let hasTransparency = colorType === 4 || colorType === 6;
    if (!hasTransparency) {
      for (let offset = 8; offset + 12 <= image.length;) {
        const length = image.readUInt32BE(offset);
        if (image.toString('ascii', offset + 4, offset + 8) === 'tRNS') hasTransparency = true;
        offset += length + 12;
      }
    }
    assert.ok(hasTransparency, `${asset.id}: transparent PNG channel`);
  }
});

test('prepared WebP payloads are complete and remain within the inline size budget', () => {
  const report = JSON.parse(readFileSync(resolve(assetsRoot, 'processing-report.json'), 'utf8'));
  assert.equal(report.readyAssets, manifest.assets.length);
  assert.ok(report.runtimeInlineEstimatedBytes <= manifest.inlineBudgetBytes);
  assert.ok(report.runtimeSelectedModuleBytes <= manifest.inlineBudgetBytes, '去重后的运行图片payload不超过当前预算；全部输入仍保留');
  for (const entry of report.entries.filter(entry => entry.encoding === 'webp-near-lossless-seam-exception')) {
    assert.ok(entry.maximumDecodedRgbDelta <= entry.maximumAllowedPixelDelta, entry.id);
    assert.ok(entry.maximumDecodedAlphaDelta <= entry.maximumAllowedPixelDelta, entry.id);
    assert.ok(entry.maximumAllowedPixelDelta <= 4, entry.id);
  }
  assert.equal(report.alignmentChecks.length, 16, '每位顾客的四状态都有可见边界检查；超差会在报告中标记需人工看图');
  for (const alignment of report.alignmentChecks) {
    assert.notEqual(alignment.status, 'incomplete', alignment.family);
    assert.equal(alignment.frames.length, 4, alignment.family);
    for (const frame of alignment.frames) assert.ok(frame.bounds, frame.id);
  }
  assert.equal(report.counterSeamChecks.length, 4, '四家店均核验实际 PNG 接缝');
  for (const seam of report.counterSeamChecks) {
    assert.equal(seam.status, 'exact-png-pixel-match', seam.shop);
    assert.equal(seam.revision, 2, seam.shop);
    assert.ok(seam.uniqueColumnHashesCount > 1, `${seam.shop}: 中片必须保留真实图案，旧单列拉伸会失败`);
    assert.ok(seam.patternChangedColumns > 0, `${seam.shop}: 中片内部应有木纹/布纹变化`);
    assert.equal(seam.mirrorPairChannelMismatches, 0, `${seam.shop}: 原画条带与水平镜像保持像素`);
    assert.equal(seam.differentRepeatEdgeChannels, 0, `${seam.shop}: 只比较首尾列，内部花纹不要求纯色`);
    assert.equal(seam.webp.status, 'within-seam-tolerance', seam.shop);
    assert.ok(seam.webp.final.maximumJoinChannelDelta <= 3, seam.shop);
    assert.ok(seam.webp.final.maximumTileChannelDelta <= 3, seam.shop);
  }
  assert.equal(report.approvedRawBaseline.matchedAssets, 77);
  assert.equal(report.approvedAssetChecks.length, 77);
  for (const asset of report.approvedAssetChecks) {
    assert.equal(asset.status, 'existing-bytes-preserved', asset.assetId);
    assert.ok(asset.files.every(file => file.status !== 'changed-forbidden'), asset.assetId);
  }
  for (const asset of manifest.assets) {
    const webp = readFileSync(resolve(assetsRoot, asset.webp));
    assert.equal(webp.toString('ascii', 0, 4), 'RIFF', asset.id);
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP', asset.id);
  }
});
