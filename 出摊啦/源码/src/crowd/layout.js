/* Pure crowd geometry. Queue length is never a rendering limit: every omitted
   sprite is counted outside, while the business queue remains untouched. */
const EPSILON = 1e-8;
const finite = value => typeof value === 'number' && Number.isFinite(value);

function pixelPolygon(zone, width, height) {
  if (!zone?.enabled || !Array.isArray(zone.pts) || zone.pts.length < 3) return null;
  const points = zone.pts.filter(point => Array.isArray(point) && finite(point[0]) && finite(point[1]))
    .map(([x, y]) => [x * width / 100, y * height / 100]);
  if (points.length < 3) return null;
  return points;
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const between = (value, a, b) => value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;
const onSegment = (point, a, b) => Math.abs(cross(a, b, point)) <= EPSILON && between(point[0], a[0], b[0]) && between(point[1], a[1], b[1]);

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function intersectsPolygon(rect, polygon, pad = 0) {
  if (!polygon) return false;
  const left = rect.x - pad, right = rect.x + rect.width + pad;
  const top = rect.y - pad, bottom = rect.y + rect.height + pad;
  const corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
  if (corners.some(point => pointInPolygon(point, polygon))) return true;
  // Polygon vertices inside the rectangle also catch a fully enclosed face.
  if (polygon.some(([x, y]) => x >= left - EPSILON && x <= right + EPSILON && y >= top - EPSILON && y <= bottom + EPSILON)) return true;
  // Testing every edge is essential for thin crossings and concave outlines;
  // sampled corners or a bounding box cannot establish safe placement.
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    for (let edge = 0; edge < 4; edge++) {
      if (segmentsIntersect(polygon[j], polygon[i], corners[edge], corners[(edge + 1) % 4])) return true;
    }
  }
  return false;
}

/** True includes touching the polygon edge. pad expands the full rectangle. */
export function rectIntersectsZone(rect, zone, width, height, pad = 0) {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height, width, height].every(finite)) return false;
  return intersectsPolygon(rect, pixelPolygon(zone, width, height), finite(pad) ? Math.max(0, pad) : 0);
}

function rowPositions(viewportWidth, spriteWidth, row) {
  const last = viewportWidth - spriteWidth;
  if (last < -EPSILON) return [];
  const step = spriteWidth * .70, positions = [0];
  for (let x = row % 2 ? step / 2 : step; x < last - EPSILON; x += step) {
    if (x > EPSILON) positions.push(x);
  }
  if (last > EPSILON) positions.push(last);
  // A short row grows around the center instead of leaving one side empty.
  const center = last / 2;
  return positions.sort((a,b) => Math.abs(a-center)-Math.abs(b-center) || a-b);
}

function availableSlots(width, height, counterTop, polygon, squeeze) {
  const unit = Math.min(width, height) / 1080;
  // Give 500 customers enough vertical reach instead of packing them all below
  // the face. Portrait rows have a little less overlap than landscape rows.
  const portrait = Math.max(0, Math.min(1, (16 / 9 - width / height) / (16 / 9 - 9 / 16)));
  const rowPitch = .80 + .10 * portrait;
  const bottom = Math.min(height, Math.max(0, counterTop + 12 * unit));
  const farY = 6 * unit + 20 * unit * squeeze * .5;
  const nearY = bottom - 130 * unit * squeeze;
  if (nearY < farY) return [];
  const slots = [];
  let row = 0, y = nearY;
  while (true) {
    const depth = nearY > farY ? (y - farY) / (nearY - farY) : 1;
    const scale = squeeze * (.5 + .5 * depth);
    const spriteWidth = 110 * unit * scale, spriteHeight = 130 * unit * scale;
    const jump = 20 * unit * scale;
    for (const x of rowPositions(width, spriteWidth, row)) {
      const reserved = { x, y: y - jump, width: spriteWidth, height: spriteHeight + jump };
      if (intersectsPolygon(reserved, polygon, 4 * unit)) continue;
      slots.push({ x, y, width: spriteWidth, height: spriteHeight, scale, row, front: false });
    }
    if (y <= farY + EPSILON) break;
    y = Math.max(farY, y - spriteHeight * rowPitch);
    row++;
  }
  const frontRow = slots[0]?.row;
  for (const slot of slots) slot.front = slot.row === frontRow;
  return slots;
}

/** x/y are top-left full-frame coordinates; scale includes the optional squeeze.
    Slots are in queue order, nearest row first. Draw in reverse for occlusion. */
export function layoutCrowd({ width, height, zone, count = 0, counterTop, compress = true } = {}) {
  const queued = finite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) return { slots: [], outside: queued, compressed: false, capacity: 0 };
  const unit = Math.min(width, height) / 1080;
  const top = finite(counterTop) ? counterTop : height - 172 * unit;
  const polygon = pixelPolygon(zone, width, height);
  const normal = availableSlots(width, height, top, polygon, 1);
  const compressed = Boolean(compress && queued > normal.length);
  const available = compressed ? availableSlots(width, height, top, polygon, .85) : normal;
  const slots = available.slice(0, queued).sort((a,b) => a.row-b.row || a.x-b.x);
  return { slots, outside: queued - slots.length, compressed, capacity: available.length };
}
