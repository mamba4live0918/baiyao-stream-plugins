import inlineAssets from '../../assets/inline-assets.mjs';
import { isRuntimeAsset, assetReference } from '../runtime-assets.js';

const CACHE_LIMIT = 2048;
const SHOP_TEXT = { noodle: '面', pancake: '饼', tea: '茶', sushi: '鱼' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = (value, label) => {
  if (!finite(value) || value <= 0) throw new Error(`${label}必须是正数。`);
  return value;
};

function canvas(width, height) {
  const image = document.createElement('canvas');
  image.width = width;
  image.height = height;
  const context = image.getContext('2d', { alpha: true });
  if (!context) throw new Error('浏览器无法创建透明 Canvas 2D 素材缓存。');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return { image, context };
}

async function decode(id, source) {
  if (typeof source !== 'string' || !/^data:image\/(?:png|webp);base64,/.test(source)) {
    throw new Error(`素材 ${id} 缺少本地内联图片；不会尝试网络加载。`);
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸为空');
  } catch (cause) {
    throw new Error(`无法解码内联素材 ${id}。`, { cause });
  }
  return [id, image];
}

function proofPixels(context, image, rect, unit, dpr) {
  const positions = [], seen = new Set();
  for (const offset of [6, 8, 10, 12]) {
    const py = Math.round((rect.y + offset * unit) * dpr);
    for (let index = 1; index <= 9; index++) {
      const px = Math.round((rect.x + rect.width * index / 10) * dpr);
      const key = `${px}:${py}`;
      if (px < 0 || py < 0 || px >= image.width || py >= image.height || seen.has(key)) continue;
      seen.add(key);
      positions.push({ px, py });
    }
  }
  if (!positions.length) return [];
  // Read only this narrow top strip once, rather than copying the full viewport.
  const left = Math.min(...positions.map(point => point.px)), top = Math.min(...positions.map(point => point.py));
  const width = Math.max(...positions.map(point => point.px)) - left + 1;
  const height = Math.max(...positions.map(point => point.py)) - top + 1;
  const pixels = context.getImageData(left, top, width, height).data;
  return positions.flatMap(({ px, py }) => {
    const index = ((py - top) * width + px - left) * 4;
    const expected = [...pixels.subarray(index, index + 4)];
    return expected[3] > 0 ? [{ x: px / dpr, y: py / dpr, expected }] : [];
  });
}

/** Decode once. The returned bank owns browser-only rasters, never game state. */
export async function createAssetBank() {
  const entries = Object.entries(inlineAssets).filter(([id]) => isRuntimeAsset(id));
  const images = new Map(await Promise.all(entries.map(([id, source]) => decode(id, source))));
  const sprites = new Map(), counters = new Map(), recent = new Map();
  const metrics = { spriteBuilds: 0, counterBuilds: 0, hits: 0, spriteHits: 0, counterHits: 0, evictions: 0, clears: 0 };

  function touch(type, cache, key, value) {
    const recentKey = `${type}:${key}`;
    recent.delete(recentKey);
    recent.set(recentKey, { cache, key });
    cache.set(key, value);
    while (recent.size > CACHE_LIMIT) {
      const oldestKey = recent.keys().next().value, oldest = recent.get(oldestKey);
      recent.delete(oldestKey);
      oldest.cache.delete(oldest.key);
      metrics.evictions++;
    }
    return value;
  }

  function cached(type, cache, key) {
    const value = cache.get(key);
    if (!value) return null;
    metrics.hits++;
    metrics[type === 'sprite' ? 'spriteHits' : 'counterHits']++;
    return touch(type, cache, key, value);
  }

  function raster(id, width, height, dpr) {
    const key = JSON.stringify([id, width, height, dpr]);
    const existing = cached('sprite', sprites, key);
    if (existing) return existing;
    const reference = assetReference(id), original = images.get(reference.sourceId);
    if (!original) throw new Error(`素材 ${id} 未包含在本步的内联素材库。`);
    const { image, context } = canvas(width, height);
    if(reference.mirrorX){context.translate(width,0);context.scale(-1,1);}
    context.drawImage(original, 0, 0, width, height);
    metrics.spriteBuilds++;
    return touch('sprite', sprites, key, { image, width: width / dpr, height: height / dpr });
  }

  function sprite(id, widthCSS, heightCSS, dpr = 1) {
    const ratio = positive(dpr, '像素倍率');
    const width = Math.max(1, Math.round(positive(widthCSS, '贴图宽度') * ratio));
    const height = Math.max(1, Math.round(positive(heightCSS, '贴图高度') * ratio));
    return raster(id, width, height, ratio);
  }

  function counterLayer({ width, height, shop, dpr = 1, rect } = {}) {
    positive(width, '画面宽度'); positive(height, '画面高度');
    const ratio = positive(dpr, '像素倍率'), unit = Math.min(width, height) / 1080;
    if (!Object.hasOwn(SHOP_TEXT, shop)) throw new Error(`未知柜台店铺：${shop}`);
    const counterWidth = Math.min(width, Math.min(width, height) * 2.2), counterHeight = 210 * unit;
    const bounds = rect || { x: (width - counterWidth) / 2, y: height - counterHeight, width: counterWidth, height: counterHeight };
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(finite) || bounds.width <= 0 || bounds.height <= 0) throw new Error('柜台矩形无效。');
    const key = JSON.stringify([width, height, shop, ratio, bounds.x, bounds.y, bounds.width, bounds.height]);
    const existing = cached('counter', counters, key);
    if (existing) return existing;
    const physicalWidth = Math.max(1, Math.round(width * ratio)), physicalHeight = Math.max(1, Math.round(height * ratio));
    const { image, context } = canvas(physicalWidth, physicalHeight);
    const left = Math.round(bounds.x * ratio), right = Math.round((bounds.x + bounds.width) * ratio);
    const top = Math.round(bounds.y * ratio), bottom = Math.round((bounds.y + bounds.height) * ratio);
    const bodyHeight = Math.max(1, bottom - top), bodyUnit = bounds.height / 210;
    const capWidth = Math.min(Math.round(128 * bodyUnit * ratio), Math.floor((right - left) / 2));
    const middleStart = left + capWidth, middleEnd = right - capWidth, innerWidth = middleEnd - middleStart;
    const tileCount = innerWidth > 0 ? Math.max(1, Math.round(innerWidth / (256 * bodyUnit * ratio))) : 0;
    const draw = (id, x, y, rasterWidth, rasterHeight) => {
      if (rasterWidth <= 0 || rasterHeight <= 0) return;
      const part = raster(id, rasterWidth, rasterHeight, ratio);
      context.drawImage(part.image, x, y);
    };
    draw(`counter_${shop}_left`, left, top, capWidth, bodyHeight);
    // Rounded physical boundaries preserve every whole pattern and close seams.
    for (let index = 0; index < tileCount; index++) {
      const start = middleStart + Math.round(innerWidth * index / tileCount);
      const end = middleStart + Math.round(innerWidth * (index + 1) / tileCount);
      draw(`counter_${shop}_mid`, start, top, end - start, bodyHeight);
    }
    draw(`counter_${shop}_right`, right - capWidth, top, capWidth, bodyHeight);
    const signSize = Math.max(1, Math.round(120 * bodyUnit * ratio));
    const signX = Math.round((left + right - signSize) / 2), signY = bottom - Math.round(12 * bodyUnit * ratio) - signSize;
    draw(`counter_${shop}_sign`, signX, signY, signSize, signSize);
    context.fillStyle = '#49372d';
    context.font = `900 ${45 * bodyUnit * ratio}px "Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(SHOP_TEXT[shop], signX + signSize / 2, signY + signSize / 2);
    const proofCandidates = proofPixels(context, image, bounds, unit, ratio);
    metrics.counterBuilds++;
    return touch('counter', counters, key, { image, width: physicalWidth / ratio, height: physicalHeight / ratio, proofCandidates, drawOrderName: 'counter', tileCount });
  }

  function clearRasterCache() {
    sprites.clear(); counters.clear(); recent.clear();
    metrics.clears++;
  }

  return {
    images, sprite, counterLayer, clearRasterCache,
    stats: () => ({ sourceImages: images.size, spriteEntries: sprites.size, counterEntries: counters.size, rasterEntries: recent.size, cacheLimit: CACHE_LIMIT, ...metrics })
  };
}
