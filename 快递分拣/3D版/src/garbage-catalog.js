/* 垃圾分类模式的品种表（纯数据，不依赖 three，可直接用 Node 测试）
   分类依据 GB/T 19095-2019 四分类，易错项参考上海市官方说明。各地口径不同，主播可在设置里改分类或关掉某种。
   why 只写原因，不写分类名：主播改了分类后只显示"品种 → 分类"，不会出现自相矛盾的说明。 */
export const BIN_NAMES = {
  national: ['可回收物', '有害垃圾', '厨余垃圾', '其他垃圾'],
  shanghai: ['可回收物', '有害垃圾', '湿垃圾', '干垃圾'],
};

export const GARBAGE = [
  { id: 'bottle', name: '塑料瓶', cat: 0, why: '倒空压扁就能回收' },
  { id: 'can', name: '易拉罐', cat: 0, why: '金属罐可以回收再利用' },
  { id: 'newspaper', name: '旧报纸', cat: 0, why: '报纸书本属于纸类' },
  { id: 'carton', name: '快递纸箱', cat: 0, why: '拆掉胶带、压扁再投' },
  { id: 'glass', name: '玻璃瓶', cat: 0, why: '玻璃可以回收，轻放防碎' },
  { id: 'shirt', name: '旧衣服', cat: 0, why: '干净的旧衣物属于织物，可以回收', tricky: true },
  { id: 'battery', name: '充电电池', cat: 1, why: '含重金属要单独处理（普通无汞干电池不算）', tricky: true },
  { id: 'tube', name: '废灯管', cat: 1, why: '灯管含汞，连包装一起投' },
  { id: 'medicine', name: '过期药品', cat: 1, why: '过期药品要单独回收处理' },
  { id: 'paint', name: '油漆桶', cat: 1, why: '油漆和溶剂是有毒化学品' },
  { id: 'thermo', name: '水银温度计', cat: 1, why: '水银有毒，打碎更危险' },
  { id: 'spray', name: '杀虫剂', cat: 1, why: '杀虫剂属于家用化学品' },
  { id: 'banana', name: '香蕉皮', cat: 2, why: '果皮容易腐烂' },
  { id: 'apple', name: '苹果核', cat: 2, why: '果核容易腐烂' },
  { id: 'fishbone', name: '鱼骨头', cat: 2, why: '鱼骨、虾壳这类小骨头能堆肥', tricky: true },
  { id: 'melon', name: '西瓜皮', cat: 2, why: '瓜皮容易腐烂' },
  { id: 'eggshell', name: '蛋壳', cat: 2, why: '蛋壳容易粉碎、能堆肥', tricky: true },
  { id: 'veg', name: '菜叶', cat: 2, why: '菜叶容易腐烂' },
  { id: 'tissue', name: '用过的纸巾', cat: 3, why: '纸巾遇水即溶，不能回收', tricky: true },
  { id: 'bigbone', name: '大骨头', cat: 3, why: '太硬难腐烂，会伤处理设备', tricky: true },
  { id: 'butt', name: '烟头', cat: 3, why: '烟头不能回收也不能堆肥' },
  { id: 'bowl', name: '碎陶瓷碗', cat: 3, why: '陶瓷碎片不能回收' },
  { id: 'durian', name: '榴莲壳', cat: 3, why: '硬果壳难腐烂', tricky: true },
  { id: 'milktea', name: '奶茶杯', cat: 3, why: '喝完倒掉，杯子、吸管、盖子一起投（上海口径）', tricky: true },
  { id: 'diaper', name: '尿不湿', cat: 3, why: '受污染，不能回收' },
];
export const GARBAGE_BY_ID = Object.fromEntries(GARBAGE.map(g => [g.id, g]));

export const binName = (cat, naming) => (BIN_NAMES[naming] || BIN_NAMES.national)[cat];
export const catOf = (item, overrides) => { const c = overrides?.[item.id]?.cat; return Number.isInteger(c) ? c : item.cat; };
export const enabledItems = overrides => GARBAGE.filter(g => overrides?.[g.id]?.on !== false);
export function itemsByCat(overrides) {
  const out = [[], [], [], []];
  for (const g of enabledItems(overrides)) out[catOf(g, overrides)].push(g);
  return out;
}
/* 刁钻垃圾：启用的易错品种；全关了就退回到全部启用品种，保证礼物总有东西可扔 */
export function trickyItems(overrides) {
  const on = enabledItems(overrides), t = on.filter(g => g.tricky);
  return t.length ? t : on;
}
export function wrongTip(item, overrides, naming) {
  const c = catOf(item, overrides);
  return `${item.name} → ${binName(c, naming)}` + (c === item.cat ? '：' + item.why : '');
}
/* 只保留目录里存在的品种；on 必须是布尔，cat 必须是 0–3 的整数；一项都不合格就整条丢掉 */
export function cleanOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!GARBAGE_BY_ID[id] || !v || typeof v !== 'object') continue;
    const o = {};
    if (typeof v.on === 'boolean') o.on = v.on;
    if (Number.isInteger(v.cat) && v.cat >= 0 && v.cat <= 3) o.cat = v.cat;
    if (Object.keys(o).length) out[id] = o;
  }
  return out;
}
