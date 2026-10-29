import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRuntimeAsset } from '../src/runtime-assets.js';

// Conversion is a build operation. Keep the same Beijing broadcast gate as build.mjs.
const beijingMinute = (Date.now() / 60000 + 480) % 1440;
if ((beijingMinute >= 421 && beijingMinute < 541) || (beijingMinute >= 1081 && beijingMinute < 1201)) {
  throw new Error('直播时段禁止素材处理（北京时间 07:01–09:01、18:01–20:01）');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = resolve(root, 'assets');
const manifestPath = resolve(assetsRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const verifyOnly = process.argv.includes('--verify');
const allowMissing = process.argv.includes('--allow-missing');
const strictSize = process.argv.includes('--strict-source-size');
const quality = 85;
const protectedAssets = manifest.assets.filter(asset => asset.batch === 1 && asset.group !== 'counters');
const previousReport = existsSync(resolve(assetsRoot, 'processing-report.json'))
  ? JSON.parse(readFileSync(resolve(assetsRoot, 'processing-report.json'), 'utf8')) : {};
const previousEntries = new Map((previousReport.entries || []).map(entry => [entry.id, entry]));
const frozenBatch1 = JSON.parse(readFileSync(resolve(assetsRoot, 'approved-batch1-hashes.json'), 'utf8').replace(/^\uFEFF/, ''));
for (const entry of frozenBatch1) {
  if (sha256(insideAssets(entry.path)) !== entry.sha256) throw new Error(`已批准第1批文件与冻结基线不符：${entry.path}`);
}
const approvedBaselinePath = resolve(root, 'qa/步骤1复审/已批准原图哈希.json');
if (!existsSync(approvedBaselinePath)) throw new Error('缺少已批准原图哈希基线，禁止在无法证明保留原图时处理素材。');
const approvedBaseline = JSON.parse(readFileSync(approvedBaselinePath, 'utf8').replace(/^\uFEFF/, ''));
const approvedBaselineByPath = new Map(approvedBaseline.map(record => [resolve(record.Path).toLowerCase(), record]));
if (approvedBaselineByPath.size !== protectedAssets.length) throw new Error('已批准原图哈希基线应覆盖全部 77 张非柜台素材。');
const protectedFilesBefore = new Map();
function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
for (const asset of protectedAssets) {
  for (const [kind, relativePath] of [['raw', asset.rawSource || `raw/${asset.group}/${asset.id}.png`], ['png', asset.src], ['webp', asset.webp]]) {
    const path = resolve(assetsRoot, relativePath);
    protectedFilesBefore.set(`${asset.id}:${kind}`, { path: relativePath, existed: existsSync(path), hash: existsSync(path) ? sha256(path) : null });
  }
}

const sharpCandidates = [
  process.env.CHUTAN_SHARP_PATH,
  resolve(root, 'node_modules/sharp'),
  resolve(root, '../../plugin-library-site/node_modules/sharp'),
  resolve(root, '../../太空站小样/node_modules/sharp'),
  resolve(root, '../../透明音乐播放器/预制歌词PV/node_modules/sharp'),
].filter(Boolean);

let sharp;
for (const candidate of sharpCandidates) {
  if (!existsSync(candidate)) continue;
  try {
    const require = createRequire(resolve(root, 'package.json'));
    sharp = require(candidate);
    break;
  } catch { /* A different existing installation may fit this runtime. */ }
}
if (!sharp) throw new Error('未找到 sharp。安装到本项目，或设置 CHUTAN_SHARP_PATH 指向已有 sharp 文件夹。');

function insideAssets(relativePath) {
  const absolute = resolve(assetsRoot, relativePath);
  if (!absolute.startsWith(`${assetsRoot}${sep}`)) throw new Error(`素材路径越界：${relativePath}`);
  return absolute;
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: verifyOnly ? 'verify' : 'prepare',
  quality,
  expectedAssets: manifest.assets.length,
  readyAssets: 0,
  totalWebpBytes: 0,
  inlineEstimatedBytes: 0,
  maxInlineBytes: manifest.inlineBudgetBytes,
  entries: [],
  derivations: previousReport.derivations || [],
  alignmentChecks: [],
  counterSeamChecks: [],
  compressionOverrides: previousReport.compressionOverrides || [],
  frozenBatch1Checks: [],
  approvedAssetPolicy: 'Preserve all existing non-counter raw/PNG/WebP bytes; only create missing first derivatives from the approved full raw canvas.',
  approvedAssetChecks: [],
  approvedRawBaseline: { file: 'qa/步骤1复审/已批准原图哈希.json', expectedAssets: protectedAssets.length, matchedAssets: 0, checks: [] },
  counterRevision: 2,
  warnings: [],
};
for (const asset of protectedAssets) {
  const rawRelative = asset.rawSource || `raw/${asset.group}/${asset.id}.png`;
  const rawPath = insideAssets(rawRelative);
  const baseline = approvedBaselineByPath.get(rawPath.toLowerCase());
  const hash = existsSync(rawPath) ? sha256(rawPath) : null;
  const matches = Boolean(baseline && hash && baseline.SHA256.toLowerCase() === hash);
  report.approvedRawBaseline.checks.push({ assetId: asset.id, path: rawRelative, sha256: hash, expectedSha256: baseline?.SHA256.toLowerCase() || null, status: matches ? 'unchanged' : 'failed' });
  if (!matches) throw new Error(`已批准原图与固定哈希基线不一致，禁止继续：${asset.id}`);
  report.approvedRawBaseline.matchedAssets += 1;
}
if (verifyOnly && existsSync(resolve(assetsRoot, 'processing-report.json'))) {
  const previousReport = JSON.parse(readFileSync(resolve(assetsRoot, 'processing-report.json'), 'utf8'));
  report.derivations = previousReport.derivations || [];
  report.compressionOverrides = previousReport.compressionOverrides || [];
}

function usesLosslessWebp(buffer) {
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunk = buffer.toString('ascii', offset, offset + 4);
    if (chunk === 'VP8L') return true;
    if (chunk === 'VP8 ') return false;
    const length = buffer.readUInt32LE(offset + 4);
    offset += 8 + length + (length % 2);
  }
  return false;
}

async function alphaBounds(pathOrBuffer) {
  const { data, info } = await sharp(pathOrBuffer).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + info.channels - 1] <= 8) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('图片内没有可见的非透明像素。');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function joinGeneratedStrips(buffers) {
  // Concatenate existing raster strips byte-for-byte. No color or alpha is authored.
  // This avoids compositing-rounding differences along a semitransparent join pixel.
  const strips = await Promise.all(buffers.map(buffer => sharp(buffer).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const width = strips.reduce((sum, strip) => sum + strip.info.width, 0);
  const height = strips[0].info.height;
  const joined = Buffer.alloc(width * height * 4);
  let x = 0;
  for (const strip of strips) {
    if (strip.info.height !== height || strip.info.channels !== 4) throw new Error('柜台分片画布不一致。');
    for (let y = 0; y < height; y += 1) {
      strip.data.copy(joined, (y * width + x) * 4, y * strip.info.width * 4, (y + 1) * strip.info.width * 4);
    }
    x += strip.info.width;
  }
  return sharp(joined, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const pendingCounterSources = new Set();
// Approved characters/props are immutable. Create a first derivative only if absent.
if (!verifyOnly) {
  for (const asset of manifest.assets) {
    if (asset.group === 'counters' && !asset.id.endsWith('_sign')) continue;
    const sourcePath = insideAssets(asset.src);
    const needsNewToolRegistration = asset.batch === 2 && asset.derivation?.cropTransparentBorder
      && asset.derivation.registrationRevision !== asset.derivation.preparedRegistrationRevision;
    if (existsSync(sourcePath) && !needsNewToolRegistration) continue;
    const rawRelative = asset.rawSource || `raw/${asset.group}/${asset.id}.png`;
    const rawPath = insideAssets(rawRelative);
    if (!existsSync(rawPath)) {
      if (asset.group === 'counters') {
        pendingCounterSources.add(asset.id);
        if (!allowMissing) throw new Error(`${asset.id} 的柜台 v2 原图尚未生成：${rawRelative}`);
      }
      continue;
    }
    const rawMetadata = await sharp(rawPath).metadata();
    if (rawMetadata.format !== 'png' || !rawMetadata.hasAlpha) throw new Error(`${asset.id} 原图必须是带透明通道的 PNG。`);
    mkdirSync(dirname(sourcePath), { recursive: true });
    const toolCrop = asset.batch === 2 && asset.derivation?.cropTransparentBorder ? await alphaBounds(rawPath) : null;
    const padding = toolCrop ? asset.derivation.transparentPaddingSourcePx || 0 : 0;
    let raster = sharp(rawPath);
    if (toolCrop) raster = raster.extract(toolCrop);
    raster = raster.resize(asset.sourceSize.width - padding * 2, asset.sourceSize.height - padding * 2,
      { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    if (padding) raster = raster.extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 0, g: 0, b: 0, alpha: 0 } });
    await raster.png().toFile(sourcePath);
    if (toolCrop) asset.derivation = { ...asset.derivation, alphaCrop: toolCrop, preparedRegistrationRevision: asset.derivation.registrationRevision };
    if (needsNewToolRegistration) asset.derivation.reencodeWebp = true;
    if (asset.group === 'counters') asset.derivation = { ...asset.derivation, preparedRevision: 2, rawSourceSha256: sha256(rawPath), preparedAt: new Date().toISOString() };
    report.derivations.push({
      assetId: asset.id, rawSource: rawRelative, output: asset.src,
      sourceCanvas: { width: rawMetadata.width, height: rawMetadata.height },
      operations: toolCrop ? asset.derivation.operations : ['preserve-full-source-canvas', 'proportional-resize', 'transparent-contain-padding'],
      alphaCrop: toolCrop, trimmed: Boolean(toolCrop), recolored: false, drawn: false,
    });
  }

  for (const shop of ['noodle', 'pancake', 'tea', 'sushi']) {
    const rawRelative = `raw/counters-v2/counter_${shop}_master.png`;
    const rawPath = insideAssets(rawRelative);
    const existingParts = ['left', 'mid', 'right'].map(part => manifest.assets.find(asset => asset.id === `counter_${shop}_${part}`));
    if (existsSync(rawPath) && existingParts.every(asset => existsSync(insideAssets(asset.src)) && asset.derivation?.preparedRevision === 2 && asset.derivation.rawSourceSha256 === sha256(rawPath))) continue;
    if (!existsSync(rawPath)) {
      for (const part of ['left', 'mid', 'right']) pendingCounterSources.add(`counter_${shop}_${part}`);
      if (!allowMissing) throw new Error(`${shop} 柜台 v2 母图尚未生成：${rawRelative}`);
      continue;
    }
    const metadata = await sharp(rawPath).metadata();
    if (metadata.format !== 'png' || !metadata.hasAlpha) throw new Error(`${shop} 柜台母图必须是带透明通道的 PNG。`);
    const bounds = await alphaBounds(rawPath);
    // Only counter masters may have outer transparent padding cropped.
    // Keep 8px transparent padding vertically so the middle tile also has real alpha.
    const normalized = await sharp(rawPath).extract(bounds).resize({ height: 404 })
      .extend({ top: 8, bottom: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const normalizedMetadata = await sharp(normalized).metadata();
    if (normalizedMetadata.width < 512) throw new Error(`${shop} 柜台母图过窄，无法保留中央 256px 花纹和两个自然端部。`);
    // Keep native horizontal scale everywhere: the left cap ends at x=255,
    // which is also the tile's first column. The mirrored right cap continues
    // from the mirrored tile in the same direction and phase, without squeezing.
    const stripRect = { left: 255, top: 0, width: 256, height: 420 };
    const illustratedStrip = await sharp(normalized).extract(stripRect).png().toBuffer();
    const mirroredStrip = await sharp(illustratedStrip).flop().png().toBuffer();
    const middle = await joinGeneratedStrips([illustratedStrip, mirroredStrip]);
    const leftRect = { left: 0, top: 0, width: 256, height: 420 };
    const rightRect = leftRect;
    const leftHalf = await sharp(normalized).extract(leftRect).png().toBuffer();
    const rightHalf = await sharp(leftHalf).flop().png().toBuffer();
    const parts = { left: leftHalf, mid: middle, right: rightHalf };
    for (const [part, buffer] of Object.entries(parts)) {
      const asset = manifest.assets.find(item => item.id === `counter_${shop}_${part}`);
      const targetPath = insideAssets(asset.src);
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, buffer);
      const sourceRect = part === 'mid' ? stripRect : part === 'left' ? leftRect : rightRect;
      asset.derivation = {
        ...asset.derivation, revision: 2, preparedRevision: 2, rawSourceSha256: sha256(rawPath), preparedAt: new Date().toISOString(), alphaCrop: bounds, normalizedSize: { width: normalizedMetadata.width, height: 420 },
        sourceRect, sourceRectSpace: 'alpha-cropped-master-resized-to-height-404-plus-8px-vertical-padding',
        horizontalFlip: part === 'mid' ? 'second-256px-half-only' : part === 'right',
        horizontalRescale: false,
        joinColumnSource: { left: stripRect.left, top: 0, width: 1, height: 420 },
        tileConstruction: part === 'mid' ? 'original-256px-generated-strip-plus-its-horizontal-mirror' : null,
        patternPixelsPreserved: true, singleColumnStretch: false,
      };
      report.derivations.push({
        assetId: asset.id, rawSource: rawRelative, output: asset.src, alphaCrop: bounds,
        revision: 2, normalizedSize: { width: normalizedMetadata.width, height: 420 }, sourceRect,
        horizontalFlip: part === 'mid' ? 'second-half-only' : part === 'right',
        operations: part === 'mid'
          ? ['crop-generated-counter-alpha-bounds', 'resize-to-height-404', 'transparent-vertical-padding-8', 'extract-illustrated-256px-center-strip', 'append-horizontal-mirror-without-squashing-pattern']
          : part === 'left' ? ['crop-generated-left-256px-cap-without-horizontal-rescale'] : ['reuse-generated-left-256px-cap', 'horizontal-mirror-without-horizontal-rescale'],
        seamGuarantee: 'tile-first-last-columns-and-cap-interface-columns-match',
        singleColumnStretch: false,
        recolored: false, drawn: false,
      });
    }
  }
}

const visibleBoundsById = new Map();
for (const asset of manifest.assets) {
  if (pendingCounterSources.has(asset.id)) {
    report.entries.push({ id: asset.id, status: 'counter-v2-source-missing', src: asset.src });
    continue;
  }
  if (asset.group === 'counters' && asset.derivation?.preparedRevision !== 2) throw new Error(`${asset.id} 尚未从柜台 v2 原图导出，禁止验收旧版文件。`);
  if (asset.group === 'counters' && asset.derivation.rawSourceSha256 !== sha256(insideAssets(asset.rawSource))) throw new Error(`${asset.id} 当前母图与导出出处哈希不符，请重新导出。`);
  const sourcePath = insideAssets(asset.src);
  const targetPath = insideAssets(asset.webp);
  if (!existsSync(sourcePath)) {
    report.entries.push({ id: asset.id, status: 'missing', src: asset.src });
    continue;
  }
  const sourceMetadata = await sharp(sourcePath).metadata();
  if (sourceMetadata.format !== 'png') throw new Error(`${asset.id} 的源文件必须为 PNG。`);
  if (!sourceMetadata.hasAlpha) throw new Error(`${asset.id} 缺少透明通道。`);
  const expected = asset.sourceSize;
  const resized = sourceMetadata.width !== expected.width || sourceMetadata.height !== expected.height;
  if (resized && (strictSize || verifyOnly)) {
    throw new Error(`${asset.id} 源图应为 ${expected.width}×${expected.height}，实际 ${sourceMetadata.width}×${sourceMetadata.height}。`);
  }
  if (resized && !verifyOnly) {
    if (asset.group !== 'counters') throw new Error(`${asset.id} 为已批准素材，现有 PNG 尺寸异常，处理脚本禁止改写。`);
    // Fitting the original image into a fixed frame preserves its proportions and margins.
    // This is size normalization only; no recoloring, illustration, or substitute artwork.
    const normalized = await sharp(sourcePath)
      .resize(expected.width, expected.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    writeFileSync(sourcePath, normalized);
    report.warnings.push(`${asset.id} 已按比例留透明边规范为 ${expected.width}×${expected.height}。`);
  }
  if (!verifyOnly && (!existsSync(targetPath) || (asset.batch === 2 && asset.derivation?.reencodeWebp))) {
    mkdirSync(dirname(targetPath), { recursive: true });
    await sharp(sourcePath).webp({ quality, alphaQuality: 100, effort: 6 }).toFile(targetPath);
    if (asset.batch === 2) delete asset.derivation.reencodeWebp;
  }
  const visibleBounds = await alphaBounds(sourcePath);
  visibleBoundsById.set(asset.id, visibleBounds);
  if (!existsSync(targetPath)) {
    report.entries.push({ id: asset.id, status: 'webp-missing', src: asset.src, webp: asset.webp });
    continue;
  }
  const target = readFileSync(targetPath);
  const targetMetadata = await sharp(target).metadata();
  if (targetMetadata.width !== expected.width || targetMetadata.height !== expected.height || !targetMetadata.hasAlpha) {
    throw new Error(`${asset.id} 的 WebP 尺寸或透明通道不符合清单。`);
  }
  const pixelStats = await sharp(target).ensureAlpha().stats();
  if (pixelStats.channels[3].min === 255) throw new Error(`${asset.id} 的透明通道完全不透明，须重做透明背景。`);
  report.readyAssets += 1;
  report.totalWebpBytes += target.length;
  const previous = previousEntries.get(asset.id);
  const encoding = previous?.encoding || (usesLosslessWebp(target) ? 'webp-lossless-seam-exception' : 'webp-q85');
  report.entries.push({ ...previous, id: asset.id, status: 'ready', src: asset.src, webp: asset.webp, bytes: target.length, encoding, visibleBounds });
}

// Bounding boxes flag framing drift; they cannot prove identity or facial consistency.
for (let index = 1; index <= 16; index += 1) {
  const family = `customer_${String(index).padStart(2, '0')}`;
  const baseline = visibleBoundsById.get(`${family}_happy`);
  const frames = ['happy', 'neutral', 'impatient', 'angry'].map(state => {
    const id = `${family}_${state}`;
    const bounds = visibleBoundsById.get(id);
    const maximumEdgeDrift = baseline && bounds ? Math.max(
      Math.abs(bounds.left - baseline.left), Math.abs(bounds.top - baseline.top),
      Math.abs(bounds.left + bounds.width - baseline.left - baseline.width),
      Math.abs(bounds.top + bounds.height - baseline.top - baseline.height),
    ) : null;
    return { id, bounds: bounds || null, maximumEdgeDrift };
  });
  const missing = frames.some(frame => !frame.bounds);
  const maximumEdgeDrift = missing ? null : Math.max(...frames.map(frame => frame.maximumEdgeDrift));
  const status = missing ? 'incomplete' : maximumEdgeDrift > 4 ? 'needs-visual-review' : 'bounds-within-tolerance';
  report.alignmentChecks.push({ family, sourcePixelTolerance: 4, maximumEdgeDrift, status, frames, claim: 'bounding-box-check-only-not-identity-verification' });
  if (status === 'needs-visual-review') report.warnings.push(`${family} 四表情可见边界最大偏移 ${maximumEdgeDrift}px（源图像素），需看图确认同位置；未自动对齐或重画。`);
}

for (const shop of ['noodle', 'pancake', 'tea', 'sushi']) {
  const ids = ['left', 'mid', 'right'].map(part => `counter_${shop}_${part}`);
  if (ids.some(id => pendingCounterSources.has(id))) continue;
  const paths = ids.map(id => insideAssets(manifest.assets.find(asset => asset.id === id).src));
  if (paths.some(path => !existsSync(path))) continue;
  const [left, mid, right] = await Promise.all(paths.map(path => sharp(path).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  let differentJoinChannels = 0;
  let differentRepeatEdgeChannels = 0;
  let mirrorPairChannelMismatches = 0;
  for (let y = 0; y < 420; y += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      const expected = mid.data[(y * mid.info.width) * 4 + channel];
      if (left.data[(y * left.info.width + left.info.width - 1) * 4 + channel] !== expected) differentJoinChannels += 1;
      if (right.data[(y * right.info.width) * 4 + channel] !== expected) differentJoinChannels += 1;
      if (mid.data[(y * mid.info.width + mid.info.width - 1) * 4 + channel] !== expected) differentRepeatEdgeChannels += 1;
      for (let x = 0; x < mid.info.width / 2; x += 1) {
        if (mid.data[(y * mid.info.width + x) * 4 + channel] !== mid.data[(y * mid.info.width + mid.info.width - 1 - x) * 4 + channel]) mirrorPairChannelMismatches += 1;
      }
    }
  }
  const columnSignatures = new Set();
  let firstColumnHash, patternChangedColumns = 0;
  for (let x = 0; x < mid.info.width; x += 1) {
    const column = Buffer.alloc(420 * 4);
    for (let y = 0; y < 420; y += 1) mid.data.copy(column, y * 4, (y * mid.info.width + x) * 4, (y * mid.info.width + x + 1) * 4);
    const hash = createHash('sha256').update(column).digest('hex');
    if (x === 0) firstColumnHash = hash;
    else if (hash !== firstColumnHash) patternChangedColumns += 1;
    columnSignatures.add(hash);
  }
  const distinctPatternColumns = columnSignatures.size;
  if (distinctPatternColumns <= 1) throw new Error(`${shop} 中片内部没有图案变化，禁止再使用单列拉伸的纯色平条。`);
  const status = differentJoinChannels || differentRepeatEdgeChannels || mirrorPairChannelMismatches ? 'failed' : 'exact-png-pixel-match';
  report.counterSeamChecks.push({ shop, status, revision: 2, differentJoinChannels, differentRepeatEdgeChannels,
    distinctPatternColumns, uniqueColumnHashesCount: distinctPatternColumns, patternChangedColumns, mirrorPairChannelMismatches,
    tileConstruction: '256px-generated-strip-plus-horizontal-mirror', checkedColumns: 'mid-first-versus-last-only; internal-pattern-is-intentionally-nonuniform', checkedFormat: 'source-png-rgba' });
  if (status === 'failed') throw new Error(`${shop} 柜台源 PNG 接口或中片平铺像素不连续。`);
}

async function inspectWebpSeams(paths) {
  // libvips can retain file-backed input handles on Windows. Decode snapshots
  // so a later lossless replacement can overwrite the same target safely.
  const [left, mid, right] = await Promise.all(paths.map(path => sharp(readFileSync(path)).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  let maximumJoinChannelDelta = 0, maximumTileChannelDelta = 0;
  for (let y = 0; y < 420; y += 1) {
    const middleOffset = y * mid.info.width * 4;
    const leftOffset = (y * left.info.width + left.info.width - 1) * 4;
    const rightOffset = y * right.info.width * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      // Hidden RGB where both alphas are near zero has no visible seam.
      if (channel === 3 || Math.max(mid.data[middleOffset + 3], left.data[leftOffset + 3]) > 8) {
        maximumJoinChannelDelta = Math.max(maximumJoinChannelDelta, Math.abs(mid.data[middleOffset + channel] - left.data[leftOffset + channel]));
      }
      if (channel === 3 || Math.max(mid.data[middleOffset + 3], right.data[rightOffset + 3]) > 8) {
        maximumJoinChannelDelta = Math.max(maximumJoinChannelDelta, Math.abs(mid.data[middleOffset + channel] - right.data[rightOffset + channel]));
      }
      const repeatEdgeOffset = (y * mid.info.width + mid.info.width - 1) * 4;
      if (channel === 3 || Math.max(mid.data[middleOffset + 3], mid.data[repeatEdgeOffset + 3]) > 8) {
        maximumTileChannelDelta = Math.max(maximumTileChannelDelta, Math.abs(mid.data[middleOffset + channel] - mid.data[repeatEdgeOffset + channel]));
      }
    }
  }
  return { maximumJoinChannelDelta, maximumTileChannelDelta, tileComparison: 'first-versus-last-column-only', alphaThresholdForVisibleRgb: 8 };
}

for (const check of report.counterSeamChecks) {
  const assets = ['left', 'mid', 'right'].map(part => manifest.assets.find(asset => asset.id === `counter_${check.shop}_${part}`));
  const paths = assets.map(asset => insideAssets(asset.webp));
  if (paths.some(path => !existsSync(path))) continue;
  const initial = await inspectWebpSeams(paths);
  let final = initial;
  let mode = assets.every(asset => report.entries.find(entry => entry.id === asset.id)?.encoding === 'webp-lossless-seam-exception') ? 'webp-lossless-seam-exception' : 'webp-q85';
  const threshold = 3;
  if (Math.max(initial.maximumJoinChannelDelta, initial.maximumTileChannelDelta) > threshold) {
    if (verifyOnly) throw new Error(`${check.shop} 柜台 WebP 接口误差超出 ${threshold}，请重新运行完整素材处理以改用无损编码。`);
    for (const asset of assets) {
      const targetPath = insideAssets(asset.webp);
      // Near-lossless codec levels are not the lossy quality scale. Bound the
      // actual decoded change to 2/255 on caps and 4/255 on mirrored middles.
      // Original PNGs/raw art stay untouched; the seam is checked again below.
      const nearQuality = asset.id.endsWith('_mid') ? 55 : 75;
      const source = readFileSync(insideAssets(asset.src));
      const encoded = await sharp(source).webp({ nearLossless: true, quality: nearQuality, alphaQuality: 100, effort: 6 }).toBuffer();
      const originalPixels = await sharp(source).ensureAlpha().raw().toBuffer();
      const encodedPixels = await sharp(encoded).ensureAlpha().raw().toBuffer();
      let maxRgbDelta = 0, maxAlphaDelta = 0;
      for (let offset = 0; offset < originalPixels.length; offset += 4) {
        maxAlphaDelta = Math.max(maxAlphaDelta, Math.abs(originalPixels[offset + 3] - encodedPixels[offset + 3]));
        if (originalPixels[offset + 3] > 8) for (let channel = 0; channel < 3; channel += 1) maxRgbDelta = Math.max(maxRgbDelta, Math.abs(originalPixels[offset + channel] - encodedPixels[offset + channel]));
      }
      const errorBound = asset.id.endsWith('_mid') ? 4 : 2;
      if (maxRgbDelta > errorBound || maxAlphaDelta > errorBound) throw new Error(`${asset.id} 近无损编码超出像素误差界限。`);
      writeFileSync(targetPath, encoded);
      const entry = report.entries.find(item => item.id === asset.id);
      report.totalWebpBytes -= entry.bytes;
      entry.bytes = readFileSync(targetPath).length;
      entry.encoding = 'webp-near-lossless-seam-exception';
      entry.nearLosslessLevel = nearQuality;
      entry.maximumDecodedRgbDelta = maxRgbDelta;
      entry.maximumDecodedAlphaDelta = maxAlphaDelta;
      entry.maximumAllowedPixelDelta = errorBound;
      report.totalWebpBytes += entry.bytes;
    }
    mode = 'webp-near-lossless-seam-exception';
    final = await inspectWebpSeams(paths);
    report.compressionOverrides.push({ shop: check.shop, assetIds: assets.map(asset => asset.id), reason: 'independently-compressed-q85-tiles-exceeded-seam-tolerance', initial, final, mode });
    report.warnings.push(`${check.shop} 柜台独立 WebP85 接缝误差超过 ${threshold}，该店三片改为有界近无损编码（端片≤2/255、中片≤4/255）；其它素材仍为质量85，PNG原图不变。`);
  }
  check.webp = { mode, threshold, initial, final, status: Math.max(final.maximumJoinChannelDelta, final.maximumTileChannelDelta) <= threshold ? 'within-seam-tolerance' : 'failed' };
  if (check.webp.status === 'failed') throw new Error(`${check.shop} 柜台 WebP 接口仍不连续。`);
}

// Direct file:// opening must work: the preview loads a plain script, never fetches JSON.
if (!verifyOnly) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(assetsRoot, 'manifest.js'), `/* Generated from manifest.json by scripts/prepare-assets.mjs. */\nwindow.CHUTAN_ASSETS = ${JSON.stringify(manifest, null, 2)};\n`);
  const inlineAssets = {};
  for (const asset of manifest.assets) {
    if (!report.entries.some(entry => entry.id === asset.id && entry.status === 'ready')) continue;
    const path = insideAssets(asset.webp);
    if (existsSync(path)) inlineAssets[asset.id] = `data:image/webp;base64,${readFileSync(path).toString('base64')}`;
  }
  writeFileSync(resolve(assetsRoot, 'inline-assets.mjs'), `/* Generated WebP payloads for offline HTML bundling. */\nexport default ${JSON.stringify(inlineAssets)};\n`);
  const toolMeta = Object.fromEntries(manifest.assets.filter(asset => asset.batch === 2).map(({ id, displaySize, sourceSize, anchor, anchors, opening }) => [id, { id, displaySize, sourceSize, anchor, anchors, ...(opening ? { opening } : {}) }]));
  writeFileSync(resolve(assetsRoot, 'tool-meta.mjs'), `/* Generated tool attachment metadata; units are source-px. */\nexport default ${JSON.stringify(toolMeta)};\n`);
  const rentMeta = Object.fromEntries(manifest.assets.filter(asset => asset.batch === 3).map(({ id, displaySize, sourceSize, anchor, anchors, textRect, screenRect, stampRect }) => [id, { id, displaySize, sourceSize, anchor, anchors, ...(textRect ? {textRect} : {}), ...(screenRect ? {screenRect} : {}), ...(stampRect ? {stampRect} : {}) }]));
  writeFileSync(resolve(assetsRoot, 'rent-meta.mjs'), `/* Generated rent/clock attachment metadata; units are source-px. */\nexport default ${JSON.stringify(rentMeta)};\n`);
  const eventMeta=Object.fromEntries(manifest.assets.filter(a=>a.batch===4).map(({id,displaySize,sourceSize,anchor,anchors,textRect,portraitRect,frameSequence})=>[id,{id,displaySize,sourceSize,anchor,anchors,frameSequence,...(textRect?{textRect}:{}),...(portraitRect?{portraitRect}:{})}]));
  writeFileSync(resolve(assetsRoot,'events-meta.mjs'),`/* Generated event attachment metadata; units are source-px. */\nexport default ${JSON.stringify(eventMeta)};\n`);
  const shopMeta=Object.fromEntries(manifest.assets.filter(a=>a.batch===5).map(({id,displaySize,sourceSize,anchor,anchors,layerRect,opening,innerClip,textRect,frameSequence})=>[id,{id,displaySize,sourceSize,anchor,anchors,layerRect,frameSequence,...(opening?{opening}:{}),...(innerClip?{innerClip}:{}),...(textRect?{textRect}:{})}]));
  writeFileSync(resolve(assetsRoot,'shops-meta.mjs'),`/* Generated shop attachment metadata; units are source-px. layerRect is placed on its matching reference frame. */\nexport default ${JSON.stringify(shopMeta)};\n`);
}

for (const asset of protectedAssets) {
  const checks = [];
  for (const kind of ['raw', 'png', 'webp']) {
    const before = protectedFilesBefore.get(`${asset.id}:${kind}`);
    const path = insideAssets(before.path);
    const afterHash = existsSync(path) ? sha256(path) : null;
    const unchanged = before.existed ? afterHash === before.hash : true;
    checks.push({ kind, path: before.path, existedBefore: before.existed, sha256Before: before.hash, sha256After: afterHash,
      status: before.existed ? unchanged ? 'unchanged' : 'changed-forbidden' : afterHash ? 'created-first-derivative' : 'missing' });
    if (!unchanged) throw new Error(`已批准素材被改写，禁止交付：${asset.id} ${kind}`);
  }
  report.approvedAssetChecks.push({ assetId: asset.id, status: 'existing-bytes-preserved', files: checks });
}

report.inlineEstimatedBytes = report.entries.reduce((sum, item) => sum + (item.bytes ? 4 * Math.ceil(item.bytes / 3) + 24 : 0), 0);
report.runtimeSelectedAssetIds = report.entries.filter(item => item.status === 'ready' && isRuntimeAsset(item.id)).map(item => item.id);
report.runtimeInlineEstimatedBytes = report.entries.filter(item => isRuntimeAsset(item.id)).reduce((sum, item) => sum + (item.bytes ? 4 * Math.ceil(item.bytes / 3) + 24 : 0), 0);
const inlineSource = readFileSync(resolve(assetsRoot, 'inline-assets.mjs'), 'utf8');
report.allInputModuleBytes = Buffer.byteLength(inlineSource);
const inlinePayload = JSON.parse(inlineSource.slice(inlineSource.indexOf('export default ') + 15, inlineSource.lastIndexOf(';')));
const runtimePayload = Object.fromEntries(Object.entries(inlinePayload).filter(([id]) => isRuntimeAsset(id)));
report.runtimeSelectedModuleBytes = Buffer.byteLength('export default ' + JSON.stringify(runtimePayload) + ';');
report.inlineBudgetAccounting = `Runtime independently encoded image payloads selected by src/runtime-assets.js; all ${manifest.assets.length} source inputs remain in inline-assets.mjs.`;
for (const entry of frozenBatch1) {
  const after = sha256(insideAssets(entry.path));
  const status = after === entry.sha256 ? 'unchanged' : 'changed-forbidden';
  report.frozenBatch1Checks.push({ path: entry.path, expectedSha256: entry.sha256, actualSha256: after, status });
  if (status !== 'unchanged') throw new Error(`禁止改写已批准素材：${entry.path}`);
}
if (report.runtimeSelectedModuleBytes > report.maxInlineBytes) report.warnings.push(`当前运行独立图片 payload 超过${report.maxInlineBytes.toLocaleString('en-US')}字节预算；整份HTML要求不超过10MB。`);
writeFileSync(resolve(assetsRoot, 'processing-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`素材 ${report.readyAssets}/${report.expectedAssets} 就绪，全部WebP ${(report.totalWebpBytes / 1024).toFixed(1)} KB，全部输入 ${(report.allInputModuleBytes / 1024).toFixed(1)} KB，运行选取 ${(report.runtimeSelectedModuleBytes / 1024).toFixed(1)} KB。`);
for (const warning of report.warnings) console.warn(warning);
if (report.readyAssets !== report.expectedAssets && !allowMissing) throw new Error('素材未齐，详见 assets/processing-report.json；仅检查中间进度时可加 --allow-missing。');
if (report.runtimeSelectedModuleBytes > report.maxInlineBytes) process.exitCode = 1;
