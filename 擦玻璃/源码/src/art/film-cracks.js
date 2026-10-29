/* 保护膜上的裂纹（画一次，一张半分辨率的整屏图）：
   红色通道 = 这道裂纹在膜被砸到几成时露出来（0..1 → 1..255），透明度 = 线条。
   几个撞击点，每个点往外放射几道折线、再加一两圈断开的弧；离撞击点越远越晚露出来，
   所以膜越挨砸，裂纹就从几个点往外一点点长满整块膜。 */
import { canvas } from './ink.js';

export function drawFilmCracks(W, H, u, random = Math.random) {
  const s = 0.5;
  /* 只画一次、之后只当贴图用：要 GPU 画布（不读像素） */
  const { c, g } = canvas(Math.max(2, Math.round(W * s)), Math.max(2, Math.round(H * s)), {});
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const segs = [];
  const line = (x0, y0, x1, y1, t, w) => segs.push({ x0, y0, x1, y1, t: Math.min(0.97, t), w });
  const CENTERS = 5;
  for (let k = 0; k < CENTERS; k++) {
    const cx = W * (0.08 + 0.84 * random());
    const cy = H * (0.1 + 0.8 * random());
    /* 第一个点一挨砸就裂，最后一个点快碎了才裂 */
    const t0 = 0.04 + (k / CENTERS) * 0.72 + random() * 0.06;
    const arms = 6 + Math.floor(random() * 4);
    for (let a = 0; a < arms; a++) {
      let ang = (a / arms) * Math.PI * 2 + random() * 0.5;
      const len = (150 + random() * 300) * u;
      let x = cx;
      let y = cy;
      let d = 0;
      while (d < len) {
        const step = (20 + random() * 26) * u;
        ang += (random() - 0.5) * 0.7;
        const nx = x + Math.cos(ang) * step;
        const ny = y + Math.sin(ang) * step;
        const k2 = d / len;
        line(x, y, nx, ny, t0 + k2 * 0.22, (2.8 - 1.8 * k2) * u);
        /* 偶尔分个叉 */
        if (random() < 0.12) {
          const ba = ang + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5);
          const bl = (25 + random() * 40) * u;
          line(nx, ny, nx + Math.cos(ba) * bl, ny + Math.sin(ba) * bl, t0 + k2 * 0.22 + 0.05, (1.6 - k2) * u + 0.6 * u);
        }
        x = nx;
        y = ny;
        d += step;
      }
    }
    /* 撞击点周围一两圈断开的弧 */
    const rings = 1 + Math.floor(random() * 2);
    for (let r = 0; r < rings; r++) {
      const rad = (38 + r * 46 + random() * 18) * u;
      const parts = 5 + Math.floor(random() * 3);
      for (let p = 0; p < parts; p++) {
        const a0 = (p / parts) * Math.PI * 2 + random() * 0.4;
        const span = ((Math.PI * 2) / parts) * (0.4 + random() * 0.35);
        let px = cx + Math.cos(a0) * rad;
        let py = cy + Math.sin(a0) * rad;
        for (let q = 1; q <= 3; q++) {
          const aa = a0 + (span * q) / 3;
          const rr = rad * (0.94 + random() * 0.12);
          const nx = cx + Math.cos(aa) * rr;
          const ny = cy + Math.sin(aa) * rr;
          line(px, py, nx, ny, t0 + 0.05 + r * 0.06, 1.7 * u);
          px = nx;
          py = ny;
        }
      }
    }
  }
  /* 先画晚露出来的，早露出来的盖在上面（交叉的地方按早的算） */
  segs.sort((a, b) => b.t - a.t);
  for (const sg of segs) {
    const v = Math.max(1, Math.round(sg.t * 255));
    g.strokeStyle = `rgb(${v},0,0)`;
    g.lineWidth = Math.max(1.2, sg.w);
    g.beginPath();
    g.moveTo(sg.x0, sg.y0);
    g.lineTo(sg.x1, sg.y1);
    g.stroke();
  }
  return c;
}
