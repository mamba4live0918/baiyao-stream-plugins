/* 露脸区遮罩贴图：把多边形（带羽化）画成一张 640×360 的小图——区里是黑（不画）、区外是白（照常画），边上按羽化渐变。
   着色器里每个像素只取一次样（不管多边形有几个点），只有露脸区或画面尺寸变了才重画一次。 */
import * as THREE from 'three';

const MW = 640;
const MH = 360;

export function createZoneMask() {
  const canvas = document.createElement('canvas');
  canvas.width = MW;
  canvas.height = MH;
  const g = canvas.getContext('2d');
  /* 羽化用模糊做：先画在四周留了边的大一点的画布上，免得画面边上被模糊成半透明 */
  const pad = document.createElement('canvas');
  const pg = pad.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  function draw(zr) {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, MW, MH);
    if (zr) {
      const sx = MW / zr.W;
      const sy = MH / zr.H;
      /* 羽化宽度 ≈ 2.56 个标准差（和以前 smoothstep 的过渡宽度差不多） */
      const sigma = zr.feather * 0.39 * Math.sqrt(sx * sy);
      const P = Math.ceil(sigma * 3) + 2;
      pad.width = MW + 2 * P;
      pad.height = MH + 2 * P;
      pg.fillStyle = '#fff';
      pg.fillRect(0, 0, pad.width, pad.height);
      pg.filter = sigma > 0.25 ? `blur(${sigma.toFixed(2)}px)` : 'none';
      pg.fillStyle = '#000';
      pg.beginPath();
      for (let i = 0; i < zr.n; i++) {
        let x = zr.xs[i] * sx;
        let y = zr.ys[i] * sy;
        /* 贴着画面边的点往外推：露脸区一直通到画面外，画面边上不会被羽化出一道半透明 */
        if (x <= MW * 0.005) x = -P;
        else if (x >= MW * 0.995) x = MW + P;
        if (y <= MH * 0.005) y = -P;
        else if (y >= MH * 0.995) y = MH + P;
        pg.lineTo(x + P, y + P);
      }
      pg.closePath();
      pg.fill('evenodd');
      pg.filter = 'none';
      g.drawImage(pad, P, P, MW, MH, 0, 0, MW, MH);
    }
    texture.needsUpdate = true;
  }

  return { texture, draw, canvas };
}
