// 工作台上的工具模型：不锈钢精密弯头镊（手持与停放共用）和拼豆笔。
// 坐标约定与旧版相同：镊子尖在原点附近（夹着的豆在 (0,.13,-.04)），镊子尾部朝 +z，长约 4.3。
import * as THREE from 'three';

/**
 * 沿中心线扫出一条截面为圆角矩形的“片”。
 * range 取中心线的一段（0–1），profile 的 t 仍是这一段内的 0–1。
 * profile(t) 返回 {thick, tall, roll}：thick 是夹合方向（x）的厚度，tall 是竖直方向的高度，roll 为绕中心线的倾转角。
 */
function sweepStrip(points, profile, { samples = 64, ring = 16, exponent = 4, range = [0, 1] } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const positions = [], normals = [], uvs = [], indices = [];
  const up = new THREE.Vector3(0, 1, 0), tangent = new THREE.Vector3(), side = new THREE.Vector3(), vertical = new THREE.Vector3(), point = new THREE.Vector3(), offset = new THREE.Vector3(), normal = new THREE.Vector3();
  const shape = [];
  for (let j = 0; j < ring; j++) {
    const a = j / ring * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    // 超椭圆：exponent 越大越接近方形，边角仍然圆滑。
    shape.push([Math.sign(c) * Math.abs(c) ** (2 / exponent), Math.sign(s) * Math.abs(s) ** (2 / exponent), c, s]);
  }
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, u = range[0] + (range[1] - range[0]) * t;
    curve.getPointAt(u, point); curve.getTangentAt(u, tangent);
    side.crossVectors(up, tangent).normalize(); vertical.crossVectors(tangent, side).normalize();
    const { thick, tall, roll = 0 } = profile(t);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (const [x, y, nx, ny] of shape) {
      const lx = x * thick / 2, ly = y * tall / 2;
      const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr;
      offset.copy(side).multiplyScalar(rx).addScaledVector(vertical, ry);
      positions.push(point.x + offset.x, point.y + offset.y, point.z + offset.z);
      const mx = nx * cr - ny * sr, my = nx * sr + ny * cr;
      normal.copy(side).multiplyScalar(mx).addScaledVector(vertical, my).normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(t, (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1);
    }
  }
  for (let i = 0; i < samples; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    indices.push(a, b, c, b, d, c); // 逆时针朝外
  }
  // 两端封口。
  for (const [i, dir] of [[0, -1], [samples, 1]]) {
    const u = range[0] + (range[1] - range[0]) * i / samples;
    curve.getPointAt(u, point); curve.getTangentAt(u, tangent);
    const center = positions.length / 3;
    positions.push(point.x, point.y, point.z); normals.push(tangent.x * dir, tangent.y * dir, tangent.z * dir); uvs.push(i / samples, .5);
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + (j + 1) % ring;
      if (dir < 0) indices.push(center, a, b); else indices.push(center, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// 拉丝纹理：沿镊子长度方向的细密划痕，用作粗糙度贴图，让高光拉成细长条。
function brushedTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7a7a7a'; ctx.fillRect(0, 0, 512, 64);
  let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { const y = random() * 64, g = 100 + random() * 90 | 0; ctx.strokeStyle = `rgba(${g},${g},${g},${.25 + random() * .5})`; ctx.lineWidth = .5 + random(); ctx.beginPath(); ctx.moveTo(random() * 60, y); ctx.lineTo(512 - random() * 60, y + (random() - .5) * .6); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; return texture;
}

export function createToolMaterials() {
  const brushed = brushedTexture();
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xe4e7ea, metalness: 1, roughness: .32, roughnessMap: brushed, anisotropy: .7, clearcoat: .15, clearcoatRoughness: .3 });
  const steelTip = new THREE.MeshPhysicalMaterial({ color: 0xcfd3d6, metalness: 1, roughness: .2 });
  const silicone = new THREE.MeshPhysicalMaterial({ color: 0x7d9862, roughness: .6, sheen: .35, sheenColor: new THREE.Color(0xdfe9cf), sheenRoughness: .8 });
  const siliconeDark = new THREE.MeshStandardMaterial({ color: 0x6f8559, roughness: .75 });
  return { steel, steelTip, silicone, siliconeDark, dispose() { brushed?.dispose(); for (const m of [steel, steelTip, silicone, siliconeDark]) m.dispose(); } };
}

// 钢片宽面朝上倾斜：俯视镜头下也能看到宽面、握套和弯头，而不是一根细线。
const ROLL = 1.18;

/** 不锈钢精密弯头镊。返回 group，group.userData.body 是镊子本体（切换拼豆笔时隐藏）。 */
export function makeTweezers(materials) {
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body); group.userData.body = body;
  for (const sign of [-1, 1]) {
    // 中心线：尾部在 +z 相连，中段向外弓，尖端向内收拢并向下弯（弯头）。
    const points = [
      new THREE.Vector3(sign * .028, .045, -.03),
      new THREE.Vector3(sign * .040, .085, .16),
      new THREE.Vector3(sign * .070, .165, .55),
      new THREE.Vector3(sign * .155, .215, 1.15),
      new THREE.Vector3(sign * .245, .235, 1.9),
      new THREE.Vector3(sign * .235, .245, 2.8),
      new THREE.Vector3(sign * .140, .25, 3.65),
      new THREE.Vector3(sign * .055, .25, 4.18),
    ];
    // 钢片截面：尖端细，往后逐渐变宽，到尾部焊接处略收。u 是沿中心线的 0–1 位置。
    const steelAt = u => ({ thick: .028 + .03 * Math.min(1, u / .16), tall: .05 + .2 * Math.min(1, u / .32) - .05 * Math.max(0, u - .85) / .15, roll: sign * ROLL });
    const arm = new THREE.Mesh(sweepStrip(points, steelAt), materials.steel); arm.castShadow = true; arm.receiveShadow = true; body.add(arm);
    // 尖端单独一截更亮的抛光面（略包住钢片）。
    const tipEnd = .13, tip = new THREE.Mesh(sweepStrip(points, t => { const s = steelAt(t * tipEnd); return { ...s, thick: s.thick + .006, tall: s.tall + .008 }; }, { samples: 16, ring: 12, range: [0, tipEnd] }), materials.steelTip);
    tip.castShadow = true; body.add(tip);
    // 硅胶防滑握套：套在钢片中段，比钢片宽厚一圈，表面一圈圈细棱。
    const grip = sweepStrip(points, t => {
      const edge = Math.min(1, Math.min(t, 1 - t) / .08);
      const ridge = .5 + .5 * Math.cos(t * Math.PI * 2 * 11);
      return { thick: (.1 + .022 * ridge) * edge + .06 * (1 - edge), tall: (.31 + .02 * ridge) * edge + .25 * (1 - edge), roll: sign * ROLL };
    }, { samples: 140, ring: 18, exponent: 3, range: [.3, .68] });
    const gripMesh = new THREE.Mesh(grip, materials.silicone); gripMesh.castShadow = true; gripMesh.receiveShadow = true; body.add(gripMesh);
  }
  // 尾部焊接头：圆润的连接块，带一圈细缝。
  const headGeometry = new THREE.CapsuleGeometry(.075, .16, 6, 16); headGeometry.rotateZ(Math.PI / 2);
  const head = new THREE.Mesh(headGeometry, materials.steel); head.scale.set(1, 1.25, 1.35); head.position.set(0, .25, 4.24); head.castShadow = true; body.add(head);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(.105, .008, 6, 24), materials.siliconeDark); seam.rotation.y = Math.PI / 2; seam.position.set(0, .25, 4.14); seam.scale.set(1, 1.2, 1); body.add(seam);
  return group;
}

/** 拼豆笔：透明笔管里装着一串当前颜色的豆，笔尖出豆口；豆数随手里剩余数量变化（最多显示 12 颗）。 */
export function makeBeadPen(beadGeometry, materials) {
  const group = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, 2.6, 28, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xf4fbf4, transparent: true, opacity: .32, roughness: .08, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .34, 1.75); group.add(barrel);
  const capGeometry = new THREE.CylinderGeometry(.21, .21, .55, 28); capGeometry.rotateX(Math.PI / 2);
  const cap = new THREE.Mesh(capGeometry, materials.silicone); cap.position.set(0, .34, 3.28); cap.castShadow = true; group.add(cap);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .7), materials.steel); clip.position.set(0, .57, 3.0); group.add(clip);
  const nozzleGeometry = new THREE.CylinderGeometry(.19, .06, .5, 28); nozzleGeometry.rotateX(-Math.PI / 2);
  const nozzle = new THREE.Mesh(nozzleGeometry, materials.steelTip); nozzle.position.set(0, .3, .2); nozzle.castShadow = true; group.add(nozzle);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.195, .02, 8, 28), materials.siliconeDark); ring.position.set(0, .34, .45); group.add(ring);
  const beads = new THREE.InstancedMesh(beadGeometry, materials.steelTip, 12); beads.count = 0; beads.castShadow = true; group.add(beads);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 12; i++) { dummy.position.set(0, .34, .62 + i * .2); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.setScalar(.47); dummy.updateMatrix(); beads.setMatrixAt(i, dummy.matrix); }
  // material 由场景传入（与板上同色豆共用同一个材质）。
  group.userData.setBeads = (material, count) => { if (material) beads.material = material; beads.count = material ? Math.max(0, Math.min(12, count | 0)) : 0; };
  group.userData.beadCount = () => beads.count;
  return group;
}
