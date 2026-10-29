import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('helper inspects the top candidate instead of testing support for all 12000 objects', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function pickDroneTarget()'), source.indexOf('/* 捣乱无人机只抓'));
  const boxes = Array.from({ length: 12000 }, (_, id) => ({ id, st: 'free', cat: 0, dormant: true, mesh: { position: { x: 2, y: id / 10, z: 0 } } }));
  let checks = 0;
  const picked = runInNewContext(code + '\npickDroneTarget()', { boxes, bins: [{ seal: null, leak: null }], pinned: () => { checks++; return false; }, inBinZone: () => false, onTable: () => true });
  assert.equal(picked.id, 11999);
  assert.equal(checks, 1);
});
