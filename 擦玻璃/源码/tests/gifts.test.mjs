import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, actionDef, defaultQty, MESS_IDS } from '../src/config.js';
import { normalizeGiftEvent, routeGift, specFromAction, giftKey, drawTotal, poolSpecs } from '../src/rules.js';
import { sanitizeSettings, migrateV5, migrateV6, loadSettings, saveSettings, KEY_SETTINGS, KEY_SETTINGS_V1, KEY_SETTINGS_V2 } from '../src/settings.js';
import { splitSpec } from '../src/tiers.js';
import { rng } from '../src/util.js';

const gift = (name, count = 1, extra = {}) => normalizeGiftEvent({ nickName: '阿花', userId: 'u1', giftName: name, count, ...extra });
const sum = (list, key) => list.reduce((a, s) => a + s.params[key], 0);
const midTier = id => actionDef(id).tiers.find(t => t.id === actionDef(id).defaultTier);
/* 一份"一下"有几条：能改数量的 1 条，来几只的也是 1 条 */
const kinds = list => [...new Set(list.map(sp => sp.action))].sort();
/* 出厂的捣乱池：八样（"我的贴纸"要先上传才勾上） */
const DEFAULT_POOL = MESS_IDS.filter(id => id !== 'sticker');

test('默认：捣乱池勾上八样（我的贴纸要先上传）；捣乱礼物、保护礼物两张表；默认接收直播间；弹幕点赞、表里没有的礼物那一行都没了', () => {
  const s = defaultSettings();
  assert.equal(s.version, 7);
  assert.deepEqual(s.rules.pool, DEFAULT_POOL);
  assert.ok(MESS_IDS.includes('sticker') && !s.rules.pool.includes('sticker'));
  assert.ok(s.rules.mess.length >= 10);
  assert.deepEqual(s.rules.mess.find(g => g.name === '玫瑰'), { name: '玫瑰', min: 1, max: 1 });
  assert.deepEqual(s.rules.help, [{ name: '机器人工坊', action: 'robot', min: 1, max: 1 }, { name: '为你撑伞', action: 'film', min: 10, max: 20 }]);
  assert.equal(s.live.receive, true);
  for (const k of ['gifts', 'chat', 'like', 'text', 'menu', 'other']) assert.equal(s.rules[k], undefined, k + ' 没了');
});

test('随机次数：每轮在最少～最多之间随机，送几个就来几轮；轮数很多时按平均算', () => {
  const r = rng(7);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const n = drawTotal(2, 5, 1, r);
    assert.ok(n >= 2 && n <= 5);
    seen.add(n);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5], '两头都能取到');
  assert.equal(drawTotal(3, 3, 7), 21, '一样的就是乘');
  const many = drawTotal(1, 3, 10000, rng(1));
  assert.ok(many > 19000 && many < 21000, '一万轮平均每轮 2 下左右：' + many);
  assert.equal(drawTotal(1, 3, 1e6), 2e6, '轮数太多直接按平均');
  assert.equal(drawTotal(5, 2, 1, () => 0), 2, '填反了也照样算');
  assert.equal(drawTotal(1, 3, 0), 0);
});

test('捣乱礼物：从捣乱池里随机来几下，一下 = 一样捣乱按出厂的量（鸡蛋 2 个、泥巴 3 团、一只猫……）', () => {
  const s = defaultSettings();
  s.rules.mess.push({ name: '比心', min: 3, max: 3 });
  const one = routeGift(s, gift('比心'), rng(3));
  assert.equal(one.length, 3, '来 3 下就是 3 条');
  for (const sp of one) {
    assert.ok(MESS_IDS.includes(sp.action));
    const def = actionDef(sp.action);
    if (!def.qty.spawn) assert.equal(sp.params[def.qty.key], defaultQty(sp.action), sp.action + ' 按出厂的量');
    assert.equal(sp.who, '阿花', '署名是送礼的观众');
    assert.equal(sp.uid, 'u1');
    assert.equal(sp.source, 'gift');
  }
  assert.equal(routeGift(s, gift('比心', 4), rng(4)).length, 12, '送 4 个 = 4 轮 × 3 下');
  const seen = new Set();
  for (let i = 0; i < 300; i++) for (const sp of routeGift(s, gift('比心'))) seen.add(sp.action);
  assert.deepEqual([...seen].sort(), [...DEFAULT_POOL].sort(), '勾上的八样都会来，不会来机器人和保护膜');
});

test('捣乱池：只从勾上的里面挑；一样都没勾当成全勾（不然送了没反应）', () => {
  const s = defaultSettings();
  s.rules.pool = ['egg', 'cat'];
  s.rules.mess.push({ name: '比心', min: 5, max: 5 });
  const seen = new Set();
  for (let i = 0; i < 100; i++) for (const sp of routeGift(s, gift('比心'))) seen.add(sp.action);
  assert.deepEqual([...seen].sort(), ['cat', 'egg']);
  assert.deepEqual(sanitizeSettings({ rules: { pool: [] } }).rules.pool, DEFAULT_POOL);
  assert.deepEqual(sanitizeSettings({ rules: { pool: ['sticker', 'egg'] } }).rules.pool, ['egg', 'sticker'], '我的贴纸能勾上');
  assert.deepEqual(sanitizeSettings({ rules: { pool: ['robot', 'mud', 'mud', 'bear'] } }).rules.pool, ['mud'], '只认捣乱那八样、不重复');
});

test('保护礼物：机器人来几台；保护膜能挡几下（随机范围），送几个就加几份', () => {
  const s = defaultSettings();
  assert.deepEqual(routeGift(s, gift('机器人工坊', 2)).map(x => x.action), ['robot', 'robot']);
  s.rules.help[0] = { name: '机器人工坊', action: 'robot', min: 2, max: 2 };
  assert.equal(routeGift(s, gift('机器人工坊', 3)).length, 6);
  const film = routeGift(s, gift('为你撑伞'), rng(5));
  assert.equal(film.length, 1);
  assert.equal(film[0].action, 'film');
  assert.ok(film[0].params.hits >= 10 && film[0].params.hits <= 20, '挡 10～20 下：' + film[0].params.hits);
  s.rules.help[1] = { name: '为你撑伞', action: 'film', min: 15, max: 15 };
  assert.equal(routeGift(s, gift('为你撑伞', 3))[0].params.hits, 45, '送 3 个 = 耐久加 3 份');
});

test('礼物名不怕多打空格、表情、全角；两张表里的都认', () => {
  const s = defaultSettings();
  assert.equal(giftKey(' 大厨 煎蛋🍳 '), giftKey('大厨煎蛋'));
  assert.equal(giftKey('ＡＢＣ'), giftKey('abc'));
  assert.ok(routeGift(s, gift('大厨 煎蛋')).length >= 3, '大厨煎蛋 3～5 下');
  assert.equal(routeGift(s, gift('机器人 工坊🤖'))[0].action, 'robot');
});

test('两张表里都没有的礼物：什么都不做（不管多贵、送多少）', () => {
  const s = defaultSettings();
  assert.equal(routeGift(s, gift('神秘礼物')), null);
  assert.equal(routeGift(s, gift('神秘礼物', 99, { giftDiamond: 30000 })), null);
  assert.ok(routeGift(s, gift('大厨煎蛋', 1, { giftDiamond: 9999 })).length <= 5, '表里的礼物不按价钱放大');
});

test('一下子送很多：按种类合起来，排队时再拆批，不会一下冒出几千条；一生一世 ×1314 照算', () => {
  const s = defaultSettings();
  s.rules.pool = ['egg'];
  s.rules.mess.push({ name: '比心', min: 5, max: 5 });
  const eggs = routeGift(s, gift('比心', 1314));
  assert.equal(eggs.length, 1, '一样捣乱合成一条');
  assert.equal(eggs[0].params.count, 5 * 1314 * defaultQty('egg'), '5 下 × 1314 × 每下 2 个');
  assert.equal(splitSpec(eggs[0]).length, Math.ceil(eggs[0].params.count / 40));
  s.rules.pool = ['cat'];
  const cats = routeGift(s, gift('比心', 1000));
  assert.equal(cats.length, 1, '5000 只猫合成一条');
  assert.equal(sum(cats, 'paws'), 5000 * midTier('cat').paws, '脚印总数照算');
  s.rules.pool = [...DEFAULT_POOL];
  s.rules.mess.push({ name: '嘉年华', min: 30, max: 60 });
  const storm = routeGift(s, gift('嘉年华', 1000));
  assert.ok(storm.length <= 8, `按种类合并：${storm.length} 条`);
  assert.ok(storm.every(sp => MESS_IDS.includes(sp.action)));
});

test('哈气、壁虎、机器人一下子来很多：合成一条，排队时拆回一只只（不变成一只待很久的）', () => {
  const s = defaultSettings();
  for (const [id, key, one] of [['fog', 'hold', 45], ['gecko', 'stay', 20]]) {
    s.rules.pool = [id];
    const list = poolSpecs(s, 50, '阿花', 'gift');
    assert.equal(list.length, 1, id + ' 合成一条');
    const parts = splitSpec(list[0]);
    assert.equal(parts.length, 50, id + ' 拆回 50 只');
    assert.ok(parts.every(p => p.params[key] === one), id + ' 每只还是一只的量');
  }
  s.rules.help[0] = { name: '机器人工坊', action: 'robot', min: 60, max: 60 };
  const robots = routeGift(s, gift('机器人工坊'));
  assert.equal(robots.length, 1);
  assert.equal(splitSpec(robots[0]).length, 60, '60 台机器人');
});

test('离谱的数（坏消息）不会把排队撑爆：总量只防到一百万', () => {
  const s = defaultSettings();
  s.rules.pool = ['egg'];
  const eggs = routeGift(s, gift('大厨煎蛋', 1e12));
  assert.equal(eggs.length, 1);
  assert.equal(eggs[0].params.count, 1e6);
  assert.equal(splitSpec(eggs[0]).length, 1e6 / 40);
  s.rules.pool = [...MESS_IDS];
  s.rules.mess.push({ name: '嘉年华', min: 9999, max: 9999 });
  const storm = routeGift(s, gift('嘉年华', 1e12));
  assert.ok(storm.length <= MESS_IDS.length && storm.every(sp => sp.params[actionDef(sp.action).scale] <= 1e6));
  assert.ok(routeGift(s, gift('为你撑伞', 1e12))[0].params.hits <= 1e6);
  assert.equal(specFromAction(s, { action: 'egg', value: 1e9, repeat: 1e9 })[0].params.count, 1e6);
  assert.equal(specFromAction(s, { action: 'egg', value: 3, repeat: 1314 })[0].params.count, 3942, '白曜的 repeat 也不按 1000 截');
  assert.deepEqual(poolSpecs(s, 0, 'x', 'gift'), []);
});

test('白曜规则动作：value 就是数量（几个 / 几团 / 几只 / 保护膜挡几下），repeat 再乘；不填用默认数量', () => {
  const s = defaultSettings();
  const mud = specFromAction(s, { action: 'mud', value: 3, repeat: 2, event: { user: { nickname: '阿花', id: '9' } } });
  assert.equal(mud.length, 1);
  assert.equal(mud[0].params.count, 6);
  assert.equal(mud[0].who, '阿花');
  assert.equal(mud[0].uid, '9');
  assert.equal(mud[0].source, 'action');
  assert.equal(specFromAction(s, { action: 'cat', value: 2 }).length, 2);
  assert.equal(specFromAction(s, { action: 'mud' })[0].params.count, defaultQty('mud'));
  assert.equal(specFromAction(s, { action: 'film', value: 30 })[0].params.hits, 30);
  assert.equal(specFromAction(s, { action: 'film' })[0].params.hits, 20, '保护膜默认挡 20 下');
  assert.equal(specFromAction(s, { action: 'mud', preview: true })[0].source, 'preview');
  assert.equal(specFromAction(s, { action: 'ore' }), null, '别的插件的互动名不认');
});

test('设置校验：坏的行丢掉，次数限 1–9999、填反了对调，两张表里重名（忽略空格表情）只留第一行', () => {
  const s = sanitizeSettings({
    version: 7,
    rules: {
      mess: [{ name: '玫瑰', min: 0, max: 3 }, { name: ' 玫瑰 ', min: 1, max: 1 }, { name: '', min: 1, max: 1 }, { name: '盲盒', min: 99999, max: 2 }, 7],
      help: [{ name: '玫瑰', action: 'robot', min: 1, max: 1 }, { name: '伞', action: 'egg', min: 1, max: 1 }, { name: '雨伞', action: 'film', min: 30, max: 5 }, { name: '机器人', action: 'robot' }],
      other: { on: true, min: 2, max: 3 }
    }
  });
  assert.deepEqual(s.rules.mess, [{ name: '玫瑰', min: 1, max: 3 }, { name: '盲盒', min: 2, max: 9999 }]);
  assert.deepEqual(s.rules.help, [{ name: '雨伞', action: 'film', min: 5, max: 30 }, { name: '机器人', action: 'robot', min: 1, max: 1 }], '保护礼物只能选机器人、保护膜；没填次数用出厂的量');
  assert.equal(s.rules.other, undefined, '旧存档里的"表里没有的礼物"丢掉');
  const d = defaultSettings();
  assert.deepEqual(sanitizeSettings(null), d);
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(d))), d);
  assert.equal(sanitizeSettings({ version: 7, live: { receive: false } }).live.receive, false, '自己关掉的照旧');
});

test('从 V1.4 搬过来：出厂礼物表换成新的两张表；自己改过的按行分开（机器人、保护膜进保护礼物）；露脸区换成多边形；弹幕点赞丢掉', () => {
  const v6default = {
    version: 6,
    rules: {
      gifts: [
        { name: '小心心', action: 'fog', n: 1 }, { name: '玫瑰', action: 'egg', n: 1 }, { name: '人气票', action: 'flyer', n: 1 }, { name: '抖音', action: 'bird', n: 1 },
        { name: '番茄', action: 'mud', n: 2 }, { name: '棒棒糖', action: 'tea', n: 1 }, { name: '墨汁炸弹', action: 'mud', n: 6 }, { name: '亲吻', action: 'fog', n: 2 },
        { name: '口红示爱', action: 'fog', n: 2 }, { name: '大厨煎蛋', action: 'egg', n: 5 }, { name: '灵动小鸟', action: 'bird', n: 3 }, { name: '做我的猫', action: 'cat', n: 1 },
        { name: '猫咪来袭', action: 'cat', n: 3 }, { name: '机器人工坊', action: 'robot', n: 1 }, { name: '为你撑伞', action: 'film', n: 1 }
      ],
      other: { action: 'random', n: 1, byPrice: true },
      chat: { enabled: true },
      like: { enabled: true }
    },
    audio: { enabled: false, volume: 0.3 },
    display: { zone: { enabled: true, x: 50, y: 33, w: 16, h: 30, round: 1, feather: 36, wobble: 0.6, seed: 7, follow: false } }
  };
  const d = defaultSettings();
  const a = sanitizeSettings(migrateV6(v6default));
  assert.deepEqual(a.rules, d.rules, '出厂表换成新的出厂表');
  assert.deepEqual(a.audio, { enabled: false, volume: 0.3 }, '声音照旧');
  assert.deepEqual(a.display.zone, d.display.zone, '出厂的露脸区换成新的默认多边形');
  const b = sanitizeSettings(migrateV6({
    version: 6,
    rules: { gifts: [{ name: '玫瑰', action: 'egg', n: 2 }, { name: '盲盒', action: 'random', n: 3 }, { name: '工坊', action: 'robot', n: 2 }, { name: '伞', action: 'film', n: 2 }], other: { action: 'none', n: 1, byPrice: true } },
    display: { zone: { enabled: true, x: 40, y: 30, w: 20, h: 30, round: 1, feather: 20 } }
  }));
  assert.deepEqual(b.rules.mess, [{ name: '玫瑰', min: 2, max: 2 }, { name: '盲盒', min: 3, max: 3 }]);
  assert.deepEqual(b.rules.help, [{ name: '工坊', action: 'robot', min: 2, max: 2 }, { name: '伞', action: 'film', min: 40, max: 40 }], '保护膜 2 次 → 挡 40 下');
  assert.equal(b.rules.other, undefined, '"表里没有的礼物"那一行新版没有了');
  assert.equal(b.display.zone.feather, 20);
  assert.equal(b.display.zone.pts.length, 12, '自己调过的椭圆换成 12 个点的多边形');
  const xs = b.display.zone.pts.map(p => p[0]);
  assert.ok(Math.abs(Math.min(...xs) - 30) < 0.2 && Math.abs(Math.max(...xs) - 50) < 0.2, '还在原来的位置、原来的大小');
});

test('从 V1.3 以前搬过来：先按旧规矩换成礼物表，再换成新的两张表', () => {
  const a = sanitizeSettings(migrateV6(migrateV5({ version: 5, rules: { menu: { on: true } }, live: { receive: false } })));
  assert.deepEqual(a.rules, defaultSettings().rules, '还在用随机菜单的直接用新的出厂表');
  assert.equal(a.live.receive, true);
  const b = sanitizeSettings(migrateV6(migrateV5({
    version: 5,
    rules: { menu: { on: false }, gifts: [{ name: '玫瑰', action: 'egg', tier: 'heavy' }, { name: '伞', action: 'film', tier: 'heavy' }], otherGifts: { enabled: false } }
  })));
  assert.deepEqual(b.rules.mess, [{ name: '玫瑰', min: 5, max: 5 }]);
  assert.deepEqual(b.rules.help, [{ name: '伞', action: 'film', min: 20, max: 20 }]);
  assert.equal(b.rules.other, undefined);
  assert.deepEqual(sanitizeSettings(migrateV6(migrateV5({ version: 1, limits: { minGapMs: 700, queueMax: 60 } }))).limits, defaultSettings().limits, '更老的存档照样升级');
});

test('存档：新格式存在新键名；没有时从最近的旧键名搬（读的时候不写，旧的都不动）', () => {
  const mem = new Map();
  const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(new Set([KEY_SETTINGS, KEY_SETTINGS_V2, KEY_SETTINGS_V1]).size, 3);
  let r = loadSettings(storage);
  assert.equal(r.exists, false);
  assert.deepEqual(r.settings, defaultSettings());
  const v1 = JSON.stringify({ version: 5, rules: { menu: { on: false }, gifts: [{ name: '玫瑰', action: 'mud', tier: '' }] } });
  mem.set(KEY_SETTINGS_V1, v1);
  r = loadSettings(storage);
  assert.equal(r.migrated, true);
  assert.deepEqual(r.settings.rules.mess, [{ name: '玫瑰', min: 3, max: 3 }]);
  const v2 = JSON.stringify({ version: 6, rules: { gifts: [{ name: '比心', action: 'egg', n: 2 }] } });
  mem.set(KEY_SETTINGS_V2, v2);
  r = loadSettings(storage);
  assert.deepEqual(r.settings.rules.mess, [{ name: '比心', min: 2, max: 2 }], 'V1.4 的比 V1.3 的新，先用它');
  assert.equal(mem.has(KEY_SETTINGS), false, '读的时候不写');
  assert.ok(saveSettings(storage, { ...r.settings, rules: { ...r.settings.rules, mess: [{ name: '新的', min: 1, max: 4 }] } }));
  r = loadSettings(storage);
  assert.equal(r.migrated, false);
  assert.deepEqual(r.settings.rules.mess, [{ name: '新的', min: 1, max: 4 }]);
  assert.equal(mem.get(KEY_SETTINGS_V1), v1, '旧键名一直不动（回退到旧版也不会乱）');
  assert.equal(mem.get(KEY_SETTINGS_V2), v2);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(loadSettings(broken).readable, false);
  assert.equal(saveSettings(broken, defaultSettings()), false);
});
