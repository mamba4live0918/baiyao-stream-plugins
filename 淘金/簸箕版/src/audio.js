/* 淘金 · 簸箕版 · 声音：全部用 WebAudio 现场合成，不依赖任何音频文件。
   两条常驻的环境声（晃簸箕的水声、从前口倒出去的流水声）随玩法起落，其余是一次性的音效。 */
export class Audio {
  constructor(settings) {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.loops = {};
    this.apply(settings);
  }

  apply(settings) {
    this.enabled = settings.audio.enabled;
    this.volume = settings.audio.volume;
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
  }

  /* 浏览器要求先有一次用户操作才能出声；OBS 浏览器源通常不受限 */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? this.volume : 0;
        this.master.connect(this.ctx.destination);
        this.noiseBuf = this.makeNoise();
        this.loops.slosh = this.loop('bandpass', 700, 0.9);
        this.loops.pour = this.loop('bandpass', 2200, 0.5);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.ctx = null;
    }
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  loop(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  /* 常驻声的音量：slosh = 晃动强度，pour = 前口倒水的量（都是 0~1 左右） */
  ambient(slosh, pour) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.loops.slosh.gain.setTargetAtTime(Math.min(1.2, slosh) * 0.14, t, 0.06);
    this.loops.pour.gain.setTargetAtTime(Math.min(1, pour) * 0.08, t, 0.15);
  }

  tone(freq, dur, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.value = o.freq || 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.gain || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || !this.enabled) return;
    const fx = SOUNDS[name];
    if (fx) fx(this);
  }
}

const SOUNDS = {
  whistle: A => A.tone(1400, 0.5, { gain: 0.05, to: 500 }),
  burst: A => {
    A.tone(110, 0.3, { gain: 0.32, to: 48 });
    A.noise(0.7, { freq: 1600, gain: 0.26 });
    A.noise(0.35, { type: 'highpass', freq: 3000, gain: 0.07, delay: 0.05 });
  },
  glint: A => {
    A.tone(1568, 0.22, { gain: 0.09 });
    A.tone(2093, 0.3, { gain: 0.06, delay: 0.06 });
  },
  nugget: A => [880, 1175, 1568, 2093].forEach((f, i) => A.tone(f, 0.35, { gain: 0.1, delay: i * 0.07 })),
  big: A => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => A.tone(f, 0.5, { gain: 0.11, delay: i * 0.08 })),
  pick: A => A.tone(520, 0.07, { gain: 0.1, type: 'triangle' }),
  collect: A => {
    [0, 1, 2, 3].forEach(i => A.tone(1250 + i * 160, 0.14, { gain: 0.08, delay: i * 0.055 }));
    A.noise(0.22, { type: 'highpass', freq: 4000, gain: 0.05 });
  },
  bad: A => A.tone(220, 0.28, { gain: 0.14, to: 110, type: 'sawtooth' }),
  thud: A => {
    A.tone(130, 0.22, { gain: 0.26, to: 55 });
    A.noise(0.16, { freq: 700, gain: 0.18 });
  },
  plop: A => A.tone(480, 0.14, { gain: 0.12, to: 200 }),
  splash: A => A.noise(0.45, { freq: 1800, gain: 0.16 }),
  pour: A => A.noise(1.1, { freq: 480, gain: 0.16 }),
  alarm: A => [0, 1, 2].forEach(i => A.tone(i % 2 ? 740 : 988, 0.12, { gain: 0.1, delay: i * 0.13, type: 'square' })),
  steal: A => A.tone(520, 0.42, { gain: 0.14, to: 130, type: 'sawtooth' }),
  caught: A => {
    A.tone(660, 0.12, { gain: 0.12 });
    A.tone(990, 0.2, { gain: 0.12, delay: 0.08 });
    A.tone(1320, 0.25, { gain: 0.1, delay: 0.16 });
  },
  growl: A => A.tone(82, 0.9, { gain: 0.22, to: 62, type: 'sawtooth' }),
  bump: A => {
    A.tone(90, 0.35, { gain: 0.32, to: 50 });
    A.noise(0.4, { freq: 500, gain: 0.26 });
  },
  brace: A => {
    A.tone(392, 0.1, { gain: 0.1, type: 'triangle' });
    A.tone(523, 0.16, { gain: 0.1, type: 'triangle', delay: 0.06 });
  },
  warn: A => [0, 1].forEach(i => A.tone(880, 0.09, { gain: 0.09, delay: i * 0.12, type: 'square' })),
  fling: A => A.tone(900, 0.35, { gain: 0.1, to: 300 })
};
