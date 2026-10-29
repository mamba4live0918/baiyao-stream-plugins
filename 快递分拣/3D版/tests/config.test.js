import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, loadConfig, parseImport, exportPayload, defaultLayout } from '../src/config.js';
import { STAGES } from '../src/stages.js';

test('defaults include V2 fields', () => {
  const c = loadConfig(null);
  assert.equal(c.mode, 'express'); assert.equal(c.play.wrong, 'double'); assert.equal(c.play.cap, 150);
  assert.equal(c.play.range, 'window'); assert.equal(c.play.back, 'mid'); assert.equal(c.play.blob, true);
  assert.equal(c.layout.head.on, false); assert.equal(c.garbage.naming, 'national'); assert.equal(c.garbage.names, true);
  assert.equal(c.glevels.length, 3); assert.equal(c.glevel, 0);
  assert.equal(c.tiers.audit[1].amt, 15); assert.equal(c.tiers.tricky[1].amt, 2); assert.equal(c.tiers.seal[2].bins, 2);
  assert.equal(c.play.mult, 2); assert.equal(c.fx, undefined, '旧的单组参数并入分档');
  assert.equal(c.layout.stage, 'counter'); assert.deepEqual(c.layout.scene, STAGES.counter.view.scene); assert.deepEqual(c.layout.cam, STAGES.counter.view.cam);
  assert.equal(c.layout.board.on, false, '说明牌默认关'); assert.deepEqual([c.layout.counter.x, c.layout.counter.y], [2, 2]); assert.deepEqual(c.layout.saved, {});
});

test('V1.0 config keeps user values and gains defaults', () => {
  const v1 = { beltSpeed: 1.6, levels: [{ name: '我的关', red: 2, yellow: 1, blue: 0, tape: 0, strip: 0, blind: 0, blindSize: 6, speed: 1, time: 0 }], layout: { scene: { x: 0, y: 50, w: 100, h: 50 } } };
  const c = loadConfig(v1);
  assert.equal(c.beltSpeed, 1.6); assert.equal(c.levels.length, 1); assert.equal(c.levels[0].name, '我的关'); assert.equal(c.levels[0].red, 2);
  assert.equal(c.mode, 'express'); assert.deepEqual(c.layout.head, DEFAULTS.layout.head);
  // 没有布局字段的旧设置：分拣台位置记进经典俯视，当前换成柜台的默认画面
  assert.equal(c.layout.stage, 'counter'); assert.equal(c.layout.saved.classic.scene.y, 50); assert.equal(c.layout.saved.classic.cam.view, 'oblique');
  assert.deepEqual(c.layout.scene, STAGES.counter.view.scene); assert.equal(c.layout.board.on, false);
});

test('V2.1 configs keep their layout; switching back to classic finds the old framing', () => {
  const c = loadConfig({ layout: { stage: 'classic', scene: { x: 5, y: 40, w: 90, h: 60 }, cam: { view: 'high', pitch: 62 }, board: { on: true }, saved: { counter: { scene: { y: 70 }, cam: { pitch: 999 } }, junk: {} } } });
  assert.equal(c.layout.stage, 'classic'); assert.equal(c.layout.scene.y, 40); assert.equal(c.layout.cam.pitch, 62); assert.equal(c.layout.board.on, true, '新版本存的说明牌开关原样保留');
  assert.equal(c.layout.saved.counter.scene.y, 70); assert.equal(c.layout.saved.counter.cam.pitch, 80, '记着的视角也收紧范围'); assert.equal(c.layout.saved.junk, undefined);
  const bad = loadConfig({ layout: { stage: 'moon', scene: { y: 44 } } }); assert.equal(bad.layout.stage, 'counter'); assert.equal(bad.layout.saved.classic.scene.y, 44);
});

test('layout reset restores the current layout only and keeps the other one remembered', () => {
  const saved = { classic: { scene: { x: 0, y: 30, w: 100, h: 70 }, cam: { ...STAGES.classic.view.cam } } };
  const L = defaultLayout('counter', saved); assert.equal(L.stage, 'counter'); assert.deepEqual(L.scene, STAGES.counter.view.scene); assert.deepEqual(L.saved, saved); assert.notEqual(L.saved, saved, '复制一份');
  const K = defaultLayout('classic'); assert.equal(K.stage, 'classic'); assert.deepEqual(K.scene, STAGES.classic.view.scene); assert.deepEqual([K.counter.x, K.counter.y], [42, 2]); assert.equal(K.board.on, false);
});

test('numbers are clamped to control ranges', () => {
  const c = loadConfig({ panel: { scale: 0 }, volume: 999, fx: { kickLoss: -5, speedMul: 99, truck: 2.7 }, play: { cap: 5, mult: 9 }, layout: { head: { r: 500, x: -20 }, cam: { pitch: 1 } }, autoNextSec: 0, link: { port: 70000 } });
  assert.equal(c.panel.scale, 60); assert.equal(c.volume, 100); assert.equal(c.tiers.kick[1].loss, 0); assert.equal(c.tiers.speed[1].mul, 6); assert.equal(c.tiers.truck[1].amt, 3); assert.equal(c.play.mult, 4);
  assert.equal(c.play.cap, 5); assert.equal(c.layout.head.r, 45); assert.equal(c.layout.head.x, 0); assert.equal(c.layout.saved.classic.cam.pitch, 12);
  assert.equal(loadConfig({ layout: { stage: 'counter', cam: { pitch: 1 } } }).layout.cam.pitch, 12);
  assert.equal(c.autoNextSec, 2); assert.equal(c.link.port, 65535);
});

test('enums fall back to defaults', () => {
  const c = loadConfig({ mode: 'pizza', bg: 'x', afterLevel: 'never', play: { range: 'moon', wrong: 'x', back: 'huge' }, perf: { shadow: 'ultra', fps: 77 }, panel: { side: 'top' }, garbage: { naming: 'tokyo' }, layout: { cam: { view: 'fisheye' } } });
  assert.equal(c.mode, 'express'); assert.equal(c.bg, 'none'); assert.equal(c.afterLevel, 'wait');
  assert.equal(c.play.range, 'window'); assert.equal(c.play.wrong, 'double'); assert.equal(c.play.back, 'mid');
  assert.equal(c.perf.shadow, 'soft'); assert.equal(c.perf.fps, 60); assert.equal(c.panel.side, 'right');
  assert.equal(c.garbage.naming, 'national'); assert.equal(c.layout.saved.classic.cam.view, 'oblique'); assert.equal(c.layout.cam.view, 'front');
});

test('valid enum values are kept', () => {
  const c = loadConfig({ mode: 'garbage', play: { range: 'platform', wrong: 'bounce', back: 'large' }, garbage: { naming: 'shanghai' } });
  assert.equal(c.mode, 'garbage'); assert.equal(c.play.range, 'platform'); assert.equal(c.play.wrong, 'bounce'); assert.equal(c.play.back, 'large'); assert.equal(c.garbage.naming, 'shanghai');
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

test('import accepts format 3 and 4, rejects other apps', () => {
  assert.throws(() => parseImport({ app: 'x' }), /不是快递分拣 3D/);
  assert.throws(() => parseImport({ app: 'kuaidi-3d', format: 9, config: {} }), /版本/);
  assert.throws(() => parseImport({ app: 'kuaidi-3d', format: 4 }), /没有可用/);
  const p = parseImport({ app: 'kuaidi-3d', format: 3, config: { volume: 20 } });
  assert.equal(p.cfg.volume, 20); assert.equal(p.rules, null);
  const e = exportPayload(loadConfig(null), []);
  assert.equal(e.format, 4); assert.equal(e.app, 'kuaidi-3d');
  const back = parseImport(JSON.parse(JSON.stringify(e)));
  assert.equal(back.cfg.play.cap, 150); assert.deepEqual(back.rules, []);
});

test('import validates rules', () => {
  assert.throws(() => parseImport({ app: 'kuaidi-3d', format: 4, rules: [{ src: 'gift', match: '', effect: 'truck', value: 1 }] }), /不能为空/);
  const p = parseImport({ app: 'kuaidi-3d', format: 4, rules: [{ src: 'gift', match: '墨镜', effect: 'audit', value: 20 }] });
  assert.equal(p.rules[0].effect, 'audit'); assert.equal(p.cfg, null);
});

test('saved tiers win over legacy fx and survive a reload', () => {
  const c = loadConfig({ fx: { sealHits: 7 }, tiers: { seal: [{ hits: 2 }, { hits: 9 }, {}] } });
  assert.equal(c.tiers.seal[0].hits, 2); assert.equal(c.tiers.seal[1].hits, 9);
  const again = loadConfig(JSON.parse(JSON.stringify(c))); assert.deepEqual(again.tiers, c.tiers);
});
