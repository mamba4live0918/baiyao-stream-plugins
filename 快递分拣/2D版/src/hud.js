/* 画面上的 HTML 部件：观众署名标签、分错的 ×2 大字、计数牌、桶上的数字、车上件数、识别台提示、拿着的垃圾名字、互动说明牌 */
import { G, toScreen, truckTop } from './state.js';
import { EFF, effLabel, resolveEffect } from './modes.js';
import { findTier } from './tiers.js';
import { GARBAGE_BY_ID } from './garbage-catalog.js';
import { segsEnd } from './timed.js';
import { statsLine, topStumper } from './mistake.js';
import { curLevel, curLevels, curIdx, remaining, auditNow } from './levels.js';
import { $, clamp, fmtT } from './util.js';

export const ICONS = {
  truck: '<svg viewBox="0 0 16 16"><path d="M1 4h8v7H1zM9 7h3l3 3v1H9z" fill="#fff"/><circle cx="4" cy="12.5" r="1.6" fill="#fff"/><circle cx="12" cy="12.5" r="1.6" fill="#fff"/></svg>',
  big: '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v8l-6 3-6-3V4z" fill="#fff"/><path d="M2 4l6 3 6-3M8 7v8" stroke="#8b5a2b" stroke-width="1.2" fill="none"/></svg>',
  tape: '<svg viewBox="0 0 16 16"><circle cx="7" cy="8" r="5" stroke="#fff" stroke-width="2.4" fill="none"/><path d="M11 12h4" stroke="#fff" stroke-width="2.4"/></svg>',
  kick: '<svg viewBox="0 0 16 16"><path d="M3 2h4v6l5 2c2 1 2 4 0 4H3z" fill="#fff"/></svg>',
  help: '<svg viewBox="0 0 16 16"><path d="M8 14S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 8-6 8z" fill="#fff"/></svg>',
  blind: '<svg viewBox="0 0 16 16"><path d="M2 5h12v9H2z" fill="#fff"/><path d="M1 3h14v3H1z" fill="#fff" opacity=".7"/><text x="8" y="12.5" font-size="8" font-weight="900" text-anchor="middle" fill="#8b5a2b">?</text></svg>',
  seal: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="#fff"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  speed: '<svg viewBox="0 0 16 16"><path d="M9 1L3 9h4l-1 6 6-8H8z" fill="#fff"/></svg>',
  leak: '<svg viewBox="0 0 16 16"><path d="M8 2s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8z" fill="#fff"/></svg>',
  strip: '<svg viewBox="0 0 16 16"><text x="8" y="13" font-size="13" font-weight="900" text-anchor="middle" fill="#fff">?</text></svg>',
  full: '<svg viewBox="0 0 16 16"><path d="M8 3v6M8 12v1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  wrong: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
  audit: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2" stroke="#fff" stroke-width="2.2" fill="none"/><path d="M10.2 10.2l3.6 3.6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  tricky: '<svg viewBox="0 0 16 16"><path d="M4 5.2a1.8 1.8 0 1 1 2.4-1.7L9.6 6.7a1.8 1.8 0 1 1 1.7 2.4 1.8 1.8 0 1 1-1.7 2.4L6.4 8.3A1.8 1.8 0 1 1 4 5.2z" fill="#fff"/></svg>',
  prank: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="4.6" fill="#fff"/><path d="M3.5 5L5 2.5 6.5 4.8M12.5 5L11 2.5 9.5 4.8" fill="#fff"/><path d="M5.8 9.2l1.4.6M10.2 9.2l-1.4.6" stroke="#c8372d" stroke-width="1.4" stroke-linecap="round"/></svg>',
};
export const ICBG = { wrong: '#d4382c', audit: '#c0392b', tricky: '#8a6a2e', prank: '#b8322a', truck: '#e0703a', big: '#8b5a2b', blind: '#b0642a', seal: '#7a5bd0', speed: '#d9811c', leak: '#2c7fb8', strip: '#8a6a4a', tape: '#4f95b8', kick: '#c8372d', help: '#2f9a74', full: '#6b737a' };

export function toast(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600); }

/* ---------- 露头圆（画面像素） ---------- */
export const headCircle = () => ({ cx: G.S.layout.head.x / 100 * G.W, cy: G.S.layout.head.y / 100 * G.H, r: G.S.layout.head.r / 100 * G.H });
/* DOM 标签避开露头圆：中心落在圆里就沿径向推到圆外 */
export function avoidHead(x, y, h) {
  if (!G.S.layout.head.on) return [x, y];
  const c = headCircle(), dx = x - c.cx, dy = y - h / 2 - c.cy, d = Math.hypot(dx, dy), need = c.r + h / 2 + 6;
  if (d >= need) return [x, y];
  const ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 1;
  return [c.cx + ux * need, c.cy + uy * need + h / 2];
}

/* ---------- 署名标签 ---------- */
export const tags = [];
let tagK = 1;
export function addTag(key, kind, name, textFn, anchor, add, life = 3.6) {
  let t = tags.find(t => t.key === key && t.life > 0);
  if (t) { t.count += add; t.life = Math.max(t.life, life); if (anchor) t.anchor = anchor; t.el.classList.remove('pop'); void t.el.offsetWidth; t.el.classList.add('pop'); }
  else {
    const el = document.createElement('div'); el.className = 'tag in';
    el.innerHTML = `<span class="ic" style="background:${ICBG[kind]}">${ICONS[kind]}</span><span><b></b> <span class="tx"></span></span>`;
    $('tags').appendChild(el);
    t = { key, kind, name, textFn, anchor, count: add, life, el }; tags.push(t);
  }
  t.el.querySelector('b').textContent = t.name; t.el.querySelector('.tx').textContent = t.textFn(t.count);
  return t;
}
export function setTagName(t, name) { t.name = name; t.el.querySelector('b').textContent = name; }
export function updTags(dt) {
  const placed = [], bd = $('board');
  if (bd && !bd.hidden && !bd.classList.contains('off')) { const r = bd.getBoundingClientRect(); placed.push({ x: r.left + r.width / 2, y: r.bottom, w: r.width, h: r.height }); }
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i]; t.life -= dt;
    if (t.life <= 0) { t.el.remove(); tags.splice(i, 1); continue; }
    t.el.querySelector('.tx').textContent = t.textFn(t.count);
    if (t.nameFn) { const nm = t.nameFn(), b = t.el.querySelector('b'); if (b.textContent !== nm) b.textContent = nm; }
    const a = typeof t.anchor === 'function' ? t.anchor() : t.anchor; if (!a) continue;
    const s = toScreen(a), w = (t.el.offsetWidth || 160) * tagK, h = (t.el.offsetHeight || 36) * tagK;
    let x = clamp(s.x, w / 2 + 8, G.W - w / 2 - 8), y = clamp(s.y, h + 8, G.H - 8);
    for (let k = 0; k < 8; k++) { const hit = placed.find(r => Math.abs(r.x - x) < (r.w + w) / 2 + 6 && Math.abs((r.y - r.h / 2) - (y - h / 2)) < (r.h + h) / 2 + 4); if (!hit) break; y = hit.y + h + 6; }
    [x, y] = avoidHead(x, y, h); x = clamp(x, w / 2 + 8, G.W - w / 2 - 8); y = clamp(y, h + 8, G.H - 8);
    placed.push({ x, y, w, h });
    // 位置用 translate 属性，居中和缩放放在 transform 里；跳动动画只改 scale 属性，以锚点为中心，不会把标签带跑
    t.el.style.translate = `${x}px ${y}px`; t.el.style.transform = `scale(${tagK}) translate(-50%,-100%)`; t.el.style.opacity = G.S.layout.tags.on ? Math.min(1, t.life / .4) : 0;
  }
}
export function clearTags() { for (const t of tags) t.el.remove(); tags.length = 0; }

/* ---------- 分错的 ×2 / ×3 大字：按游戏时钟逐帧驱动，暂停、逐帧录像都对得上 ---------- */
const pops = [];
export function multPop(p, mult) {
  const el = document.createElement('span');
  el.className = 'multpop' + (mult >= 3 ? ' x3' : ''); el.textContent = '×' + mult; $('hud').append(el);
  pops.push({ el, a: { x: p.x, y: p.y + .4 }, t: 0 });
}
export function updPops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const o = pops[i]; o.t += dt; const k = o.t / 1.1;
    if (k >= 1) { o.el.remove(); pops.splice(i, 1); continue; }
    const sp = toScreen(o.a), grow = k < .18 ? .3 + k / .18 * .95 : k < .35 ? 1.25 - (k - .18) / .17 * .25 : 1;
    const rise = k < .18 ? 10 - k / .18 * 16 : -6 - (k - .18) / .82 * 46, op = k < .1 ? k / .1 : k > .75 ? 1 - (k - .75) / .25 : 1;
    o.el.style.transform = `translate(${sp.x}px,${sp.y + rise * tagK}px) translate(-50%,-50%) scale(${grow * tagK})`; o.el.style.opacity = op;
  }
}
export const popCount = () => pops.length;
export function clearPops() { for (const o of pops) o.el.remove(); pops.length = 0; }

/* ---------- 计数牌 ---------- */
let prevRemain = -1, prevDeliv = -1;
export function refreshHud(force) {
  const r = remaining();
  if (r !== prevRemain || force) { const el = $('remain'); el.textContent = r; if (prevRemain >= 0 && !force) { el.className = 'num ' + (r > prevRemain ? 'up' : 'down'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); clearTimeout(el._t); el._t = setTimeout(() => el.className = 'num', 700); } prevRemain = r; }
  if (G.delivered !== prevDeliv || force) { $('deliv').textContent = G.delivered; prevDeliv = G.delivered; }
  const L = curLevel(), lv = `第 ${curIdx() + 1}/${curLevels().length} 关 · ${G.overtime ? '加班中' : L.name}` + (G.state === 'work' && !G.overtime && L.time > 0 ? ` · ${fmtT(L.time - G.elapsed)}` : '');
  if ($('lvLine').textContent !== lv) $('lvLine').textContent = lv;
  $('lvLine').classList.toggle('hurry', G.state === 'work' && !G.overtime && L.time > 0 && L.time - G.elapsed < 20);
  const as = auditNow(), au = as ? `${effLabel('audit', G.S.mode)}中 ×${Math.max(as.val, G.S.play.mult)} · ${Math.ceil(segsEnd(G.auditSegs, G.time) - G.time)}s` : ''; const ap = $('auditPill'); if (ap.textContent !== au) ap.textContent = au;
  const inTruck = G.truck.st === 'gone' ? 0 : G.truck.batches.reduce((n, bt) => n + bt.left, 0), hop = $('hop');
  hop.style.display = inTruck > 0 ? 'flex' : 'none'; $('hopN').textContent = '车上还有 ×' + inTruck;
}
export function showResult(ok) {
  const c = $('counter'); c.classList.toggle('done', ok !== null); c.classList.toggle('fail', ok === false); c.classList.toggle('force', ok !== null);
  if (ok === null) return;
  $('finTitle').textContent = ok ? (G.overtime ? '加班结束' : '收工') : '超时';
  $('finInfo').textContent = ok ? `${curLevel().name} · ${G.delivered} 件 · ${fmtT(G.elapsed)}` : `还剩 ${remaining()} 件没分完`;
  const top = topStumper(G.stats); $('finStats').textContent = [statsLine(G.stats), top ? `被${top.name}的刁钻垃圾难倒 ${top.n} 次` : ''].filter(Boolean).join(' · ');
  $('nextBtn').textContent = ok ? (curIdx() >= curLevels().length - 1 && !G.S.loopLevels ? '再来一次' : '下一关') : '重玩本关';
  $('nextBtn').hidden = false;
}
const hudK = () => clamp(G.H / 1080, .45, 2.2);
export function applyHud() {
  const L = G.S.layout, k = hudK();
  for (const id of ['counter', 'board']) { const o = L[id], el = $(id); el.style.left = o.x + '%'; el.style.top = o.y + '%'; el.style.transform = `scale(${o.s / 100 * k * 1.2})`; el.classList.toggle('off', !o.on); }
  tagK = L.tags.s / 100 * k * 1.15;
  document.body.classList.toggle('no-badges', !L.badges); document.body.classList.toggle('no-bincount', !L.binCounts); document.body.classList.toggle('no-cursor', !L.cursor);
  refreshBoard(true);
}
export function syncBinEls() { for (let i = 0; i < 4; i++) { const el = $('bc' + i); el.style.display = i < G.bins.length ? '' : 'none'; el.textContent = G.bins[i] ? G.bins[i].count : 0; } }
export function bumpBinEl(bin) { const el = $('bc' + bin.i); el.textContent = bin.count; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
/* 每帧跟着世界里的东西走的小牌子 */
export function updHudPos() {
  const hn = $('heldName'), hb = G.held && G.held.b, show = hb && hb.kind === 'garbage' && G.S.garbage.names && !hb.stripped && hb.itemId;
  if (show) { const p = hb.rb.translation(), sp = toScreen({ x: p.x, y: p.y + hb.size[1] / 2 + .35 }); hn.textContent = GARBAGE_BY_ID[hb.itemId].name; hn.style.transform = `translate(${sp.x}px,${sp.y}px) translate(-50%,-100%) scale(${tagK})`; hn.style.display = 'block'; }
  else if (hn.style.display !== 'none') hn.style.display = 'none';
  const L = G.L, hop = $('hop'), hp = toScreen(G.truck.st !== 'gone' ? { x: G.truck.x + .4, y: truckTop() + .55 } : { x: L.belt.x0 + .8, y: L.belt.top + 1.2 });
  const [hx, hy] = avoidHead(hp.x, hp.y, (hop.offsetHeight || 28) * tagK); hop.style.translate = `${hx}px ${hy}px`; hop.style.transform = `scale(${tagK}) translate(-50%,-100%)`;
  for (const bin of G.bins) { const el = $('bc' + bin.i), s = toScreen({ x: bin.x + bin.w / 2 - .32, y: bin.top - .42 }); el.style.translate = `${s.x}px ${s.y}px`; el.style.transform = `scale(${tagK}) translate(-50%,-50%)`; el.style.visibility = bin.count > 0 ? 'visible' : 'hidden'; }
  const st = $('scanTag'), any = G.items.some(b => b.stripped && b.st !== 'gone');
  st.style.display = any ? 'flex' : 'none';
  if (any) { const sp = toScreen({ x: L.scan.x, y: L.scan.top + 1.75 }), [sx, sy] = avoidHead(sp.x, sp.y, 30 * tagK); st.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%) scale(${tagK})`; }
}

/* ---------- 直播间互动说明牌（默认关闭：多数主播在 OBS 里自己做礼物菜单） ---------- */
export function srcText(r) { return r.src === 'gift' ? `送「${r.match}」` : r.src === 'chat' ? `弹幕「${r.match}」` : r.src === 'like' ? `点赞每 ${r.match}` : r.src === 'follow' ? '关注主播' : '进直播间'; }
/* 规则明确选了某一档才写档名（如「封桶·重」）；用默认档的规则不写，免得每条都挂一个「·中」 */
export function effText(r) { const e = EFF[resolveEffect(r.effect, G.S.mode)], t = findTier(G.S.tiers, r.effect, r.tier), lb = effLabel(r.effect, G.S.mode) + (t ? '·' + t.name : ''); return r.effect === 'kick' ? `${lb}${r.value > 1 ? ' ×' + r.value : ''}` : `${lb} ${r.value}${e.unit}${r.src === 'gift' ? '/个' : ''}`; }
let boardPage = 0, boardT = 0;
function boardList() {
  const on = G.rules.filter(r => r.on), pin = on.filter(r => r.src === 'like').slice(0, 1), rest = on.filter(r => r.src !== 'like');
  const pages = Math.max(1, Math.ceil(rest.length / 5)); boardPage %= pages;
  return { list: [...rest.slice(boardPage * 5, boardPage * 5 + 5), ...pin], pages };
}
export function tickBoard(dt) {
  boardT += dt; if (boardT <= 6) return; boardT = 0;
  const { pages } = boardList(); if (pages <= 1) return;
  boardPage = (boardPage + 1) % pages; const ul = $('board').querySelector('ul'); ul.classList.remove('flip'); void ul.offsetWidth; ul.classList.add('flip'); refreshBoard();
}
export function refreshBoard(rebuild) {
  const box = $('board'); if (!box) return;
  box.hidden = !G.S.layout.board.on || !G.rules.some(r => r.on);
  const { list, pages } = boardList(); box.querySelector('h4 small').textContent = pages > 1 ? `${boardPage + 1}/${pages}` : '';
  if (rebuild || box.dataset.sig !== JSON.stringify(list)) {
    box.dataset.sig = JSON.stringify(list); const ul = box.querySelector('ul'); ul.replaceChildren();
    for (const r of list) {
      const li = document.createElement('li'); li.dataset.rid = r.id;
      const ic = document.createElement('span'); ic.className = 'ic'; ic.style.background = ICBG[r.effect]; ic.innerHTML = ICONS[r.effect];
      const a = document.createElement('span'); a.className = 'k'; a.textContent = srcText(r);
      const b = document.createElement('span'); b.className = 'v'; b.textContent = effText(r);
      li.append(ic, a, b);
      if (r.src === 'like') { const bar = document.createElement('i'); bar.className = 'bar'; li.append(bar); }
      ul.append(li);
    }
  }
  for (const r of list) if (r.src === 'like') { const el = box.querySelector(`li[data-rid="${r.id}"] .bar`); if (el) el.style.setProperty('--p', Math.min(1, (G.likeAcc.get(r.id) || 0) / Number(r.match))); }
}
