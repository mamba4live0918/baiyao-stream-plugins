// Points that swirl in and settle into a word (the closing "白曜"). The word is
// rasterised with the title font and sampled; the pointer pushes particles aside.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import { FONT_FAMILIES } from '../core/loader.js';
import { mulberry32, randomUnit } from '../core/math.js';

const VS = /* glsl */ `
  attribute vec3 aStart;
  attribute float aSeed;
  uniform float uForm;
  uniform float uTime;
  uniform vec3 uPointer;
  uniform float uPointerOn;
  uniform float uSize;
  varying float vGlow;
  void main() {
    float k = clamp((uForm - aSeed * 0.35) / 0.65, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    vec3 p = mix(aStart, position, k);
    float t = uTime * 0.6 + aSeed * 40.0;
    p += (1.0 - k) * vec3(sin(t), cos(t * 1.3), sin(t * 0.7)) * 1.5;
    p += k * vec3(sin(t * 2.1), cos(t * 1.7), 0.0) * 0.025;
    vec2 d = p.xy - uPointer.xy;
    float dist = length(d);
    float push = uPointerOn * k * smoothstep(1.3, 0.0, dist);
    p.xy += (dist > 1e-4 ? d / dist : vec2(0.0)) * push * 0.8;
    vGlow = clamp(0.35 + 0.65 * push + (1.0 - k) * 0.4, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed * 0.8) * (60.0 / max(-mv.z, 0.1));
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = /* glsl */ `
  uniform float uOpacity;
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    // Thousands of additive points overlap, so each one stays faint.
    float a = (1.0 - d) * uOpacity;
    vec3 color = mix(vec3(0.35, 0.85, 1.0), vec3(1.0, 0.95, 0.85), vGlow) * (0.28 + vGlow * 0.6);
    gl_FragColor = vec4(color * a, 1.0);
  }
`;

// Filled pixels of `text` drawn into a canvas, as [x0, y0, x1, y1, ...].
function sampleText(text, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${Math.round(height * 0.74)}px "${FONT_FAMILIES.title}"`;
  ctx.fillText(text, width / 2, height / 2 + height * 0.04);
  const data = ctx.getImageData(0, 0, width, height).data;
  const filled = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 128) filled.push(x, y);
    }
  }
  return filled;
}

export function createParticles({ text, width, count, pixelRatio }) {
  const CW = 1024;
  const CH = 512;
  const filled = sampleText(text, CW, CH);
  const rand = mulberry32(77);
  const scale = width / CW;
  const positions = new Float32Array(count * 3);
  const starts = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (filled.length) {
      const j = Math.floor(rand() * (filled.length / 2)) * 2;
      positions[i * 3] = (filled[j] - CW / 2 + (rand() - 0.5) * 2) * scale;
      positions[i * 3 + 1] = (CH / 2 - filled[j + 1] + (rand() - 0.5) * 2) * scale;
    } else {
      positions[i * 3] = (rand() - 0.5) * width;
      positions[i * 3 + 1] = (rand() - 0.5) * width * 0.5;
    }
    positions[i * 3 + 2] = (rand() - 0.5) * 0.15;
    const [ux, uy, uz] = randomUnit(rand);
    const r = 6 + rand() * 10;
    starts[i * 3] = ux * r;
    starts[i * 3 + 1] = uy * r * 0.6;
    starts[i * 3 + 2] = uz * r * 0.5;
    seeds[i] = rand();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aStart', new BufferAttribute(starts, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  const uniforms = {
    uForm: { value: 0 },
    uTime: { value: 0 },
    uPointer: { value: new Vector3(999, 999, 0) },
    uPointerOn: { value: 0 },
    uSize: { value: 1.7 * pixelRatio },
    uOpacity: { value: 0 },
  };
  const points = new Points(
    geometry,
    new ShaderMaterial({
      uniforms,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;
  points.name = 'particles';

  return {
    points,
    uniforms,
    setPixelRatio(ratio) {
      uniforms.uSize.value = 1.7 * ratio;
    },
  };
}
