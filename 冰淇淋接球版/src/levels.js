(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GelatoLevels = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'gelato.catch.v4.levels';
  const LEGACY_KEY = 'gelato.catch.v1.config';
  const MAX_LEVELS = 200;
  const DEFAULT_CONFIG = Object.freeze({ name: '关卡 1', mode: 'classic', target: 10, targetHeight: 500,
    duration: 75, count: 1, move: 800, fall: 1.4, size: 1, bowlWidth: 190, catchOverlap: .45,
    spawnInterval: .4, attemptMode: 'unlimited', attempts: 20,
    windForce: 1.2, windPeriod: 4, gustDuration: 2.8, largeScale: 1.35, smallScale: .8 });
  const DIFFICULTIES=Object.freeze({
    standard:Object.freeze({name:'标准',targetHeight:300,duration:120,move:900,fall:1,bowlWidth:260,catchOverlap:.25,spawnInterval:.65,windForce:1}),
    hard:Object.freeze({name:'困难',targetHeight:500,duration:75,move:800,fall:1.4,bowlWidth:190,catchOverlap:.45,spawnInterval:.4,windForce:1.2}),
    expert:Object.freeze({name:'极限',targetHeight:750,duration:60,move:680,fall:1.8,bowlWidth:140,catchOverlap:.6,spawnInterval:.25,windForce:1.6})
  });
  function difficultyPreset(id,mode='classic'){
    const selected=Object.prototype.hasOwnProperty.call(DIFFICULTIES,id)?id:'hard';
    const result={...DIFFICULTIES[selected]};delete result.name;
    if(mode==='narrow')result.bowlWidth={standard:150,hard:130,expert:100}[selected];
    return result;
  }
  const LIMITS = Object.freeze(Object.fromEntries(Object.entries({
    targetHeight: { min: 20, max: 10000 }, duration: { min: 1, max: 3600 },
    move: { min: 40, max: 5000 },
    fall: { min: .3, max: 3 }, size: { min: .6, max: 1.5 }, bowlWidth: { min: 100, max: 500 }, catchOverlap: { min: .1, max: .8 },
    spawnInterval: { min: .15, max: 5 }, attempts: { min: 0, max: 100000, integer: true },
    windForce: { min: 0, max: 5 }, windPeriod: { min: 1, max: 60 },
    gustDuration: { min: .2, max: 59.8 }, largeScale: { min: .5, max: 2 }, smallScale: { min: .3, max: 1.5 }
  }).map(([key, limit]) => [key, Object.freeze(limit)])));

  const MODES = Object.freeze([
    { id: 'classic', name: '标准接球', description: '移动盘子接住随机落下的冰球，叠到目标高度后通关。',
      theme: { background: '#fff5e9', accent: '#ed7999', ink: '#62473d', mint: '#7fc6ac' }, defaults: {} },
    { id: 'narrow', name: '窄盘', description: '使用较窄的盘子接球，接住后继续向上堆叠。',
      theme: { background: '#f4f8e5', accent: '#9fb65c', ink: '#495138', mint: '#bedb9a' },
      defaults: { bowlWidth: 130 } },
    { id: 'wind', name: '阵风', description: '间歇阵风推动冰球。稳定接球只影响下落球；真实与粘性物理也会受到风力扰动。',
      theme: { background: '#eaf8f3', accent: '#68baa7', ink: '#375a53', mint: '#a7dce4' },
      defaults: { windForce: 1.2 } },
    { id: 'giant', name: '大小交替', description: '两种设定的冰球尺寸交替落下，接住后按实际高度累计。',
      theme: { background: '#f4edff', accent: '#ab8cdb', ink: '#554368', mint: '#f0c873' },
      defaults: { largeScale: 1.35, smallScale: .8 } }
  ].map(mode => Object.freeze({ ...mode, theme: Object.freeze(mode.theme),
    defaults: Object.freeze({ ...DEFAULT_CONFIG, ...mode.defaults, targetHeight: mode.defaults.target ? Math.round(mode.defaults.target * 49.84 * 100) / 100 : DEFAULT_CONFIG.targetHeight, mode: mode.id }) })));

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value);
  let creationSequence = 0;

  function numeric(value, fallback) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback;
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function nameFor(value, index) {
    const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim() : '';
    return name ? Array.from(name).slice(0, 40).join('') : '关卡 ' + (Math.max(0, Math.floor(numeric(index, 0))) + 1);
  }

  // Repairs must be repeatable even when browser storage cannot be written.
  // Newly created levels receive random identities; saved identities always survive edits and ordering.
  function repairId(level, index) {
    let hash = 2166136261;
    const text = JSON.stringify(level);
    for (let offset = 0; offset < text.length; offset++) {
      hash ^= text.charCodeAt(offset);
      hash = Math.imul(hash, 16777619);
    }
    return 'level-' + Math.max(0, Math.floor(numeric(index, 0))) + '-' + (hash >>> 0).toString(36);
  }

  function normalizeLevel(input, index = 0) {
    const source = isRecord(input) ? input : {};
    const mode = MODES.find(item => item.id === source.mode) || MODES[0];
    const result = { name: nameFor(source.name, index), mode: mode.id };
    for (const [key, limit] of Object.entries(LIMITS)) {
      const fallback = key === 'targetHeight' && Number.isFinite(numeric(source.target, NaN))
        ? Math.round(clamp(Math.round(numeric(source.target, 6)), 1, 100) * 49.84 * 100) / 100 : mode.defaults[key];
      const value = numeric(source[key], fallback);
      result[key] = clamp(limit.integer ? Math.round(value) : value, limit.min, limit.max);
    }
    // Retained for old integrations; progression uses targetHeight exclusively.
    result.target = clamp(Math.round(numeric(source.target, result.targetHeight / 49.84)), 1, 100);
    result.count = 1;
    result.attemptMode = source.attemptMode === 'limited' ? 'limited' : 'unlimited';
    result.gustDuration = Math.min(result.gustDuration, result.windPeriod - .2);
    result.id = validId(source.id) ? source.id : repairId(result, index);
    return result;
  }

  function normalizeList(input) {
    const items = Array.isArray(input) ? input.filter(isRecord).slice(0, MAX_LEVELS) : [];
    if (!items.length) items.push({});
    const normalized = items.map(normalizeLevel);
    const reserved = new Set(normalized.map(level => level.id));
    const ids = new Set();
    return normalized.map(result => {
      const stem = result.id;
      let suffix = 1;
      while (ids.has(result.id)) {
        do {
          const ending = '.' + (++suffix);
          result.id = stem.slice(0, 80 - ending.length) + ending;
        } while (reserved.has(result.id));
      }
      ids.add(result.id);
      return result;
    });
  }

  function create(mode = 'classic', index = 0) {
    const definition = MODES.find(item => item.id === mode) || MODES[0];
    let id;
    try { id = root.crypto && root.crypto.randomUUID ? 'level-' + root.crypto.randomUUID() : null; } catch (_) {}
    if (!id) id = 'level-' + Date.now().toString(36) + '-' + (++creationSequence).toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    return normalizeLevel({ ...definition.defaults, id, name: nameFor(null, index) }, index);
  }

  function migrateLegacy(oldConfig) {
    if (!isRecord(oldConfig)) return normalizeList();
    const attemptMode = oldConfig.attemptMode === 'unlimited' ? 'unlimited'
      : oldConfig.attemptMode === 'limited' || Number.isFinite(numeric(oldConfig.attempts, NaN)) ? 'limited' : 'unlimited';
    return normalizeList([{ ...oldConfig, id: validId(oldConfig.id) ? oldConfig.id : 'legacy-catch', attemptMode }]);
  }

  function resolveStorage(storage) {
    return storage === undefined ? root.localStorage : storage;
  }

  function read(storage) {
    try {
      const target = resolveStorage(storage);
      if (!target || typeof target.getItem !== 'function') return normalizeList();
      const current = target.getItem(STORAGE_KEY);
      if (current !== null && current !== undefined) {
        try { return normalizeList(JSON.parse(current)); } catch (_) { return normalizeList(); }
      }
      const legacy = target.getItem(LEGACY_KEY);
      if (legacy !== null && legacy !== undefined) {
        try { return migrateLegacy(JSON.parse(legacy)); } catch (_) { return normalizeList(); }
      }
    } catch (_) {}
    return normalizeList();
  }

  function write(input, storage) {
    if (!Array.isArray(input) || !input.length || input.length > MAX_LEVELS || !Array.from(input).every(isRecord)) {
      throw new Error('关卡列表必须包含 1 至 200 个有效关卡。');
    }
    const result = normalizeList(input);
    try {
      const target = resolveStorage(storage);
      if (!target || typeof target.setItem !== 'function') throw new Error('storage unavailable');
      target.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch (_) {
      throw new Error('无法保存关卡，请检查浏览器存储空间和权限后重试。');
    }
    return result;
  }

  return Object.freeze({ MODES, DEFAULT_CONFIG, DIFFICULTIES, difficultyPreset, LIMITS, MAX_LEVELS, STORAGE_KEY, LEGACY_KEY,
    normalizeLevel, normalizeList, create, migrateLegacy, read, write });
});
