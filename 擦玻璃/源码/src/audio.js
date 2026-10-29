/* 擦玻璃 · 音效（WebAudio 实时合成，不需要素材文件）。
   刮玻璃是一条常驻的声音：刮得越快越响，刮到脏东西时橡胶"吱吱"更明显；两小时直播里要耐听，所以整体很轻、每次略有变化。
   其他都是一次性短音：砸中、啪叽、碎蛋、叮（连擦一级级升调）、接住、敲玻璃、撕胶带、哈气、猫叫、鸟叫……
   页面还没有用户手势时 AudioContext 可能是挂起的：不报错，等第一次按下鼠标再恢复。并发声音有上限。 */
const EPS = 1e-4;
const MAX_VOICES = 14;
const rnd = (a, b) => a + Math.random() * (b - a);

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let enabled = true;
  let volume = 0.6;
  let failed = false;
  let wipeV = null;
  const busy = new Set();
  const last = {};

  function init() {
    if (ctx || failed) return !!ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      failed = true;
      return false;
    }
    try {
      ctx = new AC();
    } catch (e) {
      failed = true;
      return false;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.55 * volume;
    master.connect(comp).connect(ctx.destination);
    const n = Math.floor(ctx.sampleRate * 1.2);
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function ready() {
    if (!enabled || !init()) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return false;
    }
    return ctx.state === 'running';
  }
  function gap(key, sec) {
    const t = ctx.currentTime;
    if (last[key] !== undefined && t - last[key] < sec) return true;
    last[key] = t;
    return false;
  }
  function voice(ms) {
    if (busy.size >= MAX_VOICES) return false;
    const v = {};
    busy.add(v);
    setTimeout(() => busy.delete(v), ms);
    return true;
  }
  function env(param, t, peak, a, d) {
    param.setValueAtTime(EPS, t);
    param.linearRampToValueAtTime(Math.max(EPS, peak), t + a);
    param.exponentialRampToValueAtTime(EPS, t + a + d);
  }
  function osc(type, f0, f1, t, dur, peak, a = 0.005, dest = master) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g.gain, t, peak, a, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return o;
  }
  function burst(t, dur, peak, type, f, q = 1, f1 = null, a = 0.003) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.setValueAtTime(f, t);
    if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + dur);
    b.Q.value = q;
    const g = ctx.createGain();
    env(g.gain, t, peak, a, dur);
    s.connect(b).connect(g).connect(master);
    s.start(t, Math.random() * 0.8);
    s.stop(t + a + dur + 0.05);
  }
  function one(key, minGap, ms, fn) {
    if (!ready() || gap(key, minGap) || !voice(ms)) return;
    try {
      fn(ctx.currentTime);
    } catch (e) {
      /* 某个音效出错不影响玩 */
    }
  }

  /* 常驻的刮玻璃声：沙沙的水声 + 橡胶吱吱声 */
  function wipeVoice() {
    if (wipeV) return wipeV;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    s.connect(bp).connect(ng).connect(master);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 900;
    const sq = ctx.createBiquadFilter();
    sq.type = 'bandpass';
    sq.frequency.value = 1300;
    sq.Q.value = 5;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    /* 橡胶卡滑：一个 30Hz 左右的方波让吱吱声一顿一顿 */
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 26;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    const stick = ctx.createGain();
    stick.gain.value = 0.5;
    lfo.connect(lg).connect(stick.gain);
    o.connect(sq).connect(stick).connect(sg).connect(master);
    s.start();
    o.start();
    lfo.start();
    wipeV = { ng, sg, o, lfo, sq };
    return wipeV;
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled && wipeV) {
        const t = ctx.currentTime;
        wipeV.ng.gain.setTargetAtTime(0, t, 0.02);
        wipeV.sg.gain.setTargetAtTime(0, t, 0.02);
      }
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(0.55 * volume, ctx.currentTime, 0.05);
    },
    /* 第一次按鼠标时调用：解锁被浏览器挂起的音频 */
    unlock() {
      if (!enabled) return;
      if (init() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    wipe(intensity, touching) {
      if (!ready()) return;
      const v = wipeVoice();
      const t = ctx.currentTime;
      const k = Math.max(0, Math.min(1, intensity));
      v.ng.gain.setTargetAtTime(0.05 * k + 0.008, t, 0.04);
      v.sg.gain.setTargetAtTime((touching ? 0.05 : 0.016) * (0.3 + k), t, 0.03);
      v.o.frequency.setTargetAtTime(620 + 760 * k + rnd(-50, 50), t, 0.05);
      v.sq.frequency.setTargetAtTime(1100 + 700 * k, t, 0.08);
      v.lfo.frequency.setTargetAtTime(18 + 26 * k + rnd(-3, 3), t, 0.1);
    },
    wipeEnd() {
      if (!wipeV || !ctx) return;
      const t = ctx.currentTime;
      wipeV.ng.gain.setTargetAtTime(0, t, 0.06);
      wipeV.sg.gain.setTargetAtTime(0, t, 0.04);
    },
    thud(strength = 1) {
      one('thud', 0.05, 400, t => {
        osc('sine', 120, 48, t, 0.22, 0.32 * strength, 0.004);
        burst(t, 0.12, 0.18 * strength, 'lowpass', 900);
      });
    },
    splat(strength = 1) {
      one('splat', 0.04, 500, t => {
        burst(t, 0.18, 0.32 * strength, 'bandpass', 700, 0.8, 300);
        osc('sine', 260, 90, t, 0.16, 0.14 * strength);
        for (let i = 0; i < 3; i++) osc('sine', rnd(900, 1500), rnd(400, 600), t + 0.06 + i * rnd(0.04, 0.08), 0.07, 0.05);
      });
    },
    crack() {
      one('crack', 0.05, 400, t => {
        for (let i = 0; i < 3; i++) burst(t + i * 0.018, 0.03, 0.26, 'highpass', 2600, 0.7);
        osc('triangle', 1800, 900, t, 0.05, 0.06);
      });
    },
    /* 叮：连续擦完一级级升调（最多升 7 级），像 PowerWash 的完成音 */
    ding(combo = 0) {
      one('ding', 0.06, 900, t => {
        const step = [0, 2, 4, 5, 7, 9, 11, 12][Math.min(7, combo)];
        const f = 1046.5 * Math.pow(2, step / 12);
        osc('sine', f, f, t, 0.55, 0.16, 0.004);
        osc('sine', f * 2, f * 2, t, 0.3, 0.05, 0.004);
        osc('triangle', f * 1.5, f * 1.5, t + 0.05, 0.35, 0.05, 0.004);
      });
    },
    catchIt() {
      one('catch', 0.08, 500, t => {
        burst(t, 0.22, 0.14, 'bandpass', 600, 1.2, 3200);
        osc('sine', 520, 980, t + 0.05, 0.16, 0.14);
      });
    },
    knock() {
      one('knock', 0.12, 500, t => {
        for (let i = 0; i < 2; i++) {
          osc('sine', 430, 300, t + i * 0.13, 0.08, 0.2, 0.002);
          burst(t + i * 0.13, 0.03, 0.12, 'bandpass', 1800, 2);
        }
      });
    },
    tap() {
      one('tap', 0.05, 300, t => osc('sine', 520, 380, t, 0.07, 0.12, 0.002));
    },
    slap() {
      one('slap', 0.05, 400, t => {
        burst(t, 0.1, 0.3, 'lowpass', 1600);
        osc('sine', 180, 80, t, 0.1, 0.18);
      });
    },
    peel(k = 1) {
      one('peel', 0.06, 500, t => {
        burst(t, 0.28 * k + 0.1, 0.12, 'bandpass', 1200, 1.5, 4200, 0.02);
      });
    },
    tear() {
      one('tear', 0.08, 500, t => {
        for (let i = 0; i < 5; i++) burst(t + i * 0.035, 0.05, 0.16, 'bandpass', rnd(2200, 3400), 1.4);
      });
    },
    breath() {
      one('breath', 0.2, 1200, t => burst(t, 0.75, 0.14, 'lowpass', 1100, 0.7, 600, 0.22));
    },
    meow() {
      one('meow', 0.3, 900, t => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(650, t);
        o.frequency.linearRampToValueAtTime(1050, t + 0.14);
        o.frequency.linearRampToValueAtTime(620, t + 0.46);
        f.type = 'bandpass';
        f.frequency.setValueAtTime(1400, t);
        f.frequency.linearRampToValueAtTime(900, t + 0.46);
        f.Q.value = 3;
        env(g.gain, t, 0.09, 0.04, 0.46);
        o.connect(f).connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.55);
      });
    },
    chirp() {
      one('chirp', 0.15, 500, t => {
        osc('sine', 2800, 3700, t, 0.07, 0.07);
        osc('sine', 3000, 4000, t + 0.11, 0.08, 0.07);
      });
    },
    plop() {
      one('plop', 0.08, 400, t => {
        osc('sine', 340, 110, t, 0.14, 0.18);
        burst(t, 0.06, 0.08, 'lowpass', 900);
      });
    },
    beep() {
      one('beep', 0.15, 500, t => {
        osc('square', 880, 880, t, 0.06, 0.035);
        osc('square', 1320, 1320, t + 0.09, 0.07, 0.035);
      });
    },
    suction() {
      one('suction', 0.15, 500, t => {
        burst(t, 0.18, 0.12, 'bandpass', 2400, 1.2, 500);
        osc('sine', 300, 700, t + 0.16, 0.06, 0.12);
      });
    },
    sweep() {
      one('sweep', 0.2, 900, t => burst(t, 0.55, 0.12, 'highpass', 600, 0.7, 5200, 0.12));
    },
    pop() {
      one('pop', 0.04, 300, t => osc('sine', 700, 220, t, 0.09, 0.14, 0.002));
    }
  };
}
