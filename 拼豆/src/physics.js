import RAPIER from '@dimforge/rapier3d-compat';

// Lengths are in grid pitches. The ring, including its collision shape, has
// an open center: a solid cylinder here would rest on top of a peg.
const PITCH = 1;
const OUTER_RADIUS = 0.36;
const INNER_RADIUS = 0.19;
const BEAD_HALF_HEIGHT = 0.21;
const PEG_RADIUS = 0.13;
const PEG_HALF_HEIGHT = 0.25;
const RING_SEGMENTS = 8;
const MAX_BOARD_SIDE = 64;
// 同时参与碰撞计算的豆子上限（可按画质传入）。超出的豆先走简化的抛物线，落地后直接静止。
const DEFAULT_ACTIVE_BODIES = 96;
// 每帧最多补算几步：画面卡的时候宁可慢一点，也不要越补越卡。
const MAX_STEPS_PER_FRAME = 3;
// 每一步最多新建几个刚体：一次摇掉几百颗时分几帧陆续接入，避免某一帧突然卡一下。
const SPAWNS_PER_STEP = 24;
const FIXED_STEP = 1 / 60;
const IDENTITY = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

let rapierReady;
export function ensurePhysicsRuntime() {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

// 有些宿主页面的内容安全策略（CSP）不允许 WebAssembly（例如白曜重工的插件页：script-src 只有 'unsafe-inline'），
// Rapier 无法启动。这时改用纯 JS 的简化物理：落豆、摇掉、散落、复原都照常，只是掉落的豆不做豆与豆、豆与柱之间的碰撞。
let runtimeMode;
async function physicsRuntimeMode() {
  if (runtimeMode) return runtimeMode;
  try { await ensurePhysicsRuntime(); runtimeMode = 'rapier'; }
  catch (error) { runtimeMode = 'lite'; rapierReady = undefined; console.warn('[拼豆] WebAssembly 不可用，改用简化物理：', error?.message || error); }
  return runtimeMode;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function boardSize(size) {
  const rows = typeof size === 'number' ? size : size?.rows;
  const cols = typeof size === 'number' ? size : size?.cols;
  if (![rows, cols].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_BOARD_SIDE)) {
    throw new RangeError(`Board rows and columns must each be 1–${MAX_BOARD_SIDE}`);
  }
  return { rows, cols };
}

function pointFor(row, col, rows, cols) {
  return { x: (col - (cols - 1) / 2) * PITCH, z: (row - (rows - 1) / 2) * PITCH };
}

function ringSegmentVertices(segment) {
  const start = 2 * Math.PI * segment / RING_SEGMENTS;
  const end = 2 * Math.PI * (segment + 1) / RING_SEGMENTS;
  const points = [];
  for (const y of [-BEAD_HALF_HEIGHT, BEAD_HALF_HEIGHT]) {
    for (const radius of [INNER_RADIUS, OUTER_RADIUS]) {
      for (const angle of [start, end]) {
        points.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
      }
    }
  }
  return new Float32Array(points);
}

const ringSegments = Array.from({ length: RING_SEGMENTS }, (_, i) => ringSegmentVertices(i));

// 摇晃判定用：FNV 结果再做一次雪崩混合，保证每次摇晃之间相互独立。
function shakeRoll(id, serial) {
  let hash = Math.floor(hashUnit(`${serial}|${id}`) * 0x100000000) >>> 0;
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

function hashUnit(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function clonePose(record) {
  const { pose } = record;
  return {
    id: record.id,
    row: record.row,
    col: record.col,
    color: record.color,
    x: pose.x,
    y: pose.y,
    z: pose.z,
    rotation: { ...pose.rotation },
    state: record.state,
    stable: record.state === 'seated',
  };
}

/**
 * Create the 3D collision world for a peg board.
 *
 * onUpdate receives all bead poses after each step. onFallen receives an id
 * when that bead loses its peg, so the UI can update completion immediately.
 * Seated beads are compact logical poses; falling beads use dynamic Rapier
 * bodies with eight convex ring segments. This bounds collision work on a
 * large board without making the falling pieces solid cylinders.
 */
export async function createPegPhysics({ size, onUpdate = () => {}, onFallen = () => {}, reportAll = true, maxBodies = DEFAULT_ACTIVE_BODIES, mode: requestedMode = 'auto' }) {
  const MAX_ACTIVE_BODIES = clamp(Math.round(Number(maxBodies) || DEFAULT_ACTIVE_BODIES), 8, 160);
  const { rows, cols } = boardSize(size);
  const mode = requestedMode === 'lite' ? 'lite' : await physicsRuntimeMode();
  const lite = mode === 'lite';
  const tableHalfX = cols * 0.5 + 2;
  const tableHalfZ = rows * 0.5 + 2;
  const world = lite ? null : createWorld();
  function createWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;
  const board = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(cols * 0.5, 0.04, rows * 0.5)
      .setTranslation(0, -0.04, 0)
      .setFriction(0.65),
    board,
  );
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const { x, z } = pointFor(row, col, rows, cols);
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(PEG_HALF_HEIGHT, PEG_RADIUS)
          .setTranslation(x, PEG_HALF_HEIGHT, z)
          .setFriction(0.8),
        board,
      );
    }
  }
  // The transparent scene still has a physical work table to catch spills.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(tableHalfX, 0.04, tableHalfZ)
      .setTranslation(0, -0.22, 0)
      .setFriction(0.6),
  );
  // Transparent catch boundaries keep strong shake gifts within the part of
  // the stream overlay reserved for the work surface.
  for (const x of [-tableHalfX, tableHalfX]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.06, 1.4, tableHalfZ)
        .setTranslation(x, 1.22, 0)
        .setRestitution(0.08),
    );
  }
  for (const z of [-tableHalfZ, tableHalfZ]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(tableHalfX, 1.4, 0.06)
        .setTranslation(0, 1.22, z)
        .setRestitution(0.08),
    );
  }
  return world;
  }

  const beads = new Map();
  let activeBodies = 0;
  let spawnsThisStep = 0;
  let accumulator = 0;
  let destroyed = false;

  function requireAlive() {
    if (destroyed) throw new Error('Peg physics has been destroyed');
  }

  function removeBody(record) {
    if (!record.body) return;
    world.removeRigidBody(record.body);
    record.body = null;
    activeBodies--;
  }

  function spawnBody(record, y = record.pose.y, { settling = false } = {}) {
    if (lite || activeBodies >= MAX_ACTIVE_BODIES) return false;
    if (!settling && spawnsThisStep >= SPAWNS_PER_STEP) return false;
    spawnsThisStep++;
    const pose = record.pose;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pose.x, y, pose.z)
        .setRotation(pose.rotation)
        .setLinearDamping(0.22)
        .setAngularDamping(0.38)
        // 豆子最快每步只移动约 0.1 格，远小于豆厚，不需要连续碰撞检测（CCD 很耗性能）。
        .setCcdEnabled(false),
    );
    for (const vertices of ringSegments) {
      world.createCollider(
        RAPIER.ColliderDesc.convexHull(vertices)
          .setDensity(0.08)
          .setFriction(0.72)
          .setRestitution(0.08),
        body,
      );
    }
    record.body = body;
    activeBodies++;
    return true;
  }

  function syncPose(record) {
    if (!record.body) return;
    const position = record.body.translation();
    const rotation = record.body.rotation();
    record.pose = {
      x: position.x, y: position.y, z: position.z,
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    };
  }

  function release(record, power) {
    if (record.state === 'loose') return;
    if (record.state === 'returning') return;
    record.state = 'loose';
    record.age = 0;
    const angle = hashUnit(record.id) * 2 * Math.PI;
    const speed = 1.1 + 1.4 * power;
    // Lift the ring above the peg before applying the sideways shake.
    // A lateral impulse at board height presses the inner wall against the
    // peg, so the bead would remain pinned even during a violent spill.
    const vy = 3.9 + 1.3 * power;
    if (record.body || spawnBody(record)) {
      record.body.setLinvel({ x: 0, y: vy, z: 0 }, true);
      record.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      record.pendingLateral = { x: Math.cos(angle) * speed, z: Math.sin(angle) * speed };
    } else {
      // Visual fallback only when a mass spill exceeds the safe active-body
      // budget. As slots open, these pieces are promoted to real bodies.
      // 每颗豆的抛出速度略有不同，散得更自然。
      const spread = 0.75 + 0.7 * hashUnit(`${record.id}|spread`);
      record.fallbackVelocity = { x: Math.cos(angle) * speed * spread, y: vy * (0.85 + 0.3 * hashUnit(`${record.id}|up`)), z: Math.sin(angle) * speed * spread };
      // 简化轨迹没有真实翻滚：给一个固定的随机朝向，落地后看起来不会整齐地平躺。
      const tilt = 0.25 + 0.9 * hashUnit(`${record.id}|tilt`), yaw = angle * 1.7;
      const half = tilt / 2, s = Math.sin(half);
      const ax = Math.cos(yaw), az = Math.sin(yaw);
      record.pose.rotation = { x: ax * s, y: 0, z: az * s, w: Math.cos(half) };
    }
    record.report = true;
    onFallen(record.id);
  }

  function addBead(id, row, col, color) {
    requireAlive();
    if (beads.has(id)) throw new Error(`Bead id already exists: ${id}`);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= rows || col < 0 || col >= cols) {
      throw new RangeError('Bead row/col is outside the peg board');
    }
    const { x, z } = pointFor(row, col, rows, cols);
    const record = {
      id, row, col, color,
      state: 'settling', age: 0, body: null, fallbackVelocity: null,
      pose: { x, y: 0.57, z, rotation: { ...IDENTITY } },
    };
    beads.set(id, record);
    // 没有刚体名额（或简化物理）时，用脚本动画把豆落到柱上。
    if (!spawnBody(record, 0.57, { settling: true })) record.scriptedDrop = true;
    return clonePose(record);
  }

  function removeBead(id) {
    requireAlive();
    const record = beads.get(id);
    if (!record) return false;
    removeBody(record);
    beads.delete(id);
    return true;
  }

  function addLooseBead(bead) {
    requireAlive();
    if(beads.has(bead.id))removeBead(bead.id);
    const p=bead.pose;
    const record={id:bead.id,row:bead.row,col:bead.col,color:bead.color,state:'loose',age:10,body:null,fallbackVelocity:null,pendingLateral:null,report:true,
      pose:{x:p.x,y:p.y,z:p.z,rotation:{...p.rotation}}};
    beads.set(bead.id,record);return clonePose(record);
  }

  let shakeSerial = 0;
  function shake(strength = 0.5) {
    requireAlive();
    const power = clamp(Number(strength) || 0, 0, 1);
    if (power < 0.18) return 0;
    const chance = 0.82 * (power - 0.18) / 0.82;
    const candidates = [...beads.values()].filter(record => record.state === 'seated' || record.state === 'settling');
    // 每次摇晃使用新的序号：否则已套柱的豆年龄不变，同一批豆每次都得到同样结果，第一次没掉的豆永远摇不掉。
    const serial = ++shakeSerial;
    let count = 0;
    for (const record of candidates) {
      if (shakeRoll(record.id, serial) < chance) {
        release(record, power);
        count++;
      }
    }
    if (power >= 0.95 && count === 0 && candidates.length) {
      release(candidates[0], power);
      count++;
    }
    return count;
  }

  function spill() {
    requireAlive();
    let count = 0;
    for (const record of beads.values()) {
      if (record.state === 'seated' || record.state === 'settling') {
        release(record, 1);
        count++;
      }
    }
    return count;
  }

  function restore(ids) {
    requireAlive();
    const selected = ids == null ? [...beads.keys()] : ids;
    let count = 0;
    for (const id of selected) {
      const record = beads.get(id);
      if (!record || record.state !== 'loose') continue;
      syncPose(record);
      removeBody(record);
      record.fallbackVelocity = null;
      record.returnFrom = { ...record.pose, rotation: { ...record.pose.rotation } };
      record.state = 'returning';
      record.age = 0;
      count++;
    }
    return count;
  }

  function simulateFallback(record, dt) {
    const velocity = record.fallbackVelocity;
    if (!velocity) return;
    velocity.y -= 9.81 * dt;
    record.pose.x += velocity.x * dt;
    record.pose.y += velocity.y * dt;
    record.pose.z += velocity.z * dt;
    // 桌边有透明挡板：碰到就弹回来。
    const limitX = tableHalfX - OUTER_RADIUS, limitZ = tableHalfZ - OUTER_RADIUS;
    if (Math.abs(record.pose.x) > limitX) { record.pose.x = Math.sign(record.pose.x) * limitX; velocity.x *= -0.3; }
    if (Math.abs(record.pose.z) > limitZ) { record.pose.z = Math.sign(record.pose.z) * limitZ; velocity.z *= -0.3; }
    // 落在板面上就停在柱顶，落在板外就停在桌面上。
    const onBoard = Math.abs(record.pose.x) < cols * 0.5 && Math.abs(record.pose.z) < rows * 0.5;
    const floor = (onBoard ? PEG_HALF_HEIGHT * 2 : -0.18) + BEAD_HALF_HEIGHT * 0.6;
    if (record.pose.y <= floor) {
      record.pose.y = floor;
      velocity.y = Math.abs(velocity.y) > 0.6 ? -velocity.y * 0.25 : 0;
      // 贴地后滑行一小段再停（摩擦减速），而不是原地落下。
      const planar = Math.hypot(velocity.x, velocity.z), slowed = Math.max(0, planar - 1.4 * dt);
      if (planar > 0) { velocity.x *= slowed / planar; velocity.z *= slowed / planar; }
      if (velocity.y === 0 && slowed < 0.05) {
        record.fallbackVelocity = null; // 已经静止：不再计算，也不再占用物理名额。
        record.report = true;
        return;
      }
    }
    // 只有还在空中的豆才补成真实刚体；已经落地的不再补，避免一次大摇晃让物理引擎忙几十秒。
    if (record.age > 0.2 && record.age < 0.9 && velocity.y > -1 && activeBodies < MAX_ACTIVE_BODIES && spawnBody(record)) {
      record.body.setLinvel(velocity, true);
      record.fallbackVelocity = null;
    }
  }

  function simulateReturn(record, dt) {
    record.age += dt;
    const t = clamp(record.age / 0.58, 0, 1);
    const eased = 1 - (1 - t) ** 3;
    const target = pointFor(record.row, record.col, rows, cols);
    const from = record.returnFrom;
    record.pose.x = from.x + (target.x - from.x) * eased;
    record.pose.z = from.z + (target.z - from.z) * eased;
    record.pose.y = from.y + (BEAD_HALF_HEIGHT - from.y) * eased + 0.55 * Math.sin(Math.PI * t);
    record.pose.rotation = { ...IDENTITY };
    if (t === 1) {
      record.state = 'seated';
      record.justSeated = true;
      record.pose = { x: target.x, y: BEAD_HALF_HEIGHT, z: target.z, rotation: { ...IDENTITY } };
      record.returnFrom = null;
    }
  }

  function simulateScriptedDrop(record) {
    const t = clamp(record.age / 0.28, 0, 1);
    record.pose.y = 0.57 + (BEAD_HALF_HEIGHT - 0.57) * t * t;
    if (t === 1) {
      record.scriptedDrop = false;
      record.state = 'seated';
      record.justSeated = true;
      record.pose = { ...record.pose, y: BEAD_HALF_HEIGHT, rotation: { ...IDENTITY } };
    }
  }

  function simulateFrame() {
    world?.step();
    spawnsThisStep = 0;
    for (const record of beads.values()) {
      if (record.state === 'returning') {
        simulateReturn(record, FIXED_STEP);
        continue;
      }
      if (record.state === 'seated') continue;
      record.age += FIXED_STEP;
      if (record.state === 'settling' && record.scriptedDrop) { simulateScriptedDrop(record); continue; }
      if (record.body) syncPose(record);
      else if (record.state === 'loose') simulateFallback(record, FIXED_STEP);
      if (record.state === 'loose' && record.body && record.pendingLateral && record.pose.y > PEG_HALF_HEIGHT * 2 + BEAD_HALF_HEIGHT + 0.02) {
        const { x, z } = record.pendingLateral;
        const upward = Math.max(0, record.body.linvel().y);
        record.body.setLinvel({ x, y: upward, z }, true);
        record.body.setAngvel({ x: z * 1.6, y: 3, z: -x * 1.6 }, true);
        record.pendingLateral = null;
      }
      if (record.state === 'settling' && record.age >= 0.55) {
        const target = pointFor(record.row, record.col, rows, cols);
        const close = Math.hypot(record.pose.x - target.x, record.pose.z - target.z) < 0.2;
        if (close || record.age > 1.4) {
          removeBody(record);
          record.state = 'seated';
          record.justSeated = true;
          record.pose = { x: target.x, y: BEAD_HALF_HEIGHT, z: target.z, rotation: { ...IDENTITY } };
        }
      }
      if (record.state === 'loose' && record.body && record.age > 1.6) {
        const velocity = record.body.linvel();
        if (Math.hypot(velocity.x, velocity.y, velocity.z) < 0.15 || record.body.isSleeping() || record.age > 6) { syncPose(record); removeBody(record); record.report = true; }
      }
    }
  }

  function step(dt) {
    requireAlive();
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Physics step dt must be a nonnegative finite number');
    accumulator = Math.min(accumulator + dt, FIXED_STEP * MAX_STEPS_PER_FRAME);
    while (accumulator + 1e-9 >= FIXED_STEP) {
      simulateFrame();
      accumulator -= FIXED_STEP;
    }
    // reportAll:false 时只报告在动的豆、刚套稳的豆和刚静止的豆；已经静止的豆（柱上或桌上）不必每帧传一遍。
    const poses = [];
    for (const record of beads.values()) {
      const moving = record.state === 'settling' || record.state === 'returning' || record.body || record.fallbackVelocity;
      if (reportAll || moving || record.justSeated || record.report) poses.push(clonePose(record));
      record.justSeated = false;
      record.report = false;
    }
    onUpdate(poses);
  }

  function getBeadPose(id) {
    requireAlive();
    const record = beads.get(id);
    return record ? clonePose(record) : null;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    beads.clear();
    world?.free();
  }

  return Object.freeze({ mode, addBead, addLooseBead, removeBead, shake, spill, restore, step, getBeadPose, destroy });
}
