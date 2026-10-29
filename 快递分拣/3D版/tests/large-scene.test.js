import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, exportPayload, parseImport } from '../src/config.js';

test('simultaneous scene capacity accepts and preserves more than ten thousand', () => {
  for (const cap of [1, 150, 10001, 12000, 50000]) {
    const cfg = loadConfig({ play: { cap } });
    assert.equal(cfg.play.cap, cap);
    assert.equal(parseImport(exportPayload(cfg, [])).cfg.play.cap, cap);
  }
  assert.equal(loadConfig({ play: { cap: 50001 } }).play.cap, 50000);
});
