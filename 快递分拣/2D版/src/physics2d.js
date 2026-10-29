/* 2D 物理：Rapier（3D 版）锁在 xy 平面——动态件只能沿 x、y 平移、只能绕 z 转，等于平面物理。
   碰撞分两层（碰撞组：高 16 位 = 成员，低 16 位 = 和谁碰）：
   - 后层 BACK：台面上的件；固定的柜台、传送带、货车只挡后层。
   - 前层 FRONT：桶（U 形）、桶里的件、桶前地面上的件；桶和封桶的盖板只挡前层。
   窗口四边和露头圆两层都挡。台面上堆着的件在后层，永远不会自己掉进桶——只有松手、被踹 / 炸飞经过桶口的件才换到前层。 */
import RAPIER from '@dimforge/rapier3d-compat';
export { RAPIER };

export const LAYER = { BACK: 0x1, FRONT: 0x2, WALL: 0x4, BACKSTAT: 0x8, BINSTAT: 0x10, HEAD: 0x20, LID: 0x40 };
const G = (m, f) => (m << 16) | f;
export const GROUPS = {
  itemBack: G(LAYER.BACK, LAYER.BACK | LAYER.WALL | LAYER.BACKSTAT | LAYER.HEAD),
  itemFront: G(LAYER.FRONT, LAYER.FRONT | LAYER.WALL | LAYER.BINSTAT | LAYER.HEAD | LAYER.LID),
  wall: G(LAYER.WALL, LAYER.BACK | LAYER.FRONT),
  backStatic: G(LAYER.BACKSTAT, LAYER.BACK),
  binStatic: G(LAYER.BINSTAT, LAYER.FRONT),
  head: G(LAYER.HEAD, LAYER.BACK | LAYER.FRONT),
  lid: G(LAYER.LID, LAYER.FRONT),
};
/* 查询用的碰撞组（射线、重叠测试）：成员写成对应那一层的物件，只看想看的东西 */
export const QUERY = {
  backSurface: G(LAYER.BACK, LAYER.BACK | LAYER.BACKSTAT | LAYER.WALL | LAYER.HEAD),
  backPile: G(LAYER.BACK, LAYER.BACK | LAYER.BACKSTAT | LAYER.WALL),
  frontSurface: G(LAYER.FRONT, LAYER.FRONT | LAYER.BINSTAT | LAYER.LID | LAYER.WALL),
  backSolid: G(LAYER.BACK, LAYER.BACK | LAYER.BACKSTAT),
  frontSolid: G(LAYER.FRONT, LAYER.FRONT | LAYER.BINSTAT | LAYER.LID),
};
export const DEPTH = .3;                                   // 物件在 z 方向的半厚度（只是让碰撞体有体积）
const TO_Z = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };   // Rapier 的圆柱轴是 y，转 90° 变成朝镜头的圆

export async function createWorld(gravity = -26) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: gravity, z: 0 }); world.timestep = 1 / 60;
  return { world, fixed: world.createRigidBody(RAPIER.RigidBodyDesc.fixed()) };
}

/* 物件的碰撞形状：box [宽, 高] / circle 半径 / poly 顶点（米，中心为原点、y 向上，凸多边形）
   圆按十边形做：真圆在平面上没有滚动阻力，苹果、罐子会一直滚出去；有棱的滚几下就停 */
export function shapeDesc(body) {
  if (body.box) return RAPIER.ColliderDesc.cuboid(body.box[0] / 2, body.box[1] / 2, DEPTH);
  const poly = body.circle ? Array.from({ length: 10 }, (_, i) => { const a = (i + .5) / 10 * Math.PI * 2; return [Math.cos(a) * body.circle, Math.sin(a) * body.circle]; }) : body.poly;
  const pts = []; for (const [x, y] of poly) pts.push(x, y, -DEPTH, x, y, DEPTH);
  return RAPIER.ColliderDesc.convexHull(new Float32Array(pts)) || RAPIER.ColliderDesc.cuboid(.3, .3, DEPTH);
}

/* 一件动态物件：锁在平面里；layer 'back' / 'front' */
export function makeItemBody(world, { x, y, vx = 0, vy = 0, w = 0, rot = 0, body, density = 1, layer = 'back' }) {
  const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, 0).enabledTranslations(true, true, false).enabledRotations(false, false, true)
    .setRotation({ x: 0, y: 0, z: Math.sin(rot / 2), w: Math.cos(rot / 2) }).setLinvel(vx, vy, 0).setAngvel({ x: 0, y: 0, z: w }).setLinearDamping(.08).setAngularDamping(.7).setCcdEnabled(true));
  const col = world.createCollider(shapeDesc(body).setFriction(.72).setRestitution(.05).setDensity(density).setCollisionGroups(layer === 'front' ? GROUPS.itemFront : GROUPS.itemBack), rb);
  return { rb, col };
}
export const setLayer = (col, layer) => col.setCollisionGroups(layer === 'front' ? GROUPS.itemFront : GROUPS.itemBack);
export const angleOf = rb => { const r = rb.rotation(); return 2 * Math.atan2(r.z, r.w); };

const box = (world, fixed, x0, y0, x1, y1, groups, fr = .7) => world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, 1).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, 0).setFriction(fr).setCollisionGroups(groups), fixed);

export const BIN_WALL = .09;
const disc = (world, fixed, x, y, r, groups) => world.createCollider(RAPIER.ColliderDesc.cylinder(1, r).setRotation(TO_Z).setTranslation(x, y, 0).setFriction(.3).setCollisionGroups(groups), fixed);
const wedge = (world, fixed, pts, groups) => { const a = []; for (const [x, y] of pts) a.push(x, y, -1, x, y, 1); return world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(a)).setFriction(.2).setCollisionGroups(groups), fixed); };

/* 场景里的固定碰撞体：窗口四边、柜台、传送带、当前玩法的桶。窗口或布局一变就整组删掉重建。
   桶是 U 形（底 + 两壁），壁顶是圆头；相邻两个桶之间架一个小尖顶：掉在缝上的件会滑进其中一个桶，不会卡在两个桶中间 */
export function buildStatics(world, fixed, L, binList) {
  const all = [], W = L.worldW, H = L.worldH, t = BIN_WALL;
  for (const [x0, y0, x1, y1] of [[-2, -2, 0, H + 2], [W, -2, W + 2, H + 2], [-2, -2, W + 2, 0], [-2, H, W + 2, H + 2]]) all.push(box(world, fixed, x0, y0, x1, y1, GROUPS.wall, .5));
  all.push(box(world, fixed, L.counter.x0, -.5, L.counter.x1 + .5, L.counter.top, GROUPS.backStatic, .8));
  all.push(box(world, fixed, L.belt.x0, -.5, L.belt.x1, L.belt.top, GROUPS.backStatic, .4));
  const bins = binList.map(b => {
    const bottom = box(world, fixed, b.x - b.w / 2 + t, b.bottom, b.x + b.w / 2 - t, b.bottom + t, GROUPS.binStatic, .6);
    const walls = [box(world, fixed, b.x - b.w / 2, b.bottom, b.x - b.w / 2 + t, b.top, GROUPS.binStatic, .5), box(world, fixed, b.x + b.w / 2 - t, b.bottom, b.x + b.w / 2, b.top, GROUPS.binStatic, .5)];
    const caps = [disc(world, fixed, b.x - b.w / 2 + t / 2, b.top, t / 2 + .01, GROUPS.binStatic), disc(world, fixed, b.x + b.w / 2 - t / 2, b.top, t / 2 + .01, GROUPS.binStatic)];
    all.push(bottom, ...walls, ...caps); return { bottom, walls };
  });
  for (let i = 1; i < binList.length; i++) {
    const a = binList[i - 1], b = binList[i], x0 = a.x + a.w / 2 - t / 2, x1 = b.x - b.w / 2 + t / 2, top = Math.min(a.top, b.top);
    all.push(wedge(world, fixed, [[x0, top - .02], [x1, top - .02], [(x0 + x1) / 2, top + .16]], GROUPS.binStatic));
  }
  return { all, bins };
}
export function removeStatics(world, s) { for (const c of s.all) world.removeCollider(c, false); }
export const enableBinColliders = (cols, on, bottomOn = on) => { cols.bottom.setEnabled(bottomOn); for (const w of cols.walls) w.setEnabled(on); };

/* 封桶的盖板：桶口上一块只挡前层的板 */
export const makeLid = (world, fixed, b) => box(world, fixed, b.x - b.w / 2, b.top - .06, b.x + b.w / 2, b.top + .06, GROUPS.lid, .4);

/* 露头圆：一个朝镜头的圆柱，两层都挡 */
export const makeHead = (world, fixed, x, y, r) => world.createCollider(RAPIER.ColliderDesc.cylinder(1, r).setRotation(TO_Z).setTranslation(x, y, 0).setCollisionGroups(GROUPS.head), fixed);

/* 货车：跟着车走的运动学刚体（只挡后层），车顶能接住掉下来的件；cy 是车厢中心高度 */
export function makeTruckBody(world, w, h, cy) {
  const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-20, cy, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, 1).setFriction(.6).setCollisionGroups(GROUPS.backStatic), rb);
  return rb;
}
