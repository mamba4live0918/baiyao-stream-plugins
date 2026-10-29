// 南瓜灯工坊新版 · 游戏规则（纯逻辑，不碰画面，可以直接单测）
// 一单 = 一个观众的一个南瓜：排队 → 上工作台 → 开盖 → 刻脸 → 点亮 → 装糖 → 叠到塔上。
// 塔被推倒时，每盏灯按「从下往上第几层」决定摔不摔碎；碎了的那位观众重新排到队伍最前面，挂「重做」。
import { safeName } from './text.js';

export const STEP_NAMES = { lid: '开盖', carve: '刻脸', candy: '装糖' };

/** 从下往上第 layer 层掉下来摔碎的概率：最下面 safe 层不碎，再往上每层多 step，到 1 为止。 */
export function breakChance(layer, safe = 2, step = 0.25) {
  const p = (Number(layer) - Number(safe)) * Number(step);
  return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
}

const avatarOf = o => (typeof o?.avatar === 'string' && /^(https?:\/\/|data:image\/)/i.test(o.avatar) && o.avatar.length <= 4096 ? o.avatar : '');
const clean = o => { const a = avatarOf(o); return { nick: safeName(o?.nick), uid: String(o?.uid || 'nick:' + safeName(o?.nick)), face: typeof o?.face === 'string' ? o.face : null, ...(a ? { avatar: a } : {}) }; };

export const START_CANDY = 5;   // 开局 / 清空以后糖罐里有几颗糖
const SHOWN_KEEP = 300;         // 灯展里最多记住最近送达的这么多盏（灯串能拖着往回翻）
const FANS_KEEP = 200;          // 贡献榜最多记这么多人

export function createGame({ random = Math.random } = {}) {
  // air：正在掉、正在被小鬼叼着的灯（不在塔上也不在队伍里）。刷新页面时它们算回塔上，不会丢。
  // shown：灯展（最近送达的灯）；fans：贡献（uid → 名字、送达几盏灯、送了几颗糖、帮做几盏）
  const state = { queue: [], job: null, tower: [], air: [], made: 0, broken: 0, lost: 0, shipped: 0, candy: START_CANDY, shown: [], fans: {}, seq: 1 };

  function credit(who, field, n) {
    const uid = String(who?.uid || 'nick:' + safeName(who?.nick));
    const f = state.fans[uid] || (state.fans[uid] = { nick: safeName(who?.nick), lanterns: 0, candy: 0, help: 0 });
    f.nick = safeName(who?.nick) || f.nick;
    f[field] += n;
    const keys = Object.keys(state.fans);
    if (keys.length > FANS_KEEP) {   // 太多了：去掉贡献最少的
      keys.sort((a, b) => score(state.fans[a]) - score(state.fans[b]));
      for (const k of keys.slice(0, keys.length - FANS_KEEP)) if (k !== uid) delete state.fans[k];
    }
  }
  const score = f => f.lanterns + f.help + f.candy / 5;

  /** 贡献榜前 n 名：送达的灯、帮做的灯各算 1 分，送的糖 5 颗算 1 分。 */
  function topFans(n = 5) {
    return Object.values(state.fans).filter(f => score(f) > 0).sort((a, b) => score(b) - score(a) || b.lanterns - a.lanterns).slice(0, n);
  }

  const active = uid => state.queue.filter(o => o.uid === uid).length + (state.job?.uid === uid ? 1 : 0);
  const order = (o, redo = false) => ({ id: 'o' + state.seq++, ...clean(o), redo });

  /** 订一个南瓜。弹幕点单受「每人同时几个」限制（0 = 不限），礼物订的不受限。超了返回 {nudge: uid}，画面上让他的南瓜跳一下。 */
  function addOrder(o, { perPerson = 1, via = 'comment', front = false, redo = false } = {}) {
    const who = clean(o);
    if (via !== 'gift' && perPerson > 0 && active(who.uid) >= perPerson) return { nudge: who.uid };
    const made = order(who, redo);
    if (front) state.queue.unshift(made); else state.queue.push(made);
    return { order: made };
  }

  /** 工作台空着、队伍里有人时，把排在最前面的那单拿上来。 */
  function startNext() {
    if (state.job || !state.queue.length) return null;
    const o = state.queue.shift();
    state.job = { ...o, step: 'lid', cuts: [], lit: false, seed: Math.floor(random() * 1e9) };
    return state.job;
  }

  const job = step => (state.job && state.job.step === step ? state.job : null);
  function openLid() { const j = job('lid'); if (!j) return false; j.step = 'carve'; return true; }
  function addCut(cut) { const j = job('carve'); if (!j || !cut) return false; j.cuts.push(cut); return true; }
  function undoCut() { const j = job('carve'); return j && j.cuts.length ? j.cuts.pop() : null; }
  function light() { const j = job('carve'); if (!j) return false; j.lit = true; j.step = 'candy'; return true; }

  /** 装好糖：这盏灯做完了，直接记到塔顶（画面上它还在往塔上跳）。返回这盏灯。 */
  function fill() {
    const j = job('candy');
    if (!j) return null;
    const lantern = { id: j.id, nick: j.nick, uid: j.uid, face: j.face, ...(j.avatar ? { avatar: j.avatar } : {}), cuts: j.cuts, seed: j.seed, tilt: (random() - 0.5) * 0.12, dx: (random() - 0.5) * 0.1 };
    state.job = null;
    state.made++;
    state.tower.push(lantern);
    return lantern;
  }

  /** 试玩 / 测试用：直接做好一盏灯放到塔顶（不经过工作台）。 */
  function addLantern(o, cuts = []) {
    const who = clean(o);
    const lantern = { id: 'o' + state.seq++, ...who, cuts, seed: Math.floor(random() * 1e9), tilt: (random() - 0.5) * 0.12, dx: (random() - 0.5) * 0.1 };
    state.made++;
    state.tower.push(lantern);
    return lantern;
  }

  /** 从下往上第 from+1 层起全部推倒，返回 [{lantern, layer}]（layer 从 1 数）。 */
  function knock(from) {
    const start = Math.max(0, Math.min(state.tower.length, Math.floor(from)));
    const fell = state.tower.splice(start).map((lantern, i) => ({ lantern, layer: start + i + 1 }));
    state.air.push(...fell.map(f => f.lantern));
    return fell;
  }

  /**
   * 小车来了：塔上的灯全部装车拉走（安全送达，之后再也不会被推倒）。
   * 每送达一盏得 per 颗糖，装满 full 盏再多给 bonus 颗。返回 { lanterns（从塔顶往下）, gained }。
   * 糖等小车开走、糖飞进糖罐时再加（addCandy），数字不会先跳一下。
   */
  function ship({ per = 1, bonus = 2, full = 6 } = {}) {
    const lanterns = state.tower.splice(0).reverse();
    state.shipped += lanterns.length;
    const gained = lanterns.length ? lanterns.length * per + (full > 0 && lanterns.length >= full ? bonus : 0) : 0;
    for (const l of lanterns) credit(l, 'lanterns', 1);   // 谁的灯送达了，谁记一盏
    state.shown.push(...lanterns.slice().reverse());   // 灯展：按装车顺序挂上去
    if (state.shown.length > SHOWN_KEEP) state.shown.splice(0, state.shown.length - SHOWN_KEEP);
    return { lanterns, gained };
  }

  /** 糖进糖罐。who 是送糖的观众（小车送达得的糖不记在谁头上）。 */
  function addCandy(n, who = null) { const k = Math.max(0, Math.floor(Number(n) || 0)); state.candy += k; if (who && k) credit(who, 'candy', k); return k; }

  /** 南瓜精灵帮做：排在最前面的那单直接变成灯放到塔顶（工作台上那个不动）。返回 { order, lantern }，没有排队的返回 null。 */
  function helpMake(cuts, helper) {
    const o = state.queue.shift();
    if (!o) return null;
    const lantern = { id: o.id, nick: o.nick, uid: o.uid, face: o.face, ...(o.avatar ? { avatar: o.avatar } : {}), cuts, seed: Math.floor(random() * 1e9), tilt: (random() - 0.5) * 0.12, dx: (random() - 0.5) * 0.1, helped: safeName(helper?.nick) };
    state.made++;
    state.tower.push(lantern);
    if (helper) credit(helper, 'help', 1);
    return { order: o, lantern };
  }

  /** 给捣蛋鬼糖：够就扣掉返回 true，不够返回 false（一颗都不扣）。 */
  function spend(n) {
    const k = Math.max(0, Math.floor(Number(n) || 0));
    if (state.candy < k) return false;
    state.candy -= k;
    return true;
  }

  /** 小鬼叼走塔顶那盏。 */
  function takeTop() {
    const lantern = state.tower.pop();
    if (!lantern) return null;
    state.air.push(lantern);
    return { lantern, layer: state.tower.length + 1 };
  }

  const leaveAir = lantern => { const i = state.air.indexOf(lantern); if (i >= 0) state.air.splice(i, 1); };

  /** 灯落地：按层数掷一次。碎了 → 重新排到最前面；没碎 → 回到塔顶。返回 true = 碎了。 */
  function landed(lantern, layer, { safe = 2, step = 0.25 } = {}) {
    leaveAir(lantern);
    const broken = random() < breakChance(layer, safe, step);
    if (broken) {
      state.broken++;
      addOrder(lantern, { via: 'gift', front: true, redo: true });
    } else state.tower.push(lantern);
    return broken;
  }

  /** 被小鬼带走了：那位观众重新排到最前面。 */
  function lose(lantern) {
    leaveAir(lantern);
    state.lost++;
    addOrder(lantern, { via: 'gift', front: true, redo: true });
  }

  /** 清空这一场：队伍、工作台、塔都清掉，累计做了几盏不动。 */
  function reset() { state.queue = []; state.job = null; state.tower = []; state.air = []; state.candy = START_CANDY; state.shown = []; state.fans = {}; }

  function snapshot() {
    return { v: 2, queue: state.queue, job: state.job, tower: [...state.tower, ...state.air], made: state.made, broken: state.broken, lost: state.lost, shipped: state.shipped, candy: state.candy, shown: state.shown, fans: state.fans, seq: state.seq };
  }

  function restore(data) {
    if (!data || data.v !== 2) return false;
    const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && typeof x.uid === 'string') : []);
    state.queue = list(data.queue).map(o => ({ id: String(o.id || 'o' + state.seq++), ...clean(o), redo: !!o.redo }));
    const j = data.job;
    state.job = j && typeof j === 'object' && ['lid', 'carve', 'candy'].includes(j.step)
      ? { ...clean(j), id: String(j.id || 'o' + state.seq++), redo: !!j.redo, step: j.step, cuts: Array.isArray(j.cuts) ? j.cuts : [], lit: j.step === 'candy', seed: Number(j.seed) || 1 }
      : null;
    state.tower = list(data.tower).map(l => ({ ...clean(l), id: String(l.id || 'o' + state.seq++), cuts: Array.isArray(l.cuts) ? l.cuts : [], seed: Number(l.seed) || 1, tilt: Number(l.tilt) || 0, dx: Number(l.dx) || 0 }));
    state.air = [];
    for (const k of ['made', 'broken', 'lost', 'shipped', 'candy', 'seq']) if (Number.isFinite(data[k])) state[k] = Math.max(0, data[k]);
    state.shown = list(data.shown).slice(-SHOWN_KEEP).map(l => ({ ...clean(l), id: String(l.id || 'o' + state.seq++), cuts: Array.isArray(l.cuts) ? l.cuts : [], seed: Number(l.seed) || 1 }));
    state.fans = {};
    if (data.fans && typeof data.fans === 'object') for (const [k, f] of Object.entries(data.fans)) if (f && typeof f === 'object') state.fans[k] = { nick: safeName(f.nick), lanterns: Math.max(0, Number(f.lanterns) || 0), candy: Math.max(0, Number(f.candy) || 0), help: Math.max(0, Number(f.help) || 0) };
    return true;
  }

  return { state, addOrder, addLantern, startNext, openLid, addCut, undoCut, light, fill, knock, takeTop, ship, addCandy, spend, helpMake, topFans, landed, lose, reset, snapshot, restore };
}
