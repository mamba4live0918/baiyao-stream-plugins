/* 实例化小粒子：水珠、✨、蛋壳碎片、珍珠、灰尘团、泥点、爱心、茶滴。
   一张 8 格图集，一次绘制。水珠可以"粘在玻璃上"走走停停往下滑（思路来自 fogged-glass 的 DropSim，MIT）。 */
import * as THREE from 'three';
import { LAYER, canvasTexture } from './stage.js';
import { INK, tone } from '../art/ink.js';
import { rand, TAU, clamp } from '../util.js';

export const P = Object.freeze({ DROP: 0, SPARK: 1, SHARD: 2, PEARL: 3, PUFF: 4, MUD: 5, HEART: 6, TEA: 7 });
const FRAMES = 8;
const CELL = 64;
const MAX = 420;

function drawAtlas() {
  const c = document.createElement('canvas');
  c.width = CELL * FRAMES;
  c.height = CELL;
  const g = c.getContext('2d');
  const cell = (i, fn) => {
    g.save();
    g.translate(i * CELL + CELL / 2, CELL / 2);
    fn();
    g.restore();
  };
  const drop = (fill, line, hi = true) => {
    g.beginPath();
    g.moveTo(0, -24);
    g.bezierCurveTo(10, -10, 20, 2, 20, 10);
    g.arc(0, 10, 20, 0, Math.PI);
    g.bezierCurveTo(-20, 2, -10, -10, 0, -24);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = line;
    g.stroke();
    if (hi) {
      g.beginPath();
      g.ellipse(-7, 6, 4.5, 7, -0.5, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.fill();
    }
  };
  /* 0 水珠：几乎透明的蓝白，深一点的下边缘 + 白高光（只靠高光和暗边读成水） */
  cell(P.DROP, () => {
    g.beginPath();
    g.arc(0, 2, 22, 0, TAU);
    g.fillStyle = 'rgba(210,238,255,.38)';
    g.fill();
    g.beginPath();
    g.arc(0, 2, 22, 0.25, Math.PI - 0.25);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(70,120,150,.55)';
    g.stroke();
    g.beginPath();
    g.arc(0, 2, 22, Math.PI + 0.3, TAU - 0.3);
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,255,255,.7)';
    g.stroke();
    g.beginPath();
    g.ellipse(-8, -6, 6, 4, -0.6, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.fill();
  });
  /* 1 ✨：四角星 */
  cell(P.SPARK, () => {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 28 : 6;
      const a = (i / 8) * TAU - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#fffbe6';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#ffd36b';
    g.stroke();
  });
  /* 2 蛋壳碎片 */
  cell(P.SHARD, () => {
    g.beginPath();
    g.moveTo(-18, -12);
    g.lineTo(6, -20);
    g.lineTo(20, -4);
    g.lineTo(10, 8);
    g.lineTo(14, 18);
    g.lineTo(-10, 14);
    g.lineTo(-20, 2);
    g.closePath();
    g.fillStyle = '#fbefd6';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.ellipse(-5, -6, 6, 3, -0.4, 0, TAU);
    g.fillStyle = '#ffffff';
    g.fill();
  });
  /* 3 珍珠 */
  cell(P.PEARL, () => {
    g.beginPath();
    g.arc(0, 0, 22, 0, TAU);
    g.fillStyle = '#3d2a20';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = '#1e140f';
    g.stroke();
    g.beginPath();
    g.arc(4, 5, 15, 0, TAU);
    g.fillStyle = tone('#3d2a20', 0.08);
    g.fill();
    g.beginPath();
    g.ellipse(-8, -9, 6, 4, -0.6, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.fill();
  });
  /* 4 灰尘团 */
  cell(P.PUFF, () => {
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 28);
    gr.addColorStop(0, 'rgba(255,255,255,.9)');
    gr.addColorStop(0.6, 'rgba(240,244,246,.45)');
    gr.addColorStop(1, 'rgba(240,244,246,0)');
    g.fillStyle = gr;
    g.fillRect(-32, -32, 64, 64);
  });
  /* 5 泥点 */
  cell(P.MUD, () => drop('#8a5a34', '#4a3328'));
  /* 6 爱心 */
  cell(P.HEART, () => {
    g.beginPath();
    g.moveTo(0, 18);
    g.bezierCurveTo(-26, 0, -18, -24, 0, -10);
    g.bezierCurveTo(18, -24, 26, 0, 0, 18);
    g.closePath();
    g.fillStyle = '#ff8fb1';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = '#c4466e';
    g.stroke();
    g.beginPath();
    g.ellipse(-8, -6, 4, 2.6, -0.6, 0, TAU);
    g.fillStyle = '#fff';
    g.fill();
  });
  /* 7 茶滴 */
  cell(P.TEA, () => drop('#c08a55', '#7a4e2a'));
  return c;
}

const vertexShader = /* glsl */ `
attribute vec4 iPos;
attribute vec2 iMisc;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec2 corner = position.xy;
  float c = cos(iPos.w), s = sin(iPos.w);
  vec2 p = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iPos.z;
  vUv = vec2((iMisc.x + uv.x) / ${FRAMES}.0, uv.y);
  vAlpha = iMisc.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos.xy + p, 0.0, 1.0);
}
`;
const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 c = texture2D(uMap, vUv);
  float a = c.a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c.rgb, a);
}
`;

export function createParticles(stage) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iMisc = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos);
  geo.setAttribute('iMisc', iMisc);
  geo.instanceCount = 0;
  const tex = canvasTexture(drawAtlas());
  const material = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex } }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = LAYER.PARTICLE;
  stage.scene.add(mesh);
  const list = [];

  /* o: { frame, x, y, vx, vy, g, size, size1, rot, vr, life, fadeIn, stick } */
  function emit(o) {
    if (list.length >= MAX) list.shift();
    const p = { vx: 0, vy: 0, g: 0, rot: 0, vr: 0, life: 1, age: 0, fadeIn: 0, drag: 0, alpha: 1, ...o };
    p.size1 = p.size1 ?? p.size;
    if (p.stick) {
      p.pause = rand(0.2, 0.9);
      p.vy = 0;
    }
    list.push(p);
    return p;
  }

  return {
    emit,
    /* 一圈✨ */
    sparkle(x, y, n = 6, spread = 60) {
      const u = stage.unit;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.3, 0.3);
        const sp = rand(0.5, 1) * spread * u * 2.2;
        emit({ frame: P.SPARK, x: x + Math.cos(a) * 8 * u, y: y + Math.sin(a) * 8 * u, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3.2, size: rand(22, 38) * u, size1: 4 * u, rot: rand(0, TAU), vr: rand(-2, 2), life: rand(0.55, 0.85) });
      }
    },
    /* 甩出来的水珠 */
    spray(x, y, dirx, diry, n = 4, speed = 320, frame = P.DROP) {
      const u = stage.unit;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(diry, dirx) + rand(-0.6, 0.6);
        const sp = rand(0.45, 1) * speed * u;
        emit({ frame, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(40, 140) * u, g: 1500 * u, size: rand(9, 17) * u, life: rand(0.5, 0.9), drag: 0.4 });
      }
    },
    /* 粘在玻璃上的水珠：走走停停往下滑，几秒后干掉 */
    bead(x, y, size) {
      return emit({ frame: P.DROP, x, y, size: size * stage.unit, life: rand(2.6, 4.2), stick: true });
    },
    update(dt) {
      const W = stage.W;
      const H = stage.H;
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life || p.y > H + 80 || p.x < -120 || p.x > W + 120) {
          list.splice(i, 1);
          continue;
        }
        if (p.stick) {
          p.pause -= dt;
          if (p.pause <= 0) {
            p.vy = p.vy > 0 ? 0 : rand(40, 110) * stage.unit;
            p.pause = p.vy > 0 ? rand(0.08, 0.35) : rand(0.25, 1.1);
          }
          p.y += p.vy * dt;
        } else {
          p.vy += p.g * dt;
          const k = Math.exp(-p.drag * dt);
          p.vx *= k;
          p.vy *= p.g ? 1 : k;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
        }
      }
      const pos = iPos.array;
      const misc = iMisc.array;
      for (const p of list) {
        const t = p.age / p.life;
        const size = p.size + (p.size1 - p.size) * t;
        const fin = p.fadeIn > 0 ? clamp(p.age / p.fadeIn, 0, 1) : 1;
        const fout = p.stick ? clamp((1 - t) * 3, 0, 1) : clamp((1 - t) * 2.2, 0, 1);
        pos[n * 4] = p.x;
        pos[n * 4 + 1] = H - p.y;
        pos[n * 4 + 2] = size;
        pos[n * 4 + 3] = -p.rot;
        misc[n * 2] = p.frame;
        misc[n * 2 + 1] = p.alpha * fin * fout;
        n++;
      }
      /* 没有粒子、上一帧也没有：不重新上传（画面没变，不让它白白重画） */
      if (n || geo.instanceCount) {
        iPos.needsUpdate = true;
        iMisc.needsUpdate = true;
      }
      geo.instanceCount = n;
    },
    get count() {
      return list.length;
    },
    clear() {
      list.length = 0;
    }
  };
}
