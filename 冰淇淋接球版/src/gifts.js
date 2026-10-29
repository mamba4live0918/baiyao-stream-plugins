(function (root, factory) {
  const api = factory(root,typeof module==='object'&&module.exports?require('./tricks.js'):root.GelatoTricks);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GelatoGifts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root,Tricks) {
  'use strict';

  // Example mappings: broadcasters can replace these names in the settings panel.
  const DEFAULT_RULES = [
    {name:'跑车',action:'reverse',value:5},
    {name:'棒棒糖',action:'freeze',value:3},
    {name:'抖音',action:'plate_narrow',value:25,duration:8},
    {name:'小心心',action:'plate_wide',value:25,duration:8},
    {name:'热气球',action:'gust_left',value:2,duration:5},
    {name:'火箭',action:'gust_right',value:2,duration:5},
    {name:'甜甜圈',action:'melt',value:5,duration:10},
    {name:'大啤酒',action:'blast',value:100,blastUnit:'radius'},
    {name:'豪华游轮',action:'ice',value:10}
  ];
  const ACTIONS = new Set(Object.keys(Tricks.DEFINITIONS));
  const MAX_COUNT = 10000;
  const MAX_EFFECT = 100000;
  const EVENT_TTL = 120000;
  const MAX_SEEN_EVENTS = 2048;
  const SIMPLIFIED = {
    '車':'车','風':'风','龍':'龙','鳳':'凤','鮮':'鲜','禮':'礼','萬':'万',
    '強':'强','擊':'击','點':'点','時':'时','間':'间','長':'长','範':'范',
    '圍':'围','觸':'触','發':'发','內':'内','無':'无','數':'数','個':'个',
    '雙':'双','滿':'满','隨':'随','機':'机','樂':'乐','聲':'声','動':'动',
    '畫':'画','護':'护','蘭':'兰','氣':'气','熱':'热','輪':'轮','華':'华',
    '遊':'游','紙':'纸','飛':'飞','愛':'爱','雲':'云'
  };

  function normalizeName(value) {
    if (typeof value !== 'string') return '';
    return value.toLowerCase()
      .replace(/[\uFF01-\uFF5E]/g, char => String.fromCharCode(char.charCodeAt(0)-0xFEE0))
      .replace(/./gu, char => SIMPLIFIED[char] || char)
      .replace(/[^\p{L}\p{N}]/gu, '');
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function upgradeBlastRules(rules) {
    if (!Array.isArray(rules)) return [];
    return rules.map(rule => {
      if (!isRecord(rule)) return rule;
      const copy = { ...rule };
      if (rule.action !== 'blast' ||
          (typeof rule.value !== 'number' && typeof rule.value !== 'string') ||
          (typeof rule.value === 'string' && !rule.value.trim())) return copy;
      const value = Number(rule.value);
      if (!Number.isFinite(value)) return copy;
      // Persist the unit beside the converted value so retrying a failed save is safe.
      copy.value = Math.floor(Math.max(0,Math.min(1000,value*(rule.blastUnit === 'radius' ? 1 : 50))));
      copy.blastUnit = 'radius';
      return copy;
    });
  }

  function firstValue(sources, keys) {
    for (const source of sources) {
      if (!isRecord(source)) continue;
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null) return value;
      }
    }
    return undefined;
  }

  function positiveNumber(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeGift(message, trusted = false) {
    if (!isRecord(message)) return null;
    if (!trusted) {
      const type = firstValue([message], ['type','msgType','method']);
      if (typeof type !== 'string' && typeof type !== 'number') return null;
      if (!String(type).toLowerCase().includes('gift') && String(type) !== '2') return null;
    }
    const data = isRecord(message.data) ? message.data : null;
    const sources = [message, message.gift, data && data.gift, data];
    const rawName = firstValue([message], ['giftName']) ??
      firstValue([message.gift, data && data.gift, data], ['giftName','name']) ?? message.name;
    if (typeof rawName !== 'string' || rawName.length > 256) return null;
    const name = rawName.trim();
    if (!normalizeName(name)) return null;
    const rawCount = firstValue(sources, ['giftCount','count','comboCount','repeatCount','num']);
    const numericCount = rawCount === undefined ? 1 : positiveNumber(rawCount);
    if (numericCount === null) return null;
    const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(numericCount)));
    const rawId = firstValue(sources, ['eventId','event_id','msgId','msg_id']);
    let eventId = null;
    if (typeof rawId === 'string' && rawId.trim() && rawId.length <= 256) eventId = rawId.trim();
    else if (typeof rawId === 'number' && Number.isSafeInteger(rawId)) eventId = String(rawId);
    return { name, count, eventId };
  }

  function createReceiver(onGift) {
    const seen = new Map();
    return {
      receive(message, trusted = false) {
        const gift = normalizeGift(message, trusted);
        if (!gift) return false;
        // Without a stable ID, identical-looking deliveries may be separate real gifts.
        if (gift.eventId !== null) {
          const now = Date.now();
          const lastSeen = seen.get(gift.eventId);
          if (lastSeen !== undefined && now-lastSeen < EVENT_TTL) return false;
          seen.delete(gift.eventId);
          seen.set(gift.eventId,now);
          while (seen.size > MAX_SEEN_EVENTS) seen.delete(seen.keys().next().value);
        }
        if (typeof onGift === 'function') onGift(gift);
        return true;
      }
    };
  }

  function dispatch(gift, rules, apply) {
    const safeGift = normalizeGift(gift,true);
    if (!safeGift || !Array.isArray(rules) || typeof apply !== 'function') return 0;
    const key = normalizeName(safeGift.name);
    let applied = 0;
    for (const rule of rules.slice(0,1000)) {
      if (!isRecord(rule) || !ACTIONS.has(rule.action) || normalizeName(rule.name) !== key) continue;
      const value = positiveNumber(rule.value);
      if (value === null) continue;
      const def=Tricks.DEFINITIONS[rule.action];
      let amount=Math.min(def.max,value),options={};
      if(def.duration){
        const duration=positiveNumber(rule.duration)||def.duration;
        options.duration=Math.min(600,duration*safeGift.count);
      }else amount=Math.min(def.max,amount*safeGift.count);
      apply(rule.action,amount,gift,options);
      applied++;
    }
    return applied;
  }

  function upgradeTrickRules(input){
    const source=upgradeBlastRules(Array.isArray(input)?input:DEFAULT_RULES);
    const oldActions=new Set(['count_add','count_sub','attempts_add','attempts_sub','move_faster','move_slower','fall_faster','fall_slower','time_faster','time_slower','size_up','size_down','eat']);
    const legacy=source.some(rule=>isRecord(rule)&&oldActions.has(rule.action));
    const rules=source.filter(rule=>isRecord(rule)&&ACTIONS.has(rule.action)).map(rule=>({...rule}));
    if(legacy)for(const rule of DEFAULT_RULES)if(!rules.some(item=>item.action===rule.action||normalizeName(item.name)===normalizeName(rule.name)))rules.push({...rule});
    return rules.slice(0,100).map(rule=>{
      const def=Tricks.DEFINITIONS[rule.action];
      rule.value=Math.max(0,Math.min(def.max,Number.isFinite(Number(rule.value))?Number(rule.value):def.value));
      if(def.duration)rule.duration=Math.max(.1,Math.min(600,positiveNumber(rule.duration)||def.duration));
      if(rule.action==='blast')rule.blastUnit='radius';
      return rule;
    });
  }

  function connect(options = {}) {
    const receiver = createReceiver(options.onGift);
    let stopped = false, sdkActive = false, socket = null;
    let reconnectTimer = null, sdkTimer = null, unsubscribe = null;
    let lastStatus = '';

    function status(text) {
      if (text === lastStatus) return;
      lastStatus = text;
      if (typeof options.onStatus === 'function') options.onStatus(text);
    }

    function clearReconnect() {
      if (reconnectTimer !== null) root.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    function closeSocket() {
      const previous = socket;
      socket = null;
      if (!previous) return;
      previous.onopen = previous.onmessage = previous.onclose = previous.onerror = null;
      try { previous.close(); } catch (_) { /* A closing socket is already unusable. */ }
    }

    function trySdk() {
      if (stopped || sdkActive) return sdkActive;
      const sdk = root.SonglanPlugin;
      if (!sdk || typeof sdk.onGift !== 'function') return false;
      // Activate before registering so an SDK that emits immediately is also supported.
      sdkActive = true;
      try {
        const result = sdk.onGift(function (message) {
          if (!stopped && sdkActive) receiver.receive(message,true);
        });
        if (typeof result === 'function') unsubscribe = result;
      } catch (_) {
        sdkActive = false;
        return false;
      }
      clearReconnect();
      if (sdkTimer !== null) root.clearInterval(sdkTimer);
      sdkTimer = null;
      closeSocket();
      status('菘蓝已连接');
      return true;
    }

    function scheduleReconnect() {
      if (stopped || sdkActive || reconnectTimer !== null) return;
      status('等待礼物连接');
      reconnectTimer = root.setTimeout(function () {
        reconnectTimer = null;
        if (!trySdk()) openSocket();
      },3000);
    }

    function openSocket() {
      if (stopped || sdkActive || (socket && (socket.readyState === 0 || socket.readyState === 1))) return;
      if (typeof root.WebSocket !== 'function') { status('本地测试'); return; }
      status('礼物连接中');
      let current;
      try { current = new root.WebSocket('ws://localhost:10030'); }
      catch (_) { scheduleReconnect(); return; }
      socket = current;
      current.onopen = function () {
        if (!stopped && !sdkActive && socket === current) status('本地礼物已连接');
      };
      current.onmessage = function (event) {
        if (stopped || sdkActive || socket !== current) return;
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        receiver.receive(message);
      };
      current.onclose = function () {
        if (socket !== current) return;
        socket = null;
        scheduleReconnect();
      };
      current.onerror = function () {
        if (socket !== current || stopped || sdkActive) return;
        try { current.close(); } catch (_) { socket = null; scheduleReconnect(); }
      };
    }

    if (!trySdk()) {
      openSocket();
      sdkTimer = root.setInterval(trySdk,500);
    }

    return function cleanup() {
      if (stopped) return;
      stopped = true;
      clearReconnect();
      if (sdkTimer !== null) root.clearInterval(sdkTimer);
      sdkTimer = null;
      closeSocket();
      if (unsubscribe) { try { unsubscribe(); } catch (_) {} }
      unsubscribe = null;
      status('已断开');
    };
  }

  return { DEFAULT_RULES, upgradeTrickRules, upgradeBlastRules, normalizeName, normalizeGift, createReceiver, connect, dispatch };
});
