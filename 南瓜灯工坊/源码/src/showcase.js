// 灯展（位置、长度、大小可以在「摆位置」里拖）：小车送达的灯不会没了——
// 车开走以后，这一车灯先在画面中间亮一下、报名字（送达！），再一盏盏飞上去，挂到顶上的一串灯上，每盏有头像和名字。
// 今晚送出的灯都在这串上（最新的在右边）：挂不下的，拖着灯串左右滚着看；按住一盏能拎起来看大的，松手挂回去。
import { renderLantern } from './lantern-art.js';
import { widgetRects } from './widgets.js';
import { drawAvatar, avatarFrame } from './avatars.js';
import { clamp, lerp, easeInOut, easeOut } from './tween.js';

const REVEAL = 1.5;   // 送达：在画面中间亮多久
const FLY = 0.7;
const LIFT = 1.9;     // 拎起来放大几倍

export function createShowcase(world) {
  let L = null, reveal = null, off = 0, offTarget = null, vel = 0, drag = null, lifted = null, back = null;
  const hidden = new Set();   // 已经记进灯展、但还在「送达」或飞上去途中的（灯串上先不画）
  const swing = new Map();    // id → 挂上去 / 放回去的时间（晃一下）
  const rect = () => widgetRects(L, world.settings()).garland;
  const on = () => world.settings().show?.garland !== false;
  const sprite = (l, size) => world.sprite('G|' + l.id + '|' + Math.round(size * world.dpr()), () => renderLantern({ cuts: l.cuts, lit: true, lid: true, name: '' }, size * world.dpr()));

  /** 灯串的几何：每盏多大、间距、一次露出几盏、第 v 个位置在哪。 */
  function geo() {
    const r = rect(), size = r.h * 0.6, sp = size * 0.92, pad = sp * 0.2;
    const k = Math.max(1, Math.floor((r.w - pad * 2) / sp));
    const ropeY = r.y + r.h * 0.17, x0 = r.x + pad + (r.w - pad * 2 - sp * k) / 2;
    return { r, size, sp, pad, k, ropeY, hangY: ropeY + r.h * 0.07, at: v => x0 + sp * (v + 0.5) };
  }
  const listed = () => world.game.state.shown.filter(l => !hidden.has(l.id));
  const maxOff = (G, n) => Math.max(0, n - G.k);
  /** 第 j 盏（0 = 最早）现在在灯串上的第几个位置（可以是小数，滚动的时候） */
  // 不滚的时候最新的那盏在最右边；挂不满时整串靠右；off 往右拖多少格，就往回翻多少盏
  const place = (G, n, j) => j - (n - G.k) + off;

  /** 小车开走了：这一车灯先亮相，再挂上去；灯串滚回最新那头。 */
  function deliver(lanterns, t) {
    if (!L || !lanterns.length || !on()) return;
    for (const l of lanterns) hidden.add(l.id);
    reveal = { list: lanterns, t0: t + 0.45 };
    offTarget = 0;
  }

  // ---------- 鼠标：拎灯 / 拖灯串 ----------
  function pointerDown(x, y, t) {
    if (!L || !on() || reveal) return false;
    const G = geo(), r = G.r;
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h + G.size * 0.2) return false;
    const list = listed(), n = list.length;
    for (let j = n - 1; j >= 0; j--) {
      const v = place(G, n, j);
      if (v < -0.4 || v > G.k - 0.6) continue;
      const cx = G.at(v), cy = G.hangY + G.size * 0.5;
      if (Math.hypot(x - cx, y - cy) < G.size * 0.45) {
        lifted = { l: list[j], x, y, ang: 0, w: 0, px: x, t };
        world.audio.play('open');
        return true;
      }
    }
    if (n > G.k) { drag = { x0: x, off0: off, lx: x, lt: t }; vel = 0; offTarget = null; return true; }
    return false;
  }
  function pointerMove(x, y, t) {
    if (lifted) { lifted.x = x; lifted.y = y; return true; }
    if (!drag) return false;
    const G = geo(), n = listed().length;
    off = clamp(drag.off0 + (x - drag.x0) / G.sp, 0, maxOff(G, n));
    const dt = Math.max(1 / 120, t - drag.lt);
    vel = vel * 0.6 + ((x - drag.lx) / G.sp / dt) * 0.4;
    drag.lx = x; drag.lt = t;
    return true;
  }
  function pointerUp(x, y, t) {
    if (lifted) {
      back = { l: lifted.l, x: lifted.x, y: lifted.y, ang: lifted.ang, t0: t };
      lifted = null;
      return true;
    }
    if (drag) { drag = null; return true; }
    return false;
  }

  function update(t, dt) {
    if (!L || !on()) return false;
    let moving = false;
    const G = geo(), n = listed().length;
    if (reveal) {
      moving = true;
      const end = reveal.t0 + REVEAL + FLY + 0.06 * reveal.list.length;
      reveal.list.forEach((l, i) => { if (hidden.has(l.id) && t >= reveal.t0 + REVEAL + FLY + 0.06 * i) { hidden.delete(l.id); swing.set(l.id, t); world.audio.play('land'); } });
      if (t >= end) reveal = null;
    }
    if (offTarget !== null) { off += (offTarget - off) * Math.min(1, dt * 6); if (Math.abs(offTarget - off) < 0.01) { off = offTarget; offTarget = null; } moving = true; }
    else if (!drag && Math.abs(vel) > 0.05) { off = clamp(off + vel * dt, 0, maxOff(G, n)); vel *= Math.exp(-4 * dt); moving = true; }
    off = clamp(off, 0, maxOff(G, n));
    if (lifted) {   // 拎着：灯挂在手指下面像钟摆一样晃
      const ax = (lifted.x - lifted.px) / Math.max(dt, 1 / 120);
      lifted.w += (-ax * 0.0006 - lifted.ang * 40 - lifted.w * 5) * dt;
      lifted.ang = clamp(lifted.ang + lifted.w * dt, -0.8, 0.8);
      lifted.px = lifted.x;
      moving = true;
    }
    if (back && t - back.t0 > 0.45) { swing.set(back.l.id, t); back = null; world.audio.play('land'); }
    if (back) moving = true;
    for (const [id, s] of swing) { if (t - s < 1) moving = true; else swing.delete(id); }
    return moving || !!drag;
  }

  // ---------- 画 ----------
  function drawRope(g, G) {
    const { r, ropeY } = G, frac = off - Math.floor(off);
    g.save();
    g.beginPath(); g.rect(r.x, r.y - r.h * 0.1, r.w, r.h * 1.2); g.clip();
    g.beginPath();
    g.moveTo(r.x, ropeY);
    for (let v = -2; v <= G.k + 1; v++) { const cx = G.at(v + frac); g.lineTo(cx - G.sp / 2, ropeY); g.quadraticCurveTo(cx, ropeY + r.h * 0.14, cx + G.sp / 2, ropeY); }
    g.lineTo(r.x + r.w, ropeY);
    g.lineWidth = Math.max(2, r.h * 0.022); g.strokeStyle = '#5A3A22'; g.stroke();
    g.lineWidth = Math.max(1, r.h * 0.008); g.strokeStyle = 'rgba(255,220,160,.5)'; g.stroke();
    g.restore();
    for (const px of [r.x + r.h * 0.03, r.x + r.w - r.h * 0.03]) { g.beginPath(); g.arc(px, ropeY, r.h * 0.03, 0, Math.PI * 2); g.fillStyle = '#C9873B'; g.fill(); g.strokeStyle = '#5A3A22'; g.lineWidth = Math.max(1, r.h * 0.01); g.stroke(); }
  }

  function nameTag(g, text, x, y, fs) {
    let t = text;
    g.font = `800 ${Math.round(fs)}px "Microsoft YaHei",sans-serif`;
    while (g.measureText(t).width > fs * 4.6 && t.length > 1) t = t.slice(0, -1);
    if (t !== text) t = t.slice(0, -1) + '…';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = fs * 0.32; g.strokeStyle = '#3A1E0C'; g.strokeText(t, x, y);
    g.fillStyle = '#FFF1D8'; g.fillText(t, x, y);
  }

  /** 一盏挂着的灯：线、灯、右下角头像、底下名字。原点在挂点。 */
  function drawHung(g, l, size, fs, wake) {
    g.strokeStyle = '#5A3A22'; g.lineWidth = Math.max(1, size * 0.016);
    g.beginPath(); g.moveTo(0, -size * 0.04); g.lineTo(0, size * 0.03); g.stroke();
    g.drawImage(sprite(l, size), -size / 2, -size * 0.01, size, size);
    drawAvatar(g, l, size * 0.3, size * 0.74, size * 0.13, wake);
    nameTag(g, l.nick, 0, size * 0.99, fs);
  }

  function pill(g, text, x, y, fs, align) {
    g.save();
    g.font = `900 ${Math.round(fs)}px "Microsoft YaHei",sans-serif`;
    const tw = g.measureText(text).width + fs * 1.2, left = align === 'right' ? x - tw : x;
    g.restore();
    drawPill(g, text, left, y, fs, tw);
    return tw;
  }
  function drawPill(g, text, left, y, fs, tw) {
    g.save();
    g.font = `900 ${Math.round(fs)}px "Microsoft YaHei",sans-serif`;
    g.fillStyle = 'rgba(58,28,12,.82)';
    g.beginPath(); g.roundRect ? g.roundRect(left, y, tw, fs * 1.5, fs * 0.75) : g.rect(left, y, tw, fs * 1.5); g.fill();
    g.fillStyle = '#FFD45C'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, left + tw / 2, y + fs * 0.78);
    g.restore();
  }

  function draw(g, t, editing = false) {
    avatarFrame();   // 这一帧画到的头像算「正在用」；不显示的过一会儿就删
    if (!L || !on()) return;
    const G = geo(), list = listed(), n = list.length, wake = () => world.wake();
    if (!n && !reveal && !editing) return;
    drawRope(g, G);
    const fs = G.r.h * 0.105;
    g.save();
    g.beginPath(); g.rect(G.r.x, G.r.y - G.r.h * 0.1, G.r.w, G.r.h * 1.3); g.clip();
    list.forEach((l, j) => {
      if (lifted?.l === l || back?.l === l) return;
      const v = place(G, n, j);
      if (v < -0.8 || v > G.k - 0.2) return;
      const edge = v < 0 ? 1 + v / 0.8 : v > G.k - 1 ? (G.k - 0.2 - v) / 0.8 : 1;
      const s0 = swing.get(l.id), sw = s0 !== undefined && t - s0 < 1 ? Math.sin((t - s0) * 14) * 0.25 * Math.exp(-4 * (t - s0)) : 0;
      g.save();
      g.globalAlpha = clamp(edge, 0, 1);
      g.translate(G.at(v), G.hangY);
      g.rotate(sw);
      drawHung(g, l, G.size, fs, wake);
      g.restore();
    });
    g.restore();
    // 顶上一排：右边「今晚送出 N 盏」，左边「◀ 还有 N 盏」（往右拖能翻到更早的），翻过去了再加一个「最新的 ▶」
    const total = world.game.state.shipped, older = Math.round(maxOff(G, n) - off), newer = Math.round(off), small = G.r.h * 0.1;
    let right = G.r.x + G.r.w;
    if (total > 0 || editing) right -= pill(g, '今晚送出 ' + total + ' 盏', right, G.r.y, small, 'right') + small * 0.5;
    if (newer > 0) pill(g, '最新的 ▶', right, G.r.y, small, 'right');
    if (older > 0) pill(g, '◀ 还有 ' + older + ' 盏（往右拖）', G.r.x + G.r.h * 0.08, G.r.y, small, 'left');
    if (editing && !n) {   // 摆位置时灯串是空的：画几盏淡淡的占位
      g.save(); g.globalAlpha = 0.35;
      for (let i = 0; i < Math.min(G.k, 4); i++) { const x = G.at(G.k - 1 - i); g.fillStyle = '#FF9F43'; g.beginPath(); g.ellipse(x, G.hangY + G.size * 0.55, G.size * 0.4, G.size * 0.33, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    // 放回去的路上
    if (back) {
      const j = list.indexOf(back.l), v = j >= 0 ? place(G, n, j) : G.k - 1, k = clamp((t - back.t0) / 0.45, 0, 1), e = easeInOut(k);
      const sc = lerp(LIFT, 1, e), x = lerp(back.x, G.at(v), e), y = lerp(back.y, G.hangY, e);
      g.save(); g.translate(x, y); g.rotate(back.ang * (1 - e)); g.scale(sc, sc);
      drawHung(g, back.l, G.size, fs, wake);
      g.restore();
    }
    if (lifted) {   // 拎起来：放大，名字和头像也大
      g.save(); g.translate(lifted.x, lifted.y); g.rotate(lifted.ang); g.scale(LIFT, LIFT);
      const gl = g.createRadialGradient(0, G.size * 0.5, 0, 0, G.size * 0.5, G.size * 0.75);
      gl.addColorStop(0, 'rgba(255,200,90,.35)'); gl.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = gl; g.fillRect(-G.size, -G.size * 0.3, G.size * 2, G.size * 1.6);
      drawHung(g, lifted.l, G.size, fs, wake);
      g.restore();
    }
    if (reveal) drawReveal(g, t, G);
  }

  /** 送达：一排灯在画面中间亮一下、写名字和头像，然后飞上灯串（最新的挂在最右边）。 */
  function drawReveal(g, t, G) {
    const { list, t0 } = reveal;
    if (t < t0) return;
    const n = Math.min(list.length, 8), S = Math.min(L.m * 0.17, (L.W * 0.8) / n), y = L.H * 0.58, total = S * 0.9 * n;
    const titleK = clamp((t - t0) / 0.3, 0, 1), wake = () => world.wake();
    if (t < t0 + REVEAL + 0.2) {
      g.save();
      g.globalAlpha = titleK;
      g.font = `900 ${Math.round(L.m * 0.05)}px "Microsoft YaHei",sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = L.m * 0.012; g.strokeStyle = '#3A1E0C'; g.strokeText('送达！挂上灯展', L.W / 2, y - S * 0.75);
      g.fillStyle = '#FFD45C'; g.fillText('送达！挂上灯展', L.W / 2, y - S * 0.75);
      g.restore();
    }
    const all = world.game.state.shown, nAll = all.length;
    list.slice(0, n).forEach((l, i) => {
      const pop = clamp((t - t0 - i * 0.08) / 0.35, 0, 1);
      if (pop <= 0) return;
      const x0 = L.W / 2 - total / 2 + S * 0.9 * (i + 0.5), y0 = y;
      const flyK = clamp((t - (t0 + REVEAL + 0.06 * i)) / FLY, 0, 1), e = easeInOut(flyK);
      const j = all.indexOf(l), v = j - (nAll - Math.min(nAll, G.k)) + (nAll < G.k ? G.k - nAll : 0);
      const x = lerp(x0, G.at(v), e), yy = lerp(y0, G.hangY + G.size * 0.45, e) - Math.sin(flyK * Math.PI) * L.m * 0.08;
      const size = lerp(S, G.size, e) * (pop < 1 ? easeOut(pop) * 1.1 : 1);
      g.save();
      g.translate(x, yy);
      if (flyK <= 0) { const gl = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.8); gl.addColorStop(0, 'rgba(255,200,90,.45)'); gl.addColorStop(1, 'rgba(255,150,40,0)'); g.fillStyle = gl; g.fillRect(-size, -size, size * 2, size * 2); }
      g.drawImage(sprite(l, S), -size / 2, -size * 0.5, size, size);
      if (flyK < 0.3) {
        g.globalAlpha = 1 - flyK / 0.3;
        drawAvatar(g, l, size * 0.3, size * 0.25, size * 0.13, wake);
        nameTag(g, l.nick, 0, size * 0.52, Math.max(L.m * 0.022, size * 0.12));
      }
      g.restore();
    });
    if (list.length > n && t < t0 + REVEAL) {
      g.save();
      g.font = `800 ${Math.round(L.m * 0.03)}px "Microsoft YaHei",sans-serif`;
      g.textAlign = 'center'; g.fillStyle = '#FFF1D8'; g.lineWidth = L.m * 0.008; g.strokeStyle = '#3A1E0C';
      g.strokeText('等 ' + list.length + ' 盏', L.W / 2, y + S * 0.75); g.fillText('等 ' + list.length + ' 盏', L.W / 2, y + S * 0.75);
      g.restore();
    }
  }

  function info() {
    if (!L) return null;
    const G = geo(), list = listed(), n = list.length;
    return { count: n, visible: G.k, off, lanterns: list.map((l, j) => ({ nick: l.nick, x: G.at(place(G, n, j)), y: G.hangY + G.size * 0.5 })).filter(p => p.x > G.r.x && p.x < G.r.x + G.r.w), rect: G.r, lifted: !!lifted };
  }
  function clear() { reveal = null; hidden.clear(); swing.clear(); off = 0; offTarget = null; vel = 0; drag = null; lifted = null; back = null; }

  return { deliver, update, draw, pointerDown, pointerMove, pointerUp, info, clear, relayout: next => { L = next; }, get busy() { return !!reveal; }, get grabbing() { return !!(drag || lifted); } };
}
