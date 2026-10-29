// The community screen camera B cuts to: a floating monitor that boots like a
// CRT, with the streamer's Douyin info and code, and a looping (demo) feed.
// Above it, particles gather into the closing "白曜".
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import qrUrl from '../assets/community/douyin-qr.webp';
import { SdfText } from '../text/sdfText.js';
import { COMMUNITY, PARTICLE_TEXT, SCRAMBLE_CHARS } from '../content.js';
import { COLORS, PARTICLES, SCREEN, TIMELINE } from '../config.js';
import { clamp, easeInOutCubic, remap, smoothstep } from '../core/math.js';
import { createParticles } from './particles.js';

const GLASS_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// uBoot 0..1: a bright line appears in the middle, then the picture opens up.
const GLASS_FS = /* glsl */ `
  uniform float uTime;
  uniform float uBoot;
  varying vec2 vUv;
  void main() {
    float band = abs(vUv.y - 0.5) * 2.0;
    float open = smoothstep(0.0, 0.25, uBoot);
    float height = smoothstep(0.15, 1.0, uBoot);
    float visible = step(band, max(height, 0.004)) * open;
    vec3 base = mix(vec3(0.03, 0.06, 0.11), vec3(0.012, 0.025, 0.05), vUv.y);
    float scan = 0.92 + 0.08 * sin(vUv.y * 900.0 + uTime * 6.0);
    float vignette = smoothstep(1.2, 0.3, length((vUv - 0.5) * vec2(1.6, 1.0)));
    vec3 color = base * scan * (0.6 + 0.4 * vignette);
    float edge = smoothstep(0.02, 0.0, abs(band - height)) * (1.0 - smoothstep(0.97, 1.0, uBoot));
    color += vec3(0.5, 0.9, 1.0) * edge * 2.0;
    gl_FragColor = vec4(color * visible, 1.0);
  }
`;

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function rectLines(x0, y0, x1, y1, material) {
  const points = [x0, y0, 0, x1, y0, 0, x1, y0, 0, x1, y1, 0, x1, y1, 0, x0, y1, 0, x0, y1, 0, x0, y0, 0];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
  const lines = new LineSegments(geometry, material);
  if (material.isLineDashedMaterial) lines.computeLineDistances();
  return lines;
}

export function createCommunity({ atlas, pixelRatio }) {
  const root = new Group();
  root.name = 'community';
  const screen = new Group();
  screen.position.set(...SCREEN.center);
  root.add(screen);
  const W = SCREEN.width;
  const H = SCREEN.height;

  const glassUniforms = { uTime: { value: 0 }, uBoot: { value: 0 } };
  const glass = new Mesh(
    new PlaneGeometry(W, H),
    new ShaderMaterial({ uniforms: glassUniforms, vertexShader: GLASS_VS, fragmentShader: GLASS_FS }),
  );
  screen.add(glass);

  const bezel = new MeshStandardMaterial({ color: 0x1c2129, metalness: 0.8, roughness: 0.4 });
  for (const [w, h, x, y] of [
    [W + 0.6, 0.3, 0, H / 2 + 0.15],
    [W + 0.6, 0.3, 0, -H / 2 - 0.15],
    [0.3, H, -W / 2 - 0.15, 0],
    [0.3, H, W / 2 + 0.15, 0],
  ]) {
    const part = new Mesh(new BoxGeometry(w, h, 0.35), bezel);
    part.position.set(x, y, -0.05);
    screen.add(part);
  }
  const edgeGlow = new LineBasicMaterial({ color: new Color(0.6, 2.4, 3.2), transparent: true, opacity: 0 });
  const edge = rectLines(-W / 2 + 0.06, -H / 2 + 0.06, W / 2 - 0.06, H / 2 - 0.06, edgeGlow);
  edge.position.z = 0.02;
  screen.add(edge);

  const texts = [];
  const addText = (options, value, x, y, delay) => {
    const t = new SdfText(atlas, { scramble: SCRAMBLE_CHARS, depthTest: true, halo: 0, ...options });
    t.setText(value);
    t.position.set(x, y, 0.03);
    t.reveal = 0;
    screen.add(t);
    texts.push({ text: t, delay });
    return t;
  };
  const ICE = rgb(COLORS.ice);
  const AMBER = rgb(COLORS.amber);
  const DIM = rgb(COLORS.dim);
  const left = -W / 2 + 0.7;

  addText({ font: 'monoBold', size: 0.3, color: AMBER, letterSpacing: 0.18 }, COMMUNITY.label, left, H / 2 - 0.45, 0);
  addText({ font: 'monoBold', size: 0.3, color: AMBER, letterSpacing: 0.18, align: 'right' }, COMMUNITY.live, W / 2 - 0.7, H / 2 - 0.45, 0.05);
  addText({ font: 'title', size: 0.95, color: ICE }, COMMUNITY.title, left, H / 2 - 1.1, 0.08);
  COMMUNITY.rows.forEach(([label, value], i) => {
    const y = 1.75 - i * 0.82;
    addText({ font: 'mono', size: 0.3, color: DIM, letterSpacing: 0.08 }, label, left, y, 0.15 + i * 0.05);
    addText({ font: 'title', size: 0.46, color: ICE }, value, left + 2.1, y + 0.1, 0.18 + i * 0.05);
  });
  addText({ font: 'title', size: 0.27, color: DIM, align: 'center' }, COMMUNITY.qr, left + 1.2, -3.78, 0.3);
  addText({ font: 'monoBold', size: 0.28, color: AMBER, letterSpacing: 0.12 }, COMMUNITY.wallTitle, 1.4, 2.25, 0.25);
  const wall = addText(
    { font: 'title', size: 0.34, color: ICE, lineHeight: 1.55, maxChars: 400, scrollWindow: 5.1 },
    COMMUNITY.wall.join('\n'),
    1.4,
    1.6,
    0.3,
  );
  wall.opacity = 0.82;

  const dim = new LineBasicMaterial({ color: new Color(0.25, 0.32, 0.42), transparent: true, opacity: 0 });
  const divider = new LineSegments(new BufferGeometry(), dim);
  divider.geometry.setAttribute('position', new BufferAttribute(new Float32Array([0.8, 2.5, 0, 0.8, -4.0, 0]), 3));
  divider.position.z = 0.02;
  screen.add(divider);
  // Round Douyin code with transparent corners, in the 2.4-unit square below the rows.
  const qrTexture = new TextureLoader().load(qrUrl);
  qrTexture.colorSpace = SRGBColorSpace;
  const qrMaterial = new MeshBasicMaterial({ map: qrTexture, transparent: true, opacity: 0 });
  const qr = new Mesh(new PlaneGeometry(2.4, 2.4), qrMaterial);
  qr.position.set(left + 1.2, -2.25, 0.025);
  screen.add(qr);

  const liveDot = new Mesh(new CircleGeometry(0.1, 24), new MeshBasicMaterial({ color: new Color(3, 0.6, 0.3), transparent: true, opacity: 0 }));
  liveDot.position.set(W / 2 - 1.75, H / 2 - 0.6, 0.03);
  screen.add(liveDot);

  const particles = createParticles({ text: PARTICLE_TEXT, width: PARTICLES.width, count: PARTICLES.count, pixelRatio });
  particles.points.position.set(...PARTICLES.center);
  root.add(particles.points);

  return {
    group: root,
    particleCenter: particles.points.position,
    setPixelRatio: particles.setPixelRatio,

    // pointer: position on the particle plane relative to its centre, or null.
    update(p, time, pointer) {
      glassUniforms.uTime.value = time;
      const boot = remap(p, TIMELINE.screenBoot[0], TIMELINE.screenBoot[1]);
      glassUniforms.uBoot.value = boot;
      root.visible = p > TIMELINE.transition[0] - 0.01;
      const content = remap(boot, 0.75, 1);
      edgeGlow.opacity = smoothstep(0.2, 0.6, boot);
      dim.opacity = content * 0.8;
      qrMaterial.opacity = content;
      liveDot.material.opacity = content * (0.55 + 0.45 * Math.sign(Math.sin(time * 4)));
      for (const { text, delay } of texts) {
        text.reveal = clamp((content - delay) / 0.5);
        text.visible = text.reveal > 0;
        text.update(time);
      }
      wall.scroll = time * 0.35;

      const form = easeInOutCubic(remap(p, TIMELINE.particles[0], TIMELINE.particles[1]));
      const u = particles.uniforms;
      u.uTime.value = time;
      u.uForm.value = form;
      u.uOpacity.value = smoothstep(0, 0.12, form);
      particles.points.visible = form > 0;
      if (pointer) {
        u.uPointer.value.copy(pointer);
        u.uPointerOn.value = 1;
      } else {
        u.uPointerOn.value = 0;
      }
    },
  };
}
