/* 万圣节砸砸乐试玩 · 音效（全部用 WebAudio 现合成，不带音频文件）
   第一次点按钮时才创建声音设备（浏览器要求用户先操作）。 */
(function () {
  'use strict';
  const HW = window.HW;
  let ctx = null, master = null, noiseBuf = null, muted = false;

  function ready() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function env(gain, t, attack, hold, release, peak) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }
  // 一个音：波形、起止频率、时长、音量
  function tone(type, f0, f1, dur, vol, delay = 0, vibrato = 0) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vibrato) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 6.5; lg.gain.value = vibrato;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    env(g, t, 0.008, dur * 0.25, dur * 0.75, vol);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // 一段噪声：滤波类型、起止中心频率、时长、音量
  function noise(type, f0, f1, dur, vol, delay = 0, q = 1) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, 0.004, dur * 0.15, dur * 0.85, vol);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  HW.sfx = {
    setMuted(v) { muted = !!v; if (muted && ctx) ctx.suspend(); else if (ctx) ctx.resume(); },
    get muted() { return muted; },
    unlock() { ready(); },
    thud() { tone('sine', 140, 55, 0.22, 0.55); noise('lowpass', 900, 200, 0.09, 0.25); },
    crash() { noise('bandpass', 1400, 300, 0.45, 0.5, 0, 0.8); tone('sine', 110, 40, 0.3, 0.5); },
    pop() { tone('sine', 520, 980, 0.09, 0.35); },
    boo() { tone('sine', 330, 170, 0.9, 0.3, 0, 9); tone('triangle', 495, 255, 0.9, 0.12, 0.02, 9); noise('lowpass', 700, 300, 0.7, 0.08); },
    whoosh() { noise('bandpass', 260, 2400, 0.6, 0.35, 0, 1.4); },
    possess() { tone('sine', 220, 110, 1.4, 0.22, 0, 5); tone('sine', 277, 139, 1.4, 0.16, 0.05, 5); tone('sine', 330, 165, 1.4, 0.14, 0.1, 5); noise('bandpass', 400, 3000, 1.0, 0.18, 0, 2); },
    glass() { noise('highpass', 3200, 5200, 0.25, 0.4); [2600, 3400, 4100].forEach((f, i) => tone('sine', f, f * 0.97, 0.3, 0.12, i * 0.03)); noise('lowpass', 1200, 300, 0.3, 0.3, 0.02); },
    boing() { tone('sine', 220, 660, 0.18, 0.35, 0, 0); tone('sine', 660, 330, 0.3, 0.3, 0.18, 30); },
    poof() { noise('lowpass', 1200, 200, 0.4, 0.45); tone('sine', 300, 120, 0.25, 0.15); },
    swish() { noise('bandpass', 900, 2600, 0.22, 0.32, 0, 2); },
    wrap() { noise('bandpass', 2400, 900, 0.3, 0.22, 0, 3); },
    flap() { for (let i = 0; i < 3; i++) noise('bandpass', 700, 500, 0.05, 0.25, i * 0.07, 2); },
    squeak() { tone('sine', 2300, 3100, 0.07, 0.18); tone('sine', 2500, 3400, 0.07, 0.15, 0.1); },
    chomp() { noise('lowpass', 2200, 600, 0.06, 0.35); noise('lowpass', 2000, 500, 0.06, 0.3, 0.12); },
    coin() { tone('triangle', 988, 988, 0.08, 0.22); tone('triangle', 1319, 1319, 0.14, 0.22, 0.07); },
    jingle() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.18, 0.22, i * 0.08)); },
    shield() { [523, 659, 784].forEach((f, i) => tone('sine', f, f * 1.01, 1.2, 0.12, i * 0.04, 4)); },
    bubble() { tone('sine', 400 + Math.random() * 300, 900 + Math.random() * 300, 0.08, 0.12); },
  };
})();
