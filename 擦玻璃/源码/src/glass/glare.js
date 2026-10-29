/* 玻璃感：卡通式的斜向双道反光 + 四边淡青玻璃边 + 砸中时的震波圈 + 擦干净时反光一亮。
   全屏一个四边形着色器；强度 uGlass = 0 时完全透明。露脸区内不画。 */
import * as THREE from 'three';
import { ZONE_GLSL, LAYER } from './stage.js';

const RINGS = 4;

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uGlass;
uniform float uFlash;
uniform vec2 uWobble;
uniform vec4 uRings[${RINGS}];
${ZONE_GLSL}

/* 一道反光条：c 中心、ang 方向、len 半长、wid 半宽、off 横向偏移（都按画面高度为 1） */
float band(vec2 p, vec2 c, float ang, float len, float wid, float off) {
  vec2 d = p - c;
  float cs = cos(ang), sn = sin(ang);
  float u = d.x * cs + d.y * sn;
  float v = -d.x * sn + d.y * cs - off;
  float across = 1.0 - smoothstep(wid * 0.45, wid, abs(v));
  float along = 1.0 - smoothstep(len * 0.55, len, abs(u));
  return across * along;
}

/* 预乘累加：把一层颜色盖到已有结果上 */
void over(inout vec3 acc, inout float A, vec3 c, float a) {
  acc = acc * (1.0 - a) + c * a;
  A = A + a * (1.0 - A);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  /* 尺寸按短边：横屏竖屏下玻璃边、反光一样粗 */
  float S = min(uRes.x, uRes.y);
  vec2 ext = uRes / S;
  vec2 p = frag / S;
  vec2 pw = (frag - uWobble) / S;
  float ang = 0.95;
  float flash = 1.0 + uFlash * 1.4;
  vec3 acc = vec3(0.0);
  float A = 0.0;
  /* 四边玻璃边：最外一圈灰青细线（浅底上也看得见）+ 里面一条白亮线 + 向内一层很淡的青色 */
  float e = min(min(p.x, ext.x - p.x), min(p.y, ext.y - p.y));
  float glow = 1.0 - smoothstep(0.0, 0.035, e);
  float outer = 1.0 - smoothstep(0.0015, 0.0032, e);
  float inner = (1.0 - smoothstep(0.0048, 0.0072, e)) * smoothstep(0.0028, 0.0042, e);
  over(acc, A, vec3(0.70, 0.88, 0.97), glow * 0.12 * uGlass);
  over(acc, A, vec3(0.50, 0.68, 0.78), outer * 0.55 * uGlass);
  over(acc, A, vec3(1.0), inner * 0.6 * uGlass);
  /* 卡通斜向反光：左上一组（粗 + 细），右下一组（稍短）；外圈淡青、芯白 */
  float g = 0.0;
  float gs = 0.0;
  vec2 c1 = vec2(0.12, 0.80) * ext;
  vec2 c2 = vec2(0.89, 0.18) * ext;
  g += band(pw, c1, ang, 0.17, 0.016, 0.0);
  g += band(pw, c1, ang, 0.11, 0.0055, 0.034) * 0.95;
  g += band(pw, c2, ang, 0.12, 0.012, 0.0) * 0.85;
  g += band(pw, c2, ang, 0.075, 0.0042, -0.027) * 0.8;
  gs += band(pw, c1, ang, 0.18, 0.024, 0.0) + band(pw, c2, ang, 0.13, 0.019, 0.0) * 0.85;
  over(acc, A, vec3(0.74, 0.90, 1.0), min(gs, 1.0) * 0.22 * uGlass * flash);
  over(acc, A, vec3(1.0), min(g, 1.0) * 0.5 * uGlass * flash);
  /* 震波圈 */
  float rings = 0.0;
  for (int i = 0; i < ${RINGS}; i++) {
    vec4 r = uRings[i];
    if (r.w <= 0.0) continue;
    float d = distance(frag, r.xy);
    float w = 0.007 * S + r.z * 0.04;
    rings += exp(-pow((d - r.z) / w, 2.0)) * r.w;
  }
  over(acc, A, vec3(1.0), min(rings, 1.0) * 0.42);
  float z = zoneMask(frag);
  if (A * z < 0.002) discard;
  gl_FragColor = vec4(acc / max(A, 1e-4), min(A * z, 0.9));
}
`;

const vertexShader = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function createGlare(stage) {
  const rings = Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, 0, 0));
  const ringState = Array.from({ length: RINGS }, () => ({ x: 0, y: 0, t: 1, dur: 1, max: 1 }));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: stage.shared.uRes,
      uGlass: { value: 0.6 },
      uFlash: { value: 0 },
      uWobble: stage.shared.uWobble,
      uRings: { value: rings },
      uZoneTex: stage.shared.uZoneTex,
      uZoneP: stage.shared.uZoneP
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = LAYER.GLARE;
  stage.scene.add(mesh);

  let wobble = 0;
  let wobbleT = 0;
  let reduced = false;
  let flash = 0;
  let next = 0;
  return {
    setStrength(v) {
      material.uniforms.uGlass.value = v;
    },
    /* 关掉装饰动画：砸中不抖、不出震波圈 */
    setReduced(v) {
      reduced = !!v;
    },
    /* 砸中：在 (x,y) 出一圈震波，玻璃反光抖一下 */
    impact(x, y, strength = 1) {
      if (reduced) return;
      const r = ringState[next++ % RINGS];
      Object.assign(r, { x, y, t: 0, dur: 0.6 + 0.3 * strength, max: (140 + 220 * strength) * stage.unit });
      wobble = Math.min(2.4, wobble + 1.25 * strength);
      wobbleT = 0;
    },
    tap(x, y) {
      if (reduced) return;
      const r = ringState[next++ % RINGS];
      Object.assign(r, { x, y, t: 0, dur: 0.45, max: 46 * stage.unit });
    },
    flash(v = 1) {
      flash = Math.max(flash, v);
    },
    update(dt) {
      wobbleT += dt;
      const amp = wobble * 11 * stage.unit;
      const wx = Math.sin(wobbleT * 38) * amp;
      const wy = Math.cos(wobbleT * 31) * amp * 0.6;
      stage.shared.uWobble.value.set(wx, wy);
      /* 玻璃上的脏东西跟着一起震（反光震得多一点，脏东西少一点，像玻璃在晃） */
      stage.pane.position.set(wx * 0.45, wy * 0.45, 0);
      wobble *= Math.exp(-dt * 6.5);
      /* 抖完了就停在 0（不然一直有看不见的小抖动，画面永远"在变"） */
      if (wobble < 0.002) wobble = 0;
      flash = Math.max(0, flash - dt * 1.8);
      material.uniforms.uFlash.value = flash;
      for (let i = 0; i < RINGS; i++) {
        const r = ringState[i];
        r.t += dt;
        const k = Math.min(1, r.t / r.dur);
        const alive = r.t < r.dur;
        rings[i].set(r.x * stage.dpr, (stage.H - r.y) * stage.dpr, (k * r.max + 6) * stage.dpr, alive ? (1 - k) ** 1.6 : 0);
      }
    },
    get wobbleAmount() {
      return wobble;
    }
  };
}
