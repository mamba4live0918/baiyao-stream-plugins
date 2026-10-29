// Full-screen shaders: the signal-loss transition between the two cameras and
// the final grade (vignette, grain, lens fringe, impact flash, warning pulse).
import { Vector2 } from 'three';

const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// hash21 is fine for small inputs (band/block indices). Per-pixel noise uses an
// integer hash: sin-based hashes fall apart on the GPU with pixel-sized inputs.
const HASH = /* glsl */ `
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hashPixel(vec2 p, float frame) {
    uint f = uint(max(frame, 0.0));
    uvec2 q = uvec2(ivec2(p)) + uvec2(f * 1973u, f * 9277u);
    q *= uvec2(1597334673u, 3812015801u);
    uint n = (q.x ^ q.y) * 1597334673u;
    return float(n) / 4294967295.0;
  }
`;

export const TransitionShader = {
  uniforms: {
    tA: { value: null },
    tB: { value: null },
    uT: { value: 0 },
    uTime: { value: 0 },
    uStrength: { value: 1 },
    uResolution: { value: new Vector2(1, 1) },
  },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */ `
    uniform sampler2D tA;
    uniform sampler2D tB;
    uniform float uT;
    uniform float uTime;
    uniform float uStrength;
    uniform vec2 uResolution;
    varying vec2 vUv;
    ${HASH}

    vec3 sampleSplit(sampler2D t, vec2 uv, float split) {
      return vec3(
        texture2D(t, uv + vec2(split, 0.0)).r,
        texture2D(t, uv).g,
        texture2D(t, uv - vec2(split, 0.0)).b
      );
    }

    void main() {
      float peak = 1.0 - abs(uT * 2.0 - 1.0);   // 0 at either end, 1 at the cut
      float f = smoothstep(0.0, 1.0, peak) * uStrength;
      vec2 uv = vUv;

      // Vertical roll right around the cut.
      uv.y = fract(uv.y + smoothstep(0.65, 1.0, peak) * fract(uTime * 1.7) * uStrength);

      // Horizontal tearing in random bands.
      float bands = mix(40.0, 120.0, hash21(vec2(floor(uTime * 10.0), 1.0)));
      float band = floor(uv.y * bands);
      float tick = floor(uTime * 30.0);
      float tearOn = step(1.0 - peak * 0.9, hash21(vec2(band * 1.3, floor(uTime * 15.0))));
      uv.x += (hash21(vec2(band, tick)) - 0.5) * 0.12 * f * tearOn;
      uv.x += sin(uv.y * 30.0 + uTime * 20.0) * 0.004 * f;

      // Displaced blocks.
      vec2 block = floor(uv * vec2(16.0, 9.0));
      float blockOn = step(1.0 - peak * 0.5, hash21(block + floor(uTime * 12.0)));
      uv += blockOn * (vec2(hash21(block + 3.0), hash21(block + 7.0)) - 0.5) * 0.08 * f;

      float split = 0.02 * f;
      vec3 a = sampleSplit(tA, uv, split);
      vec3 b = sampleSplit(tB, uv, split);
      vec3 color = mix(a, b, step(0.5, uT));
      // First pass after the scene: stop any NaN/Inf here so bloom cannot spread it.
      if (!(color.r == color.r && color.g == color.g && color.b == color.b)) color = vec3(0.0);
      color = clamp(color, 0.0, 64.0);

      // Reduced-motion users (uStrength < 1) get a much slower flicker.
      float rate = uStrength < 0.99 ? 6.0 : 30.0;
      float snow = hashPixel(floor(vUv * uResolution / 2.0), floor(uTime * rate));
      color = mix(color, vec3(snow) * 0.8, smoothstep(0.55, 1.0, peak) * 0.85 * uStrength);
      color *= 1.0 - f * 0.35 * (0.5 + 0.5 * sin(vUv.y * uResolution.y * 1.5));
      color = mix(color, color * vec3(0.7, 1.05, 1.1), f * 0.6);
      color *= 1.0 + (hash21(vec2(floor(uTime * rate * 0.8), 9.0)) - 0.5) * 0.4 * f;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uAlert: { value: 0 },
    uVignette: { value: 0.38 },
    uGrain: { value: 0.03 },
    uResolution: { value: new Vector2(1, 1) },
  },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uFlash;
    uniform float uAlert;
    uniform float uVignette;
    uniform float uGrain;
    uniform vec2 uResolution;
    varying vec2 vUv;
    ${HASH}

    void main() {
      vec2 d = vUv - 0.5;
      float fringe = 0.0048 * dot(d, d);
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + d * fringe * 4.0).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - d * fringe * 4.0).b
      );
      float vignette = smoothstep(0.85, 0.2, length(d * vec2(1.0, 0.85)));
      color *= mix(1.0 - uVignette, 1.0, vignette);
      color += uAlert * vec3(1.0, 0.55, 0.18) * (1.0 - vignette) * 0.14;
      color += uFlash * vec3(1.0, 0.95, 0.88);
      color += (hashPixel(vUv * uResolution, floor(uTime * 24.0)) - 0.5) * uGrain;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
