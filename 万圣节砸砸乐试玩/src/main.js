/* 万圣节砸砸乐试玩 · 主循环、按钮、提示字
   质检用：window.hw.advance(毫秒) 不靠浏览器动画帧也能往前走（预览窗口藏起来时用）。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { pick, label, reseed } = HW.util;
  const canvas = document.getElementById('stage'), g = canvas.getContext('2d');
  const STEP = 1000 / 60;
  let view = 1, last = 0, sim = 0, raf = 0, bg = null;
  const toasts = [], scheduled = [];

  HW.ui = { toast(text) { toasts.unshift({ text, age: 0 }); if (toasts.length > 4) toasts.length = 4; } };

  // 七种互动：捣蛋六种 + 糖果保护
  const TRICKS = {
    tower: { name: '南瓜叠叠乐', run: who => { const n = HW.tower.add(); HW.ui.toast(who + ' 往你头上叠了个南瓜（第 ' + n + ' 层）'); } },
    flood: { name: '南瓜淹没', run: who => { HW.flood.add(6); HW.ui.toast(who + ' 下了一阵南瓜雨'); } },
    ghost: { name: '小幽灵', run: who => { HW.ghosts.add(); HW.ui.toast(who + ' 放出一只小幽灵'); } },
    potion: { name: '变身药水', run: who => { HW.potion.add(who); } },
    mummy: { name: '木乃伊', run: who => { HW.mummy.add(); HW.ui.toast(who + ' 给你缠了一圈绷带'); } },
    bats: { name: '蝙蝠倒挂', run: who => { HW.bats.add(2); HW.ui.toast(who + ' 引来两只蝙蝠'); } },
  };
  const pool = new Set(Object.keys(TRICKS));

  function trick(kind) {
    const who = pick(HW.names);
    if (HW.candy.shielded()) { HW.candy.add(who, 1, true); HW.ui.toast(who + ' 的捣蛋被保护罩变成了糖'); return; }
    const list = [...pool];
    const k = kind === 'random' ? (list.length ? pick(list) : null) : kind;
    if (k) TRICKS[k].run(who);
  }
  function candy(n) { const who = pick(HW.names); HW.candy.add(who, n); HW.ui.toast(who + ' 喂了你 ' + n + ' 颗糖'); }
  function clearTricks() { HW.tower.clear(true); HW.flood.clear(); HW.ghosts.clear(); HW.potion.clear(); HW.mummy.clear(); HW.bats.clear(); }
  function resetAll() {
    reseed(20261031);
    HW.tower.reset(); HW.flood.reset(); HW.ghosts.reset(); HW.potion.reset(); HW.mummy.reset(); HW.bats.reset(); HW.candy.reset();
    HW.particles.clear(); HW.avatar.reset(); toasts.length = 0; scheduled.length = 0;
  }
  // 「连送 5 次」：按模拟时间排队，不用定时器
  function repeat(times, fn) { for (let i = 0; i < times; i++) scheduled.push({ at: sim + i * 0.28, fn }); }
  HW.main = { clearTricks, trick, candy, resetAll, TRICKS, pool };

  function step(dt) {
    sim += dt / 1000;
    for (let i = scheduled.length - 1; i >= 0; i--) if (scheduled[i].at <= sim) { const job = scheduled[i]; scheduled.splice(i, 1); job.fn(); }
    HW.potion.update(dt); HW.ghosts.update(dt); HW.candy.update(dt);
    // 各效果对皮套的影响合在一起（真插件里分别发给 VTS）
    const f = HW.avatar.fx, P = HW.potion.fx, Gf = HW.ghosts.fx;
    f.scale = P.scale; f.scaleAnchor = HW.avatar.POINTS[P.anchor === 'face' ? 'face' : 'bottom']; f.flip = P.flip; f.green = P.green;
    f.alpha = P.alpha * Gf.alpha; f.ghost = Gf.ghost; f.lift = Gf.lift; f.sway = Gf.sway; f.chomp = HW.candy.fx.chomp;
    HW.avatar.update(dt);
    HW.tower.update(dt); HW.flood.update(dt); HW.mummy.update(dt); HW.bats.update(dt); HW.particles.update(dt);
    for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].age += dt / 1000; if (toasts[i].age > 3.4) toasts.splice(i, 1); }
  }
  function background() {
    const c = document.createElement('canvas');
    c.width = HW.W; c.height = HW.H;
    const b = c.getContext('2d');
    const gr = b.createLinearGradient(0, 0, 0, HW.H);
    gr.addColorStop(0, '#2C2240'); gr.addColorStop(1, '#17121F');
    b.fillStyle = gr; b.fillRect(0, 0, HW.W, HW.H);
    const v = b.createRadialGradient(HW.W / 2, HW.H * 0.45, 200, HW.W / 2, HW.H * 0.5, 980);
    v.addColorStop(0, 'rgba(120,90,170,.18)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
    b.fillStyle = v; b.fillRect(0, 0, HW.W, HW.H);
    return c;
  }
  function render() {
    const t = sim;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(view, 0, 0, view, 0, 0);
    g.drawImage(bg, 0, 0);
    HW.candy.drawBack(g, t);
    HW.ghosts.draw(g, false);
    HW.avatar.draw(g);
    HW.flood.draw(g);
    HW.mummy.draw(g);
    HW.tower.draw(g, t);
    HW.bats.draw(g, t);
    HW.ghosts.draw(g, true);
    HW.potion.draw(g);
    HW.particles.draw(g);
    HW.candy.draw(g, t);
    toasts.forEach((m, i) => label(g, m.text, 40, 56 + i * 50, { size: 32, alpha: Math.min(1, (3.4 - m.age) / 0.6) * Math.min(1, m.age / 0.15) }));
    if (HW.tower.record >= 2) label(g, '南瓜塔最高 ' + HW.tower.record + ' 层', HW.W - 40, 166, { size: 28, align: 'right', fill: '#FFD45C' });
  }
  function tick(now) {
    const dt = last ? Math.min(50, now - last) : STEP;
    last = now;
    step(dt);
    render();
    raf = requestAnimationFrame(tick);
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(r.width * dpr));
    if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round((w * HW.H) / HW.W); }
    view = canvas.width / HW.W;
  }
  function stagePoint(e) { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * HW.W, y: ((e.clientY - r.top) / r.height) * HW.H }; }

  function setupControls() {
    const combo = document.getElementById('combo');
    const times = () => (combo.checked ? 5 : 1);
    document.querySelectorAll('[data-trick]').forEach(b => {
      b.onclick = () => { HW.sfx.unlock(); repeat(times(), () => trick(b.dataset.trick)); };
    });
    document.getElementById('candy1').onclick = () => { HW.sfx.unlock(); candy(1); };
    document.getElementById('candy5').onclick = () => { HW.sfx.unlock(); candy(5); };
    document.getElementById('scare').onclick = () => { HW.sfx.unlock(); HW.bats.scare(); };
    document.getElementById('shake').onclick = () => { HW.sfx.unlock(); HW.avatar.shake(); };
    document.getElementById('reset').onclick = () => resetAll();
    document.getElementById('auto').onchange = e => { HW.avatar.auto = e.target.checked; };
    document.getElementById('mute').onchange = e => HW.sfx.setMuted(e.target.checked);
    const chips = document.getElementById('pool');
    for (const [key, t] of Object.entries(TRICKS)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = t.name; b.setAttribute('aria-pressed', 'true');
      b.onclick = () => { if (pool.has(key)) pool.delete(key); else pool.add(key); b.setAttribute('aria-pressed', String(pool.has(key))); };
      chips.append(b);
    }
    canvas.addEventListener('pointerdown', e => { HW.sfx.unlock(); canvas.setPointerCapture(e.pointerId); const p = stagePoint(e); HW.avatar.dragStart(p.x, p.y); });
    canvas.addEventListener('pointermove', e => { if (HW.avatar.drag) { const p = stagePoint(e); HW.avatar.dragMove(p.x, p.y); } });
    for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => HW.avatar.dragEnd());
    window.addEventListener('resize', resize);
  }

  function start() {
    HW.art.init();
    HW.flood.init();
    bg = background();
    const img = new Image();
    img.onload = () => {
      HW.avatar.init(img);
      resetAll();
      setupControls();
      resize();
      window.hw = {
        ready: true,
        advance(ms) { cancelAnimationFrame(raf); resize(); for (let t = 0; t < ms; t += STEP) step(STEP); render(); return sim; },
        resume() { last = 0; raf = requestAnimationFrame(tick); },
        trick, candy, resetAll, shake: () => HW.avatar.shake(),
        drag(dx, dy) { HW.avatar.dragStart(800, 450); HW.avatar.dragMove(800 + dx, 450 + dy); },
        release() { HW.avatar.dragEnd(); },
        state: () => ({ tower: HW.tower.count(), record: HW.tower.record, flood: HW.flood.count, overflow: HW.flood.overflow, ghosts: HW.ghosts.list.length, possess: HW.ghosts.possess,
          potion: HW.potion.cur && HW.potion.cur.key, mummy: HW.mummy.strips.length, bats: HW.bats.list.length, candy: HW.candy.count, shield: HW.candy.shield }),
      };
      raf = requestAnimationFrame(tick);
    };
    img.onerror = () => { window.hw = { ready: false, error: '皮套图片没加载出来' }; };
    img.src = document.getElementById('avatar-src').textContent.trim();
  }
  start();
})();
