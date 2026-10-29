/* 刮过的水痕：刮条两端各拖一条细水线（1.2 秒干掉），刮过的带子闪一层很淡的亮光（0.4 秒）。
   每帧用最近的刮条位置重建一张带状网格，不上传整屏贴图。露脸区里不画。 */
import * as THREE from 'three';
import { ZONE_GLSL, LAYER } from './stage.js';

const MAX_PTS = 240;
const EDGE_LIFE = 0.5;
const SHEEN_LIFE = 0.42;

const vertexShader = /* glsl */ `
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const fragmentShader = /* glsl */ `
precision highp float;
varying vec4 vColor;
${ZONE_GLSL}
void main() {
  float a = vColor.a * zoneMask(gl_FragCoord.xy);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}
`;

export function createWater(stage) {
  const pts = [];
  const maxQuads = MAX_PTS * 3;
  const pos = new Float32Array(maxQuads * 4 * 3);
  const col = new Float32Array(maxQuads * 4 * 4);
  const idx = new Uint16Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q++) {
    const v = q * 4;
    idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aColor', colAttr);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uZoneTex: stage.shared.uZoneTex, uZoneP: stage.shared.uZoneP },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = LAYER.WATER;
  stage.pane.add(mesh);

  let quads = 0;
  /* 上一帧有几块：没有水痕、上一帧也没有，就不重新上传（画面没变，不让它白白重画） */
  let lastQuads = 0;
  function quad(ax, ay, bx, by, cx, cy, dx, dy, r, g, b, a0, a1) {
    if (quads >= maxQuads) return;
    const H = stage.H;
    const p = quads * 12;
    pos.set([ax, H - ay, 0, bx, H - by, 0, cx, H - cy, 0, dx, H - dy, 0], p);
    const c = quads * 16;
    col.set([r, g, b, a0, r, g, b, a0, r, g, b, a1, r, g, b, a1], c);
    quads++;
  }

  return {
    /* 刮条一帧的位置：中心 (x,y)、刮条方向角 ang（刮条本身的朝向）、半长 half、笔画编号 stroke */
    add(x, y, ang, half, stroke, now) {
      const last = pts[pts.length - 1];
      if (last && last.stroke === stroke && Math.hypot(last.x - x, last.y - y) < 1.5) return;
      pts.push({ x, y, ux: Math.cos(ang), uy: Math.sin(ang), half, stroke, t: now });
      if (pts.length > MAX_PTS) pts.shift();
    },
    clear() {
      pts.length = 0;
    },
    update(now) {
      while (pts.length && now - pts[0].t > EDGE_LIFE) pts.shift();
      quads = 0;
      const lw = 1.25 * stage.unit;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a.stroke !== b.stroke) continue;
        const ea = Math.max(0, 1 - (now - a.t) / EDGE_LIFE) ** 1.4;
        const eb = Math.max(0, 1 - (now - b.t) / EDGE_LIFE) ** 1.4;
        /* 亮光带：两次刮条位置之间扫过的四边形 */
        const sa = Math.max(0, 1 - (now - a.t) / SHEEN_LIFE) ** 2;
        const sb = Math.max(0, 1 - (now - b.t) / SHEEN_LIFE) ** 2;
        if (sa > 0 || sb > 0) {
          quad(a.x - a.ux * a.half, a.y - a.uy * a.half, a.x + a.ux * a.half, a.y + a.uy * a.half,
            b.x - b.ux * b.half, b.y - b.uy * b.half, b.x + b.ux * b.half, b.y + b.uy * b.half, 1, 1, 1, sa * 0.16, sb * 0.16);
        }
        /* 两条细水线：刮条两端的轨迹 */
        for (const s of [-1, 1]) {
          const ax = a.x + s * a.ux * a.half;
          const ay = a.y + s * a.uy * a.half;
          const bx = b.x + s * b.ux * b.half;
          const by = b.y + s * b.uy * b.half;
          let nx = -(by - ay);
          let ny = bx - ax;
          const nl = Math.hypot(nx, ny) || 1;
          nx = (nx / nl) * lw;
          ny = (ny / nl) * lw;
          quad(ax - nx, ay - ny, ax + nx, ay + ny, bx - nx, by - ny, bx + nx, by + ny, 0.86, 0.96, 1, ea * 0.36, eb * 0.36);
        }
      }
      if (quads || lastQuads) {
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        posAttr.clearUpdateRanges();
        colAttr.clearUpdateRanges();
      }
      lastQuads = quads;
      geo.setDrawRange(0, quads * 6);
    }
  };
}
