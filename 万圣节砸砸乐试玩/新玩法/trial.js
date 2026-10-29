/* 万圣节砸砸乐 · 0.27.3 新玩法试玩
   用白曜重工 0.27.1 里真的万圣节控制器（src/halloween.cjs、halloween-config.cjs）和 OBS 叠加层（assets/puppet/halloween-*.js），
   白曜的立绘代替 VTS 模型：药水、附身在真软件里由 VTS 动皮套，这里照着 prank-vts-core 的动作在立绘上模拟（0.27.3 起绕着脸转、缩）。
   按住画面拖动 = 晃头（真软件里来自 VTS 的头部跟随）。 */
(() => {
  'use strict';
  const C = __req('./halloween-config.cjs'), { createHalloween } = __req('./halloween.cjs');
  const stage = document.getElementById('stage'), cv = document.getElementById('avatar'), g = cv.getContext('2d');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
  const smooth = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const $ = id => document.getElementById(id);

  // ---------------- 立绘（1170×900）和脸上的点（像素） ----------------
  const IMG_H = 900, PIVOT = { x: 545, y: 520 }, FACE = { x: 543, y: 330 };   // FACE：头顶到下巴 0.673 处，和叠加层同一套比例
  const POINTS = { headTop: { x: 543, y: 96 }, chin: { x: 543, y: 443.5 }, mouth: { x: 541, y: 398 }, chest: { x: 545, y: 640 } };
  const img = new Image(); img.src = window.__AVATAR__;
  const tints = new Map();
  function tinted(color) {
    if (tints.has(color) || !img.complete || !img.naturalWidth) return tints.get(color) || null;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    tints.set(color, c); return c;
  }
  let W = 1, H = 1, MIN = 1, dpr = 1;
  function resize() {
    W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight); MIN = Math.min(W, H); dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  }

  // ---------------- 头：拖动 / 使劲甩头（弹簧跟着目标走） ----------------
  const head = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, vt: 0, tx: 0, ty: 0, tt: 0, drag: null, shakeT: -1 };
  function updateHead(s) {
    if (!head.drag) {
      if (head.shakeT >= 0) {
        head.shakeT += s;
        const env = Math.max(0, 1 - head.shakeT / 1.6), w = Math.PI * 2 * 2.6;
        head.tt = 0.5 * Math.sin(w * head.shakeT) * env; head.tx = 130 * Math.sin(w * head.shakeT + Math.PI / 2) * env * MIN / 900; head.ty = 0;
        if (head.shakeT > 1.6) { head.shakeT = -1; head.tt = head.tx = 0; }
      } else head.tx = head.ty = head.tt = 0;
    }
    const k = 260, c = 2 * Math.sqrt(k) * 0.6;
    head.vx += (k * (head.tx - head.x) - c * head.vx) * s; head.vy += (k * (head.ty - head.y) - c * head.vy) * s;
    head.vt += (300 * (head.tt - head.tilt) - 2 * Math.sqrt(300) * 0.55 * head.vt) * s;
    head.x += head.vx * s; head.y += head.vy * s; head.tilt += head.vt * s;
  }

  // ---------------- 假 VTS：照着 0.27.3 prank-vts-core 的药水动作，绕着脸转、缩（脸的位置用 VTS 窗口坐标：x、y 都是 -1…1，y 向上） ----------------
  let motion = null;
  const jitter = (seed, amount) => { const v = Math.sin(seed * 12.9898) * 43758.5453; return ((v - Math.floor(v)) * 2 - 1) * amount; };
  const mix = (a, b, u) => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });
  // 和真软件同一套：停下来的位置要让整个头（头顶、下巴）留在屏幕里（VTS 坐标，转动在像素等比坐标里算）
  function insideOf(F, top) {
    return (target, rot = 0, k = 1) => {
      if (!top) return target;
      const half = [W / 2, H / 2], r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), hx = (top.x - F.x) * half[0], hy = (top.y - F.y) * half[1];
      const ox = k * (hx * c + hy * s) / half[0], oy = k * (-hx * s + hy * c) / half[1], edge = 0.92;
      const fit = (v, o) => { const lo = -edge - Math.min(0, o, -0.486 * o), hi = edge - Math.max(0, o, -0.486 * o); return lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi); };
      return { x: fit(target.x, ox), y: fit(target.y, oy) };
    };
  }
  function poseOf(m, now, F, top) {
    const t = now - m.start, L = m.end - m.start, p = { target: F, rot: 0, k: 1, alpha: 1, tint: null, tintA: 0 }, inside = insideOf(F, top);
    const phase = (inMs = 450, outMs = 450) => Math.min(smooth(t / inMs), smooth((L - t) / outMs)), at = (dx, dy) => ({ x: F.x + dx, y: F.y + dy });
    switch (m.potion || m.kind) {
      case 'possess': { const k = Math.min(smooth(t / 1200), smooth((L - t) / 600)); return { ...p, target: at(0, 0.12 * k), rot: 5 * k * Math.sin(t / 1000 * 2.1), tint: '#96cdff', tintA: 0.55, alpha: 0.67 }; }
      case 'shrink': return { ...p, k: 1 - 0.5 * phase() };
      case 'grow': { const u = phase(); return { ...p, k: 1 + 0.35 * u, target: mix(F, inside(F, 0, 1.35), u) }; }
      case 'flip': { const u = phase(); return { ...p, target: mix(F, inside({ x: F.x, y: -0.45 }, 180), u), rot: 180 * u }; }
      case 'green': return { ...p, tint: '#82ff78', tintA: 0.55 };
      case 'fade': return { ...p, alpha: 0.5 };
      case 'spin': { const turns = Math.max(1, Math.round(L / 1400)); return { ...p, rot: 360 * turns * smooth(t / L) }; }
      case 'bounce': return { ...p, target: at(0, 0.2 * Math.abs(Math.sin(Math.PI * t / 420)) * phase(200, 200)) };
      case 'float': {
        const u = Math.min(smooth(t / 1600), smooth((L - t) / Math.max(600, Math.min(1400, L / 3)))), sky = { x: clamp(F.x * 0.5, -0.5, 0.5), y: 0.42 };
        const rot = 10 * Math.sin(t / 500) * u;
        return { ...p, k: 1 - 0.68 * u, target: mix(F, inside({ x: sky.x + 0.14 * Math.sin(t / 650), y: sky.y + 0.05 * Math.sin(t / 420) }, rot, 0.32), u), rot };
      }
      case 'lie': { const u = phase(), side = F.x >= 0 ? 1 : -1; return { ...p, k: 1 - 0.25 * u, target: mix(F, inside({ x: side * 0.42, y: -0.42 }, side * 90, 0.75), u), rot: side * 90 * u }; }
      case 'teleport': { const hop = Math.floor(t / 850); return { ...p, target: L - hop * 850 < 900 ? F : inside({ x: jitter(hop * 7 + m.seed, 0.6), y: 0.15 + jitter(hop * 13 + m.seed, 0.4) }) }; }
      case 'shake': { const f = Math.floor(t / 40), u = phase(100, 200); return { ...p, target: at(jitter(f, 0.025) * u, jitter(f + 99, 0.02) * u), rot: jitter(f + 7, 4) * u }; }
      case 'rainbow': { const h = (t / 1600) % 1; return { ...p, tint: 'hsl(' + Math.round(h * 360) + ',90%,60%)', tintA: 0.5 }; }
      case 'red': { const f = Math.floor(t / 60), u = phase(100, 200); return { ...p, tint: '#ff5f50', tintA: 0.5, target: at(jitter(f, 0.012) * u, jitter(f + 3, 0.01) * u) }; }
      case 'purple': { const u = phase(600, 600); return { ...p, tint: '#b46eff', tintA: 0.5, target: at(0.04 * Math.sin(t / 900) * u, 0), rot: 8 * Math.sin(t / 600) * u }; }
      case 'gold': return { ...p, tint: '#ffd65a', tintA: 0.55 };
      case 'blink': return { ...p, alpha: Math.floor(t / 220) % 2 ? 1 : 0.12 };
      // 真软件里困困、晕乎乎的低头、闭眼、转头用皮套的脸部参数；立绘做不到，这里用整体歪一点代替
      case 'sleepy': { const nod = Math.max(0, Math.sin(t / 1100 * Math.PI)), u = phase(400, 400); return { ...p, target: at(0, -0.03 * nod * u), rot: (4 * Math.sin(t / 2300) + 5 * nod) * u }; }
      case 'dizzy': { const w = t / 1000 * 4.2, u = phase(400, 400); return { ...p, rot: (7 * Math.sin(w * 0.5) + 6 * Math.cos(w)) * u }; }
      case 'wind': { const gust = (0.5 + 0.5 * Math.sin(t / 650)) * phase(500, 500); return { ...p, target: at(0.06 * gust, 0), rot: -9 * gust }; }
      default: return p;   // 只画在 OBS 上的药水（南瓜头、冒烟、泡泡、爱心眼）不动皮套
    }
  }
  function currentPose(now, F, top) {
    const rest = { target: F, rot: 0, k: 1, alpha: 1, tint: null, tintA: 0 };
    if (!motion) return rest;
    if (now >= motion.end + 400) { motion = null; return rest; }
    const p = poseOf(motion, Math.min(now, motion.end), F, top);
    if (now <= motion.end) return p;
    const k = smooth((now - motion.end) / 350);   // 最后剩的一点回到原样（真软件里是 0.35 秒）
    return { ...p, target: mix(p.target, F, k), rot: lerp(((p.rot % 360) + 540) % 360 - 180, 0, k), k: lerp(p.k, 1, k), alpha: lerp(p.alpha, 1, k), tintA: lerp(p.tintA, 0, k) };
  }
  const startMotion = (kind, potion, ms) => { const now = performance.now(); motion = { kind, potion, start: now, end: now + ms, seed: Math.random() * 1000, side: Math.random() < 0.5 ? -1 : 1 }; };
  const stopMotion = () => { if (motion) motion.end = Math.min(motion.end, performance.now()); };

  // ---------------- 立绘画到画面上，同时算出给叠加层的定位点（和真软件一样按画面比例） ----------------
  let anchors = {}, framing = 'big';
  function render(now) {
    resize();
    const s = (0.66 * MIN) / IMG_H;
    // 平常的样子（拖动晃头）；药水绕着脸转、缩：先算出脸现在在哪，再按「脸要去哪、转多少、缩几倍」摆
    // 立绘「放大」= 像直播里那样只露上半身：脸在画面上方 40% 处，皮套中心在屏幕下面很远（正是 0.27.1 出问题的摆法）
    const m0 = framing === 'big'
      ? new DOMMatrix().translate(W * 0.5 + head.x, H * 0.4 + head.y).rotate((head.tilt * 180) / Math.PI).scale(s * 2.4, s * 2.4).translate(-FACE.x, -FACE.y)
      : new DOMMatrix().translate(W * 0.5 + head.x, H - (IMG_H - PIVOT.y) * s + head.y).rotate((head.tilt * 180) / Math.PI).scale(s, s).translate(-PIVOT.x, -PIVOT.y);
    const f0 = m0.transformPoint(new DOMPoint(FACE.x, FACE.y)), F = { x: (f0.x / W) * 2 - 1, y: 1 - (f0.y / H) * 2 };
    const t0 = m0.transformPoint(new DOMPoint(POINTS.headTop.x, POINTS.headTop.y)), top = { x: (t0.x / W) * 2 - 1, y: 1 - (t0.y / H) * 2 };
    const p = currentPose(now, F, top), tx = ((p.target.x + 1) / 2) * W, ty = ((1 - p.target.y) / 2) * H;
    const m = new DOMMatrix().translate(tx, ty).rotate(p.rot).scale(p.k, p.k).translate(-f0.x, -f0.y).multiply(m0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    if (img.complete && img.naturalWidth && p.alpha > 0.01) {
      g.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
      g.globalAlpha = p.alpha; g.drawImage(img, 0, 0);
      const tint = p.tint && p.tintA > 0.01 ? tinted(p.tint) : null;
      if (tint) { g.globalAlpha = p.alpha * p.tintA; g.drawImage(tint, 0, 0); }
      g.globalAlpha = 1;
    }
    const deg = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    anchors = Object.fromEntries(Object.entries(POINTS).map(([name, q]) => { const x = m.a * q.x + m.c * q.y + m.e, y = m.b * q.x + m.d * q.y + m.f; return [name, { x: x / W, y: y / H, angle: -deg, scale: 1 }]; }));
  }

  // ---------------- OBS 叠加层（真的那一套）和声音 ----------------
  let audio = null;
  function wakeAudio() {
    if (audio) { if (audio.context.state === 'suspended') audio.context.resume(); return; }
    try { const context = new AudioContext(), output = context.createDynamicsCompressor(); output.connect(context.destination); audio = { context, output }; } catch { audio = null; }
  }
  addEventListener('pointerdown', wakeAudio, { capture: true });
  const fx = BaiyaoHalloween.create({ mount: stage, viewport: () => ({ width: W, height: H }), resolve: name => anchors[name] || null, sound: BaiyaoHalloweenSound.create({ audio: () => audio }) });

  // ---------------- 控制器（真的那一套）+ 一个小调度器：附身和药水一个一个来，和真软件同样的接触时刻 ----------------
  let config = C.normalizeHalloween({ enabled: true, potionSec: 6, possessSec: 6 });
  const artStore = new Map();
  let queue = [], busyUntil = 0, timers = [];
  const RUN = 'trial', CONTACT = { possess: 1200, potion: 750 };
  function runNext() {
    if (performance.now() < busyUntil || !queue.length) return;
    const it = queue[0];
    it.left--; if (it.left <= 0) queue.shift();
    const potion = it.kind === 'potion' ? (it.potions?.length ? it.potions[Math.floor(Math.random() * it.potions.length)] : 'shrink') : null;
    const contact = CONTACT[it.kind], now = Date.now(), plan = { startAt: now, contactAt: [now + contact], endAt: now + contact + it.durationMs };
    fx.handle({ kind: it.kind, name: it.name, ...(potion ? { potion } : {}), ...(it.ghosts ? { ghosts: it.ghosts } : {}) }, plan);
    if (it.kind === 'possess' || C.VTS_POTIONS.includes(potion)) timers.push(setTimeout(() => startMotion(it.kind, potion, it.durationMs), contact));
    busyUntil = performance.now() + contact + it.durationMs + 450;
    timers.push(setTimeout(runNext, contact + it.durationMs + 460));
  }
  const h = createHalloween({
    publish: (_run, payload) => fx.handle(payload, null),
    schedule: (_run, intent) => { queue.push({ ...intent, left: intent.count || 1 }); runNext(); },
    clearScheduled: kinds => { const before = queue.length; queue = queue.filter(q => !kinds.includes(q.kind)); return before - queue.length; },
    cancelVts: () => stopMotion(),
    getConfig: () => config,
    vtsReady: () => true,
    queued: () => queue.filter(q => q.kind === 'possess').reduce((a, q) => a + q.left, 0),
    towerArt: { read: key => artStore.get(key) || '' },
  });

  // ---------------- 按钮 ----------------
  let count = 1;
  const play = kind => { wakeAudio(); try { h.simulate(RUN, { kind, count }); } catch (error) { $('status').textContent = error.message; } };
  const button = (parent, label, onClick, extra = '') => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = label; if (extra) b.className = extra; b.addEventListener('click', onClick); parent.append(b); return b; };
  const countButtons = [1, 5, 20].map(n => button($('counts'), '×' + n, () => { count = n; countButtons.forEach((b, i) => b.classList.toggle('on', [1, 5, 20][i] === n)); }));
  countButtons[0].classList.add('on');
  for (const t of config.tiers) button($('tiers'), '试玩：' + t.name, () => play('tier:' + t.id), 'tier');
  for (const [kind, label] of [['tower', '南瓜叠叠乐'], ['flood', '南瓜淹没'], ['ghost', '小幽灵'], ['mummy', '木乃伊'], ['bats', '蝙蝠倒挂'], ['scare', '吓飞蝙蝠'], ['candy', '送糖']]) button($('tricks'), label, () => play(kind));
  for (const [group, label] of Object.entries(C.POTION_GROUPS)) {
    const list = C.POTION_LIST.filter(p => p.group === group), free = list.every(p => !p.vts);
    const title = document.createElement('h3'); title.innerHTML = label + (free ? '<span class="vts free">不用 VTS</span>' : '<span class="vts">真软件里要 VTS</span>');
    const row = document.createElement('div'); row.className = 'row';
    $('potions').append(title, row);
    for (const p of list) { const b = button(row, p.label, () => play('potion:' + p.id)); b.title = p.note; }
  }
  $('shake').addEventListener('click', () => { head.shakeT = 0; });
  $('clear').addEventListener('click', () => { for (const t of timers) clearTimeout(t); timers = []; queue = []; busyUntil = 0; motion = null; h.reset(RUN); fx.clear(); });
  $('frame').addEventListener('change', e => { framing = e.target.value; });
  $('bg').addEventListener('change', e => { stage.classList.toggle('checker', e.target.value === 'checker'); stage.classList.toggle('light', e.target.value === 'light'); });

  // ---------------- 叠南瓜换成自己的图（和设置页同样处理：裁透明边、缩到 512 像素、转 PNG） ----------------
  async function toPng(file) {
    const bitmap = await createImageBitmap(file);
    const k = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height)), w = Math.max(1, Math.round(bitmap.width * k)), hh = Math.max(1, Math.round(bitmap.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d'); x.drawImage(bitmap, 0, 0, w, hh); bitmap.close?.();
    const d = x.getImageData(0, 0, w, hh).data; let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let xx = 0; xx < w; xx++) if (d[(y * w + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) throw Error('这张图是全透明的');
    const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1; out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }
  async function keyOf(url) { const bytes = new TextEncoder().encode(url), hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function setArt(patch) { config = C.normalizeHalloween({ ...config, towerArt: { ...config.towerArt, ...patch } }); $('art-on').checked = config.towerArt.on; $('art-on').disabled = !config.towerArt.images.length; }
  $('art-file').addEventListener('change', async e => {
    const images = [...config.towerArt.images];
    for (const file of [...e.target.files]) {
      try {
        const url = await toPng(file), key = await keyOf(url);
        if (artStore.has(key)) continue;
        artStore.set(key, url); images.push({ key, name: file.name.replace(/\.[^.]+$/, '').slice(0, 30) });
        const f = document.createElement('figure'), im = document.createElement('img'), cap = document.createElement('figcaption');
        im.src = url; cap.textContent = file.name; f.append(im, cap); $('art-list').append(f);
      } catch (error) { $('status').textContent = file.name + '：' + error.message; }
    }
    e.target.value = '';
    setArt({ on: images.length > 0, images });
  });
  $('art-on').addEventListener('change', e => setArt({ on: e.target.checked }));

  // ---------------- 拖动 = 晃头 ----------------
  stage.addEventListener('pointerdown', e => { head.drag = { x: e.clientX, y: e.clientY }; stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!head.drag) return; const dx = e.clientX - head.drag.x, dy = e.clientY - head.drag.y; head.tx = clamp(dx, -0.35 * W, 0.35 * W); head.ty = clamp(dy * 0.5, -0.08 * H, 0.1 * H); head.tt = clamp(dx / 800, -0.42, 0.42); });
  const release = () => { head.drag = null; head.tx = head.ty = head.tt = 0; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);

  // ---------------- 帧循环 + 状态 ----------------
  let last = performance.now();
  function frame(now) {
    const s = Math.min(0.05, (now - last) / 1000); last = now;
    updateHead(s); render(now); fx.poke();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setInterval(() => {
    const st = h.status(RUN), potions = queue.filter(q => q.kind === 'potion').reduce((a, q) => a + q.left, 0), possess = queue.filter(q => q.kind === 'possess').reduce((a, q) => a + q.left, 0);
    $('status').textContent = '小幽灵 ' + st.ghosts + '/' + st.ghostNeed + ' · 南瓜桶 ' + st.candy + '/' + st.bucket + ' 颗糖 · 保护罩' + (st.shieldLeftMs > 0 ? '还剩 ' + Math.ceil(st.shieldLeftMs / 1000) + ' 秒' : '没开') + (potions || possess ? ' · 排队：药水 ' + potions + '、附身 ' + possess : '');
  }, 300);
  window.__trial = { h, fx, config: () => config, anchors: () => anchors, queue: () => queue };
})();
