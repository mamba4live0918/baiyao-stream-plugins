(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GelatoAppearance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const KEY = 'gelato.catch.v2.appearance';
  const BUILTIN_NAMES = Object.freeze(['草莓','开心果','香草','葡萄','巧克力','蓝莓','芒果','薄荷巧克力','咖啡','蜜桃','黑芝麻','曲奇奶油']);
  const BUILTIN_COUNT = BUILTIN_NAMES.length;
  const MAX_CUSTOM_FLAVORS = 12;
  const MAX_FLAVORS = BUILTIN_COUNT + MAX_CUSTOM_FLAVORS;
  const MAX_IMAGE_CHARS = 500000;
  const MAX_TOTAL_CHARS = 3000000;
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const DEFAULTS = Object.freeze({
    version: 2,
    scoops: Object.freeze(BUILTIN_NAMES.map((name,builtin) =>
      Object.freeze({ id:'builtin-'+builtin, name, enabled:true, builtin }))),
    bowl: Object.freeze({ dataUrl:null, name:'默认盘子', rim:0.08 }),
    ice: Object.freeze({ dataUrl:null, name:'默认冰球' })
  });
  const validImages = new Map();

  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function hasBuiltin(scoop) { return record(scoop) && Object.prototype.hasOwnProperty.call(scoop,'builtin'); }
  function validBuiltin(scoop) { return hasBuiltin(scoop) && Number.isInteger(scoop.builtin) && scoop.builtin >= 0 && scoop.builtin < BUILTIN_COUNT; }
  function safeName(value, fallback) {
    if (typeof value !== 'string') return fallback;
    return Array.from(value.slice(0,160).trim().replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,40).join('') || fallback;
  }
  function validId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 80 &&
      !value.startsWith('builtin-') && !/[\u0000-\u001f\u007f]/.test(value);
  }
  function imageData(value) {
    if (typeof value !== 'string' || value.length > MAX_IMAGE_CHARS) return false;
    if (validImages.has(value)) return true;
    const comma = value.indexOf(',');
    if (comma < 0 || !/^data:image\/(png|jpeg|webp);base64,$/.test(value.slice(0,comma+1))) return false;
    const payload = value.slice(comma+1);
    if (!payload.length || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return false;
    validImages.set(value,true);
    if (validImages.size > 32) validImages.delete(validImages.keys().next().value);
    return true;
  }
  function rim(value) {
    const numeric = (typeof value === 'number' || (typeof value === 'string' && value.trim())) ? Number(value) : NaN;
    return Number.isFinite(numeric) ? Math.max(0,Math.min(0.8,numeric)) : DEFAULTS.bowl.rim;
  }

  // Read-time recovery may discard damaged or excessive images; write() is strict.
  function normalize(input) {
    const source = record(input) ? input : {};
    const entries = Array.isArray(source.scoops) ? source.scoops : [];
    const bowlSource = record(source.bowl) ? source.bowl : {};
    const bowlData = imageData(bowlSource.dataUrl) ? bowlSource.dataUrl : null;
    const bowl = { dataUrl:bowlData, name:bowlData ? safeName(bowlSource.name,'自定义器皿') : DEFAULTS.bowl.name, rim:rim(bowlSource.rim) };
    const iceSource=record(source.ice)?source.ice:{},iceData=imageData(iceSource.dataUrl)?iceSource.dataUrl:null;
    const ice={dataUrl:iceData,name:iceData?safeName(iceSource.name,'自定义冰球'):DEFAULTS.ice.name};
    // Reserve the bowl first so a damaged over-budget old file keeps its selected vessel.
    let totalChars = (bowlData ? bowlData.length : 0)+(iceData?iceData.length:0);
    // An existing narrowed selection (including custom-only) stays narrowed when new presets arrive.
    const preservedSelection = entries.some(entry => validBuiltin(entry) && entry.builtin < 4 && entry.enabled === false);
    const scoops = DEFAULTS.scoops.map(builtin => {
      const selected = entries.find(entry => validBuiltin(entry) && entry.builtin === builtin.builtin);
      return selected ? { id:builtin.id, name:safeName(selected.name,builtin.name), enabled:selected.enabled !== false, builtin:builtin.builtin } : { ...builtin, enabled:builtin.builtin < 4 || !preservedSelection };
    });
    const seenIds = new Set(scoops.map(scoop => scoop.id));
    for (const entry of entries) {
      if (scoops.length >= MAX_FLAVORS) break;
      if (!record(entry) || hasBuiltin(entry) || !validId(entry.id) || !imageData(entry.dataUrl)) continue;
      const id = entry.id.trim();
      if (seenIds.has(id) || totalChars+entry.dataUrl.length > MAX_TOTAL_CHARS) continue;
      scoops.push({ id, name:safeName(entry.name,'自定义冰球'), enabled:entry.enabled !== false, dataUrl:entry.dataUrl });
      seenIds.add(id);
      totalChars += entry.dataUrl.length;
    }
    if (!scoops.some(scoop => scoop.enabled)) scoops[0].enabled = true;
    return { version:2, scoops, bowl, ice };
  }

  function available(state) { return normalize(state).scoops.filter(scoop => scoop.enabled); }

  function select(state, batch, index) {
    const choices = available(state);
    const offset = value => typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) % choices.length : 0;
    return choices[((offset(batch)+offset(index)) % choices.length + choices.length) % choices.length];
  }

  function read(storage) {
    try {
      const store = storage === undefined ? root.localStorage : storage;
      const saved = store && store.getItem(KEY);
      return normalize(saved ? JSON.parse(saved) : DEFAULTS);
    } catch (_) { return normalize(DEFAULTS); }
  }

  function requireImage(dataUrl) {
    if (typeof dataUrl === 'string' && dataUrl.length > MAX_IMAGE_CHARS) throw new Error('单张图片数据超过容量上限，请缩小图片后重试。');
    if (!imageData(dataUrl)) throw new Error('图片格式无效：只接受 PNG、JPG 或 WebP 的 base64 图片数据，不支持网址或 SVG。');
    return dataUrl.length;
  }

  function validateForWrite(input) {
    if (!record(input)) return;
    if (input.scoops !== undefined && !Array.isArray(input.scoops)) throw new Error('冰球图片列表格式无效，请检查导入配置。');
    const entries = input.scoops || [];
    if (entries.length > MAX_FLAVORS) throw new Error('最多保留 24 款冰球，包括 12 款内置和 12 款自定义图片。');
    const seenIds = new Set(), seenBuiltins = new Set();
    let customCount = 0, totalChars = 0;
    for (const entry of entries) {
      if (!record(entry)) throw new Error('冰球图片配置格式无效，请检查导入内容。');
      if (hasBuiltin(entry)) {
        if (!validBuiltin(entry) || entry.id !== 'builtin-'+entry.builtin || entry.dataUrl !== undefined) throw new Error('内置冰球配置格式无效；自定义图片不能带有 builtin 字段。');
        if (seenBuiltins.has(entry.builtin)) throw new Error('内置冰球编号重复，请检查导入配置。');
        seenBuiltins.add(entry.builtin);
      } else {
        if (!validId(entry.id)) throw new Error('自定义图片编号无效，请重新添加图片。');
        const id = entry.id.trim();
        if (seenIds.has(id)) throw new Error('自定义图片编号重复，请检查导入配置。');
        seenIds.add(id);
        customCount++;
        if (customCount > MAX_CUSTOM_FLAVORS) throw new Error('最多添加 12 款自定义图片，总计最多 24 款冰球。');
        totalChars += requireImage(entry.dataUrl);
      }
    }
    if (input.bowl !== undefined && !record(input.bowl)) throw new Error('器皿图片配置格式无效。');
    const bowlData = input.bowl && input.bowl.dataUrl;
    if (bowlData !== undefined && bowlData !== null) totalChars += requireImage(bowlData);
    if(input.ice!==undefined&&!record(input.ice))throw new Error('冰球图片配置格式无效。');
    const iceData=input.ice&&input.ice.dataUrl;
    if(iceData!==undefined&&iceData!==null)totalChars+=requireImage(iceData);
    if (totalChars > MAX_TOTAL_CHARS) throw new Error('图片总容量超过上限，请删除部分自定义图片或缩小图片后再保存。');
  }

  function write(state, storage) {
    validateForWrite(state);
    const normalized = normalize(state);
    try {
      const store = storage === undefined ? root.localStorage : storage;
      if (!store || typeof store.setItem !== 'function') throw new Error('Storage unavailable');
      store.setItem(KEY,JSON.stringify(normalized));
    } catch (_) {
      throw new Error('保存失败：浏览器存储空间不足或当前环境禁止保存。请删除部分图片后重试，原配置未更新。');
    }
    return normalized;
  }

  async function importFile(file, kind = 'scoop') {
    if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error('图片文件为空或无法读取，请重新选择。');
    if (file.size > MAX_FILE_BYTES) throw new Error('图片超过 8 MB，请先压缩图片后再导入。');
    if (!['image/png','image/jpeg','image/webp'].includes(String(file.type || '').toLowerCase())) throw new Error('请选择 PNG、JPG 或 WebP 图片，不支持 SVG 或其他格式。');
    if (!['scoop','bowl','ice'].includes(kind)) throw new Error('图片用途无效，请选择冰淇淋、冰球或器皿。');
    if (!root.Image || !root.document || !root.URL || typeof root.URL.createObjectURL !== 'function') throw new Error('当前环境不支持图片导入，请在浏览器中打开插件后重试。');
    let objectUrl;
    try {
      objectUrl = root.URL.createObjectURL(file);
      const image = new root.Image();
      await new Promise((resolve,reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('图片损坏或无法解码，请换一张 PNG、JPG 或 WebP 图片。'));
        image.src = objectUrl;
      });
      const originalWidth = image.naturalWidth || image.width;
      const originalHeight = image.naturalHeight || image.height;
      if (!originalWidth || !originalHeight) throw new Error('图片损坏，无法读取有效宽高。');
      const maxWidth = kind === 'bowl' ? 512 : 192;
      const maxHeight = kind === 'bowl' ? 256 : 192;
      const scale = Math.min(1,maxWidth/originalWidth,maxHeight/originalHeight);
      let width = Math.max(1,Math.round(originalWidth*scale));
      let height = Math.max(1,Math.round(originalHeight*scale));
      const canvas = root.document.createElement('canvas');
      let dataUrl = '';
      // PNG retains alpha. A particularly noisy bowl image may need another shrink
      // to meet the per-image limit; its proportions and transparent pixels remain.
      for (let attempt=0;attempt<12;attempt++) {
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('当前浏览器无法处理图片，请换一个浏览器重试。');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image,0,0,width,height);
        dataUrl = canvas.toDataURL('image/png');
        if (dataUrl.length <= MAX_IMAGE_CHARS) break;
        width = Math.max(1,Math.floor(width*0.85));
        height = Math.max(1,Math.floor(height*0.85));
      }
      if (!imageData(dataUrl)) throw new Error('图片处理后仍然超过容量上限，请先缩小原图后重试。');
      const originalName = typeof file.name === 'string' ? file.name.replace(/\.[^.]+$/,'') : '';
      return { dataUrl, width:canvas.width, height:canvas.height, name:safeName(originalName,kind === 'bowl' ? '自定义器皿' : '自定义冰球') };
    } catch (error) {
      if (error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)) throw error;
      throw new Error('图片损坏或读取失败，请重新选择本地 PNG、JPG 或 WebP 图片。');
    } finally {
      if (objectUrl) root.URL.revokeObjectURL(objectUrl);
    }
  }

  return { DEFAULTS, BUILTIN_COUNT, MAX_CUSTOM_FLAVORS, MAX_FLAVORS, normalize, available, select, read, write, importFile };
});
