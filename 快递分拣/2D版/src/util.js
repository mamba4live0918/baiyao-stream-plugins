/* 小工具（各模块共用） */
export const $ = id => document.getElementById(id);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const eOut = t => 1 - Math.pow(1 - t, 3);
export const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
export const fmtT = t => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
export const NAMES = ['小王', '阿橙', '大熊', '木木', '七七', '豆包', '阿杰', '小鹿', '饭团', 'Momo'];
export const CNAME = ['红', '黄', '蓝'];
/* 绕 z 轴转 a 弧度的四元数（物件锁在 xy 平面里，只绕 z 转） */
export const quatZ = a => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
