(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PuppetCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'puppet-interaction-config-v1';
  var MAX_CONFIG_BYTES = 1048576;
  var ACTIONS = ['hit', 'pinch', 'kick'];
  var ANCHORS = ['hit', 'pinchLeft', 'pinchRight', 'kick'];
  var own = Function.call.bind(Object.prototype.hasOwnProperty);

  function invalid(message) { throw new RangeError(message); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function inRange(value, min, max) { return finite(value) && value >= min && value <= max; }
  function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
  function clamp(value) { return Math.max(0, Math.min(1, value)); }
  function positive(value) { if (!finite(value) || value <= 0) invalid('画布和可见区域尺寸必须是有限正数。'); }
  function safeKey(key) { return key !== '__proto__' && key !== 'prototype' && key !== 'constructor'; }
  function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(label + '必须是对象。');
    var proto = Object.getPrototypeOf(value);
    // SDK callbacks can pass plain objects from the parent iframe realm.
    // Match its native Object prototype rather than this realm's identity.
    var crossRealmPlain = proto && Object.getPrototypeOf(proto) === null && own(proto, 'constructor') &&
      typeof proto.constructor === 'function' && Function.prototype.toString.call(proto.constructor) === Function.prototype.toString.call(Object);
    if (proto !== Object.prototype && proto !== null && !crossRealmPlain) invalid(label + '必须是普通对象。');
    Object.keys(value).forEach(function (key) { if (!safeKey(key)) invalid(label + '包含非法字段。'); });
    return value;
  }
  function textValue(value, label, max, empty, trim) {
    if (typeof value !== 'string' || value.length > max) invalid(label + '必须是长度不超过 ' + max + ' 的文本。');
    var result = trim ? value.trim() : value;
    if (!empty && !result.trim()) invalid(label + '不能为空。');
    return result;
  }
  function message(error) { return error && error.message ? String(error.message) : '操作失败。'; }
  function success(value) { return { ok: true, value: value, error: null }; }
  function failure(error) { return { ok: false, value: null, error: message(error) }; }
  function utf8Bytes(text) {
    var bytes = 0;
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
        bytes += 4; i += 1;
      } else bytes += 3;
      if (bytes > MAX_CONFIG_BYTES) break;
    }
    return bytes;
  }
  function boundedJSON(value) {
    var json = JSON.stringify(value);
    if (typeof json !== 'string' || utf8Bytes(json) > MAX_CONFIG_BYTES) invalid('配置内容超过 1 MiB 上限或无法序列化。');
    return json;
  }

  function validateResolution(width, height) {
    return integer(width, 320, 7680) && integer(height, 320, 7680);
  }
  function gcd(a, b) { while (b) { var remainder = a % b; a = b; b = remainder; } return a; }
  function aspectKey(width, height) {
    if (!validateResolution(width, height)) invalid('分辨率宽高必须是 320–7680 的整数。');
    var divisor = gcd(width, height);
    return (width / divisor) + ':' + (height / divisor);
  }
  function fitRect(logicalWidth, logicalHeight, viewportWidth, viewportHeight) {
    [logicalWidth, logicalHeight, viewportWidth, viewportHeight].forEach(positive);
    var scale = Math.min(viewportWidth / logicalWidth, viewportHeight / logicalHeight);
    var width = Math.min(viewportWidth, logicalWidth * scale);
    var height = Math.min(viewportHeight, logicalHeight * scale);
    return { left: (viewportWidth - width) / 2, top: (viewportHeight - height) / 2, width: width, height: height, scale: scale };
  }
  function clientToNormalized(clientX, clientY, rect) {
    if (!rect || !finite(clientX) || !finite(clientY) || !finite(rect.left) || !finite(rect.top)) invalid('指针与画布坐标无效。');
    positive(rect.width); positive(rect.height);
    return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
  }
  function pointToPixels(point, width, height) {
    if (!point || !finite(point.x) || !finite(point.y)) invalid('准星坐标必须是有限数字。');
    positive(width); positive(height);
    return { x: clamp(point.x) * width, y: clamp(point.y) * height };
  }

  function defaultSettings(kind) {
    var result = { size: 0.16, effectScale:1, intensity: 1, duration: kind === 'pinch' ? 4 : kind === 'kick' ? 3.2 : 1, direction: 'left', variant: 'shoe', hotkeyID: '', parameter: '', parameterValue: 0 };
    if (kind === 'hit') Object.assign(result,{hitTarget:'face',contactScale:1,skinColor:'#f9e1d2'});
    if (kind === 'kick') result.kickShrink = .70;
    if (kind === 'kick') result.kickFlightVersion = 1;
    if (kind === 'pinch') {
      result.skinColor = '#ffe3d5';
      result.pinchMarkScale = 1;
      result.pinchMarkOpacity = 0.85;
      result.pinchStyleVersion = 1;
    }
    return result;
  }
  function defaultLayout() {
    return {
      calibrated: false,
      anchors: { hit: { x: 0.5, y: 0.35 }, hitHead: {x:0.5,y:0.19}, pinchLeft: { x: 0.4, y: 0.4 }, pinchRight: { x: 0.6, y: 0.4 }, kick: { x: 0.5, y: 0.75 } },
      settings: { hit: defaultSettings('hit'), pinch: defaultSettings('pinch'), kick: defaultSettings('kick') }
    };
  }
  function defaultProfile(modelID, name) {
    modelID = textValue(modelID, '模型 ID', 128, false, false);
    if (!safeKey(modelID)) invalid('模型 ID 无效。');
    return { modelID: modelID, name: textValue(name, '模型名称', 256, false, false), layouts: {} };
  }
  function defaultConfig() {
    return { version: 1, scene: { width: 1920, height: 1080 }, profiles: {}, rules: [{ name: '', action: 'hit', count: 1 }], volume: 0.4, port: 8001 };
  }
  function readSettings(input, kind) {
    record(input, '动作参数');
    var isPinch = kind === 'pinch';
    var legacyPinch = isPinch && !own(input, 'pinchStyleVersion');
    var legacyKick = kind === 'kick' && !own(input, 'kickFlightVersion');
    if (kind === 'kick' && !legacyKick && input.kickFlightVersion !== 1) invalid('不支持的踢飞配置版本。');
    if (isPinch && !legacyPinch && input.pinchStyleVersion !== 1) invalid('不支持的捏痕配置版本。');
    var direction = own(input, 'direction') ? input.direction : 'left';
    var variant = own(input, 'variant') ? input.variant : 'shoe';
    if (direction !== 'left' && direction !== 'right') invalid('动作方向只能是 left 或 right。');
    if (variant !== 'shoe' && variant !== 'barefoot') invalid('踢击素材只能是穿鞋或赤脚。');
    if (!inRange(input.size, 0.02, 1)) invalid('素材大小须在 0.02–1 之间。');
    if (!inRange(input.intensity, 0, 3)) invalid('动作强度须在 0–3 之间。');
    var maxDuration = isPinch && !legacyPinch ? 15 : 5;
    if (!inRange(input.duration, 0.1, maxDuration)) invalid('动作时长须在 0.1–' + maxDuration + ' 秒之间。');
    if (!inRange(input.parameterValue, -1000000, 1000000)) invalid('输入参数值超出允许范围。');
    var result = {
      size: input.size, intensity: input.intensity, duration: legacyPinch ? Math.max(input.duration, 4) : legacyKick ? Math.max(input.duration, 3.2) : input.duration, direction: direction, variant: variant,
      hotkeyID: textValue(input.hotkeyID, '表情热键', 256, true, false),
      parameter: textValue(input.parameter, '输入参数', 256, true, false), parameterValue: input.parameterValue
    };
    result.effectScale=own(input,'effectScale')?input.effectScale:1;
    if(!inRange(result.effectScale,.25,3)) invalid('特效大小须在25%–300%之间。');
    if(kind==='hit'){
      result.hitTarget=own(input,'hitTarget')?input.hitTarget:'face';
      result.contactScale=own(input,'contactScale')?input.contactScale:1;
      result.skinColor=own(input,'skinColor')?input.skinColor:'#f9e1d2';
      if(!['face','head'].includes(result.hitTarget))invalid('打击部位须为脸或头。');
      if(!inRange(result.contactScale,.25,3))invalid('接触衔接大小须在25%–300%之间。');
      if(typeof result.skinColor!=='string'||!/^#[0-9a-f]{6}$/i.test(result.skinColor))invalid('接触肤色须为六位HEX颜色。');
      result.skinColor=result.skinColor.toLowerCase();
    }
    if(kind==='kick'){
      result.kickShrink=own(input,'kickShrink')?input.kickShrink:.70;
      if(!inRange(result.kickShrink,0,.95))invalid('踢飞缩小幅度须在0%–95%之间。');
    }
    if (kind === 'kick') result.kickFlightVersion = 1;
    if (isPinch) {
      var skinColor = own(input, 'skinColor') ? input.skinColor : '#ffe3d5';
      var markScale = own(input, 'pinchMarkScale') ? input.pinchMarkScale : 1;
      var markOpacity = own(input, 'pinchMarkOpacity') ? input.pinchMarkOpacity : 0.85;
      if (typeof skinColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(skinColor)) invalid('捏痕肤色须为 # 开头的六位 HEX 颜色。');
      if (!inRange(markScale, 0.5, 2)) invalid('捏痕大小须在 0.5–2 之间。');
      if (!inRange(markOpacity, 0, 1)) invalid('捏痕不透明度须在 0–1 之间。');
      result.skinColor = skinColor.toLowerCase();
      result.pinchMarkScale = markScale;
      result.pinchMarkOpacity = markOpacity;
      result.pinchStyleVersion = 1;
    }
    return result;
  }
  function readLayout(input) {
    record(input, '布局'); record(input.anchors, '准星'); record(input.settings, '动作参数组');
    if (typeof input.calibrated !== 'boolean') invalid('校准状态必须是布尔值。');
    var result = { calibrated: input.calibrated, anchors: {}, settings: {} };
    ANCHORS.forEach(function (name) {
      var point = record(input.anchors[name], name + ' 准星');
      if (!inRange(point.x, 0, 1) || !inRange(point.y, 0, 1)) invalid('准星坐标须在 0–1 之间。');
      result.anchors[name] = { x: point.x, y: point.y };
    });
    var head=own(input.anchors,'hitHead')?record(input.anchors.hitHead,'打头准星'):{x:result.anchors.hit.x,y:Math.max(0,result.anchors.hit.y-.16)};
    if(!inRange(head.x,0,1)||!inRange(head.y,0,1))invalid('打头准星坐标须在0–1之间。');
    result.anchors.hitHead={x:head.x,y:head.y};
    ACTIONS.forEach(function (name) { result.settings[name] = readSettings(input.settings[name], name); });
    return result;
  }
  function readProfile(input, expectedID) {
    record(input, '模型配置'); record(input.layouts, '模型布局');
    var result = defaultProfile(input.modelID, input.name);
    if (expectedID !== undefined && result.modelID !== expectedID) invalid('模型 ID 与存档索引不一致。');
    var keys = Object.keys(input.layouts);
    if (keys.length > 64) invalid('单个模型最多保存 64 个比例布局。');
    keys.forEach(function (key) {
      var parts = /^([1-9]\d{0,3}):([1-9]\d{0,3})$/.exec(key);
      if (!parts || Number(parts[1]) > 7680 || Number(parts[2]) > 7680 || gcd(Number(parts[1]), Number(parts[2])) !== 1) invalid('布局比例必须是最简宽高比。');
      result.layouts[key] = readLayout(input.layouts[key]);
    });
    return result;
  }
  function ensureLayout(profile, width, height) {
    var key = aspectKey(width, height);
    var clean = readProfile(profile);
    return own(clean.layouts, key) ? clean.layouts[key] : defaultLayout();
  }

  function validateConfig(input) {
    try {
      record(input, '配置');
      boundedJSON(input);
      if (input.version !== 1) invalid('不支持的配置版本。');
      record(input.scene, '画布');
      if (!validateResolution(input.scene.width, input.scene.height)) invalid('分辨率宽高必须是 320–7680 的整数。');
      record(input.profiles, '模型列表');
      var ids = Object.keys(input.profiles);
      if (ids.length > 100) invalid('最多保存 100 个模型。');
      if (!Array.isArray(input.rules) || input.rules.length > 100) invalid('礼物规则须为数组，最多 100 条。');
      if (!inRange(input.volume, 0, 1)) invalid('音量须在 0–1 之间。');
      if (!integer(input.port, 1, 65535)) invalid('VTS 端口须为 1–65535 的整数。');
      var result = { version: 1, scene: { width: input.scene.width, height: input.scene.height }, profiles: {}, rules: [], volume: input.volume, port: input.port };
      ids.forEach(function (id) { result.profiles[id] = readProfile(input.profiles[id], id); });
      input.rules.forEach(function (rule) {
        record(rule, '礼物规则');
        if (ACTIONS.indexOf(rule.action) < 0) invalid('礼物动作只能是打、捏或踢。');
        if (!integer(rule.count, 1, 100)) invalid('每次动作数量须为 1–100 的整数。');
        var cleanRule={ name: textValue(rule.name, '礼物名称', 128, true, true), action: rule.action, count: rule.count };
        if(rule.action==='kick'){
          var ruleVariant=own(rule,'variant')?rule.variant:'shoe';
          if(ruleVariant!=='shoe'&&ruleVariant!=='barefoot')invalid('礼物踢击素材只能是穿鞋或赤脚。');
          cleanRule.variant=ruleVariant;
        }
        result.rules.push(cleanRule);
      });
      return success(result);
    } catch (error) { return failure(error); }
  }
  function importConfig(jsonText) {
    try {
      if (typeof jsonText !== 'string' || !jsonText.trim()) invalid('请选择有效的 JSON 配置文件。');
      if (jsonText.length > MAX_CONFIG_BYTES || utf8Bytes(jsonText) > MAX_CONFIG_BYTES) invalid('配置文件超过 1 MiB 上限。');
      return validateConfig(JSON.parse(jsonText));
    } catch (error) { return failure(error); }
  }
  function exportConfig(config) {
    var checked = validateConfig(config);
    if (!checked.ok) return { ok: false, text: null, error: checked.error };
    var text = JSON.stringify(checked.value, null, 2);
    if (utf8Bytes(text) > MAX_CONFIG_BYTES) return { ok: false, text: null, error: '导出配置超过 1 MiB 上限。' };
    return { ok: true, text: text, error: null };
  }
  function resolveStorage(storage, writing) {
    if (storage == null) {
      if (typeof globalThis === 'undefined') invalid('当前环境无法使用浏览器存储。');
      storage = globalThis.localStorage;
    }
    if (!storage || typeof storage.getItem !== 'function' || (writing && typeof storage.setItem !== 'function')) invalid('当前环境无法使用浏览器存储。');
    return storage;
  }
  function storageKey(key) { return key === undefined ? STORAGE_KEY : textValue(key, '存储名称', 256, false, false); }
  function loadConfig(storage, key) {
    var found = false;
    try {
      var text = resolveStorage(storage, false).getItem(storageKey(key));
      if (text === null) return { ok: true, value: defaultConfig(), error: null, found: false };
      found = true;
      var checked = importConfig(text);
      return { ok: checked.ok, value: checked.ok ? checked.value : defaultConfig(), error: checked.error, found: true };
    } catch (error) { return { ok: false, value: defaultConfig(), error: message(error), found: found }; }
  }
  function saveConfig(storage, config, key) {
    var checked = validateConfig(config);
    if (!checked.ok) return { ok: false, error: checked.error };
    try {
      var target = resolveStorage(storage, true);
      var name = storageKey(key);
      var text = JSON.stringify(checked.value);
      target.setItem(name, text);
      if (target.getItem(name) !== text) invalid('配置写入后未能核对，当前更改仅作临时使用。');
      return { ok: true, error: null };
    } catch (error) { return { ok: false, error: message(error) }; }
  }

  function normalizeGift(raw) {
    try {
      record(raw, '礼物数据');
      var name = own(raw, 'name') ? raw.name : (own(raw, 'giftName') ? raw.giftName : (raw.gift && raw.gift.name));
      name = textValue(name, '礼物名称', 128, false, true);
      if (!integer(raw.count, 1, 100)) invalid('礼物本次数量须为 1–100 的整数。');
      var gift = { name: name, count: raw.count };
      if (raw.eventId !== undefined && raw.eventId !== null && raw.eventId !== '') {
        if (typeof raw.eventId === 'string') {
          var eventId = textValue(raw.eventId, '事件 ID', 256, true, true);
          if (eventId) gift.eventId = eventId;
        } else if (Number.isSafeInteger(raw.eventId) && raw.eventId >= 0) gift.eventId = String(raw.eventId);
        else invalid('事件 ID 必须是文本或非负安全整数。');
      }
      return success(gift);
    } catch (error) { return failure(error); }
  }

  return Object.freeze({
    STORAGE_KEY: STORAGE_KEY, MAX_CONFIG_BYTES: MAX_CONFIG_BYTES,
    validateResolution: validateResolution, aspectKey: aspectKey, fitRect: fitRect,
    clientToNormalized: clientToNormalized, pointToPixels: pointToPixels,
    defaultProfile: defaultProfile, ensureLayout: ensureLayout, defaultConfig: defaultConfig,
    validateConfig: validateConfig, importConfig: importConfig, exportConfig: exportConfig,
    loadConfig: loadConfig, saveConfig: saveConfig, load: loadConfig, save: saveConfig,
    normalizeGift: normalizeGift
  });
}));
