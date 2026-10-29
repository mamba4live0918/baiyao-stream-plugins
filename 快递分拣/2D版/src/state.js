/* 2D 版的共享状态：设置、物理世界、布局、物件、桶、排队中的观众效果、时钟都挂在 G 上，各模块读写同一份。
   世界坐标用米（x 向右、y 向上、原点在窗口左下角），画面坐标用 CSS 像素（y 向下），换算见 toScreen / toWorld。 */
export const G = {
  S: null, rules: [], likeAcc: new Map(),
  world: null, fixed: null, statics: null, headCol: null, head: null,   // head：露头圆在世界里的位置 { x, y, r }（米），没开时为 null
  L: null, W: 1, H: 1,
  time: 0,
  items: [], bins: [], unloads: [],
  held: null,
  state: 'work', delivered: 0, elapsed: 0, doneT: 0, overtime: false, runLevel: null, shiftNo: 0,
  stats: null, auditSegs: [], speedSegs: [],
  bigQueue: [], warns: [], bigT: 0, helpQueue: [], prankQueue: [], trickQueue: [], pendingTape: [], pendingStrip: [], kickQueue: [], kickNext: 0,
  splits: [], parts: [], flyers: [],
  shake: 0, tableShake: 0, beltPos: 0, spawnT: 0, jamT: 0, jam: false, entryBlocked: false,
  truck: { st: 'gone', t: 0, x: -20, batches: [], name: '', body: null, bodyOn: false, loadMax: 0 },
  drones: [],
};
export const isGarbage = () => G.S.mode === 'garbage';
export const toScreen = p => ({ x: p.x * G.L.ppm, y: G.H - p.y * G.L.ppm });
export const toWorld = (sx, sy) => ({ x: sx / G.L.ppm, y: (G.H - sy) / G.L.ppm });
/* 货车车身（车厢）中心的高度：车轮压在地面上 */
export const truckCY = () => G.L.truck.h / 2 + .18;
export const truckTop = () => G.L.truck.h + .18;
