import test from 'node:test';
import assert from 'node:assert/strict';
import { routeGift, routeComment, normalizeGiftEvent, normalizeCommentEvent, specFromAction } from '../src/rules.js';
import { sanitizeSettings, defaultSettings } from '../src/settings.js';
import { computeLayout, queueSlot, traySlot } from '../src/layout.js';

const S = over => sanitizeSettings({ ...defaultSettings(), ...over });
const gift = (name, count = 1, nick = '小白') => normalizeGiftEvent({ giftName: name, count, nickname: nick, userId: 'u1', eventId: 'e' + Math.random() });
const say = (content, nick = '小白') => normalizeCommentEvent({ content, nickname: nick, userId: 'u-' + nick });

test('订南瓜礼物：送 1 个 = N～M 个南瓜，礼物点单不受每人一单限制', () => {
  const s = S({ rules: { order: [{ name: '小心心', min: 2, max: 2 }], mess: [], pool: ['cat'] } });
  const out = routeGift(s, gift('小心心', 3));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'order');
  assert.equal(out[0].count, 6);
  assert.equal(out[0].via, 'gift');
});

test('捣乱礼物：从捣乱池里随机，总下数不少；池子空了什么都不做；表里没有的礼物什么都不做', () => {
  const s = S({ rules: { order: [], mess: [{ name: '玫瑰', min: 3, max: 3 }], pool: ['cat', 'wind'] } });
  const out = routeGift(s, gift('玫瑰', 2));
  assert.equal(out.reduce((a, x) => a + x.count, 0), 6);
  assert.ok(out.every(x => ['cat', 'wind'].includes(x.kind)));
  assert.equal(routeGift(S({ rules: { order: [], mess: [{ name: '玫瑰', min: 1, max: 1 }], pool: [] } }), gift('玫瑰')), null);
  assert.equal(routeGift(s, gift('没配置的礼物', 5)), null);
});

test('弹幕口令：整句等于口令才算；口令 + 脸型能点名要脸；关掉点名后不带脸', () => {
  const s = S({});
  assert.equal(routeComment(s, say('南瓜灯')).kind, 'order');
  assert.equal(routeComment(s, say('今天的南瓜灯好看')), null);
  assert.equal(routeComment(s, say('南瓜灯猫猫')).face, 'cat');
  assert.equal(routeComment(S({ order: { ...defaultSettings().order, faces: false } }), say('南瓜灯猫猫')).face, null);
  assert.equal(routeComment(S({ order: { ...defaultSettings().order, enabled: false } }), say('南瓜灯')), null);
});

test('白曜自配动作：order / wind / cat / witch / ghost，数量 = 数值 × 次数', () => {
  const s = S({});
  assert.equal(specFromAction(s, { action: 'cat', value: 2, repeat: 3, actionId: 'a1', event: { nickname: '小白' } }).count, 6);
  assert.equal(specFromAction(s, { action: 'order', value: 1, actionId: 'a2', event: { type: 'gift', nickname: '小白' } }).via, 'gift');
  assert.equal(specFromAction(s, { action: 'rain', value: 1 }), null);
});

test('设置整理：乱填的数字夹回范围，重复的礼物名只留第一行，空表也合法', () => {
  const s = sanitizeSettings({ tower: { side: 'up', safeLayers: -3, breakStep: 7, size: 99 }, rules: { order: [{ name: '小心心', min: 5, max: 2 }, { name: ' 小心心 ', min: 1, max: 1 }], mess: [{ name: '小心心' }] }, audio: { volume: 'x' } });
  assert.equal(s.tower.side, 'right');
  assert.equal(s.tower.safeLayers, 0);
  assert.equal(s.tower.breakStep, 1);
  assert.equal(s.tower.size, 1.6);
  assert.deepEqual(s.rules.order, [{ name: '小心心', min: 2, max: 5 }]);
  assert.deepEqual(s.rules.mess, []);
  assert.equal(s.audio.volume, 0.35);
  assert.deepEqual(sanitizeSettings(null), defaultSettings());
});

test('布局：6 种画布上，工作台、排队、塔都在画面里，塔在左时整套镜像', () => {
  for (const [W, H] of [[1920, 1080], [2048, 1536], [1080, 1920], [2560, 1080], [1366, 768], [1280, 720]]) {
    for (const side of ['right', 'left']) {
      const L = computeLayout(W, H, S({ tower: { ...defaultSettings().tower, side } }));
      const inside = (x, half) => x - half >= -1 && x + half <= W + 1;
      assert.ok(inside(L.bench.x, L.bench.size * 0.42), `${W}x${H} ${side} 工作台`);
      assert.ok(inside(L.tower.x, L.tower.size * 0.42), `${W}x${H} ${side} 塔`);
      for (let i = 0; i < L.queue.n; i++) assert.ok(inside(queueSlot(L, i).x, L.queue.size * 0.42), `${W}x${H} ${side} 排队第 ${i + 1} 个`);
      assert.ok(traySlot(L, 0, 6).y > 0, `${W}x${H} 模具托盘顶在画面里`);
      if (side === 'left') assert.ok(L.tower.x < L.bench.x);
      else assert.ok(L.tower.x > L.bench.x);
    }
  }
});
