import test from 'node:test';
import assert from 'node:assert/strict';
import { coverShape, paperEnvelope, eachPaperSample, liftBand } from '../src/game/actors/flyer-shape.js';
import { axisSpan } from '../src/game/actors/flyer-peel.js';
import { createFlyerCover } from '../src/game/flyer-cover.js';
import { rng } from '../src/util.js';

const KINDS = ['plain', 'sticker', 'label', 'note', 'ticket', 'kraft', 'lined'];

test('贴平能盖住的范围都在纸的最外沿以内', () => {
  for (const kind of KINDS) {
    const pw = 260;
    const ph = 340;
    const cover = coverShape(kind, pw, ph, 1);
    const env = paperEnvelope(kind, pw, ph, 1);
    for (let x = -pw / 2 - 6; x <= pw / 2 + 6; x += 0.5) {
      for (let y = -ph / 2 - 6; y <= ph / 2 + 6; y += 0.5) if (cover(x, y)) assert.ok(env.inside(x, y), `${kind} (${x}, ${y})`);
    }
  }
});

test('取点走到纸的最外沿：牛皮纸毛边、不干胶白边、圆角、票根缺口上都有点，点都不出最外沿', () => {
  for (const kind of KINDS) {
    const pw = 260;
    const ph = 340;
    const env = paperEnvelope(kind, pw, ph, 1);
    let maxX = 0;
    let maxY = 0;
    let n = 0;
    eachPaperSample(env, { u: 1, edge: 5, fill: 5 }, (x, y) => {
      maxX = Math.max(maxX, Math.abs(x));
      maxY = Math.max(maxY, Math.abs(y));
      /* 点在边上：往哪边挪一丁点能进去就算（圆角往里挪、票根缺口往外挪） */
      const near = [-0.01, 0, 0.01].some(dx => [-0.01, 0, 0.01].some(dy => env.inside(x + dx, y + dy)));
      assert.ok(near, `${kind} 点 (${x}, ${y}) 出了最外沿`);
      n++;
      return true;
    });
    assert.ok(Math.abs(maxX - env.hw) < 1e-9 && Math.abs(maxY - env.hh) < 1e-9, `${kind} 一圈要走到最外沿`);
    assert.ok(maxX >= pw / 2 && maxY >= ph / 2, `${kind} 至少走到纸的轮廓`);
    assert.ok(n > 600, `${kind} 点太少：${n}`);
  }
  assert.ok(paperEnvelope('kraft', 260, 340, 1).hw > 130 + 1.2, '牛皮纸往外的毛边算在里面');
  assert.ok(paperEnvelope('sticker', 260, 340, 1).hw >= 130 + 3.5, '不干胶外圈白边算在里面');
  /* 票根缺口那一圈有点 */
  const t = paperEnvelope('ticket', 260, 340, 1);
  let onNotch = 0;
  eachPaperSample(t, { u: 1, edge: 5, fill: 5 }, (x, y) => {
    if (Math.abs(Math.hypot(Math.abs(x) - t.notch.x, y - t.notch.y) - t.notch.r) < 1e-6) onNotch++;
    return true;
  });
  assert.ok(onNotch >= 8, `票根缺口上的点 ${onNotch}`);
});

test('翘起的角掀开的那一截：鼠标停上去翘到 1.6 倍也在里面', () => {
  assert.ok(liftBand(28, 1) >= 1.6 * 28 + 3);
});

/* 照 flyer.js 的规则做的"纸"：转一点角度、随机撕的方向，用真的 coverShape / paperEnvelope / eachPaperSample */
function sheet(kind, x, y, w, rot, random) {
  const pw = w;
  const ph = w * (0.7 + random() * 0.7);
  let ax;
  let ay;
  if (random() < 0.5) {
    const l = Math.hypot(pw, ph);
    ax = ((random() < 0.5 ? -1 : 1) * pw) / l;
    ay = ((random() < 0.5 ? -1 : 1) * ph) / l;
  } else {
    const side = Math.floor(random() * 4);
    ax = [0, 0, -1, 1][side];
    ay = [-1, 1, 0, 0][side];
  }
  const [s0, s1] = axisSpan(pw, ph, ax, ay);
  const restP = Math.min((s1 - s0) * 0.07, (s1 - s0) * 0.2);
  const from = s0 + liftBand(restP, 1);
  const shape = coverShape(kind, pw, ph, 1);
  const env = paperEnvelope(kind, pw, ph, 1);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const ex = Math.abs(env.hw * cos) + Math.abs(env.hh * sin);
  const ey = Math.abs(env.hw * sin) + Math.abs(env.hh * cos);
  const f = {
    z: 0,
    state: 'stuck',
    asleep: false,
    kind,
    env,
    box: { x0: x - ex, y0: y - ey, x1: x + ex, y1: y + ey },
    toScreen: (lx, ly) => [x + lx * cos - ly * sin, y + lx * sin + ly * cos],
    setZ(v) {
      f.z = v;
    },
    get canSleep() {
      return f.state === 'stuck' && !f.asleep;
    },
    covers(sx, sy) {
      if (f.state !== 'stuck') return false;
      const dx = sx - x;
      const dy = sy - y;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      return lx * ax + ly * ay >= from && shape(lx, ly);
    },
    everySample(fn) {
      return eachPaperSample(env, { u: 1, edge: 2.5, fill: 2.5 }, (lx, ly) => fn(...f.toScreen(lx, ly)));
    },
    sleep() {
      f.asleep = true;
    },
    wake() {
      f.asleep = false;
    }
  };
  return f;
}

test('随机叠一大摞：睡着的每一张，逐点看都被上面贴平的纸盖住（纸边露出来的不许睡）', () => {
  const W = 900;
  const H = 600;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const random = rng(seed * 7919);
    const view = { W, H };
    const cover = createFlyerCover({ view: () => view });
    const list = [];
    for (let i = 0; i < 160; i++) {
      const f = sheet(KINDS[Math.floor(random() * KINDS.length)], random() * W, random() * H, 120 + random() * 110, (random() - 0.5) * 0.32, random);
      f.state = 'slap';
      cover.add(f);
      f.state = 'stuck';
      cover.more(f);
      list.push(f);
    }
    const sleepers = list.filter(f => f.asleep);
    assert.ok(sleepers.length > 20, `第 ${seed} 摞：睡着的太少（${sleepers.length}），测不出东西`);
    for (const g of sleepers) {
      const above = list.filter(h => h.z > g.z && h.box.x0 < g.box.x1 && g.box.x0 < h.box.x1 && h.box.y0 < g.box.y1 && g.box.y0 < h.box.y1);
      let open = 0;
      for (let lx = -g.env.hw; lx <= g.env.hw; lx += 2) {
        for (let ly = -g.env.hh; ly <= g.env.hh; ly += 2) {
          if (!g.env.inside(lx, ly)) continue;
          const [sx, sy] = g.toScreen(lx, ly);
          if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
          if (!above.some(h => h.covers(sx, sy))) open++;
        }
      }
      /* 取点之间漏掉的小缝最多一丁点（边上、里面都是 2.5u 一个点）：每格 2×2，最多 4 格 = 16 u² */
      assert.ok(open <= 4, `第 ${seed} 摞：一张${g.kind}睡着了，可还露着约 ${open * 4} 平方单位`);
    }
  }
});
