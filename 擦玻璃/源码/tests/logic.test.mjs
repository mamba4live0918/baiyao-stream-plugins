import test from 'node:test';
import assert from 'node:assert/strict';
import { Director } from '../src/director.js';
import { defaultSettings } from '../src/config.js';
import { zoneRect, zoneDist, hitsZone, placeOutside, placeRectOutside, nearZone, defaultZone, presetPts, ellipsePts, sanitizeZone } from '../src/zone.js';
import { isCompliant, safeName } from '../src/text.js';
import { bladeAngleFor, angleDiff, rng } from '../src/util.js';
import { passStrength, remainingAfter } from '../src/glass/wipe-math.js';

const spec = (action, id) => ({ id, action, params: {} });

test('排队：捣乱之间按最短间隔放出，帮忙（机器人、保护膜）不受间隔限制', () => {
  const s = defaultSettings();
  s.limits.minGapMs = 1000;
  const d = new Director();
  d.push(spec('egg', 1), s);
  d.push(spec('mud', 2), s);
  d.push(spec('robot', 3), s);
  const all = () => true;
  assert.equal(d.next(0, s, all).id, 1);
  assert.equal(d.next(0.2, s, all).id, 3, '机器人可以插在间隔里');
  assert.equal(d.next(0.5, s, all), null, '间隔没到，泥巴还得等');
  assert.equal(d.next(1.0, s, all).id, 2);
  for (let i = 0; i < 5000; i++) assert.equal(d.push(spec('egg', 10 + i), s), 'ok', '排队默认不限');
  assert.equal(d.size, 5000);
  assert.equal(d.push(null, s), 'bad');
  s.limits.queueMax = 5001;
  assert.equal(d.push(spec('egg', 1), s), 'ok');
  assert.equal(d.push(spec('egg', 2), s), 'full', '自己设了排队上限，满了就不收');
});

test('排队：默认不留间隔，一次放一条；超时只丢指定的（比如小动物满员一直等）', () => {
  const s = defaultSettings();
  assert.equal(s.limits.minGapMs, 0);
  const d = new Director();
  d.push({ ...spec('egg', 1), queuedAt: 0 }, s);
  d.push({ ...spec('cat', 2), queuedAt: 0 }, s);
  d.push({ ...spec('mud', 3), queuedAt: 0 }, s);
  assert.equal(d.next(0, s, () => true).id, 1);
  assert.equal(d.next(0, s, () => true).id, 2, '没有间隔，下一帧就能放');
  assert.equal(d.prune(100, 90, x => x.action === 'cat'), 0, '猫已经放出去了');
  d.push({ ...spec('cat', 4), queuedAt: 0 }, s);
  assert.equal(d.prune(100, 90, x => x.action === 'cat'), 1, '只丢等太久的猫');
  assert.equal(d.size, 1, '泥巴还在队里');
});

test('露脸区（多边形）：距离区内为负、区外为正；关掉就没有；凹进去的形状也算得对', () => {
  const z = zoneRect(defaultZone(), 1920, 1080);
  assert.equal(Math.round(z.cx), 960);
  assert.ok(zoneDist(z, z.cx, z.cy) < 0, '中心在区内');
  assert.ok(zoneDist(z, 10, 10) > 0, '角落在区外');
  assert.ok(hitsZone(z, z.x1 + 20, z.cy, 40), '半径 40 的东西贴着边会压到');
  assert.ok(!hitsZone(z, z.x1 + 60, z.cy, 40));
  assert.ok(zoneDist(z, z.x1 - 2, z.y0 + 2) > 0, '外接框的角落不在区内（是椭圆一样的形状）');
  assert.equal(zoneRect({ ...defaultZone(), enabled: false }, 1920, 1080), null, '关掉就没有露脸区');
  /* 一个 U 形（凹进去的）：中间那道缝不算区里 */
  const u = zoneRect({ enabled: true, feather: 0, pts: [[30, 20], [40, 20], [40, 60], [60, 60], [60, 20], [70, 20], [70, 80], [30, 80]] }, 1000, 1000);
  assert.ok(zoneDist(u, 500, 400) > 0, 'U 形中间的缺口在区外');
  assert.ok(zoneDist(u, 350, 400) < 0 && zoneDist(u, 650, 400) < 0 && zoneDist(u, 500, 700) < 0, 'U 形的两条腿和底在区里');
  assert.ok(Math.abs(zoneDist(u, 500, 400) - 100) < 1e-6, '离最近的边 100 像素');
  assert.ok(zoneDist(u, u.ix, u.iy) < 0, '找到的"区里最深的点"真的在区里');
});

test('露脸区：往脸边砸的落点（从区里往外，过了边再往外几像素）', () => {
  const z = zoneRect(defaultZone(), 1920, 1080);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const p = nearZone(z, a, 30);
    const d = zoneDist(z, p.x, p.y);
    assert.ok(d > 0 && d <= 30 + 1e-6, `方向 ${i}：在边外 30 像素以内：${d}`);
    const q = nearZone(z, a, -10);
    assert.ok(zoneDist(z, q.x, q.y) < 0, '负数是边里面一点');
  }
});

test('露脸区：预设形状头顶对齐、左右居中；旧的椭圆存档换成多边形；坏数据回落默认', () => {
  const face = defaultZone().pts;
  const top = pts => Math.min(...pts.map(p => p[1]));
  const midX = pts => (Math.min(...pts.map(p => p[0])) + Math.max(...pts.map(p => p[0]))) / 2;
  for (const kind of ['face', 'shoulder', 'half']) {
    const p = presetPts(kind, face.map(([x, y]) => [x - 10, y]));
    assert.ok(Math.abs(top(p) - top(face)) < 0.2, kind + ' 头顶对齐');
    assert.ok(Math.abs(midX(p) - (midX(face) - 10)) < 0.2, kind + ' 左右居中');
    assert.ok(p.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100), kind + ' 不出画面');
  }
  const half = zoneRect({ enabled: true, feather: 30, pts: presetPts('half', face) }, 1920, 1080);
  assert.ok(half.y1 >= 1079, '露半身一直通到画面底下');
  const e = ellipsePts(50, 50, 10, 20, 12);
  assert.equal(e.length, 12);
  assert.deepEqual(e[0], [50, 30], '从正上方开始');
  assert.deepEqual(sanitizeZone(null), defaultZone());
  assert.deepEqual(sanitizeZone({ enabled: false }), { ...defaultZone(), enabled: false });
});

test('露脸区：竖屏、带鱼屏上默认框和预设不变形（按短边换算）；没动过的默认框才跟着画面比例走', () => {
  const px = (pts, W, H) => {
    const xs = pts.map(p => (p[0] / 100) * W);
    const ys = pts.map(p => (p[1] / 100) * H);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  const [w0, h0] = px(defaultZone().pts, 1920, 1080);
  for (const [W, H] of [[1080, 1920], [2560, 1080], [720, 1280]]) {
    const s = Math.min(W, H) / 1080;
    const [w, h] = px(defaultZone(W / H).pts, W, H);
    assert.ok(Math.abs(w - w0 * s) < 4 && Math.abs(h - h0 * s) < 4, `${W}x${H} 的默认框还是脸的形状：${Math.round(w)}×${Math.round(h)}`);
    for (const kind of ['shoulder', 'half']) {
      const [pw, ph] = px(presetPts(kind, null, W / H), W, H);
      const [lw, lh] = px(presetPts(kind, null), 1920, 1080);
      assert.ok(Math.abs(pw - lw * s) < 6 && (Math.abs(ph - lh * s) < 6 || kind === 'half'), `${W}x${H} 的${kind}不变形`);
    }
  }
  const top = pts => Math.min(...pts.map(p => p[1]));
  assert.ok(Math.abs(top(defaultZone().pts) - 18) < 0.2, '横屏头顶在 18%');
  assert.ok(Math.abs(top(defaultZone(1080 / 1920).pts) - (100 - 82 * (1080 / 1920))) < 0.2, '竖屏按皮套站在底下算，脸大概在中间');
  assert.equal(defaultZone().auto, true, '出厂的默认框跟着画面比例走');
  assert.equal(sanitizeZone({ enabled: true, feather: 36, pts: defaultZone().pts }).auto, true, '旧存档里还是默认框：当作没动过');
  assert.equal(sanitizeZone({ enabled: true, feather: 36, pts: [[40, 20], [60, 20], [50, 60]] }).auto, false, '自己框过的固定不动');
  assert.equal(sanitizeZone({ ...defaultZone(), auto: false }).auto, false, '点过预设 / 框过以后不再自动');
});

test('小广告贴的位置：整张纸（按真实的长方形，转了角度也算）都不压进露脸区；"贴着脸"时紧挨着脸的边', () => {
  const z = zoneRect(defaultZone(), 1920, 1080);
  const minDist = (p, w, h, rot) => {
    let m = Infinity;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 5; j++) {
      const lx = -w / 2 + (w * i) / 4;
      const ly = -h / 2 + (h * j) / 5;
      m = Math.min(m, zoneDist(z, p.x + lx * Math.cos(rot) - ly * Math.sin(rot), p.y + lx * Math.sin(rot) + ly * Math.cos(rot)));
    }
    return m;
  };
  let near = 0;
  for (let i = 1; i <= 200; i++) {
    const rot = (i % 7 - 3) * 0.05;
    const p = placeRectOutside(z, 1920, 1080, 290, 400, rot, { random: rng(i), clearance: 12, hug: true, step: 8 });
    if (!p) continue;
    const d = minDist(p, 290, 400, rot);
    assert.ok(d >= 12 - 1e-6, `第 ${i} 张压进露脸区了：${d}`);
    if (d < 12 + 40) near++;
  }
  assert.ok(near > 120, '贴着脸的那些确实紧挨着脸的边');
});

test('露脸区：找出生点永远不落在区里（换 500 个随机种子）', () => {
  const z = zoneRect({ enabled: true, feather: 36, pts: ellipsePts(50, 50, 30, 35, 16) }, 1920, 1080);
  for (let i = 1; i <= 500; i++) {
    const p = placeOutside(z, 1920, 1080, 90, { random: rng(i), pad: 10 });
    if (p) assert.ok(!hitsZone(z, p.x, p.y, 90, 10), `第 ${i} 次落进了露脸区`);
  }
  /* 淹没感：overlap 越大，东西越能压进露脸区边上（中心还是在区外） */
  let inside = 0;
  for (let i = 1; i <= 500; i++) {
    const p = placeOutside(z, 1920, 1080, 90, { random: rng(i), pad: 10, overlap: 0.8 });
    if (!p) continue;
    assert.ok(zoneDist(z, p.x, p.y) >= 0, '中心不进露脸区');
    if (hitsZone(z, p.x, p.y, 90, 10)) inside++;
  }
  assert.ok(inside > 20, '有不少会压到露脸区边上');
  const full = zoneRect({ enabled: true, feather: 0, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] }, 1920, 1080);
  assert.equal(placeOutside(full, 1920, 1080, 90, { random: rng(1) }), null, '整屏都是露脸区就放不下');
});

test('抖音合规的硬过滤（观众昵称上屏前过一遍）：联系方式、网址、长串数字、钱和红包、赌、黄一律不上屏', () => {
  for (const t of ['加微信聊', '威信', 'v信', 'wx1234', '扣扣', '私信我', '进群', '电话多少', '扫码', 'www.abc', 'abc.com', 'http://x', '13812345678', '１２３４５', '领红包', '刷单', '兼职', '博彩', '约炮']) {
    assert.equal(isCompliant(t), false, t);
  }
  for (const t of ['白曜好帅', '1314', '520快乐', 'LOVE', '到此一游']) assert.equal(isCompliant(t), true, t + ' 不该被拦');
});

test('合规过滤绕不过去（加空格、全角、圈数字、横杠电话、零宽/软连字符）', () => {
  const soft = String.fromCodePoint(0xad);
  const vs = String.fromCodePoint(0xfe0f);
  for (const t of ['加 微 信', 'v x 123', '扫 码', 'ＶＸ', 'Ｑ Ｑ', '138 1234 5678', '138-1234-5678', '①③⑧①②③④⑤', '微' + soft + '信', 'v' + vs + 'x', '一三八一二三四五六七八']) {
    assert.equal(isCompliant(t), false, JSON.stringify(t));
  }
});

test('观众昵称：带联系方式的昵称不上屏，换成"观众"', () => {
  assert.equal(safeName('小明'), '小明');
  assert.equal(safeName('加VX看福利'), '观众');
  assert.equal(safeName('138 1234 5678'), '观众');
  assert.equal(safeName(''), '观众');
  assert.equal(safeName(null), '观众');
  const zw = String.fromCodePoint(0x200b);
  assert.equal(safeName(`白${zw}曜`), '白曜', '零宽字符去掉');
  assert.equal(safeName('用户1234567890'), '用户***', '抖音默认昵称的长串数字打码');
});

test('刮条朝向：垂直于拖动方向；来回刷不会 180° 翻面', () => {
  let a = 0;
  a = bladeAngleFor(a, 1, 0);
  assert.ok(Math.abs(Math.abs(angleDiff(a, Math.PI / 2))) < 1e-9 || Math.abs(Math.abs(angleDiff(a, -Math.PI / 2))) < 1e-9, '往右拖，刮条竖着');
  const before = a;
  a = bladeAngleFor(a, -1, 0);
  assert.ok(Math.abs(angleDiff(before, a)) < 1e-9, '往回拖，刮条不翻面');
});

test('刮擦强度：一遍的一遍刮干净，硬的大约刮几遍剩 5% 左右', () => {
  assert.equal(passStrength(1), 1);
  assert.ok(passStrength(2) > passStrength(3), '越硬每遍去得越少');
  assert.ok(remainingAfter(2, 2) < 0.07 && remainingAfter(2, 1) > 0.15, '两遍的：一遍还剩不少，两遍基本干净');
  assert.ok(remainingAfter(3, 3) < 0.07);
});

test('刮"遍"：掉头（哪怕是慢慢拐过去的弧）算新的一遍，直着刮不算', async () => {
  const { passTracker } = await import('../src/util.js');
  const p = passTracker();
  const first = p.next(10, 0);
  assert.equal(p.next(10, 1), first, '方向差不多还是同一遍');
  /* 每帧只拐 36°，拐 180° */
  let id = first;
  for (let k = 1; k <= 5; k++) id = p.next(Math.cos((k * Math.PI) / 5) * 10, Math.sin((k * Math.PI) / 5) * 10);
  assert.notEqual(id, first, '慢慢掉头也算新的一遍');
  p.reset();
  assert.notEqual(p.id, id, '抬手再按是新的一遍');
});
