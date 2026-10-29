import test from 'node:test';
import assert from 'node:assert/strict';
import { Live } from '../src/live.js';
import { defaultSettings } from '../src/settings.js';

// 白曜里两个 SDK 是同一路事件：一个礼物会同时送到 SonglanPlugin 和 BaiyaoPlugin 的回调里
function baiyaoEnv() {
  const handlers = { gift: [], chat: [] }, actions = [];
  const sdk = { onGift: fn => { handlers.gift.push(fn); }, onChat: fn => { handlers.chat.push(fn); } };
  return { env: { SonglanPlugin: sdk, BaiyaoPlugin: { ...sdk, onAction: fn => { actions.push(fn); } }, setInterval: () => 0, clearInterval: () => {} }, handlers, actions };
}
const settings = () => ({ ...defaultSettings(), rules: { order: [{ name: '小心心', min: 1, max: 1 }], mess: [], candy: [], pool: [] } });

test('白曜里一个礼物只算一次（只接白曜那一路），同一个事件编号再来也不算', () => {
  const { env, handlers } = baiyaoEnv(), got = [];
  new Live(s => { got.push(s); }, settings, env).start();
  assert.equal(handlers.gift.length, 1, '只登记了一路');
  const raw = { type: 'gift', eventId: 'e1', nickName: '小白', userId: 'u1', giftName: '小心心', count: 1 };
  for (const fn of handlers.gift) fn(raw);
  for (const fn of handlers.gift) fn(raw);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, 'order');
});

test('菘蓝没有事件编号：每个礼物都算', () => {
  const handlers = { gift: [] }, got = [];
  const env = { SonglanPlugin: { onGift: fn => { handlers.gift.push(fn); }, onChat: () => {} }, setInterval: () => 0, clearInterval: () => {} };
  new Live(s => { got.push(s); }, settings, env).start();
  for (let i = 0; i < 3; i++) for (const fn of handlers.gift) fn({ type: 'gift', nickName: '小白', giftName: '小心心', count: 1 });
  assert.equal(got.length, 3);
});
