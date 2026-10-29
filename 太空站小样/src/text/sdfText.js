// A block of SDF text drawn as instanced quads. Supports a left-to-right
// "decode" reveal with scrambled glyphs, plus a slice/colour-split glitch.
import {
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { glyphQuad, layoutText } from './textLayout.js';

export const SCRAMBLE_WINDOW = 0.25;
const SCRAMBLE_INTERVAL = 0.05; // seconds between glyph swaps

const VS = /* glsl */ `
  attribute vec2 corner;
  attribute vec4 aRect;   // x, y (top), width, height
  attribute vec4 aUV;     // u0, v0, u1, v1
  attribute vec4 aParams; // order 0..1, random, line
  uniform float uReveal;
  uniform float uGlitch;
  uniform float uTime;
  uniform float uSize;
  uniform float uScroll;      // looping scroll (only when uWrap > 0)
  uniform float uWrap;
  uniform float uWindow;
  uniform float uLineAdvance;
  varying vec2 vUv;
  varying float vVisible;
  varying float vFade;
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float head = uReveal * (1.0 + ${SCRAMBLE_WINDOW.toFixed(3)});
    vVisible = 1.0 - smoothstep(head - 0.02, head, aParams.x);
    vec2 pos = aRect.xy + vec2(corner.x * aRect.z, -corner.y * aRect.w);
    vFade = 1.0;
    if (uWrap > 0.0) {
      // Lines move up and wrap round; d is a line's distance below the block top.
      float d = mod(aParams.z * uLineAdvance - uScroll, uWrap);
      pos.y += aParams.z * uLineAdvance - d;
      vFade = smoothstep(0.0, uLineAdvance * 1.2, d) * (1.0 - smoothstep(uWindow - uLineAdvance * 1.2, uWindow, d));
    }
    float slice = aParams.z * 7.0 + floor((aRect.y - aRect.w * 0.5) / (uSize * 0.35));
    float tick = floor(uTime * 18.0);
    float on = step(1.0 - uGlitch * 0.5, hash21(vec2(slice, tick)));
    pos.x += (hash21(vec2(slice + 3.1, tick)) - 0.5) * uSize * 0.8 * on * uGlitch;
    vUv = vec2(mix(aUV.x, aUV.z, corner.x), mix(aUV.y, aUV.w, corner.y));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 0.0, 1.0);
  }
`;

const FS = /* glsl */ `
  uniform sampler2D tAtlas;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGlitch;
  uniform float uHalo;
  varying vec2 vUv;
  varying float vVisible;
  varying float vFade;
  float alphaAt(vec2 uv) {
    float d = texture2D(tAtlas, uv).r;
    float w = max(fwidth(d) * 0.75, 1e-4);
    return smoothstep(0.75 - w, 0.75 + w, d);
  }
  void main() {
    float a = alphaAt(vUv);
    vec3 color = uColor;
    if (uGlitch > 0.02) {
      float off = uGlitch * 0.0025;
      float ar = alphaAt(vUv + vec2(off, 0.0));
      float ab = alphaAt(vUv - vec2(off, 0.0));
      float am = max(a, max(ar, ab));
      color = uColor * vec3(ar, a, ab) / max(am, 1e-3);
      a = am;
    }
    // Soft dark halo from the same distance field keeps text readable over clouds.
    float halo = smoothstep(0.35, 0.7, texture2D(tAtlas, vUv).r) * uHalo * 0.75;
    float coverage = max(a, halo);
    vec3 composite = color * (a / max(coverage, 1e-3));
    float alpha = coverage * uOpacity * vVisible * vFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(composite, alpha);
  }
`;

// Options beyond layout: depthTest (true for text placed in the 3D scene) and
// scrollWindow (> 0 makes the lines loop upwards inside a window that tall).
export class SdfText extends Mesh {
  constructor(
    atlas,
    { font, size, color, align = 'left', letterSpacing = 0, lineHeight = 1.3, maxChars = 96, scramble = '', halo = 0.55, depthTest = false, scrollWindow = 0 },
  ) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('corner', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    geometry.setIndex([0, 2, 1, 2, 3, 1]);
    for (const name of ['aRect', 'aUV', 'aParams']) {
      const attr = new InstancedBufferAttribute(new Float32Array(maxChars * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attr);
    }
    geometry.instanceCount = 0;

    const material = new ShaderMaterial({
      uniforms: {
        tAtlas: { value: atlas.texture },
        uColor: { value: new Vector3(...color) },
        uOpacity: { value: 1 },
        uReveal: { value: 1 },
        uGlitch: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: size },
        uHalo: { value: halo },
        uScroll: { value: 0 },
        uWrap: { value: 0 },
        uWindow: { value: scrollWindow },
        uLineAdvance: { value: size * lineHeight },
      },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthTest,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true,
    });

    super(geometry, material);
    this.frustumCulled = false;
    this.atlas = atlas;
    this.font = font;
    this.size = size;
    this.align = align;
    this.letterSpacing = letterSpacing;
    this.lineHeight = lineHeight;
    this.maxChars = maxChars;
    this.scrollWindow = scrollWindow;
    this.scramble = [...scramble].filter((c) => c.trim());
    this.text = null;
    this.items = [];
    this.width = 0;
    this.height = 0;
    this.lastSwap = -1;
    atlas.ensure(font, this.scramble.join(''));
  }

  get reveal() {
    return this.material.uniforms.uReveal.value;
  }
  set reveal(v) {
    this.material.uniforms.uReveal.value = v;
  }
  get opacity() {
    return this.material.uniforms.uOpacity.value;
  }
  set opacity(v) {
    this.material.uniforms.uOpacity.value = v;
  }
  get glitch() {
    return this.material.uniforms.uGlitch.value;
  }
  set glitch(v) {
    this.material.uniforms.uGlitch.value = v;
  }

  setColor(rgb) {
    this.material.uniforms.uColor.value.set(rgb[0], rgb[1], rgb[2]);
  }

  set scroll(v) {
    this.material.uniforms.uScroll.value = v;
  }

  setSize(size) {
    if (size === this.size) return;
    this.size = size;
    this.material.uniforms.uSize.value = size;
    this.relayout();
  }

  setAlign(align) {
    if (align === this.align) return;
    this.align = align;
    this.relayout();
  }

  relayout() {
    const text = this.text;
    this.text = null;
    if (text !== null) this.setText(text);
  }

  setText(value) {
    const text = String(value ?? '');
    if (text === this.text) return;
    this.text = text;
    this.atlas.ensure(this.font, text);
    const layout = layoutText(text, {
      glyph: (char) => this.atlas.glyph(this.font, char),
      size: this.size,
      letterSpacing: this.letterSpacing,
      lineHeight: this.lineHeight,
      align: this.align,
    });
    this.width = layout.width;
    this.height = layout.height;

    const drawn = layout.chars.filter((c) => !c.glyph.empty).slice(0, this.maxChars);
    const last = Math.max(1, drawn.length - 1);
    this.items = drawn.map((c, i) => ({ ...c, order: i / last, scrambled: false }));
    const params = this.geometry.attributes.aParams;
    this.items.forEach((item, i) => {
      this.writeGlyph(i, item, item.glyph);
      params.setXYZW(i, item.order, Math.random(), item.line, 0);
    });
    params.needsUpdate = true;
    this.geometry.instanceCount = this.items.length;

    const u = this.material.uniforms;
    u.uLineAdvance.value = this.size * this.lineHeight;
    if (this.scrollWindow > 0) {
      // Wrap a little beyond the window so a line never pops in while visible.
      u.uWrap.value = Math.max(layout.height, this.scrollWindow + u.uLineAdvance.value);
    }
  }

  writeGlyph(index, item, g) {
    const q = glyphQuad(item.pen, item.baseline, item.scale, g);
    const { aRect, aUV } = this.geometry.attributes;
    aRect.setXYZW(index, q.x, q.y, q.w, q.h);
    aUV.setXYZW(index, g.u0, g.v0, g.u1, g.v1);
    aRect.needsUpdate = true;
    aUV.needsUpdate = true;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
    if (!this.items.length || !this.scramble.length) return;
    const reveal = this.reveal;
    const settled = reveal <= 0 || reveal >= 1;
    const anyScrambled = this.items.some((it) => it.scrambled);
    if (settled && !anyScrambled) return;
    if (!settled && time - this.lastSwap < SCRAMBLE_INTERVAL) return;
    this.lastSwap = time;

    const head = reveal * (1 + SCRAMBLE_WINDOW);
    this.items.forEach((item, i) => {
      const scrambling = !settled && item.order >= head - SCRAMBLE_WINDOW && item.order < head;
      if (scrambling) {
        const char = this.scramble[(Math.random() * this.scramble.length) | 0];
        this.writeGlyph(i, item, this.atlas.glyph(this.font, char));
        item.scrambled = true;
      } else if (item.scrambled) {
        this.writeGlyph(i, item, item.glyph);
        item.scrambled = false;
      }
    });
  }
}
