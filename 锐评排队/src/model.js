(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./themes.js'), require('./transport.js'));
  else root.ReviewModel = factory(root.ReviewEngine, root.ReviewThemes, root.ReviewTransport);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, T, Transport) {
  'use strict';
  const fail = message => { throw new Error(message); };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const normalizeName = name => name.normalize('NFKC').trim().toLowerCase();
  function string(value, label, max, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(label + '格式或长度无效');
    return value;
  }
  function integer(value, label, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(label + '必须是 ' + min + '–' + max + ' 的整数');
    return value;
  }
  function defaultRules() {
    return [{ id: 'default-fan-badge', name: '粉丝团灯牌', kind: 'join', min: 1, opportunities: 1, enabled: true }];
  }
  function create() {
    return { version: 1, engine: E.createState(), settings: T.settings(), rules: defaultRules(), ruleDefaultsVersion: 1, receipts: {}, transport: null, giftsEnabled: true, identityMode: 'display' };
  }
  function identityKey(gift, mode = 'display') {
    if (typeof gift.userId === 'string' && gift.userId) return 'uid:' + gift.userId;
    if (mode !== 'display' || typeof gift.nickname !== 'string' || !gift.nickname) return '';
    // FNV-1a 128 over an unambiguous exact nickname/avatar pair. This key is
    // explicitly LOCAL display identity, never a substitute platform user ID.
    const input = JSON.stringify([gift.nickname, typeof gift.avatar === 'string' ? gift.avatar : '']);
    let hash = 0x6c62272e07bb014262b821756295c58dn;
    const prime = 0x0000000001000000000000000000013bn;
    const mask = (1n << 128n) - 1n;
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      hash = ((hash ^ BigInt(code & 255)) * prime) & mask;
      hash = ((hash ^ BigInt(code >>> 8)) * prime) & mask;
    }
    return 'display:' + hash.toString(16).padStart(32, '0');
  }
  function validateSettings(raw) {
    if (!record(raw)) fail('主题设置格式无效');
    string(raw.title, '标题', 40);
    if (typeof raw.showEmpty !== 'boolean' || typeof raw.showSource !== 'boolean') fail('显示设置须为布尔值');
    if (!record(raw.skins)) fail('主题配置无效');
    for (const theme of T.themes) {
      const skin = raw.skins[theme.id];
      if (!record(skin)) fail('主题挂件格式无效');
      const templates = Object.prototype.hasOwnProperty.call(skin, 'decorations')
        ? record(skin.decorations) ? [skin.decorations.current, skin.decorations.waiting] : [null]
        : [skin.stickers];
      for (const template of templates) {
        if (!Array.isArray(template)) fail('主题挂件模板格式无效');
        for (const sticker of template) if (!record(sticker) || typeof sticker.hidden !== 'boolean') fail('挂件显示设置须为布尔值');
      }
    }
    return T.validate(raw);
  }
  function validate(raw) {
    if (!record(raw) || raw.version !== 1) fail('不支持此存档格式或版本');
    const doc = create();
    doc.engine = E.validate(raw.engine);
    doc.settings = validateSettings(raw.settings);
    if (typeof raw.giftsEnabled !== 'boolean') fail('礼物开关须为布尔值');
    doc.giftsEnabled = raw.giftsEnabled;
    if (raw.identityMode !== undefined && raw.identityMode !== 'display' && raw.identityMode !== 'strict') fail('用户识别方式无效');
    doc.identityMode = raw.identityMode === undefined ? 'display' : raw.identityMode;
    if (raw.ruleDefaultsVersion !== undefined && raw.ruleDefaultsVersion !== 0 && raw.ruleDefaultsVersion !== 1) fail('默认礼物规则版本无效');
    if (!Array.isArray(raw.rules) || raw.rules.length > 30) fail('礼物规则最多 30 条');
    // Upgrade empty pre-default configurations once. Marker 1 respects an
    // intentional later deletion, and existing custom rules are never replaced.
    const rules = raw.ruleDefaultsVersion !== 1 && raw.rules.length === 0 ? defaultRules() : raw.rules;
    const ids = new Set();
    const enabledNames = new Set();
    doc.rules = rules.map(rawRule => {
      if (!record(rawRule)) fail('礼物规则格式无效');
      const id = string(rawRule.id, '规则编号', 100, true);
      const name = string(rawRule.name, '礼物名称', 200, true);
      if (ids.has(id)) fail('规则编号重复');
      ids.add(id);
      if (!['join', 'priority', 'repeat'].includes(rawRule.kind)) fail('礼物玩法无效');
      if (typeof rawRule.enabled !== 'boolean') fail('规则开关须为布尔值');
      const key = normalizeName(name);
      if (!key) fail('礼物名称不能为空');
      if (rawRule.enabled && enabledNames.has(key)) fail('同一礼物不能同时启用多条规则');
      if (rawRule.enabled) enabledNames.add(key);
      return { id, name, kind: rawRule.kind, min: integer(rawRule.min, '触发礼物数', 1, 9999), opportunities: integer(rawRule.opportunities, '机会数', 1, 20), enabled: rawRule.enabled };
    });
    if (!record(raw.receipts) || Object.keys(raw.receipts).length > 4000) fail('礼物累计记录格式无效或超过 4000 条');
    for (const key of Object.keys(raw.receipts)) {
      string(key, '礼物累计标识', 500, true);
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('礼物累计标识无效');
      doc.receipts[key] = integer(raw.receipts[key], '礼物累计余数', 0, 9998);
    }
    // Transport owns its versioned bookkeeping schema; unknown fields never survive.
    doc.transport = raw.transport !== null && Transport && typeof Transport.createReceiver === 'function'
      ? Transport.createReceiver(null, { savedState: raw.transport }).exportState() : null;
    return doc;
  }
  function normalizedGift(raw) {
    if (!record(raw) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 256) return null;
    const quantityIssue = typeof raw.quantityIssue === 'string' && raw.quantityIssue.trim() && raw.quantityIssue.length <= 200 ? raw.quantityIssue.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    if (!quantityIssue && (!Number.isSafeInteger(raw.count) || raw.count < 1 || raw.count > 10000)) return null;
    const text = (value, max = 256) => typeof value === 'string' && value.length <= max ? value.trim() : '';
    const gift = { name: raw.name.trim(), count: quantityIssue ? 0 : raw.count, userId: text(raw.userId), nickname: text(raw.nickname), avatar: text(raw.avatar, 4096), eventId: text(raw.eventId) || null, comboId: text(raw.comboId) || null, cumulative: raw.cumulative === true };
    if (quantityIssue) {
      gift.quantityIssue = quantityIssue;
      gift.rawCount = typeof raw.rawCount === 'string' ? raw.rawCount.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 100) : '[原数量不可用]';
    }
    return gift;
  }
  function route(rawDoc, rawGift) {
    const doc = validate(rawDoc);
    const gift = normalizedGift(rawGift);
    if (!doc.giftsEnabled || !gift) return doc;
    const rule = doc.rules.find(item => item.enabled && normalizeName(item.name) === normalizeName(gift.name));
    if (!rule) return doc;
    const opportunitiesFor = total => rule.kind === 'repeat' ? Math.floor(total / rule.min) * rule.opportunities : 1;
    function pending(reason, requestedOpportunities, awardReady = false) {
      doc.engine = E.apply(doc.engine, { type: 'pendingAdd', gift: { ...gift, requestedKind: rule.kind, requestedOpportunities, awardReady, ruleId: rule.id, threshold: rule.min }, reason });
      return validate(doc);
    }
    if (gift.quantityIssue) return pending('礼物数量异常：' + gift.quantityIssue + '。原数量：' + gift.rawCount + '；请核对并手动填写有效数量后再处理。', 0);
    if (!gift.nickname || (!gift.userId && doc.identityMode === 'strict')) return pending('缺少稳定用户 ID 或昵称，请核对赠送者后手动处理。', opportunitiesFor(gift.count));
    if (gift.userId.length > 196 || gift.nickname.length > 200) return pending('用户 ID 或昵称超过队列长度上限，请核对资料后手动处理。', opportunitiesFor(gift.count));
    const personKey = identityKey(gift, doc.identityMode);
    // Preserve prior platform-ID receipt keys; only fallback uses the local key.
    const receiptKey = JSON.stringify([rule.id, gift.userId || personKey]);
    if (receiptKey.length > 500) return pending('用户累计标识过长，请核对资料后手动处理。', opportunitiesFor(gift.count));
    const previous = Object.prototype.hasOwnProperty.call(doc.receipts, receiptKey) ? doc.receipts[receiptKey] : 0;
    const total = previous + gift.count;
    const requestedOpportunities = opportunitiesFor(total);
    if (!Object.prototype.hasOwnProperty.call(doc.receipts, receiptKey) && Object.keys(doc.receipts).length >= 4000) return pending('礼物累计记录已满，请先整理记录，再按礼物数量和门槛核对处理。', requestedOpportunities);
    doc.receipts[receiptKey] = total % rule.min;
    if (total < rule.min) return validate(doc);
    if (rule.kind === 'repeat' && requestedOpportunities > 20) return pending('本批已获得 ' + requestedOpportunities + ' 次机会，超过单次 20 次上限；整批保留，请分批处理。', requestedOpportunities, true);
    const person = { key: personKey, uid: gift.userId, name: gift.nickname, avatar: gift.avatar, note: '' };
    try {
      doc.engine = E.apply(doc.engine, { type: rule.kind, person, opportunities: requestedOpportunities, source: rule.name });
    } catch (error) {
      return pending('自动排队未完成：' + String(error.message || error).slice(0, 650) + '；整批保留，请核对后处理。', requestedOpportunities, true);
    }
    return validate(doc);
  }
  return { create, defaultRules, validate, route, identityKey };
});
