/* 淘金 · 簸箕版 · 浣熊模型（小偷）：圆滚滚的身子、黑眼罩、红围巾、条纹尾巴；偷到东西背一个小麻袋，被抓住头上转星星 */
import * as THREE from 'three';
import { mesh } from './geo.js';

const S = (r, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h);

export function buildRaccoon(M) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = body) => {
    const m = mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  };
  const legs = [-1, 1].map(s => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.09, 0.16, 0);
    part(new THREE.CapsuleGeometry(0.05, 0.08, 6, 12), M.furDark, 0, -0.08, 0, 1, 1, 1, leg);
    part(S(0.06), M.furDark, 0, -0.15, 0.03, 1, 0.6, 1.3, leg);
    body.add(leg);
    return leg;
  });
  part(S(0.2), M.furGray, 0, 0.33, 0, 1, 1.15, 0.9);
  part(S(0.15), M.furLight, 0, 0.3, 0.085, 1, 1.1, 0.6);
  const scarf = mesh(new THREE.TorusGeometry(0.15, 0.035, 10, 24), M.redCloth);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.5;
  body.add(scarf);
  const arms = [-1, 1].map(s => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.19, 0.44, 0.02);
    part(new THREE.CapsuleGeometry(0.045, 0.1, 6, 10), M.furDark, 0, -0.08, 0, 1, 1, 1, arm);
    arm.rotation.z = s * 0.5;
    body.add(arm);
    return arm;
  });
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0);
  body.add(head);
  part(S(0.21, 28, 22), M.furGray, 0, 0, 0, 1.15, 1, 1, head);
  part(S(0.1), M.furLight, 0, -0.07, 0.15, 1.25, 0.8, 0.95, head);
  for (const s of [-1, 1]) {
    const mask = part(S(0.075), M.furDark, s * 0.075, 0.0, 0.165, 1.45, 0.72, 0.5, head);
    mask.rotation.z = s * -0.25;
    part(S(0.05), M.furLight, s * 0.085, 0.075, 0.16, 1.3, 0.55, 0.5, head);
    part(S(0.032, 16, 12), M.eye, s * 0.072, 0.008, 0.2, 1, 1.1, 0.8, head);
    part(S(0.011, 8, 6), M.eyeShine, s * 0.072 + 0.01, 0.022, 0.226, 1, 1, 1, head);
    const ear = part(S(0.07), M.furGray, s * 0.15, 0.17, -0.01, 1, 1.15, 0.5, head);
    ear.rotation.z = s * -0.35;
    part(S(0.042), M.furDark, s * 0.15, 0.165, 0.02, 1, 1.1, 0.4, head);
  }
  part(S(0.03, 12, 10), M.nose, 0, -0.045, 0.245, 1.2, 0.9, 1, head);
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.16);
  body.add(tail);
  for (let i = 0; i < 6; i++) {
    const r = 0.085 - i * 0.007;
    part(S(r, 16, 12), i % 2 ? M.furGray : M.furDark, 0, i * 0.065, -i * 0.045 - Math.sin(i * 0.5) * 0.03, 1, 1, 1, tail);
  }
  /* 赃物袋：偷到了才出现 */
  const sack = new THREE.Group();
  sack.position.set(0.12, 0.56, -0.17);
  part(S(0.15), M.burlap, 0, 0, 0, 1, 1.1, 1, sack);
  part(new THREE.TorusGeometry(0.05, 0.018, 8, 14), M.rope, 0, 0.15, 0, 1, 1, 1, sack).rotation.x = Math.PI / 2;
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14), M.gold, 0.02, 0.17, 0.02, 1, 1, 1, sack);
  sack.visible = false;
  body.add(sack);
  /* 被抓住时头上转圈的小星星 */
  const stars = new THREE.Group();
  stars.position.y = 0.95;
  for (let i = 0; i < 3; i++) {
    const st = part(new THREE.OctahedronGeometry(0.045), M.brass, Math.cos((i / 3) * 6.28) * 0.18, 0, Math.sin((i / 3) * 6.28) * 0.18, 1, 1, 1, stars);
    st.castShadow = false;
  }
  stars.visible = false;
  g.add(stars);
  return { g, body, legs, arms, head, tail, sack, stars };
}
