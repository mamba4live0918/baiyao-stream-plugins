import { rectIntersectsZone } from './layout.js';

const bound = (value, limit) => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Three entry-time draws; these normalized values stay with the order. */
export function createCrowdOffset(random = Math.random) {
  const draw = limit => {
    const value = Number(random());
    return (clamp(Number.isFinite(value) ? value : .5, 0, 1) * 2 - 1) * limit;
  };
  return Object.freeze({ x: draw(.12), y: draw(.06), scale: draw(.05) });
}

/** Apply fixed entry variation once per layout, never during frame painting.
    Keep the bottom-center as the size anchor. A dangerous face-edge variation
    falls back to the already-safe slot, preserving capacity and order identity. */
export function applyCrowdVariation(slot, offset, { width, height, zone, counterTop } = {}) {
  if (!offset) return { ...slot };
  const unit = Math.min(width, height) / 1080;
  const factor = 1 + bound(offset.scale, .05), scale = slot.scale * factor;
  const spriteWidth = slot.width * factor, spriteHeight = slot.height * factor;
  const bottom = Math.min(height, (Number.isFinite(counterTop) ? counterTop : height - 210 * unit) + 12 * unit);
  const top = 6 * unit + 20 * unit * scale, lastY = bottom - spriteHeight;
  if (spriteWidth > width || top > lastY) return { ...slot };
  const x = clamp(slot.x + slot.width * .70 * bound(offset.x, .12) - (spriteWidth - slot.width) / 2, 0, width - spriteWidth);
  const y = clamp(slot.y + slot.height * bound(offset.y, .06) - (spriteHeight - slot.height), top, lastY);
  const result = { ...slot, x, y, width: spriteWidth, height: spriteHeight, scale };
  const jump = 20 * unit * scale;
  if (rectIntersectsZone({ ...result, y: y - jump, height: spriteHeight + jump }, zone, width, height, 4 * unit)) return { ...slot };
  return result;
}
