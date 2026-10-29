// The NASA ISS model split into its modules. Scrolling first opens it up like an
// exploded-view drawing (cyan hologram of the intact station left behind), then
// moves every module out to a ring that turns as you scroll and frames the core.
import { AdditiveBlending, Box3, Color, DoubleSide, Group, Matrix4, Mesh, Quaternion, ShaderMaterial, Sphere, Vector3 } from 'three';
import { clamp, easeInOutCubic, mulberry32, randomUnit, remap, smoothstep } from '../core/math.js';
import { RING, TIMELINE } from '../config.js';

const HOLO_VS = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HOLO_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float fresnel = pow(max(1.0 - abs(dot(n, v)), 0.0), 2.4);
    vec3 cell = abs(fract(vPosW * 1.6) - 0.5);
    float grid = smoothstep(0.46, 0.5, max(cell.x, max(cell.y, cell.z)));
    float scan = 0.6 + 0.4 * sin(vPosW.y * 14.0 - uTime * 2.4);
    float flicker = 0.9 + 0.1 * sin(uTime * 37.0 + vPosW.x * 5.0);
    float alpha = (fresnel * 0.85 + grid * 0.3 + 0.035) * scan * flicker * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// Pieces that come right up to a camera dissolve (dithered) instead of filling
// the screen. Applied to lit materials only, which provide vViewPosition.
const NEAR_FADE = { start: { value: 6 }, end: { value: 13 } };
function addNearFade(shader) {
  shader.uniforms.uNearFadeStart = NEAR_FADE.start;
  shader.uniforms.uNearFadeEnd = NEAR_FADE.end;
  shader.fragmentShader = shader.fragmentShader.replace(
    'void main() {',
    /* glsl */ `uniform float uNearFadeStart;
uniform float uNearFadeEnd;
void main() {
  float nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, length(vViewPosition));
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (dither > nearFade) discard;`,
  );
}

function tuneMaterial(material) {
  const list = Array.isArray(material) ? material : [material];
  for (const m of list) {
    if ('envMapIntensity' in m) m.envMapIntensity = 0.9;
    if (m.isMeshStandardMaterial) m.onBeforeCompile = addNearFade;
  }
}

const UNFOLD_SPAN = 0.4; // share of the unfold window each piece takes to open

// GLTFLoader turns a multi-material mesh into a Group of one Mesh per primitive.
// Those primitives belong to one module and must move together.
function moduleKey(mesh, associations) {
  const own = associations?.get(mesh);
  const parent = mesh.parent;
  const up = parent && associations?.get(parent);
  if (own && own.primitives !== undefined && up && up.meshes === own.meshes) return parent;
  return mesh;
}

export function createStation(gltf, { size }) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const dims = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = size / Math.max(dims.x, dims.y, dims.z);
  const fit = new Matrix4().makeScale(scale, scale, scale).multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));

  const modules = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const key = moduleKey(obj, gltf.parser?.associations);
    if (!modules.has(key)) modules.set(key, []);
    modules.get(key).push({ mesh: obj, world: fit.clone().multiply(obj.matrixWorld) });
  });

  const group = new Group();
  group.name = 'station';
  const ghosts = new Group();
  ghosts.name = 'station-ghosts';

  const holoShared = {
    uColor: { value: new Color(0.35, 0.88, 1.0).multiplyScalar(0.75) },
    uTime: { value: 0 },
  };
  const holoBase = new ShaderMaterial({
    uniforms: { ...holoShared, uOpacity: { value: 0 } },
    vertexShader: HOLO_VS,
    fragmentShader: HOLO_FS,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true, // additive, so one pass over both faces is enough
  });

  const pieces = [];
  let maxDist = 0;
  for (const entries of modules.values()) {
    const ghostMaterial = holoBase.clone();
    ghostMaterial.uniforms.uColor = holoShared.uColor;
    ghostMaterial.uniforms.uTime = holoShared.uTime;
    const sphere = new Sphere();
    const parts = entries.map(({ mesh, world }, i) => {
      mesh.removeFromParent();
      // Keep the full world matrix (it may carry dequantisation scale), so parts
      // are posed by matrix instead of position/quaternion.
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(world);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      tuneMaterial(mesh.material);
      group.add(mesh);

      mesh.geometry.computeBoundingSphere();
      const partSphere = mesh.geometry.boundingSphere.clone().applyMatrix4(world);
      if (i === 0) sphere.copy(partSphere);
      else sphere.union(partSphere);

      const ghost = new Mesh(mesh.geometry, ghostMaterial);
      ghost.matrixAutoUpdate = false;
      ghost.matrix.copy(world);
      ghost.visible = false;
      ghost.renderOrder = 5;
      ghosts.add(ghost);
      return { mesh, world, ghost };
    });
    maxDist = Math.max(maxDist, sphere.center.length());
    pieces.push({ parts, ghostMaterial, center: sphere.center.clone(), radius: sphere.radius });
  }

  const rand = mulberry32(20261019);
  for (const piece of pieces) {
    const dist = piece.center.length();
    piece.dir = dist < 0.4 ? new Vector3(...randomUnit(rand)) : piece.center.clone().normalize();
    // Exploded view: everything moves straight out from the middle, farther for
    // parts that were already far out, so the station keeps its shape.
    piece.explode = piece.center.clone().multiplyScalar(0.75).addScaledVector(piece.dir, 1.0);
    // Outer parts (solar wings, radiators) let go first.
    piece.delay = clamp(0.55 * (1 - dist / maxDist) + rand() * 0.15, 0, 1 - UNFOLD_SPAN);
    piece.ringAngle = dist < 0.4 ? rand() * Math.PI * 2 : Math.atan2(piece.center.z, piece.center.x);
    piece.ringRadius = RING.radius + (rand() - 0.5) * RING.spread;
    piece.ringY = (rand() - 0.5) * RING.height;
    piece.ringDelay = rand() * 0.4;
    piece.tilt = (rand() - 0.5) * 0.5;
    piece.phase = rand() * Math.PI * 2;
  }

  const target = new Vector3();
  const ringPos = new Vector3();
  const quat = new Quaternion();
  const tiltQuat = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const pose = new Matrix4();
  const rotation = new Matrix4();
  const fromCenter = new Matrix4();

  function unfoldAmount(piece, p) {
    const u = remap(p, TIMELINE.unfold[0], TIMELINE.unfold[1]);
    return easeInOutCubic(remap(u, piece.delay, piece.delay + UNFOLD_SPAN));
  }

  function ringAmount(piece, p) {
    const [r0, r1] = TIMELINE.ring;
    return easeInOutCubic(remap(p, r0 + piece.ringDelay * (r1 - r0) * 0.5, r1));
  }

  return {
    group,
    ghosts,
    pieces,

    // Scroll progress at which a piece starts to move (used to fire its bolt).
    startProgress(index) {
      const [u0, u1] = TIMELINE.unfold;
      return u0 + (u1 - u0) * pieces[index].delay;
    },

    update(p, time) {
      holoShared.uTime.value = time;
      const ghostFade = 1 - smoothstep(TIMELINE.ghostFade[0], TIMELINE.ghostFade[1], p);
      // The ring turns with scroll, not time: a piece's target can then never
      // sit on the far side of the core while it is still flying out to it.
      const turn = Math.max(0, p - TIMELINE.ring[0]) * RING.turn;
      for (const piece of pieces) {
        const a = unfoldAmount(piece, p);
        const r = ringAmount(piece, p);

        target.copy(piece.center).addScaledVector(piece.explode, a);
        if (r > 0) {
          const orbit = piece.ringAngle + turn;
          const bob = Math.sin(time * 0.5 + piece.phase) * 0.15;
          ringPos.set(Math.cos(orbit) * piece.ringRadius, piece.ringY + bob, Math.sin(orbit) * piece.ringRadius);
          target.lerp(ringPos, r);
        }
        // Turn with the ring so pieces keep facing the same way round it.
        quat.setFromAxisAngle(up, -turn * r);
        tiltQuat.setFromAxisAngle(piece.dir, piece.tilt * r);
        quat.multiply(tiltQuat);

        // pose = T(target) * R * T(-center): rotate about the piece's own centre.
        pose.makeTranslation(target.x, target.y, target.z);
        rotation.makeRotationFromQuaternion(quat);
        fromCenter.makeTranslation(-piece.center.x, -piece.center.y, -piece.center.z);
        pose.multiply(rotation).multiply(fromCenter);

        const alpha = smoothstep(0.05, 0.35, a) * ghostFade;
        piece.ghostMaterial.uniforms.uOpacity.value = alpha;
        for (const part of piece.parts) {
          part.mesh.matrix.multiplyMatrices(pose, part.world);
          part.mesh.matrixWorldNeedsUpdate = true;
          part.ghost.visible = alpha > 0.003;
        }
      }
    },
  };
}
