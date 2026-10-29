import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, ACTION_IDS } from '../src/config.js';
import { buildSpec, tierIndexByPrice, findTier } from '../src/tiers.js';
import { normalizeGiftEvent, normalizeChatEvent, normalizeLikeEvent, routeGift, routeChat, VoteBoard, LikeBoard, routeLike, specFromAction } from '../src/rules.js';
import { sanitizeSettings } from '../src/settings.js';

const fresh = () => defaultSettings();

test('互动只有五种：加矿砂、扔石头、倒泥水、撞簸箕、小偷', () => {
  assert.deepEqual([...ACTION_IDS], ['ore', 'rocks', 'mud', 'bump', 'thief']);
});

test('档位：礼物数量只放大主要参数（加矿=袋数），不升档，按上限截断', () => {
  const s = fresh();
  const a = buildSpec(s, 'ore', 'mid', 3, '阿花');
  assert.equal(a.tierId, 'mid');
  assert.equal(a.params.sacks, 3);
  assert.equal(a.params.sand, 0.055, '每袋沙量不随数量放大');
  assert.equal(buildSpec(s, 'ore', 'mid', 99).params.sacks, 8);
  assert.equal(buildSpec(s, 'thief', 'heavy', 5).params.fraction, 0.6, '小偷最多偷走六成');
  assert.equal(buildSpec(s, 'mud', 'mid', 2).params.dur, 28);
  assert.equal(buildSpec(s, 'mud', 'mid', 2).params.power, 0.75, '强度不随数量放大');
  assert.equal(findTier(s.actions.ore, 'nope').id, 'mid');
  assert.deepEqual([5, 10, 100].map(p => tierIndexByPrice(3, p, [10, 100])), [0, 1, 2]);
});

test('礼物：规则表里的按规则；其他礼物默认加矿砂并按单价选档', () => {
  const s = fresh();
  const heart = routeGift(s, normalizeGiftEvent({ nickName: '阿花', giftName: '小心心', count: 2 }));
  assert.equal(heart.action, 'ore');
  assert.equal(heart.tierId, 'light');
  assert.equal(heart.params.sacks, 2);
  const thief = routeGift(s, normalizeGiftEvent({ nickName: '大盗', giftName: '比心', count: 1 }));
  assert.equal(thief.action, 'thief');
  assert.equal(thief.tierId, 'mid', '规则没选档就用默认档');
  assert.equal(routeGift(s, normalizeGiftEvent({ nickName: 'x', giftName: '加油鸭', count: 1 })).action, 'bump');
  const rich = routeGift(s, normalizeGiftEvent({ nickName: '土豪', giftName: '嘉年华', count: 1, giftDiamond: 30000 }));
  assert.equal(rich.action, 'ore');
  assert.equal(rich.tierId, 'heavy');
  assert.equal(routeGift(s, normalizeGiftEvent({ nickName: 'x', giftName: '神秘', count: 1 })).tierId, 'mid');
  s.actions.thief.enabled = false;
  assert.equal(routeGift(s, normalizeGiftEvent({ nickName: '大盗', giftName: '比心', count: 1 })), null);
});

test('弹幕公投与点赞', () => {
  const s = fresh();
  const b = new VoteBoard();
  const say = (n, t, now) => routeChat(s, normalizeChatEvent({ nickName: n, userId: n, content: t }), b, now);
  assert.equal(say('a', '撞它', 0), null);
  assert.equal(say('a', '撞', 1), null, '同一个人只算一票');
  assert.equal(say('b', '撞', 2), null);
  assert.equal(say('c', '快撞', 3).action, 'bump');
  const lb = new LikeBoard();
  assert.equal(routeLike(s, normalizeLikeEvent({ count: 150 }), lb, 0), null);
  assert.equal(routeLike(s, normalizeLikeEvent({ count: 60 }), lb, 1).action, 'ore');
});

test('白曜规则动作：value 选档，repeat 放大幅度', () => {
  const s = fresh();
  const spec = specFromAction(s, { action: 'rocks', value: 3, repeat: 2, event: { user: { nickname: '阿花' } } });
  assert.equal(spec.tierId, 'heavy');
  assert.equal(spec.params.count, 8);
  assert.equal(spec.who, '阿花');
  assert.equal(specFromAction(s, { action: 'flood' }), null, '旧版的互动名不认');
});

test('设置校验：坏数据回落默认，合法设置原样返回', () => {
  const d = defaultSettings();
  assert.deepEqual(sanitizeSettings(null), d);
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(d))), d);
  const odd = sanitizeSettings({ play: { spill: 'yes' }, rules: { gifts: [{ name: '玫瑰', action: 'bear' }] } });
  assert.equal(odd.play.spill, true);
  assert.deepEqual(odd.rules.gifts, []);
});
