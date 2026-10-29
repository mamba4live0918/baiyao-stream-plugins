// 经典布局的桶排与传送带之间存在被桶遮住的低处：用无渲染碰撞体托到桶口高度。
// 柜台布局背后已经是实心柜体，不重复加墙。
export function binRearGuards(stage, mode, bin) {
  if (!stage.legs) return [];
  const slots = stage.slots[mode];
  return slots.map(([x, z], i) => ({
    x0: i ? (slots[i - 1][0] + x) / 2 : x - bin.w / 2 - .08,
    x1: i < slots.length - 1 ? (x + slots[i + 1][0]) / 2 : x + bin.w / 2 + .08,
    y0: 0,
    y1: stage.base + bin.h + .12,
    z0: stage.belt.z + stage.belt.w / 2 + .08,
    z1: z - bin.d / 2,
  }));
}
