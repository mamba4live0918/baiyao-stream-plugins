// 堆货台容量按真实物件计数，不以固定纸箱高度推断；卸货动画提前占位。
export function dockLoad(items, dock) {
  return items.filter(({ st, p }) => st === 'unload' || (st === 'free' &&
    p.x > dock.x0 - .2 && p.x < dock.x1 + .1 &&
    p.z > dock.z0 - .1 && p.z < dock.z1 + .25 && p.y > dock.top - .05)).length;
}

// 观察一段时间的实际位移，碰撞造成的小幅抖动不算输送进展。
export function advanceStall(previous, x, dt) {
  if (!previous || Math.abs(x - previous.anchor) >= .2) return { anchor: x, seconds: 0 };
  return { anchor: previous.anchor, seconds: previous.seconds + dt };
}

// 堵点上方还有货物时先取最上层，否则“被压住不能取”会让整个堆永久停住。
export function topOfStack(items, id) {
  let item = items.find(b => b.id === id);
  if (!item) return null;
  for (let i = 0; i < items.length; i++) {
    const above = items.filter(o => o !== item && o.st === 'free' &&
      o.p.y >= item.p.y + item.dims[1] * .3 &&
      o.p.y - item.p.y <= (item.dims[1] + o.dims[1]) / 2 + .2 &&
      Math.abs(o.p.x - item.p.x) < (item.dims[0] + o.dims[0]) * .4 &&
      Math.abs(o.p.z - item.p.z) < (item.dims[2] + o.dims[2]) * .4
    ).sort((a, b) => b.p.y - a.p.y)[0];
    if (!above) return item;
    item = above;
  }
  return item;
}
