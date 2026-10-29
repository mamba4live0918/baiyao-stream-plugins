import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, exportPayload, parseImport } from '../src/config.js';
import { validRule } from '../src/rules.js';
import { cleanTiers, fixParam } from '../src/tiers.js';

test('new and legacy settings default to audience-only endless play', () => {
  assert.equal(loadConfig(null).endless, true);
  assert.equal(loadConfig({ mode: 'garbage' }).endless, true);
  assert.equal(loadConfig({ endless: false }).endless, false);
});
test('truck rules accept 1–10000 and reject outside that range', () => {
  const rule = { src: 'gift', match: '玫瑰', effect: 'truck', cd: 0 };
  for (const value of [1, 60, 9999, 10000]) assert.equal(validRule({ ...rule, value }, 0).value, value);
  for (const value of [0, -1, 10001, 1.5, Infinity]) assert.throws(() => validRule({ ...rule, value }, 0));
});
test('large tier quantities and rules survive save/export/import without truncation', () => {
  const tiers = cleanTiers({ truck: [{ id: 'huge', name: '一万', def: true, amt: 10000 }] });
  assert.equal(tiers.truck[0].amt, 10000);
  assert.equal(fixParam('truck', 'amt', 9999), 9999);
  const rules = [validRule({ src: 'gift', match: '玫瑰', effect: 'truck', value: 10000 }, 0)];
  const result = parseImport(exportPayload(loadConfig({ tiers }), rules));
  assert.equal(result.cfg.endless, true);
  assert.equal(result.cfg.tiers.truck[0].amt, 10000);
  assert.equal(result.rules[0].value, 10000);
});
