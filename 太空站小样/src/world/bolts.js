// Separation bolts: a flash and a small smoke puff (Unity Labs flipbooks) at the
// joint of each large module the moment it starts to move away.
import { Group } from 'three';
import { clamp, smoothstep } from '../core/math.js';
import { createBillboard, createFlipbook, FLASH_FS } from './fx.js';

const MAX_BURSTS = 18;
const DURATION = 1.1; // seconds

export function createBolts({ station, sheets }) {
  const group = new Group();
  group.name = 'bolts';

  const largest = station.pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => piece.radius > 0.45)
    .sort((a, b) => b.piece.radius - a.piece.radius)
    .slice(0, MAX_BURSTS);

  const bursts = largest.map(({ piece, index }, k) => {
    const sheet = sheets[k % sheets.length];
    const fx = new Group();
    // The joint: the side of the piece that faced the middle of the station.
    fx.position.copy(piece.center).addScaledVector(piece.dir, -piece.radius * 0.45);
    fx.visible = false;
    const puff = createFlipbook(sheet, 2.4, { boost: 1.5, intensity: 1.3 });
    const flash = createBillboard(FLASH_FS, { uIntensity: { value: 0 } }, 1.6);
    fx.add(puff, flash);
    group.add(fx);
    return { fx, puff, flash, frames: sheet.frames, startP: station.startProgress(index), triggeredAt: null, lastP: null };
  });

  return {
    group,

    // jumped: progress was set directly, so bolts the jump skipped over stay quiet.
    update(p, time, jumped) {
      for (const b of bursts) {
        if (p >= b.startP) {
          if (b.triggeredAt === null) {
            const crossed = !jumped && b.lastP !== null && b.lastP < b.startP;
            b.triggeredAt = crossed ? time : -Infinity;
          }
        } else if (b.triggeredAt !== null) {
          b.triggeredAt = null;
        }
        b.lastP = p;

        const age = b.triggeredAt === null ? -1 : time - b.triggeredAt;
        const active = age >= 0 && age < DURATION;
        b.fx.visible = active;
        if (!active) continue;
        const k = clamp(age / DURATION);
        const flash = b.flash.material.uniforms;
        flash.uIntensity.value = 2.2 * Math.exp(-age * 10);
        flash.uScale.value = 1.6 * (0.6 + Math.min(age, 0.25) * 3);
        const puff = b.puff.material.uniforms;
        puff.uFrame.value = k * (b.frames - 1);
        puff.uOpacity.value = 1 - smoothstep(0.65, 1, k);
        puff.uScale.value = 2.4 * (0.8 + k * 0.5);
      }
    },
  };
}
