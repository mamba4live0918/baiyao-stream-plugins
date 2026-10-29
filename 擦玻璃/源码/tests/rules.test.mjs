import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, ACTION_IDS, isHelp } from '../src/config.js';
import { buildSpec, findTier, splitSpec } from '../src/tiers.js';
import { normalizeGiftEvent } from '../src/rules.js';
import { sanitizeSettings } from '../src/settings.js';
import { defaultZone } from '../src/zone.js';

const fresh = () => defaultSettings();

test('互动一共十一种：九种捣乱（含主播上传的"我的贴纸"）+ 两种帮忙', () => {
  assert.deepEqual([...ACTION_IDS], ['egg', 'tea', 'mud', 'flyer', 'sticker', 'fog', 'cat', 'bird', 'gecko', 'robot', 'film']);
  assert.deepEqual(ACTION_IDS.filter(isHelp), ['robot', 'film']);
});

test('档位：礼物数量只放大带 × 的参数，不升档，按上限截断', () => {
  const s = fresh();
  const a = buildSpec(s, 'egg', 'mid', 3, '阿花', 'gift', { uid: 'u1' });
  assert.equal(a.tierId, 'mid');
  assert.equal(a.params.count, 6, '中档 2 个 × 3');
  assert.equal(a.params.size, 1, '大小不随数量放大');
  assert.equal(a.params.warn, 1.2, '预警时间不随数量放大');
  assert.equal(a.uid, 'u1');
  assert.equal(buildSpec(s, 'egg', 'mid', 99).params.count, 198, '数量放大不封顶（太多会拆批）');
  assert.equal(buildSpec(s, 'fog', 'mid', 3).params.hold, 135, '哈气：数量放大停留时间');
  assert.equal(buildSpec(s, 'film', 'heavy', 9).params.hits, 360, '保护膜：重档挡 40 下 × 9');
  assert.equal(buildSpec(s, 'film', 'mid', 999).params.hits, 19980, '保护膜耐久也不封顶');
  assert.equal(findTier(s.actions.egg, 'nope').id, 'mid');
});

test('礼物消息：连击结束的汇总包不重复算', () => {
  assert.equal(normalizeGiftEvent({ giftName: '玫瑰', count: 3, effectiveGiftCount: 0 }), null);
  assert.equal(normalizeGiftEvent({ giftName: '玫瑰', count: 3 }).gift.count, 3);
});

test('设置校验：坏数据回落默认，合法设置原样返回', () => {
  const d = defaultSettings();
  assert.deepEqual(sanitizeSettings(null), d);
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(d))), d);
  const odd = sanitizeSettings({ display: { zone: { pts: [[-5, 10], [120, 20], [50, 'x'], [40, 90], [30, 60]], feather: 999 }, glass: 7 }, rules: { mess: [{ name: '玫瑰', min: 'a' }] }, play: { blade: 1 } });
  assert.deepEqual(odd.display.zone.pts, [[0, 10], [100, 20], [40, 90], [30, 60]], '露脸区的点限在画面里，坏的点丢掉');
  assert.equal(odd.display.zone.feather, 120);
  assert.deepEqual(sanitizeSettings({ display: { zone: { pts: [[1, 1], [2, 2]] } } }).display.zone, d.display.zone, '不到 3 个点就用默认的');
  assert.equal(sanitizeSettings({ display: { zone: { pts: Array.from({ length: 40 }, (_, i) => [i, i]) } } }).display.zone.pts.length, 24, '最多 24 个点');
  assert.equal(odd.display.glass, 1);
  assert.equal(odd.play.blade, 8);
  assert.deepEqual(odd.rules.mess, [{ name: '玫瑰', min: 1, max: 1 }]);
  assert.equal(odd.live.receive, true, '默认接收直播间');
});

test('上限：默认全都不限（0 = 不限），自己想限再填数字；旧存档里没改过的默认值自动换成不限', () => {
  const d = defaultSettings();
  assert.deepEqual(d.limits, { minGapMs: 0, queueMax: 0, ownerCap: 0, maxStains: 0, waitSec: 0, actors: { cat: 0, bird: 0, gecko: 0, robot: 0, flyer: 0 } });
  const mine = sanitizeSettings({ version: 3, limits: { maxStains: 200, ownerCap: 8, queueMax: 50, waitSec: 90, minGapMs: 300, actors: { cat: 2, robot: 1 } } });
  assert.deepEqual(mine.limits, { minGapMs: 300, queueMax: 50, ownerCap: 8, maxStains: 200, waitSec: 90, actors: { cat: 2, bird: 0, gecko: 0, robot: 1, flyer: 0 } });
  const v1 = sanitizeSettings({ version: 1, limits: { minGapMs: 700, queueMax: 60, ownerCap: 30, maxStains: 120 } });
  assert.deepEqual(v1.limits, d.limits, '第 1 版的默认值换成不限');
  const v2 = sanitizeSettings({ version: 2, limits: { minGapMs: 0, ownerCap: 100000, maxStains: 100000 } });
  assert.deepEqual(v2.limits, d.limits, '第 2 版的 10 万也换成不限');
  const v2mine = sanitizeSettings({ version: 2, limits: { minGapMs: 0, ownerCap: 12, maxStains: 500 } });
  assert.equal(v2mine.limits.ownerCap, 12, '自己改过的照旧');
  assert.equal(v2mine.limits.maxStains, 500);
});

test('露脸区：默认只框脸（多边形），淹没感默认偏大；旧存档里没改过的露脸区换成新的，调过的照着原来的框换成多边形', () => {
  const d = defaultSettings();
  assert.deepEqual(d.display.zone, defaultZone());
  const xs = d.display.zone.pts.map(p => p[0]);
  const ys = d.display.zone.pts.map(p => p[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 18 && Math.max(...ys) - Math.min(...ys) <= 32, '只框脸');
  assert.ok(d.play.engulf >= 0.8 && d.play.engulf <= 1);
  const old = sanitizeSettings({ version: 3, display: { zone: { enabled: true, x: 50, y: 34, w: 26, h: 40, round: 0.7, feather: 28, follow: false } } });
  assert.deepEqual(old.display.zone, d.display.zone, '老默认换成新默认');
  const mine = sanitizeSettings({ version: 3, display: { zone: { enabled: false, x: 40, y: 30, w: 30, h: 50, round: 0.5, feather: 20, follow: false } } });
  const mx = mine.display.zone.pts.map(p => p[0]);
  const my = mine.display.zone.pts.map(p => p[1]);
  assert.ok(Math.abs(Math.min(...mx) - 25) < 0.2 && Math.abs(Math.max(...mx) - 55) < 0.2 && Math.abs(Math.min(...my) - 5) < 0.2 && Math.abs(Math.max(...my) - 55) < 0.2, '自己调过的圆角框：还是那么大、在那里');
  assert.equal(mine.display.zone.enabled, false, '开关照旧');
  assert.equal(mine.display.zone.feather, 20);
  assert.equal(sanitizeSettings({ play: { engulf: 3 } }).play.engulf, 1);
});

test('礼物数量放大不封顶：超过"一次最多"就拆成好几批排队（每批不超过一次的量）', () => {
  const s = fresh();
  const big = buildSpec(s, 'egg', 'heavy', 1314);
  assert.equal(big.params.count, 5 * 1314, '不再封顶');
  const parts = splitSpec(big);
  assert.equal(parts.length, Math.ceil((5 * 1314) / 40));
  assert.ok(parts.every(p => p.params.count <= 40 && p.action === 'egg' && p.who === big.who));
  assert.equal(parts.reduce((a, p) => a + p.params.count, 0), 5 * 1314, '总数不变');
  assert.equal(new Set(parts.map(p => p.id)).size, parts.length, '每批有自己的 id');
  assert.deepEqual(splitSpec(buildSpec(s, 'egg', 'mid', 1)).length, 1, '没超过就不拆');
  assert.equal(buildSpec(s, 'robot', 'heavy', 100).params.seconds, 4000, '时长也不封顶');
  assert.equal(splitSpec(buildSpec(s, 'robot', 'heavy', 100)).length, 200, '机器人按一台 20 秒拆回好几台');
  assert.equal(splitSpec(buildSpec(s, 'robot', 'mid', 1)).length, 1, '一台的不拆');
});
