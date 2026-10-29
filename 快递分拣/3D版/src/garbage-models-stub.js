/* 临时垃圾模型（正式模型 garbage-models.js 到位前用于接线和测试）：彩色圆角块 + 品种名，接口与正式版相同 */
export const GARBAGE_IDS = ['bottle', 'can', 'newspaper', 'carton', 'glass', 'shirt', 'battery', 'tube', 'medicine', 'paint', 'thermo', 'spray', 'banana', 'apple', 'fishbone', 'melon', 'eggshell', 'veg', 'tissue', 'bigbone', 'butt', 'bowl', 'durian', 'milktea', 'diaper'];
const NAME = { bottle: '塑料瓶', can: '易拉罐', newspaper: '旧报纸', carton: '快递纸箱', glass: '玻璃瓶', shirt: '旧衣服', battery: '充电电池', tube: '废灯管', medicine: '过期药品', paint: '油漆桶', thermo: '水银温度计', spray: '杀虫剂', banana: '香蕉皮', apple: '苹果核', fishbone: '鱼骨头', melon: '西瓜皮', eggshell: '蛋壳', veg: '菜叶', tissue: '用过的纸巾', bigbone: '大骨头', butt: '烟头', bowl: '碎陶瓷碗', durian: '榴莲壳', milktea: '奶茶杯', diaper: '尿不湿' };
const CAT = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3];
const HUE = ['#4f8fe0', '#e05a4f', '#4fb36b', '#7a8288'];
export function createGarbageKit(THREE, RoundedBoxGeometry) {
  const cache = new Map(), geo = new RoundedBoxGeometry(.8, .5, .6, 2, .1);
  const label = (text, bg) => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 128); g.fillStyle = '#fff'; g.font = '900 44px "Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 66); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  function build(id) {
    if (!cache.has(id)) cache.set(id, new THREE.MeshStandardMaterial({ map: label(NAME[id] || id, HUE[CAT[GARBAGE_IDS.indexOf(id)]] || '#888'), roughness: .7 }));
    const g = new THREE.Group(), m = new THREE.Mesh(geo, cache.get(id)); m.castShadow = m.receiveShadow = true; g.add(m);
    return { object: g, shape: { kind: 'cuboid', hx: .4, hy: .25, hz: .3 }, dims: [.8, .5, .6] };
  }
  const bagGeo = new RoundedBoxGeometry(2, 1.6, 2, 3, .45), bagMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: .35 });
  function bag() { const g = new THREE.Group(), m = new THREE.Mesh(bagGeo, bagMat); m.castShadow = m.receiveShadow = true; g.add(m); return { object: g, shape: { kind: 'cuboid', hx: 1, hy: .8, hz: 1 }, dims: [2, 1.6, 2] }; }
  const mudMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
  const layerMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f4ee, transparent: true, opacity: .5, roughness: .4, depthWrite: false });
  function bagLayer(dims, k) { const e = .08 + .05 * k, m = new THREE.Mesh(new RoundedBoxGeometry(dims[0] + e, dims[1] + e, dims[2] + e, 2, .08), layerMat); m.renderOrder = 2; return m; }
  function binLabel(cat, text) { return label(text, 'rgba(0,0,0,0)'); }
  return { ids: GARBAGE_IDS, build, bag, mudMaterial, bagLayer, binLabel };
}
