/* 擦玻璃 · 设置面板里的几大块：
   ① 捣乱池（勾上哪几样捣乱）② 捣乱礼物（礼物名 → 从捣乱池随机来几下）③ 保护礼物（礼物名 → 擦窗机器人 / 保护膜 → 来多少）；
   高级设置（不懂就别动，默认收起）。 */
import { el, numInput } from './dom.js';
import { ACTIONS, HELP_IDS, actionDef, defaultQty } from '../config.js';
import { LIMIT_MAX, QTY_MAX } from '../settings.js';
import { giftKey } from '../rules.js';
import { DETAIL_MAX } from '../game/grime.js';

const MESS = ACTIONS.filter(d => d.kind === 'mess');
/* #rrggbb → 半透明（老一点的浏览器内核没有 color-mix，比如 OBS 自带的） */
const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
/* 输入礼物名时的下拉提示（抖音常见礼物；以直播伴侣里能送的为准） */
const COMMON_GIFTS = ['小心心', '玫瑰', '人气票', '抖音', '棒棒糖', '番茄', '大啤酒', '墨汁炸弹', '亲吻', '口红示爱', '玫瑰花束', '大厨煎蛋', '灵动小鸟', '做我的猫', '猫咪来袭', '比心', '机器人工坊', '为你撑伞', '嘉年华', '火箭', '跑车'];
/* "一下"是多少，写给主播看 */
const ONE_HIT = '一下 = 随机一样：鸡蛋 2 个、奶茶 1 杯、泥巴 3 团、小广告 2 张、我的贴纸 1 张、一团哈气、一只猫 / 鸟 / 壁虎';

/* 落灰四档：关 / 少 / 正常 / 多（存的还是 enabled、每分钟几片、最多几片） */
const DUST_LEVELS = {
  off: { name: '关', enabled: false, perMin: 2, max: 8 },
  few: { name: '少', enabled: true, perMin: 1, max: 4 },
  normal: { name: '正常', enabled: true, perMin: 2, max: 8 },
  many: { name: '多', enabled: true, perMin: 4, max: 12 }
};
const dustLevel = d => (!d.enabled ? 'off' : d.perMin <= 1.5 ? 'few' : d.perMin >= 3 ? 'many' : 'normal');

function choose(value, options, onPick, label) {
  return el('select', { 'aria-label': label, onchange: e => onPick(e.target.value) },
    options.map(([v, t]) => el('option', { value: v, text: t, selected: v === value })));
}

/* 随机范围 [最少] ～ [最多] 单位：改了一头，另一头跟着不让它倒过来 */
function rangeInput(ui, row, label, unit, get) {
  const set = (key, n) => ui.edit(s => {
    const r = get(s);
    r[key] = Math.max(1, Math.min(QTY_MAX, Math.round(n)));
    if (key === 'min' && r.max < r.min) r.max = r.min;
    if (key === 'max' && r.min > r.max) r.min = r.max;
    return s;
  });
  return el('span', { class: 'gl-range' },
    numInput(row.min, { min: 1, max: QTY_MAX, step: 1, label: label + ' 最少' }, n => set('min', n)),
    el('i', { text: '～' }),
    numInput(row.max, { min: 1, max: QTY_MAX, step: 1, label: label + ' 最多' }, n => set('max', n)),
    el('span', { text: unit }));
}

/* 礼物名：两张表里都不能重（忽略空格、表情、全角半角）；重了、空了就退回原来的名字并提示 */
function nameInput(ui, row, onName) {
  const s = ui.app.settings;
  const all = [...s.rules.mess, ...s.rules.help];
  const name = el('input', { value: row.name, maxlength: 40, 'aria-label': '礼物名', list: 'gl-gift-list', placeholder: '礼物名' });
  name.addEventListener('change', () => {
    const v = name.value.trim();
    const key = giftKey(v);
    if (!key || all.some(o => o !== row && giftKey(o.name) === key)) {
      name.value = row.name;
      name.classList.add('bad');
      name.title = key ? '这个礼物已经在表里了' : '礼物名不能空着';
      return;
    }
    ui.edit(x => (onName(x, v), x));
  });
  return name;
}

const tryBtn = (ui, row) => el('button', { class: 'gl-try', title: '试一下（当作有人送了一个）', 'aria-label': '试一下 ' + row.name, text: '▶', onclick: () => ui.app.live.simGift(row.name, null, 1, '试用') });
const delBtn = (ui, row, drop) => el('button', { class: 'gl-del', title: '删掉这一行', 'aria-label': '删掉 ' + row.name, text: '✕', onclick: () => ui.edit(x => (drop(x), x)) });

/* 加一行：名字先叫"新礼物 1"，光标放进去直接打 */
function addRow(ui, list, make) {
  ui.focusNewGift = list;
  ui.edit(x => {
    const names = [...x.rules.mess, ...x.rules.help].map(g => giftKey(g.name));
    let k = 1;
    while (names.includes(giftKey('新礼物' + k))) k++;
    x.rules[list].push(make('新礼物' + k));
    return x;
  });
}

/* ---------- ① 捣乱池 ---------- */
export function poolSection(ui) {
  const s = ui.app.settings;
  const live = ui.app.live;
  const pool = s.rules.pool;
  const lib = ui.app.stickers;
  const chip = d => {
    const on = pool.includes(d.id);
    /* "我的贴纸"要先上传了才能勾（已经勾着的随时能取消） */
    const empty = d.id === 'sticker' && !(lib && lib.count);
    const off = empty && !on;
    const title = off ? '先在下面上传你的贴纸' : empty ? '还没有贴纸：轮到它时先照常贴小广告' : '';
    return el('label', { class: 'gl-chip' + (on ? ' on' : '') + (off ? ' off' : ''), title, style: `--c:${d.color};--cb:${tint(d.color, 0.24)}` },
      el('input', {
        type: 'checkbox', checked: on, disabled: off, 'aria-label': d.name,
        onchange: e => {
          if (!e.target.checked && pool.length <= 1) {
            e.target.checked = true;
            ui.app.toast('捣乱池里至少留一样');
            return;
          }
          ui.edit(x => ((x.rules.pool = e.target.checked ? [...x.rules.pool, d.id] : x.rules.pool.filter(id => id !== d.id)), x));
        }
      }),
      el('b', { class: 'gl-badge', style: `background:${d.color}`, text: d.badge }), d.name);
  };
  return el('section', { class: 'gl-sec' },
    ui.switchRow('接收直播间的礼物', s.live.receive, (x, v) => ((x.live.receive = v), x),
      live.sdk || live.bay ? '已经连上直播间了。' : '还没连上直播间：导入白曜 / 菘蓝以后会自动连上。没连上也能点每行的 ▶ 试。'),
    el('h3', { text: '① 捣乱池' }),
    el('p', { class: 'gl-say', text: '观众送捣乱礼物，就从勾上的这几样里随机挑。' }),
    el('div', { class: 'gl-pool' }, MESS.map(chip)),
    stickerBox(ui)
  );
}

/* 我的贴纸：上传（可以一次选好几张）、缩略图、删掉。第一次上传（原来一张都没有）自动勾上"我的贴纸"，全删了自动取消 */
function stickerBox(ui) {
  const lib = ui.app.stickers;
  if (!lib) return null;
  const upload = async files => {
    const first = !lib.count;
    const n = await lib.add(files);
    if (!n) {
      ui.app.toast('没读到图片（要 PNG / WebP / JPG / GIF）');
      return;
    }
    ui.app.toast(`加了 ${n} 张贴纸`, 'help');
    if (first && !ui.app.settings.rules.pool.includes('sticker')) ui.edit(x => (x.rules.pool.push('sticker'), x));
  };
  const remove = async id => {
    await lib.remove(id);
    if (!lib.count && ui.app.settings.rules.pool.includes('sticker')) ui.edit(x => ((x.rules.pool = x.rules.pool.filter(p => p !== 'sticker')), x));
  };
  return el('div', { class: 'gl-stk-box' },
    el('div', { class: 'gl-stickers' },
      lib.list().map(st => el('span', { class: 'gl-stk', title: st.name },
        el('img', { src: st.thumb, alt: st.name }),
        el('button', { class: 'gl-stk-x', 'aria-label': '删掉 ' + st.name, title: '删掉这张', text: '✕', onclick: () => remove(st.id) }))),
      el('label', { class: 'gl-stk-add' }, el('span', { text: '＋ 上传我的贴纸' }),
        el('input', { type: 'file', class: 'gl-file', accept: 'image/png,image/webp,image/gif,image/jpeg', multiple: true, onchange: e => upload(e.target.files) }))),
    !lib.count && ui.app.settings.rules.pool.includes('sticker') ? el('p', { class: 'gl-note gl-warn', text: '「我的贴纸」勾着，但这里还没有贴纸：轮到它时先照常贴小广告。上传几张，或者把它取消勾选。' }) : null,
    el('p', { class: 'gl-note', text: '透明底的 PNG / WebP 最好：按图案的轮廓做成异形贴纸（自动加一圈白边），观众送捣乱礼物时随机贴上来，和小广告一样要顺着揭下来。可以一次选好几张，动图只取第一张。自己上传的图要自己保证合规：别放二维码、联系方式、品牌。' }));
}

/* ---------- ② 捣乱礼物 ---------- */
export function messSection(ui) {
  const s = ui.app.settings;
  const list = s.rules.mess;
  const row = (r, i) => el('div', { class: 'gl-gift gl-mess' },
    nameInput(ui, r, (x, v) => (x.rules.mess[i].name = v)),
    rangeInput(ui, r, r.name + ' 来几下', '下', x => x.rules.mess[i]),
    tryBtn(ui, r),
    delBtn(ui, r, x => x.rules.mess.splice(i, 1)));
  return el('section', { class: 'gl-sec' },
    el('h3', { text: '② 捣乱礼物' }),
    el('p', { class: 'gl-say', text: '观众送一个，就从捣乱池里随机来几下（每次在两个数之间随机）。送几个就来几轮。' }),
    el('div', { class: 'gl-gift gl-mess gl-gift-head' }, el('span', { text: '礼物名' }), el('span', { text: '来几下（随机）' }), el('span'), el('span')),
    list.map(row),
    el('button', { class: 'gl-add', text: '＋ 添加一个捣乱礼物', disabled: list.length + s.rules.help.length >= 500, onclick: () => addRow(ui, 'mess', name => ({ name, min: 1, max: 1 })) }),
    el('p', { class: 'gl-note', text: ONE_HIT + '。礼物名照着抖音里的写就行，多打了空格、表情没关系。两张表里都没有的礼物，送了不会有反应。' })
  );
}

/* ---------- ③ 保护礼物 ---------- */
const HELP_DOES = HELP_IDS.map(id => [id, actionDef(id).name]);
const helpUnit = id => (id === 'film' ? '下' : actionDef(id).qty.unit);

export function helpSection(ui) {
  const s = ui.app.settings;
  const list = s.rules.help;
  const row = (r, i) => el('div', { class: 'gl-gift gl-help' },
    nameInput(ui, r, (x, v) => (x.rules.help[i].name = v)),
    choose(r.action, HELP_DOES, v => ui.edit(x => {
      const h = x.rules.help[i];
      if (h.action !== v) {
        /* 换了干什么：数量换成那一样的出厂量（机器人 1 台、保护膜挡 20 下） */
        h.action = v;
        h.min = h.max = defaultQty(v);
      }
      return x;
    }), r.name + ' 干什么'),
    el('span', { class: 'gl-help-q' }, el('i', { text: r.action === 'film' ? '挡' : '' }), rangeInput(ui, r, r.name + (r.action === 'film' ? ' 能挡几下' : ' 来几台'), helpUnit(r.action), x => x.rules.help[i])),
    tryBtn(ui, r),
    delBtn(ui, r, x => x.rules.help.splice(i, 1)));
  return el('section', { class: 'gl-sec' },
    el('h3', { text: '③ 保护礼物' }),
    el('p', { class: 'gl-say', text: '观众送一个，来帮你：擦窗机器人自己找脏的地方擦；保护膜能挡几下，挡满了自己裂开掉下来（膜还在时再有人送，就加耐久）。' }),
    el('div', { class: 'gl-gift gl-help gl-gift-head' }, el('span', { text: '礼物名' }), el('span', { text: '干什么' }), el('span', { text: '来多少（随机）' }), el('span'), el('span')),
    list.map(row),
    el('button', { class: 'gl-add', text: '＋ 添加一个保护礼物', disabled: list.length + s.rules.mess.length >= 500, onclick: () => addRow(ui, 'help', name => ({ name, action: 'film', min: 10, max: 20 })) }),
    el('datalist', { id: 'gl-gift-list' }, COMMON_GIFTS.map(n => el('option', { value: n })))
  );
}

/* ---------- 高级设置（默认收起） ---------- */

export function advancedSection(ui) {
  const s = ui.app.settings;
  const z = s.display.zone;
  const lim = s.limits;
  const st = ui.app.stats;
  const sel = (value, opts, apply, label) => choose(value, opts, v => ui.edit(x => apply(x, v), false), label);
  return el('details', { class: 'gl-adv', open: ui.advOpen, ontoggle: e => (ui.advOpen = e.target.open) },
    el('summary', { text: '高级设置（不懂就别动）' }),
    el('h4', { text: '捣乱的样子' }),
    ui.num('东西大小', s.play.messScale, { min: 0.5, max: 4, step: 0.05, unit: '倍' }, (x, n) => ((x.play.messScale = n), x)),
    ui.slider('淹没感', s.play.engulf, (x, v) => ((x.play.engulf = v), x), '越大，东西越往脸边挤，只露一张脸'),
    ui.field('自己落灰', sel(dustLevel(s.play.dust), Object.entries(DUST_LEVELS).map(([k, v]) => [k, v.name]), (x, v) => ((x.play.dust = { enabled: DUST_LEVELS[v].enabled, perMin: DUST_LEVELS[v].perMin, max: DUST_LEVELS[v].max }), x), '自己落灰'), '快擦干净、又没人送礼时，自己落点灰'),
    ui.num('刮条宽度', s.play.blade, { min: 8, max: 30, step: 0.5, unit: '%（占画面短边）' }, (x, n) => ((x.play.blade = n), x)),
    el('h4', { text: '露脸区' }),
    ui.check('启用露脸区', z.enabled, (x, v) => ((x.display.zone.enabled = v), x)),
    ui.num('边缘羽化', z.feather, { min: 0, max: 120, step: 1, unit: '像素' }, (x, n) => ((x.display.zone.feather = n), x)),
    el('h4', { text: '画面上的字和玻璃' }),
    ui.check('脏东西旁边挂观众名字', s.display.names, (x, v) => ((x.display.names = v), x)),
    ui.check('右上角"今天擦掉 N 处"', s.display.counter, (x, v) => ((x.display.counter = v), x)),
    ui.check('捣乱榜 / 帮忙榜', s.display.boards, (x, v) => ((x.display.boards = v), x)),
    ui.check('画面下方的操作提示', s.display.hint, (x, v) => ((x.display.hint = v), x)),
    ui.slider('玻璃反光', s.display.glass, (x, v) => ((x.display.glass = v), x), '拉到最左 = 完全透明'),
    ui.field('砸中时玻璃抖一下', sel(s.display.motion, [['on', '抖'], ['system', '跟随系统'], ['off', '不抖']], (x, v) => ((x.display.motion = v), x), '砸中时玻璃抖一下')),
    el('h4', { text: '上限（0 = 不限）' }),
    ui.num('两次捣乱最少隔', lim.minGapMs, { min: 0, max: 10000, step: 100, unit: '毫秒' }, (x, n) => ((x.limits.minGapMs = n), x)),
    ui.num('排队最多', lim.queueMax, { min: 0, max: LIMIT_MAX, step: 1, unit: '条' }, (x, n) => ((x.limits.queueMax = n), x)),
    ui.num('排队最多等', lim.waitSec, { min: 0, max: 86400, step: 1, unit: '秒' }, (x, n) => ((x.limits.waitSec = n), x)),
    ui.num('一个观众同时最多', lim.ownerCap, { min: 0, max: LIMIT_MAX, step: 1, unit: '块' }, (x, n) => ((x.limits.ownerCap = n), x)),
    ui.num('玻璃上同时最多', lim.maxStains, { min: 0, max: LIMIT_MAX, step: 1, unit: '块' }, (x, n) => ((x.limits.maxStains = n), x)),
    ...[['cat', '猫', '只'], ['bird', '小鸟', '只'], ['gecko', '壁虎', '只'], ['robot', '擦窗机器人', '台'], ['flyer', '小广告', '张']].map(([k, name, unit]) =>
      ui.num(`同时最多${name}`, lim.actors[k], { min: 0, max: 10000, step: 1, unit }, (x, n) => ((x.limits.actors[k] = n), x))),
    el('p', { class: 'gl-note', text: '都不填也不会卡：送得再多也是拆成一批批排队；玻璃上单独的脏东西超过 ' + DETAIL_MAX + ' 块，最早的沉成"陈年污垢"（照样能刮、照样计数）；小广告被整张盖住的先不画。' }),
    el('h4', { text: '统计' }),
    el('dl', { class: 'gl-stats' },
      [['今天擦掉', st.today + ' 处'], ['一共擦掉', st.total + ' 处']].map(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
    el('div', { class: 'gl-row' },
      el('button', { text: '清空今天', onclick: () => { if (confirm('清空今天的计数和榜单？')) { st.resetToday(); ui.render(); } } }),
      el('button', { text: '全部清零', onclick: () => { if (confirm('今天和一共的计数、榜单全部清零？')) { st.resetAll(); ui.render(); } } }))
  );
}
