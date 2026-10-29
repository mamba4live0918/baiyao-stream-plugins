/* 擦玻璃 · 主播自己上传的异形贴纸库：图片存在浏览器的 IndexedDB 里（关掉 OBS、刷新都还在，不占设置那几 KB 的地方），
   开着时解码成画布、做好刀模白边，交给小广告系统贴。存不下来（浏览器不让存）时这次直播里照样能用，只提示一句。 */
import { trimAndScale, dieCutCanvas, makeStickerDesign, thumbOf } from './art/sticker-art.js';

const DB_NAME = 'glass2d-stickers';
const STORE = 'stickers';
const MAX_SIDE = 512;
/* 解码时最长边超过这个就直接缩小着解（几亿像素的照片整张解开会把页面卡住） */
const DECODE_MAX = 2048;

function openDb() {
  return new Promise(resolve => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function tx(db, mode, fn) {
  return new Promise(resolve => {
    try {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : true);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/* 只读图片的宽高（不整张解码）；读不出来返回 null */
const sizeOf = blob =>
  new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

const decode = async blob => {
  if (typeof createImageBitmap === 'function') {
    const size = await sizeOf(blob);
    const k = size ? Math.min(1, DECODE_MAX / Math.max(size.w, size.h, 1)) : 1;
    if (k < 1) return createImageBitmap(blob, { resizeWidth: Math.max(1, Math.round(size.w * k)), resizeHeight: Math.max(1, Math.round(size.h * k)), resizeQuality: 'high' });
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/* 解码 → 裁边缩放成画布；解出来的位图用完马上放掉 */
const toCanvas = async blob => {
  const img = await decode(blob);
  try {
    return trimAndScale(img, MAX_SIDE);
  } finally {
    if (img.close) img.close();
  }
};

const toBlob = c => new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'));

export function createStickerLibrary({ onChange = () => {}, toast = () => {} } = {}) {
  const items = [];
  let db = null;
  let saved = true;
  let bag = [];
  /* 读、存、删一件一件排着来（刚打开就上传、边读边删时不会乱、不会重复） */
  let chain = Promise.resolve();
  const serial = fn => (chain = chain.then(fn, fn));

  const build = (id, name, canvas) => {
    const die = dieCutCanvas(canvas);
    return { id, name, design: makeStickerDesign(id, die), thumb: thumbOf(die.canvas) };
  };

  async function loadNow() {
    db = await openDb();
    if (!db) {
      saved = false;
      return;
    }
    const rows = (await tx(db, 'readonly', st => st.getAll())) || [];
    rows.sort((a, b) => (a.added || 0) - (b.added || 0));
    let n = 0;
    for (const r of rows) {
      try {
        const c = await toCanvas(r.blob);
        if (c) {
          items.push(build(r.id, r.name, c));
          n++;
        }
      } catch (e) {
        /* 坏掉的那张跳过 */
      }
    }
    if (n) onChange();
  }

  async function addNow(files) {
    let n = 0;
    for (const f of Array.from(files || [])) {
      if (!f || !/^image\//.test(f.type || '')) continue;
      try {
        const c = await toCanvas(f);
        if (!c) continue;
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const name = String(f.name || '贴纸').replace(/\.[a-z0-9]+$/i, '').slice(0, 40);
        if (db) {
          const blob = await toBlob(c);
          const ok = blob && (await tx(db, 'readwrite', st => st.put({ id, name, blob, added: Date.now() })));
          if (!ok) saved = false;
        }
        items.push(build(id, name, c));
        n++;
      } catch (e) {
        /* 读不了的图片跳过 */
      }
    }
    if (n) {
      bag = [];
      onChange();
      if (!lib.persistent) toast('贴纸存不下来（浏览器不让存），这次直播里能用，关掉以后要重新上传');
    }
    return n;
  }

  async function removeNow(id) {
    const i = items.findIndex(s => s.id === id);
    if (i < 0) return;
    items.splice(i, 1);
    bag = [];
    if (db) await tx(db, 'readwrite', st => st.delete(id));
    onChange();
  }

  const lib = {
    get count() {
      return items.length;
    },
    /* 存不下来（这次关掉就没了） */
    get persistent() {
      return saved && !!db;
    },
    list: () => items.map(s => ({ id: s.id, name: s.name, thumb: s.thumb })),
    /* 开着时读回以前上传的 */
    load: () => serial(loadNow),
    /* 上传：返回加进来几张 */
    add: files => serial(() => addNow(files)),
    remove: id => serial(() => removeNow(id)),
    /* 轮着来：一袋里每张出现一次再洗牌 */
    next() {
      if (!items.length) return null;
      if (!bag.length) bag = items.map((_, i) => i).sort(() => Math.random() - 0.5);
      const s = items[bag.pop()];
      return s ? s.design : items[0].design;
    }
  };
  return lib;
}
