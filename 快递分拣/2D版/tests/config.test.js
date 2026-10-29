import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, loadConfig, parseImport, exportPayload } from '../src/config.js';

test('2D defaults: no 3D view settings, board off, counter top-left', () => {
  const c = loadConfig(null);
  assert.equal(c.mode, 'express'); assert.equal(c.play.wrong, 'double'); assert.equal(c.play.cap, 150); assert.equal(c.play.mult, 2);
  assert.equal(c.play.range, undefined); assert.equal(c.play.back, undefined); assert.equal(c.layout.cam, undefined); assert.equal(c.layout.scene, undefined); assert.equal(c.layout.stage, undefined); assert.equal(c.perf.shadow, undefined);
  assert.equal(c.layout.size, 100); assert.equal(c.layout.counterY, 20); assert.equal(c.layout.board.on, false); assert.deepEqual([c.layout.counter.x, c.layout.counter.y], [2, 2]);
  assert.deepEqual(c.layout.head, DEFAULTS.layout.head); assert.equal(c.garbage.naming, 'national'); assert.equal(c.glevels.length, 3);
  assert.equal(c.tiers.audit[1].amt, 15); assert.equal(c.tiers.seal[2].bins, 2); assert.equal(c.fx, undefined);
});

test('numbers are clamped to control ranges', () => {
  const c = loadConfig({ panel: { scale: 0 }, volume: 999, fx: { kickLoss: -5, speedMul: 99, truck: 2.7 }, play: { cap: 5, mult: 9 }, layout: { head: { r: 500, x: -20 }, size: 999, counterY: 1 }, autoNextSec: 0, link: { port: 70000 } });
  assert.equal(c.panel.scale, 60); assert.equal(c.volume, 100); assert.equal(c.tiers.kick[1].loss, 0); assert.equal(c.tiers.speed[1].mul, 6); assert.equal(c.tiers.truck[1].amt, 3); assert.equal(c.play.mult, 4);
  assert.equal(c.play.cap, 50); assert.equal(c.layout.head.r, 45); assert.equal(c.layout.head.x, 0); assert.equal(c.layout.size, 180); assert.equal(c.layout.counterY, 8);
  assert.equal(c.autoNextSec, 2); assert.equal(c.link.port, 65535);
});

test('enums fall back to defaults; valid values kept', () => {
  const c = loadConfig({ mode: 'pizza', bg: 'x', afterLevel: 'never', play: { wrong: 'x' }, perf: { fps: 77 }, panel: { side: 'top' }, garbage: { naming: 'tokyo' } });
  assert.equal(c.mode, 'express'); assert.equal(c.bg, 'none'); assert.equal(c.afterLevel, 'wait'); assert.equal(c.play.wrong, 'double'); assert.equal(c.perf.fps, 60); assert.equal(c.panel.side, 'right'); assert.equal(c.garbage.naming, 'national');
  const k = loadConfig({ mode: 'garbage', play: { wrong: 'bounce' }, garbage: { naming: 'shanghai' } });
  assert.equal(k.mode, 'garbage'); assert.equal(k.play.wrong, 'bounce'); assert.equal(k.garbage.naming, 'shanghai');
});

test('garbage levels are cleaned and at least one item remains', () => {
  const c = loadConfig({ glevels: [{ name: '', rec: 0, haz: 0, kit: 0, oth: 0, blind: 0, speed: 9, time: -1, bag: 50 }] });
  const l = c.glevels[0];
  assert.ok(l.name.length > 0); assert.ok(l.rec + l.haz + l.kit + l.oth + l.blind >= 1);
  assert.equal(l.speed, 3); assert.equal(l.time, 0); assert.ok(l.bag <= l.rec + l.haz + l.kit + l.oth); assert.equal(typeof l.id, 'string');
});

test('level ids are unique strings and survive a reload', () => {
  const c = loadConfig(null);
  assert.equal(new Set(c.levels.map(l => l.id)).size, c.levels.length);
  assert.equal(new Set(c.glevels.map(l => l.id)).size, c.glevels.length);
  const again = loadConfig(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(again.levels.map(l => l.id), c.levels.map(l => l.id));
});

test('current level indices are clamped', () => {
  const c = loadConfig({ level: 9, glevel: -3 });
  assert.equal(c.level, c.levels.length - 1); assert.equal(c.glevel, 0);
});

test('garbage item overrides drop unknown ids and bad values', () => {
  const c = loadConfig({ garbage: { items: { bottle: { on: false }, banana: { cat: 3 }, nope: { on: false }, can: { cat: 9 } } } });
  assert.deepEqual(c.garbage.items, { bottle: { on: false }, banana: { cat: 3 } });
});

test('import takes 2D files and 3D V1/V2 files; 3D view settings are dropped', () => {
  assert.throws(() => parseImport({ app: 'x' }), /不是快递分拣/);
  assert.throws(() => parseImport({ app: 'kuaidi-2d', format: 9, config: {} }), /版本/);
  assert.throws(() => parseImport({ app: 'kuaidi-3d', format: 9, config: {} }), /版本/);
  assert.throws(() => parseImport({ app: 'kuaidi-2d', format: 1 }), /没有可用/);
  const three = parseImport({ app: 'kuaidi-3d', format: 4, config: { volume: 20, mode: 'garbage', layout: { stage: 'classic', cam: { pitch: 30 }, head: { on: true, r: 20 } }, play: { range: 'platform', cap: 120 } }, rules: [{ src: 'gift', match: '墨镜', effect: 'audit', value: 20 }] });
  assert.equal(three.cfg.volume, 20); assert.equal(three.cfg.mode, 'garbage'); assert.equal(three.cfg.layout.head.r, 20); assert.equal(three.cfg.play.cap, 120);
  assert.equal(three.cfg.layout.cam, undefined); assert.equal(three.cfg.play.range, undefined); assert.equal(three.rules[0].effect, 'audit');
  const e = exportPayload(loadConfig(null), []); assert.equal(e.app, 'kuaidi-2d'); assert.equal(e.format, 1);
  const back = parseImport(JSON.parse(JSON.stringify(e))); assert.equal(back.cfg.play.cap, 150); assert.deepEqual(back.rules, []);
});

test('import validates rules', () => {
  assert.throws(() => parseImport({ app: 'kuaidi-2d', format: 1, rules: [{ src: 'gift', match: '', effect: 'truck', value: 1 }] }), /不能为空/);
  const p = parseImport({ app: 'kuaidi-2d', format: 1, rules: [{ src: 'gift', match: '墨镜', effect: 'audit', value: 20 }] });
  assert.equal(p.rules[0].effect, 'audit'); assert.equal(p.cfg, null);
});

test('saved tiers win over legacy fx and survive a reload', () => {
  const c = loadConfig({ fx: { sealHits: 7 }, tiers: { seal: [{ hits: 2 }, { hits: 9 }, {}] } });
  assert.equal(c.tiers.seal[0].hits, 2); assert.equal(c.tiers.seal[1].hits, 9);
  const again = loadConfig(JSON.parse(JSON.stringify(c))); assert.deepEqual(again.tiers, c.tiers);
});
