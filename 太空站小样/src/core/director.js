// Maps scroll progress to camera poses and to which view(s) must be rendered.
// Camera A films the station, the unfold and the plugin server; camera B films
// the community screen after the "signal lost" cut.
import { CatmullRomCurve3, Vector3 } from 'three';
import { clamp, lerp, remap } from './math.js';
import { TIMELINE } from '../config.js';

// [progress, position, look target, vertical fov]
const OPENING_KEYS = [
  [0.0, [6, 2.5, 34], [0, -2.5, 0], 38],
  [0.1, [14, 3.5, 26], [0, -1.5, 0], 38],
  [0.2, [20, 6, 14], [0, 0, 0], 40],
  [0.3, [11, 5, 19], [0, 0.5, 0], 42],
];

// Targets sit left of the subject so it lands right of centre, clear of the
// story block in the bottom-left corner.
export const CAMERA_B_KEYS = [
  [TIMELINE.transition[0], [1.5, -4, -46], [-1.5, -6, -70], 44],
  [0.9, [0, -5.2, -50], [-3.2, -6.3, -70], 42],
  [1.0, [0, -3, -44], [-1.6, -2.6, -70], 46],
];

// Camera A: the opening shots, a look at the top of the rack, then a hold in
// front of each featured blade while its drawer is out, then a pull-back.
export function cameraAKeys(layout, windows) {
  const keys = [...OPENING_KEYS];
  keys.push([TIMELINE.pluginsStart - 0.02, [2.6, layout.top + 0.9, 8.8], [-1.4, layout.top - 1.0, 0], 40]);
  for (const w of windows) {
    const y = layout.slotY(w.slot);
    const span = w.end - w.start;
    keys.push([w.start + span * 0.22, [0.7, y + 0.8, 5.3], [-0.75, y + 0.48, 1.6], 38]);
    keys.push([w.end - span * 0.22, [1.0, y + 0.74, 5.1], [-0.75, y + 0.46, 1.6], 38]);
  }
  const last = windows.length ? layout.slotY(windows[windows.length - 1].slot) : layout.bottom + 0.6;
  keys.push([TIMELINE.transition[1], [2.4, last - 0.3, 7.5], [0, last - 0.2, 0], 40]);
  return keys;
}

export function createTrack(keys) {
  const toVec = (k, i) => new Vector3(...k[i]);
  const positions = new CatmullRomCurve3(keys.map((k) => toVec(k, 1)), false, 'centripetal');
  const targets = new CatmullRomCurve3(keys.map((k) => toVec(k, 2)), false, 'centripetal');
  const last = keys.length - 1;

  return function evaluate(progress, out) {
    const p = clamp(progress, keys[0][0], keys[last][0]);
    let i = 0;
    while (i < last - 1 && p >= keys[i + 1][0]) i++;
    const u = remap(p, keys[i][0], keys[i + 1][0]);
    const t = (i + u) / last;
    positions.getPoint(t, out.position);
    targets.getPoint(t, out.target);
    out.fov = lerp(keys[i][3], keys[i + 1][3], u);
    return out;
  };
}

export function createDirector(keysA, keysB = CAMERA_B_KEYS) {
  const trackA = createTrack(keysA);
  const trackB = createTrack(keysB);
  return {
    poseA: (p, out) => trackA(p, out),
    poseB: (p, out) => trackB(p, out),
  };
}

export function createPose() {
  return { position: new Vector3(), target: new Vector3(), fov: 40 };
}

// Returns { transition, needA, needB }. transition is 0 for pure A, 1 for pure B.
export function viewState(progress) {
  const [start, end] = TIMELINE.transition;
  const transition = remap(progress, start, end);
  return {
    transition,
    needA: transition < 1,
    needB: transition > 0,
  };
}
