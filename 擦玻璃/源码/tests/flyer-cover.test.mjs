import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlyerCover } from '../src/game/flyer-cover.js';

/* 假的小广告：轴对齐的长方形，贴平时整张都盖得住；取点 5 像素一格 */
function paper(x0, y0, x1, y1) {
  const f = {
    z: 0,
    state: 'stuck',
    asleep: false,
    sleeps: 0,
    wakes: 0,
    box: { x0, y0, x1, y1 },
    setZ(v) {
      f.z = v;
    },
    get canSleep() {
      return f.state === 'stuck' && !f.asleep;
    },
    covers(x, y) {
      return f.state === 'stuck' && x >= x0 && x <= x1 && y >= y0 && y <= y1;
    },
    everySample(fn) {
      for (let x = x0; x <= x1; x += 5) for (let y = y0; y <= y1; y += 5) if (!fn(x, y)) return false;
      return true;
    },
    sleep() {
      f.asleep = true;
      f.sleeps++;
    },
    wake() {
      f.asleep = false;
      f.wakes++;
    }
  };
  return f;
}

/* 贴一张：先"啪"上去（还没贴平），抹平以后才盖得住底下 */
function slap(cover, f) {
  f.state = 'slap';
  cover.add(f);
  f.state = 'stuck';
  cover.more(f);
  return f;
}

/* 撕下最上面那张 */
function peelOff(cover, f) {
  f.state = 'peel';
  cover.less(f);
  f.state = 'gone';
  cover.remove(f);
}

test('盖严实了才睡：只盖住一部分的照样醒着，整张盖住的睡下', () => {
  const cover = createFlyerCover();
  const a = slap(cover, paper(100, 100, 200, 200));
  const b = slap(cover, paper(150, 100, 300, 220));
  assert.equal(a.asleep, false, '左边一半还露着');
  const c = slap(cover, paper(90, 90, 160, 210));
  assert.equal(a.asleep, true, '两张一起把它盖严了');
  assert.equal(b.asleep, false);
  assert.equal(c.asleep, false);
  assert.deepEqual([cover.size, cover.awake, cover.asleep], [3, 2, 1]);
});

test('还在"啪"、正被揭起来的纸不算盖住', () => {
  const cover = createFlyerCover();
  const a = slap(cover, paper(100, 100, 200, 200));
  const top = paper(50, 50, 250, 250);
  top.state = 'slap';
  cover.add(top);
  cover.more(top);
  assert.equal(a.asleep, false, '没贴平之前底下那张不睡');
  top.state = 'stuck';
  cover.more(top);
  assert.equal(a.asleep, true);
  top.state = 'peel';
  cover.less(top);
  assert.equal(a.asleep, false, '一揭起来底下那张马上醒');
  top.state = 'stuck';
  cover.more(top);
  assert.equal(a.asleep, true, '松手贴回去又睡');
});

test('盖住它的任何一张被撕掉，它就醒；另一张还在也一样', () => {
  const cover = createFlyerCover();
  const a = slap(cover, paper(100, 100, 200, 200));
  const left = slap(cover, paper(90, 90, 160, 210));
  const right = slap(cover, paper(150, 90, 210, 210));
  assert.equal(a.asleep, true);
  peelOff(cover, left);
  assert.equal(a.asleep, false, '左边露出来了');
  assert.equal(right.asleep, false);
  assert.equal(cover.size, 2);
});

test('一大摞叠着：只有最上面那张醒着，从上往下一张张撕，每张都会醒过来等着被撕', () => {
  const cover = createFlyerCover();
  const stack = [];
  for (let i = 0; i < 300; i++) stack.push(slap(cover, paper(100 - (i % 3), 100 - (i % 2), 220 + (i % 4), 260 + (i % 5))));
  /* 越往上纸越大一点点也好、小一点点也好，盖不严的那几张会醒着；但醒着的总是少数 */
  assert.ok(cover.awake < 120, `醒着的 ${cover.awake} 张`);
  let peeled = 0;
  while (cover.size) {
    const awake = stack.filter(f => !f.asleep && f.state === 'stuck');
    /* 最上面那张一定醒着（能抓到、能撕） */
    const top = stack.filter(f => f.state === 'stuck').reduce((p, q) => (q.z > p.z ? q : p));
    assert.equal(top.asleep, false, '最上面那张要醒着');
    assert.ok(awake.length >= 1);
    peelOff(cover, top);
    peeled++;
  }
  assert.equal(peeled, 300, '每一张都得撕下来，没有一张被"压死"成脏东西');
  assert.equal(cover.awake, 0);
});

test('最上面撕掉只回头看底下那几张：深处睡着的不被吵醒', () => {
  const cover = createFlyerCover();
  const stack = [];
  for (let i = 0; i < 50; i++) stack.push(slap(cover, paper(100, 100, 200, 200)));
  const wakesBefore = stack.slice(0, 48).reduce((n, f) => n + f.wakes, 0);
  peelOff(cover, stack[49]);
  assert.equal(stack[48].asleep, false, '紧挨着的那张醒了');
  assert.equal(stack.slice(0, 48).reduce((n, f) => n + f.wakes, 0), wakesBefore, '更深的不动');
  assert.ok(stack.slice(0, 48).every(f => f.asleep));
});

test('画面外的部分不用盖住', () => {
  const view = { W: 400, H: 300 };
  const cover = createFlyerCover({ view: () => view });
  const a = slap(cover, paper(-50, 100, 100, 200));
  slap(cover, paper(-5, 95, 110, 205));
  assert.equal(a.asleep, true, '露在画面左边外面的那截看不见，不算露着');
});

test('z 快用完时从 1 重新排，上下顺序不变', () => {
  const cover = createFlyerCover({ maxZ: 5 });
  const list = [];
  for (let i = 0; i < 4; i++) list.push(slap(cover, paper(i * 300, 0, i * 300 + 100, 100)));
  peelOff(cover, list[0]);
  peelOff(cover, list[2]);
  const a = slap(cover, paper(1000, 0, 1100, 100));
  const b = slap(cover, paper(2000, 0, 2100, 100));
  const zs = [list[1].z, list[3].z, a.z, b.z];
  assert.ok(zs.every((z, i) => i === 0 || z > zs[i - 1]), `顺序 ${zs}`);
  assert.ok(Math.max(...zs) <= 5);
});

test('清空以后重新开始', () => {
  const cover = createFlyerCover();
  slap(cover, paper(0, 0, 100, 100));
  slap(cover, paper(-10, -10, 110, 110));
  cover.clear();
  assert.deepEqual([cover.size, cover.awake, cover.asleep], [0, 0, 0]);
  const f = slap(cover, paper(0, 0, 10, 10));
  assert.equal(f.z, 1);
});

test('同一帧里上面那张先贴平、自己后贴平：自己贴平时发现整张被盖住，照样睡', () => {
  const cover = createFlyerCover();
  const a = paper(100, 100, 200, 200);
  const b = paper(50, 50, 250, 250);
  a.state = 'slap';
  b.state = 'slap';
  cover.add(a);
  cover.add(b);
  b.state = 'stuck';
  cover.more(b);
  assert.equal(a.asleep, false, '它还在"啪"，先不睡');
  a.state = 'stuck';
  cover.more(a);
  assert.equal(a.asleep, true);
});

test('被揭着的时候上面又贴了一张：松手贴回去时发现整张被盖住，照样睡', () => {
  const cover = createFlyerCover();
  const a = slap(cover, paper(100, 100, 200, 200));
  a.state = 'peel';
  cover.less(a);
  const c = slap(cover, paper(50, 50, 250, 250));
  assert.equal(a.asleep, false, '正被揭着，不睡');
  a.state = 'stuck';
  cover.more(a);
  assert.equal(a.asleep, true);
  assert.equal(c.asleep, false);
});

test('画面变大：原来在画面外的那截进来了、又没被盖住，就醒', () => {
  const view = { W: 400, H: 300 };
  const cover = createFlyerCover({ view: () => view });
  const a = slap(cover, paper(300, 100, 450, 200));
  slap(cover, paper(290, 90, 405, 210));
  assert.equal(a.asleep, true, '露在画面外的那截看不见');
  view.W = 300;
  cover.viewChanged();
  assert.equal(a.asleep, true, '画面变小不用管');
  view.W = 500;
  cover.viewChanged();
  assert.equal(a.asleep, false, '画面变大，那截露出来了');
});
