/* 淘金 · 簸箕版 · 矿砂袋：粗麻布袋、扎口麻绳、袋身盖着档位印章，头顶观众名字；从天上掉下来，砸到沙面炸开 */
import * as THREE from 'three';
import { mesh } from './geo.js';
import { makeLabel, disposeLabel } from './labels.js';
import { cvs, rnd } from '../util.js';

/* 麻袋轮廓：平底、鼓肚、收口，扎绳上面是一圈张开的布边（袋口敞着） */
const PROFILE = [[0.0, 0], [0.24, 0.01], [0.33, 0.07], [0.37, 0.22], [0.355, 0.38], [0.29, 0.52], [0.16, 0.62], [0.085, 0.665], [0.1, 0.7], [0.16, 0.76], [0.2, 0.8], [0.185, 0.815]].map(([r, y]) => new THREE.Vector2(r, y));

/* 让麻袋不那么规整：袋身鼓包、袋口布边起褶 */
function sackGeometry() {
  const geo = new THREE.LatheGeometry(PROFILE, 40);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    let k = 1;
    if (v.y < 0.6) k += 0.05 * Math.sin(a * 3 + v.y * 6) + 0.035 * Math.sin(a * 5 - v.y * 9);
    if (v.y > 0.69) k += 0.22 * Math.sin(a * 9) * Math.min(1, (v.y - 0.69) / 0.08);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function stampTex(text, color) {
  const c = cvs(256, 256);
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.globalAlpha = 0.9;
  g.lineWidth = 14;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(128, 128, 84, 0, Math.PI * 2);
  g.stroke();
  /* 字用深色墨，档位颜色只在外圈，麻袋上看得清 */
  g.fillStyle = '#4a220a';
  g.font = '900 92px "TJRound","Microsoft YaHei UI","Microsoft YaHei",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSacks(scene, ctx) {
  /* target(job) = 落点（簸箕里那一点）现在的世界坐标；簸箕在晃，麻袋下落时跟着落点微调 */
  const { M, target, onBurst } = ctx;
  const geo = sackGeometry();
  const rope = new THREE.TorusGeometry(0.095, 0.026, 8, 24);
  const knot = new THREE.SphereGeometry(0.04, 12, 10);
  const tail = new THREE.CylinderGeometry(0.016, 0.012, 0.16, 8);
  tail.translate(0, -0.08, 0);
  const sackMat = M.burlap.clone();
  sackMat.side = THREE.DoubleSide;
  const stampGeo = new THREE.CircleGeometry(0.17, 24);
  const stamps = new Map();
  const active = [];
  const queue = [];
  let gap = 0;

  function stampMat(text, color) {
    const key = text + color;
    if (!stamps.has(key)) stamps.set(key, new THREE.MeshStandardMaterial({ map: stampTex(text, color), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    return stamps.get(key);
  }

  function make(job) {
    const g = new THREE.Group();
    const body = mesh(geo, sackMat);
    body.scale.setScalar(job.scale);
    g.add(body);
    const tie = new THREE.Group();
    tie.position.y = 0.665 * job.scale;
    tie.scale.setScalar(job.scale);
    const ring = mesh(rope, M.rope);
    ring.rotation.x = Math.PI / 2;
    tie.add(ring);
    const k = mesh(knot, M.rope);
    k.position.set(0, 0, 0.1);
    tie.add(k);
    for (const s of [-1, 1]) {
      const t = mesh(tail, M.rope);
      t.position.set(s * 0.02, 0, 0.12);
      t.rotation.set(0.5, 0, s * 0.35);
      tie.add(t);
    }
    g.add(tie);
    const st = mesh(stampGeo, stampMat(job.stamp, job.color), false, false);
    st.position.set(0, 0.3 * job.scale, 0.372 * job.scale);
    st.scale.setScalar(job.scale);
    g.add(st);
    const label = makeLabel(job.owner || '观众', { badge: job.badge, badgeBg: job.color, border: job.color, height: 0.22 });
    label.position.set(0, 0.95 * job.scale + 0.32, 0);
    g.add(label);
    return { g, label };
  }

  function launch(job) {
    const { g, label } = make(job);
    const p = target(job);
    g.position.set(p.x, 5.2 + rnd(0, 0.6), p.z);
    /* 印章那面朝着镜头，下落时只轻轻晃 */
    g.rotation.set(rnd(-0.3, 0.3), rnd(-0.45, 0.45), rnd(-0.3, 0.3));
    scene.add(g);
    active.push({ job, g, label, vy: -2, spin: rnd(-0.6, 0.6) });
  }

  return {
    /* 预热用：印章材质（贴图 + 透明，着色器和别的都不一样） */
    materials: () => [stampMat('矿', '#c9862f'), sackMat],
    /* job: {x, z, owner, scale, stamp, badge, color, ...随身带给 onBurst 的数据} */
    add(job) {
      queue.push(job);
    },
    pending() {
      return queue.length + active.length;
    },
    update(dt) {
      gap -= dt;
      if (queue.length && gap <= 0) {
        launch(queue.shift());
        gap = 0.38;
      }
      for (let i = active.length - 1; i >= 0; i--) {
        const s = active[i];
        s.vy += -16 * dt;
        s.g.position.y += s.vy * dt;
        s.g.rotation.y += s.spin * dt;
        s.g.rotation.x *= 0.98;
        s.g.rotation.z *= 0.98;
        const p = target(s.job);
        s.g.position.x += (p.x - s.g.position.x) * Math.min(1, dt * 6);
        s.g.position.z += (p.z - s.g.position.z) * Math.min(1, dt * 6);
        if (s.g.position.y <= p.y + 0.1) {
          scene.remove(s.g);
          disposeLabel(s.label);
          active.splice(i, 1);
          onBurst(s.job);
        }
      }
    },
    clear() {
      queue.length = 0;
      for (const s of active) {
        scene.remove(s.g);
        disposeLabel(s.label);
      }
      active.length = 0;
    }
  };
}
