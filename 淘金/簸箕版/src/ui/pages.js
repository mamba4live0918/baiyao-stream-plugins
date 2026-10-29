/* 淘金 3D · 设置面板的两页：互动档位编辑、接入规则（礼物表 / 其他礼物 / 弹幕公投 / 点赞 / 保护） */
import { el, numInput } from './dom.js';
import { ACTIONS } from '../config.js';
import { MAX_TIERS, buildSpec } from '../tiers.js';

const clone = x => JSON.parse(JSON.stringify(x));

function tierCard(ui, def, cfg, tier, i) {
  const app = ui.app;
  const name = el('input', { value: tier.name, maxlength: 6, 'aria-label': def.name + '档位名' });
  name.addEventListener('change', () => ui.edit(s => ((s.actions[def.id].tiers[i].name = name.value), s)));
  return el('div', { class: 'tj-card' },
    el('div', { class: 'tj-card-head' },
      name,
      el('label', { class: 'tj-def' },
        el('input', { type: 'radio', name: 'def-' + def.id, checked: cfg.defaultTier === tier.id, onchange: () => ui.edit(s => ((s.actions[def.id].defaultTier = tier.id), s), false) }),
        '默认档'),
      el('button', { class: 'tj-try', title: '试一下这一档', text: '▶ 试', onclick: () => app.game.trigger(buildSpec(app.settings, def.id, tier.id, 1, '试用', 'sim')) }),
      el('button', { title: '删除这一档', text: '×', disabled: cfg.tiers.length <= 1, onclick: () => ui.edit(s => {
        const c = s.actions[def.id];
        c.tiers.splice(i, 1);
        if (c.defaultTier === tier.id) c.defaultTier = c.tiers[0].id;
        return s;
      }) })),
    el('div', { class: 'tj-params' }, def.params.map(p =>
      el('label', {},
        el('span', { text: p.label + (p.key === def.scale ? ' ×' : '') + (p.unit ? `（${p.unit}）` : '') }),
        numInput(tier[p.key], { min: p.min, max: p.max, step: p.step, label: def.name + ' ' + tier.name + ' ' + p.label }, n =>
          ui.edit(s => ((s.actions[def.id].tiers[i][p.key] = n), s))))))
  );
}

function actionBlock(ui, def) {
  const cfg = ui.app.settings.actions[def.id];
  const scaleParam = def.params.find(p => p.key === def.scale);
  const add = el('button', { text: '＋ 添加档位', disabled: cfg.tiers.length >= MAX_TIERS, onclick: () => ui.edit(s => {
    const fresh = { id: 't' + Date.now().toString(36) + Math.floor(Math.random() * 99), name: '新档' };
    for (const p of def.params) fresh[p.key] = p.def;
    s.actions[def.id].tiers.push(fresh);
    return s;
  }) });
  const reset = el('button', { text: '恢复出厂档位', onclick: () => ui.edit(s => ((s.actions[def.id] = { enabled: s.actions[def.id].enabled, defaultTier: def.defaultTier, tiers: clone(def.tiers) }), s)) });
  return el('details', { class: 'tj-action', open: ui.openAction === def.id, ontoggle: e => { if (e.target.open) ui.openAction = def.id; } },
    el('summary', {},
      el('b', { class: 'tj-badge', style: `background:${def.color}`, text: def.badge }),
      el('span', { class: 'tj-tname', text: def.name }),
      el('span', { class: 'tj-counter', text: `${cfg.tiers.length} 档 · 礼物数量放大「${scaleParam.label}」` }),
      el('input', { type: 'checkbox', checked: cfg.enabled, title: '启用', 'aria-label': '启用' + def.name, onclick: e => e.stopPropagation(), onchange: e => ui.edit(s => ((s.actions[def.id].enabled = e.target.checked), s), false) })),
    cfg.tiers.map((t, i) => tierCard(ui, def, cfg, t, i)),
    el('div', { class: 'tj-row' }, add, reset)
  );
}

export function actionsPage() {
  return el('div', {},
    el('p', { class: 'tj-note', text: '每种互动的档位数量、名字和参数都由你定（1–12 档）。礼物数量只放大带 × 的那一项，不会升档；规则里按档位引用，改名、调顺序都不影响。▶ 试一下。' }),
    ACTIONS.map(def => actionBlock(this, def))
  );
}

/* ---------- 接入规则 ---------- */

function actionSelect(value, onPick) {
  return el('select', { onchange: e => onPick(e.target.value), 'aria-label': '互动' },
    ACTIONS.map(d => el('option', { value: d.id, text: d.name, selected: d.id === value })));
}

function tierSelect(settings, action, value, onPick, allowDefault = true) {
  const tiers = settings.actions[action].tiers;
  return el('select', { onchange: e => onPick(e.target.value), 'aria-label': '档位' },
    allowDefault ? el('option', { value: '', text: '默认档', selected: value === '' }) : null,
    tiers.map(t => el('option', { value: t.id, text: t.name, selected: t.id === value })));
}

function giftTable(ui, s) {
  const rows = s.rules.gifts.map((g, i) => {
    const name = el('input', { value: g.name, maxlength: 40, 'aria-label': '礼物名' });
    name.addEventListener('change', () => {
      const v = name.value.trim();
      /* 空名字或和别的行重名：不改，免得另一行被合并掉 */
      if (!v || s.rules.gifts.some((o, k) => k !== i && o.name === v)) {
        name.value = g.name;
        name.title = v ? '已经有这个礼物了' : '礼物名不能为空';
        return;
      }
      ui.edit(x => ((x.rules.gifts[i].name = v), x));
    });
    return el('div', { class: 'tj-rule' }, name,
      actionSelect(g.action, v => ui.edit(x => ((x.rules.gifts[i] = { name: g.name, action: v, tier: '' }), x))),
      tierSelect(s, g.action, g.tier, v => ui.edit(x => ((x.rules.gifts[i].tier = v), x))),
      el('button', { text: '×', title: '删除', onclick: () => ui.edit(x => (x.rules.gifts.splice(i, 1), x)) }));
  });
  const addRow = () => ui.edit(x => {
    let k = 1;
    while (x.rules.gifts.some(g => g.name === '新礼物' + k)) k++;
    x.rules.gifts.push({ name: '新礼物' + k, action: 'ore', tier: '' });
    return x;
  });
  return el('div', {},
    el('h3', { text: '指定礼物' }),
    el('p', { class: 'tj-note', text: '礼物名要和平台上的完全一样。数量会放大幅度（加矿 = 袋数），不会升档。' }),
    el('div', { class: 'tj-rule tj-rule-head' }, el('span', { text: '礼物名' }), el('span', { text: '触发' }), el('span', { text: '档位' }), el('span')),
    rows,
    el('div', { class: 'tj-row' }, el('button', { text: '＋ 添加礼物', disabled: s.rules.gifts.length >= 80, onclick: addRow }))
  );
}

function otherGifts(ui, s) {
  const o = s.rules.otherGifts;
  const bands = o.bands.map((b, i) => ui.num(`分档线 ${i + 1}`, b, { min: 0, max: 100000, step: 1, unit: '钻' }, (x, n) => ((x.rules.otherGifts.bands[i] = Math.min(100000, Math.max(0, n))), x)));
  return el('div', {},
    el('h3', { text: '其他礼物' }),
    ui.check('启用', o.enabled, (x, v) => ((x.rules.otherGifts.enabled = v), x)),
    ui.field('触发', actionSelect(o.action, v => ui.edit(x => ((x.rules.otherGifts.action = v), x)))),
    el('p', { class: 'tj-note', text: '表里没有的礼物按单个礼物的钻石单价选档：分档线把价格切成几段，从低档到高档。拿不到单价时用默认档。' }),
    bands,
    el('div', { class: 'tj-row' },
      el('button', { text: '＋ 分档线', disabled: o.bands.length >= 4, onclick: () => ui.edit(x => (x.rules.otherGifts.bands.push((o.bands[o.bands.length - 1] || 10) * 10), x)) }),
      el('button', { text: '－ 分档线', disabled: o.bands.length <= 1, onclick: () => ui.edit(x => (x.rules.otherGifts.bands.pop(), x)) }))
  );
}

function chatSection(ui, s) {
  const c = s.rules.chat;
  const rows = c.words.map((w, i) => {
    const word = el('input', { value: w.word, maxlength: 8, 'aria-label': '弹幕词' });
    word.addEventListener('change', () => {
      const v = word.value.trim();
      if (!v || c.words.some((o, k) => k !== i && o.word === v)) {
        word.value = w.word;
        word.title = v ? '已经有这个词了' : '弹幕词不能为空';
        return;
      }
      ui.edit(x => ((x.rules.chat.words[i].word = v), x));
    });
    return el('div', { class: 'tj-word' }, word, actionSelect(w.action, v => ui.edit(x => ((x.rules.chat.words[i].action = v), x))),
      el('button', { text: '×', title: '删除', onclick: () => ui.edit(x => (x.rules.chat.words.splice(i, 1), x)) }));
  });
  return el('div', {},
    el('h3', { text: '弹幕公投' }),
    ui.check('启用', c.enabled, (x, v) => ((x.rules.chat.enabled = v), x)),
    el('p', { class: 'tj-note', text: '窗口期内有足够多不同的人发出同一个词，才触发对应的互动（默认档）。同一个人刷屏只算一票。' }),
    ui.num('统计窗口', c.windowSec, { min: 3, max: 120, step: 1, unit: '秒' }, (x, n) => ((x.rules.chat.windowSec = n), x)),
    ui.num('需要人数', c.threshold, { min: 1, max: 50, step: 1, unit: '人' }, (x, n) => ((x.rules.chat.threshold = n), x)),
    ui.num('每个词冷却', c.cooldownSec, { min: 3, max: 600, step: 1, unit: '秒' }, (x, n) => ((x.rules.chat.cooldownSec = n), x)),
    rows,
    el('div', { class: 'tj-row' }, el('button', { text: '＋ 添加弹幕词', disabled: c.words.length >= 30, onclick: () => ui.edit(x => {
      let k = 1;
      while (x.rules.chat.words.some(w => w.word === '词' + k)) k++;
      x.rules.chat.words.push({ word: '词' + k, action: 'mud' });
      return x;
    }) }))
  );
}

function likeSection(ui, s) {
  const l = s.rules.like;
  return el('div', {},
    el('h3', { text: '点赞蓄力' }),
    ui.check('启用', l.enabled, (x, v) => ((x.rules.like.enabled = v), x)),
    ui.num('每攒', l.pulses, { min: 5, max: 5000, step: 5, unit: '个赞' }, (x, n) => ((x.rules.like.pulses = n), x)),
    ui.num('冷却', l.cooldownSec, { min: 3, max: 600, step: 1, unit: '秒' }, (x, n) => ((x.rules.like.cooldownSec = n), x)),
    ui.field('触发', actionSelect(l.action, v => ui.edit(x => ((x.rules.like = { ...x.rules.like, action: v, tier: '' }), x)))),
    ui.field('档位', tierSelect(s, l.action, l.tier, v => ui.edit(x => ((x.rules.like.tier = v), x)))),
    el('p', { class: 'tj-note', text: '点赞事件的真实频率和是否合并，需要在真实直播间校准“每攒多少个赞”。' })
  );
}

export function rulesPage() {
  const s = this.app.settings;
  const lim = s.limits;
  return el('div', {},
    el('h3', { text: '直播接入' }),
    this.check('接收真实直播事件', s.live.receive, (x, v) => ((x.live.receive = v), x)),
    el('p', { class: 'tj-note', text: this.app.live.status() + '。默认关闭：确认接入正常后再打开，避免试玩时被真实礼物打断。白曜里配置的规则动作不受这个开关限制（动作 id 就是互动名：' + ACTIONS.map(a => a.id + '=' + a.name).join('、') + '；value 选第几档，repeat 放大幅度）。' }),
    giftTable(this, s),
    otherGifts(this, s),
    chatSection(this, s),
    likeSection(this, s),
    el('h3', { text: '保护：不让你被一路压死' }),
    this.num('两次捣乱最短间隔', lim.minGapMs, { min: 0, max: 10000, step: 100, unit: '毫秒' }, (x, n) => ((x.limits.minGapMs = n), x)),
    this.num('排队上限', lim.queueMax, { min: 1, max: 60, step: 1, unit: '条' }, (x, n) => ((x.limits.queueMax = n), x)),
    this.num('同时下落的矿袋上限', lim.maxSacks, { min: 1, max: 60, step: 1, unit: '袋' }, (x, n) => ((x.limits.maxSacks = n), x)),
    el('p', { class: 'tj-note', text: '加矿砂不受“最短间隔”限制；小偷最多同时两只；泥水、撞簸箕同类叠加只延长时间（最多 60 秒）。' })
  );
}

