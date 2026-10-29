// Twelve meteors (eleven scanned rocks + asteroid Bennu) on scripted, scroll-driven
// paths. Hits trigger a flash, explosion flipbooks, a shock ring and sparks.
// Explosions: Unity Labs flipbooks (small hits) and a JangaFX EmberGen volume
// rendered to a flipbook (the Bennu hit). Meteor heads burn with the Unity fireball loop.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { clamp, easeOutCubic, mulberry32, randomUnit, smoothstep } from '../core/math.js';
import { METEOR_RADIANT, TIMELINE } from '../config.js';
import { BILLBOARD_VS, vec3From } from './shared.js';

const TRAIL_VS = /* glsl */ `
  uniform vec3 uHead;
  uniform vec3 uDir;
  uniform float uLength;
  uniform float uWidth;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 axis = normalize(uDir);
    vec3 toCamera = normalize(cameraPosition - uHead + vec3(1e-4));
    // Looking straight down the trail makes the cross product vanish; normalising
    // zero gives NaN, which bloom would smear across the screen.
    vec3 c = cross(axis, toCamera);
    float len = length(c);
    vec3 side = len > 1e-4 ? c / len : vec3(0.0, 1.0, 0.0);
    float along = uv.x;
    float width = uWidth * mix(1.0, 0.2, along);
    vec3 world = uHead - axis * along * uLength + side * (uv.y - 0.5) * width;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FS = /* glsl */ `
  uniform float uIntensity;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    float along = vUv.x;
    float across = abs(vUv.y - 0.5) * 2.0;
    float core = exp(-across * across * 6.0);
    float fade = pow(max(1.0 - along, 0.0), 1.6); // along can interpolate past 1
    float flicker = 0.85 + 0.15 * sin(uTime * 30.0 + along * 20.0 + uSeed);
    vec3 color = mix(vec3(1.0, 0.85, 0.6), vec3(0.35, 0.55, 1.0), smoothstep(0.0, 0.7, along));
    gl_FragColor = vec4(color * core * fade * flicker * uIntensity, 1.0);
  }
`;

// Flipbook sheet laid out left-to-right, top-to-bottom. Bright (fire) pixels get
// an HDR boost so they bloom. ADDITIVE is for sheets without alpha.
const FLIPBOOK_FS = /* glsl */ `
  uniform sampler2D tSheet;
  uniform vec2 uGrid;
  uniform float uFrames;
  uniform float uFrame;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uBoost;
  varying vec2 vUv;
  vec4 frameAt(float f) {
    vec2 cell = vec2(mod(f, uGrid.x), uGrid.y - 1.0 - floor(f / uGrid.x));
    return texture2D(tSheet, (cell + vUv) / uGrid);
  }
  void main() {
    float f = clamp(uFrame, 0.0, uFrames - 1.0);
    float f0 = floor(f);
    vec4 c = mix(frameAt(f0), frameAt(min(f0 + 1.0, uFrames - 1.0)), f - f0);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 rgb = c.rgb * uIntensity * (1.0 + uBoost * smoothstep(0.35, 0.95, lum));
    #ifdef ADDITIVE
      gl_FragColor = vec4(rgb * uOpacity, 1.0);
    #else
      gl_FragColor = vec4(rgb, c.a * uOpacity);
    #endif
  }
`;

const FLASH_FS = /* glsl */ `
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float core = exp(-r * r * 18.0) * 3.0;
    float halo = exp(-r * 4.5) * 0.8;
    float rays = pow(max(0.0, 1.0 - abs(p.x * p.y) * 40.0), 6.0) * exp(-r * 2.5);
    float edge = 1.0 - smoothstep(0.85, 1.0, r);
    gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * (core + halo + rays * 0.8) * edge * uIntensity, 1.0);
  }
`;

const RING_FS = /* glsl */ `
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float ring = smoothstep(0.04, 0.0, abs(r - 0.82));
    float fill = smoothstep(0.82, 0.0, r) * 0.12;
    gl_FragColor = vec4(vec3(0.6, 0.85, 1.0) * (ring + fill) * uIntensity, 1.0);
  }
`;

const SPARK_VS = /* glsl */ `
  attribute vec3 aVel;
  attribute float aSeed;
  uniform float uAge;
  uniform float uLife;
  uniform float uSize;
  varying float vLife;
  void main() {
    float t = min(uAge, uLife);
    vec3 local = aVel * (t - 0.35 * t * t / uLife);
    vLife = clamp(1.0 - uAge / (uLife * (0.55 + 0.45 * aSeed)), 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(local, 1.0);
    gl_PointSize = uSize * vLife * (300.0 / max(-mv.z, 0.1));
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FS = /* glsl */ `
  varying float vLife;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0 || vLife <= 0.0) discard;
    float a = (1.0 - d) * vLife;
    vec3 color = mix(vec3(1.0, 0.35, 0.1), vec3(1.0, 0.9, 0.7), vLife) * 2.5;
    gl_FragColor = vec4(color * a, 1.0);
  }
`;

const ROCK_IMPACTS = [0.665, 0.676, 0.688, 0.699, 0.71, 0.722, 0.733, 0.745, 0.756, 0.768, 0.779];
const MISSES = new Set([2, 6, 9]);

function toFloatAttributes(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.attributes[name];
    if (attr.array instanceof Float32Array && !attr.normalized && !attr.isInterleavedBufferAttribute) continue;
    const size = attr.itemSize;
    const array = new Float32Array(attr.count * size);
    for (let i = 0; i < attr.count; i++) {
      array[i * size] = attr.getX(i);
      if (size > 1) array[i * size + 1] = attr.getY(i);
      if (size > 2) array[i * size + 2] = attr.getZ(i);
      if (size > 3) array[i * size + 3] = attr.getW(i);
    }
    geometry.setAttribute(name, new BufferAttribute(array, size));
  }
  return geometry;
}

// First mesh of a glTF, baked into world space and normalised to radius 1.
function unitMesh(gltf) {
  gltf.scene.updateMatrixWorld(true);
  let source = null;
  gltf.scene.traverse((o) => {
    if (!source && o.isMesh) source = o;
  });
  const geometry = toFloatAttributes(source.geometry.clone());
  geometry.applyMatrix4(source.matrixWorld);
  geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere;
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(1 / radius, 1 / radius, 1 / radius);
  geometry.computeBoundingSphere();
  return { geometry, material: source.material.clone() };
}

export function createMeteors({ rock, bennu, station, sheets, pixelRatio }) {
  const group = new Group();
  group.name = 'meteors';
  const rand = mulberry32(1919);
  const radiant = vec3From(METEOR_RADIANT).normalize();
  const sharedTime = { value: 0 };
  const sparkSizes = [];
  const rockUnit = unitMesh(rock);
  const bennuUnit = unitMesh(bennu);

  // Hit the biggest parts; Bennu takes the large piece nearest the middle.
  const bySize = station.pieces
    .map((piece, index) => ({ index, radius: piece.radius, dist: piece.center.length() }))
    .filter((p) => p.radius > 0.5)
    .sort((a, b) => b.radius - a.radius);
  const bennuTarget = bySize.slice(0, 6).sort((a, b) => a.dist - b.dist)[0].index;
  const rockTargets = bySize.map((p) => p.index).filter((i) => i !== bennuTarget);

  function billboard(fragmentShader, uniforms, scale, { additive = true, defines = {} } = {}) {
    const mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        uniforms: { uScale: { value: scale }, ...uniforms },
        vertexShader: BILLBOARD_VS,
        fragmentShader,
        defines,
        transparent: true,
        blending: additive ? AdditiveBlending : NormalBlending,
        depthWrite: false,
      }),
    );
    mesh.frustumCulled = false;
    return mesh;
  }

  function flipbook(sheet, scale, { additive = false, boost = 0.8, intensity = 1 } = {}) {
    return billboard(
      FLIPBOOK_FS,
      {
        tSheet: { value: sheet.texture },
        uGrid: { value: new Vector2(sheet.grid, sheet.grid) },
        uFrames: { value: sheet.frames },
        uFrame: { value: 0 },
        uIntensity: { value: intensity },
        uOpacity: { value: 1 },
        uBoost: { value: boost },
      },
      scale,
      { additive, defines: additive ? { ADDITIVE: '' } : {} },
    );
  }

  function sparks(count, speed, travel, big) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    const velocity = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
      v.set(...randomUnit(rand)).addScaledVector(travel, 0.8).normalize().multiplyScalar(speed * (0.3 + rand() * 0.7));
      v.toArray(velocity, i * 3);
      seed[i] = rand();
    }
    geometry.setAttribute('aVel', new BufferAttribute(velocity, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seed, 1));
    const size = { value: (big ? 1.4 : 0.9) * pixelRatio };
    sparkSizes.push({ uniform: size, base: big ? 1.4 : 0.9 });
    const points = new Points(
      geometry,
      new ShaderMaterial({
        uniforms: { uAge: { value: 0 }, uLife: { value: big ? 2.6 : 1.4 }, uSize: size },
        vertexShader: SPARK_VS,
        fragmentShader: SPARK_FS,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    return points;
  }

  // Explosion layers: [sheet, size, duration (s), delay (s), offset distance].
  function explosionLayers(big, index) {
    if (!big) return [[sheets.small[index % sheets.small.length], 7, 1.7, 0, 0]];
    return [
      [sheets.big, 19, 2.8, 0, 0],
      [sheets.small[1], 8, 1.3, 0.15, 2.6],
      [sheets.small[0], 7, 1.3, 0.32, 2.6],
    ];
  }

  function impactFx(big, travel, index) {
    const fx = new Group();
    fx.visible = false;
    const flash = billboard(FLASH_FS, { uIntensity: { value: 0 } }, big ? 10 : 3.5);
    const fireballs = explosionLayers(big, index).map(([sheet, base, duration, delay, offset]) => {
      // Lift the small hits a little: their smoke is dark against space.
      const mesh = flipbook(sheet, base, big ? {} : { boost: 1.5, intensity: 1.25 });
      if (offset) mesh.position.set(...randomUnit(rand)).multiplyScalar(offset);
      fx.add(mesh);
      return { mesh, base, duration, delay, frames: sheet.frames };
    });
    const ring = billboard(RING_FS, { uIntensity: { value: 0 } }, 1);
    const sparkPoints = sparks(big ? 320 : 90, big ? 16 : 7, travel, big);
    fx.add(ring, sparkPoints, flash);
    group.add(fx);
    return { group: fx, flash, fireballs, ring, sparks: sparkPoints, big, life: big ? 3.4 : 2.0 };
  }

  function makeMeteor({ big, impactP, hit, pieceIndex, index }) {
    const size = big ? 2.2 : 0.35 + rand() * 0.45;
    const travel = radiant
      .clone()
      .negate()
      .add(new Vector3(...randomUnit(rand)).multiplyScalar(big ? 0.05 : 0.14))
      .normalize();
    const target = new Vector3();
    if (hit) {
      station.positionAt(pieceIndex, impactP, target);
      target.addScaledVector(travel, -station.pieces[pieceIndex].radius * 0.4);
      station.addKick(pieceIndex, {
        p0: impactP,
        dir: travel.clone().add(new Vector3(...randomUnit(rand)).multiplyScalar(0.35)).normalize(),
        dist: big ? 4.5 : 2 + rand() * 1.5,
        spin: 1.2 + rand() * 2.2,
      });
    } else {
      const near = rockTargets[Math.floor(rand() * rockTargets.length)];
      station.positionAt(near, impactP, target);
      const sideways = new Vector3(...randomUnit(rand)).cross(travel).normalize();
      target.addScaledVector(sideways, 4 + rand() * 3);
    }

    const unit = big ? bennuUnit : rockUnit;
    const mesh = new Mesh(unit.geometry, unit.material);
    mesh.scale.setScalar(size);
    mesh.visible = false;

    const trail = new Mesh(
      new PlaneGeometry(1, 1, 24, 1),
      new ShaderMaterial({
        uniforms: {
          uHead: { value: new Vector3() },
          uDir: { value: travel.clone() },
          uLength: { value: big ? 34 : 9 + size * 10 },
          uWidth: { value: big ? 4.5 : size * 2.2 },
          uIntensity: { value: 0 },
          uTime: sharedTime,
          uSeed: { value: rand() * 100 },
        },
        vertexShader: TRAIL_VS,
        fragmentShader: TRAIL_FS,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        forceSinglePass: true,
      }),
    );
    trail.frustumCulled = false;
    trail.visible = false;

    // Burning head: the Unity fireball loop, additive.
    const head = flipbook(sheets.fireball, size * (big ? 3 : 2.2), { additive: true, boost: 1 });
    head.visible = false;
    group.add(mesh, trail, head);

    return {
      big,
      size,
      impactP,
      hit,
      travel,
      target,
      speed: big ? 650 : 850 + rand() * 250,
      mesh,
      trail,
      head,
      fx: hit ? impactFx(big, travel, index) : null,
      seed: rand(),
      spinAxis: new Vector3(...randomUnit(rand)),
      spinRate: 0.4 + rand() * 1.2,
      triggeredAt: null,
      lastP: null,
    };
  }

  const meteors = [];
  let nextTarget = 0;
  ROCK_IMPACTS.forEach((impactP, i) => {
    const hit = !MISSES.has(i);
    meteors.push(makeMeteor({ big: false, impactP, hit, pieceIndex: hit ? rockTargets[nextTarget++] : -1, index: i }));
  });
  meteors.push(makeMeteor({ big: true, impactP: TIMELINE.bennuImpact, hit: true, pieceIndex: bennuTarget, index: 0 }));

  function updateFx(m, age) {
    const fx = m.fx;
    const active = age >= 0 && age < fx.life;
    fx.group.visible = active;
    if (!active) return;
    fx.group.position.copy(m.target);

    const flash = fx.flash.material.uniforms;
    flash.uIntensity.value = (fx.big ? 2.5 : 1.6) * Math.exp(-age * (fx.big ? 5 : 9));
    flash.uScale.value = (fx.big ? 10 : 3.5) * (0.5 + Math.min(age, 0.4) * 2.5);

    for (const ball of fx.fireballs) {
      const local = age - ball.delay;
      const k = clamp(local / ball.duration);
      const u = ball.mesh.material.uniforms;
      ball.mesh.visible = local >= 0 && local <= ball.duration;
      u.uFrame.value = k * (ball.frames - 1);
      u.uOpacity.value = 1 - smoothstep(0.7, 1.0, k);
      u.uScale.value = ball.base * (0.85 + easeOutCubic(k) * 0.35);
    }

    const ringK = clamp(age / (fx.big ? 1.4 : 0.8));
    const ring = fx.ring.material.uniforms;
    ring.uScale.value = (fx.big ? 26 : 9) * easeOutCubic(ringK);
    ring.uIntensity.value = 1.0 * (1 - ringK);

    fx.sparks.material.uniforms.uAge.value = age;
  }

  const position = new Vector3();

  return {
    group,
    count: meteors.length,

    // Hits that have happened by progress p (deterministic, used for telemetry).
    hitStats(p) {
      let small = 0;
      let bennuHit = false;
      for (const m of meteors) {
        if (!m.hit || p < m.impactP) continue;
        if (m.big) bennuHit = true;
        else small++;
      }
      return { small, bennuHit };
    },

    setPixelRatio(pixelRatio) {
      for (const s of sparkSizes) s.uniform.value = s.base * pixelRatio;
    },

    // jumped: progress was set directly (?p=, setProgress), not scrolled.
    update(p, time, jumped = false) {
      sharedTime.value = time;
      let shake = 0;
      let flash = 0;
      let glitch = 0;

      for (const m of meteors) {
        const before = p < m.impactP;
        const flying = before || !m.hit;
        const distance = m.speed * (m.impactP - p);
        const far = Math.abs(distance);
        const visible = flying && far < 900;
        m.mesh.visible = visible;
        m.trail.visible = visible;
        m.head.visible = visible;
        if (visible) {
          position.copy(m.target).addScaledVector(m.travel, -distance);
          m.mesh.position.copy(position);
          m.mesh.quaternion.setFromAxisAngle(m.spinAxis, time * m.spinRate);
          const fade = 1 - smoothstep(350, 900, far);
          m.trail.material.uniforms.uHead.value.copy(position);
          m.trail.material.uniforms.uIntensity.value = fade * (m.big ? 1.8 : 1.2);
          m.head.position.copy(position);
          const head = m.head.material.uniforms;
          head.uFrame.value = (time * 30 + m.seed * 64) % 64;
          head.uIntensity.value = fade * (m.big ? 1.4 : 0.9);
        }

        if (!m.hit) continue;
        if (!before) {
          if (m.triggeredAt === null) {
            // Every impact the scroll crosses plays, however big the frame step;
            // a jump (e.g. ?p=0.95) skips straight to the aftermath.
            const crossed = !jumped && m.lastP !== null && m.lastP < m.impactP;
            m.triggeredAt = crossed ? time : -Infinity;
          }
        } else if (m.triggeredAt !== null) {
          m.triggeredAt = null;
        }
        m.lastP = p;

        const age = m.triggeredAt === null ? -1 : time - m.triggeredAt;
        updateFx(m, age);
        if (age >= 0 && age < 3) {
          shake += (m.big ? 0.9 : 0.16) * Math.exp(-age * (m.big ? 2.5 : 6));
          flash += (m.big ? 0.28 : 0.03) * Math.exp(-age * (m.big ? 2.4 : 7));
          glitch = Math.max(glitch, Math.exp(-age * 3));
        }
      }
      return { shake, flash, glitch };
    },
  };
}
