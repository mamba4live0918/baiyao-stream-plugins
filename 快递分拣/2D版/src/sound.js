/* 声音：全部用 WebAudio 合成，不带音频文件。和 3D 版同一套音色 */
import { G } from './state.js';
import { rnd, clamp } from './util.js';

let AC = null, master = null, nbuf = null, lastLand = 0;
export function au() {
  if (!G.S.sound) return null;
  try {
    if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = G.S.volume / 100; master.connect(AC.destination); }
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { return null; }
  return AC;
}
export const setVolume = v => { if (master) master.gain.value = v / 100; };
export function tone(f, dur, type, vol, f2, delay) { const a = au(); if (!a) return; const t = a.currentTime + (delay || 0); const o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .03); }
export function noise(dur, vol, freq, delay, q, type) { const a = au(); if (!a) return; if (!nbuf) { nbuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const t = a.currentTime + (delay || 0); const s = a.createBufferSource(); s.buffer = nbuf; const f = a.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || .8; const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .5); s.stop(t + dur + .03); }
export const sfx = {
  pick() { tone(420, .07, 'sine', .06, 640); noise(.05, .06, 2400); },
  drop() { tone(165, .16, 'sine', .3, 80); noise(.07, .18, 1500); },
  bigBin() { tone(105, .32, 'sine', .4, 48); noise(.2, .28, 650); },
  wrong() { tone(240, .12, 'square', .035, 170); tone(190, .14, 'square', .035, 130, .1); },
  split() { noise(.12, .16, 1900, 0, 1.2); tone(520, .14, 'triangle', .07, 1040); tone(780, .16, 'triangle', .06, 1560, .07); },
  land(v) { if (G.time - lastLand < .045) return; lastLand = G.time; const k = clamp(v / 14, 0, 1); noise(.06, .03 + k * .12, 900 + Math.random() * 500); tone(130 + Math.random() * 40, .07, 'sine', .02 + k * .08, 80); },
  heavy() { tone(78, .5, 'sine', .55, 34); noise(.4, .38, 380, 0, .6, 'lowpass'); noise(.14, .22, 1700, .02); },
  truck() { noise(1.1, .09, 150, 0, .5, 'lowpass'); tone(1050, .09, 'square', .03, null, .25); tone(1050, .09, 'square', .03, null, .55); },
  thump() { noise(.07, .08, 900); },
  robot() { tone(880, .08, 'sine', .05, 1400); tone(1320, .1, 'sine', .05, 1900, .09); },
  zip() { tone(620, .08, 'triangle', .05, 1200); },
  blocked() { tone(160, .08, 'triangle', .08, 120); },
  rip() { noise(.1, .18, 3800, 0, 1.5, 'highpass'); noise(.07, .1, 2600, .05, 1.2); },
  kick() { tone(66, .45, 'sine', .6, 30); noise(.32, .42, 280, 0, .6, 'lowpass'); for (let i = 0; i < 6; i++) noise(.06, .12, rnd(900, 2200), .07 + i * .06); },
  tapeOn() { noise(.3, .08, 3000, 0, 2); tone(900, .22, 'triangle', .03, 500); },
  whistle() { tone(1400, .5, 'sine', .04, 500); },
  audit() { for (let i = 0; i < 3; i++) { tone(1180, .16, 'square', .035, 900, i * .22); tone(880, .16, 'square', .03, 700, i * .22 + .11); } },
  prank() { tone(310, .16, 'sawtooth', .04, 200); tone(260, .2, 'sawtooth', .04, 160, .14); tone(420, .1, 'square', .025, 300, .3); },
  speedUp() { tone(200, .6, 'sawtooth', .05, 900); noise(.5, .08, 1200, 0, .8); },
  scanOk() { tone(1320, .08, 'square', .04); tone(1760, .12, 'square', .04, null, .09); },
  beep() { tone(1500, .04, 'square', .03); },
  fix() { tone(1800, .05, 'square', .04); noise(.08, .1, 3000); },
  done() { noise(.03, .25, 3200); tone(1320, .55, 'sine', .12, null, .1); tone(1760, .7, 'sine', .08, null, .2); },
};
