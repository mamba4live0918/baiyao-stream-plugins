// Small camera-facing effects shared by the scene: flipbook sprites and flashes.
import { AdditiveBlending, Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';
import { BILLBOARD_VS } from './shared.js';

// Flipbook sheet laid out left-to-right, top-to-bottom. Bright (fire) pixels get
// an HDR boost so they bloom. ADDITIVE is for sheets without alpha.
export const FLIPBOOK_FS = /* glsl */ `
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

export const FLASH_FS = /* glsl */ `
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

export function createBillboard(fragmentShader, uniforms, scale, { additive = true, defines = {} } = {}) {
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

// sheet: { texture, grid, frames }
export function createFlipbook(sheet, scale, { additive = false, boost = 0.8, intensity = 1 } = {}) {
  return createBillboard(
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
