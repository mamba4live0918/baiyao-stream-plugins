/* 分拣台布局（纯数据，可直接用 Node 测试）。
   「柜台」：画面底部横一长条柜台，主播站在柜台后面；垃圾在面前的台面上越堆越高，桶贴着柜台前沿排在正中。
            柜台、传送带、堆货台都是实心的，后面紧贴一道隐形墙，东西只会停在看得见、点得到的地方。
   「经典俯视」：V1.0 起的斜俯视立体展台（地台、车道、架在钢架上的筐）。
   场景和碰撞体在启动时按布局一次建好，切换布局要重新载入页面。 */
export const STAGE_IDS = ['counter', 'classic'];
export const STAGE_LABEL = { counter: '柜台（推荐）', classic: '经典俯视' };

export const STAGES = {
  counter: {
    id: 'counter',
    plat: { x0: -8.0, x1: 8.0, z0: -2.6, z1: 3.0 },           // 「只在地台上」的四面墙、接地阴影只画在这以外
    table: { x0: -3.9, x1: 7.8, z0: -2.6, z1: -.2, top: 2.3 }, // 柜台台面（右端放识别台）
    belt: { x0: -5.3, x1: -3.3, z: -1.4, w: 1.7, top: 2.9, kick: 2.6 },  // 从堆货台往柜台送，末端伸到台面上方；出口把东西往台面里推一把，免得堵在出口
    dock: { x0: -7.8, x1: -5.3, z0: -2.6, z1: -.2, top: 1.75, cap: 8, layers: 2 },   // 比台面矮、最多叠两层：后面停的货车露得出来
    feed: { x: -5.9, z: -1.4 },
    scan: { x: 6.8, z: -1.4, top: 2.36 },
    truck: { park: -6.55, z: -3.2, away: 16, yaw: Math.PI / 2, scale: 1.3 }, // 倒车停在堆货台后面，车尾朝镜头开门卸货
    base: .8,                                                  // 桶底高度：桶口 1.65 低于台面 2.3，台面上的东西不会被桶挡住
    slots: {
      express: [[-2.8, .8], [0, .8], [2.8, .8]],
      garbage: [[-4.2, .8], [-1.4, .8], [1.4, .8], [4.2, .8]],
    },
    backZ: -2.6,                                               // 后墙固定贴着柜台后沿
    frontZ: 3.2,                                               // 前墙：镜头离得近，东西最多飞到桶前的地面，不会贴到镜头上
    sideX: [-7.8, 7.8],                                        // 左右侧墙贴着台子两头：台子两头外面靠后的地面从镜头看会被台子挡住
    drag: { x: [-7.4, 7.4], z: [-2.2, 2.6] },                  // 「只在地台上」时拿着东西能移动的范围
    // 取景按实物轮廓框：柜台一整条（左右对称，桶排正对画面中间）+ 桶和桶前的地面；货车在框外上方照样看得见
    fit: [{ x: [-7.8, 7.8], y: [-.1, 2.9], z: [-2.6, -.2] }, { x: [-5.6, 5.6], y: [-.1, 1.8], z: [-.2, 2.6] }],
    floor: false, road: false, legs: false,
    view: { scene: { x: 0, y: 62, w: 100, h: 38 }, cam: { view: 'front', pitch: 22, yaw: 0, zoom: 100, panX: 0, panY: 0 } },
    hud: { counter: { x: 2, y: 2 }, board: { x: 81, y: 2, on: false } },
  },
  classic: {
    id: 'classic',
    plat: { x0: -10.9, x1: 8.6, z0: -6.4, z1: 5.0 },
    table: { x0: .9, x1: 6.7, z0: -3.3, z1: .7, top: .92 },
    belt: { x0: -6.6, x1: 1.9, z: -2.1, w: 1.7, top: 1.55 },
    dock: { x0: -9.45, x1: -4.3, z0: -5.05, z1: -2.95, top: 1.42, cap: 24, layers: 3 },
    feed: { x: -5.6, z: -3.2 },
    scan: { x: 2.8, z: 2.45, top: 1.02 },
    truck: { park: -6.9, z: -5.45, away: 19, yaw: Math.PI / 2 },
    base: 1.25,
    slots: {
      express: [[-5.5, 2.35], [-2.55, 2.35], [.4, 2.35]],
      garbage: [[-8.2, 2.35], [-5.35, 2.35], [-2.5, 2.35], [.35, 2.35]],
    },
    backZ: null,                                               // 后墙按「地台后方空间」设置
    drag: { x: [-8.6, 9.2], z: [-4.1, 3.9] },
    fit: [{ x: [-10.9, 8.6], y: [-.5, 3.3], z: [-5.6, 5.0] }],
    floor: true, road: true, legs: true,
    view: { scene: { x: 0, y: 34, w: 100, h: 66 }, cam: { view: 'oblique', pitch: 42, yaw: 0, zoom: 100, panX: 0, panY: 0 } },
    hud: { counter: { x: 42, y: 2 }, board: { x: 81, y: 2, on: false } },
  },
};

export const stageOf = id => STAGES[id] || STAGES.counter;

/* 堆货台上的落货格：按台面大小排几列几行（每格约 1.24 × 1.0），离传送带入口近的先堆 */
export function dockCells(dock, feed) {
  const cols = Math.max(1, Math.round((dock.x1 - dock.x0 - .4) / 1.24)), rows = Math.max(1, Math.round((dock.z1 - dock.z0 - .3) / 1.0));
  const cells = [];
  for (let ix = 0; ix < cols; ix++) for (let iz = 0; iz < rows; iz++) cells.push({ x: dock.x1 - .7 - ix * 1.24, z: dock.z1 - .55 - iz * 1.0 });
  return cells.sort((a, b) => (a.x - feed.x) ** 2 + (a.z - feed.z) ** 2 - ((b.x - feed.x) ** 2 + (b.z - feed.z) ** 2));
}
