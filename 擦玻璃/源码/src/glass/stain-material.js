/* 污渍着色器：颜色画布 × 擦除遮罩 × 露脸区 × 淡出。
   遮罩剩得很少时直接当没有（避免永远擦不掉的一层薄膜）；刮到一半的地方颜色变浅、变薄，像被抹开。 */
import * as THREE from 'three';
import { ZONE_GLSL } from './stage.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform sampler2D uMask;
uniform float uOpacity;
uniform float uFade;
uniform float uFlash;
uniform float uSmear;
${ZONE_GLSL}
void main() {
  vec4 c = texture2D(uMap, vUv);
  float m = texture2D(uMask, vUv).a;
  float keep = smoothstep(0.045, 0.15, m) * (0.25 + 0.75 * m);
  float a = c.a * keep * uOpacity * uFade * zoneMask(gl_FragCoord.xy);
  if (a < 0.003) discard;
  /* 抹开的地方：变浅、略灰，像薄薄一层被拖开的污渍 */
  vec3 col = mix(c.rgb, c.rgb * 0.82 + vec3(0.13), (1.0 - m) * uSmear);
  col += vec3(0.95, 0.98, 1.0) * uFlash * 0.22;
  gl_FragColor = vec4(min(col, vec3(1.0)), a);
}
`;

export function createStainMaterial(stage, mapTex, maskTex, opts = {}) {
  const s = stage.shared;
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: mapTex },
      uMask: { value: maskTex },
      uOpacity: { value: opts.opacity ?? 1 },
      uFade: { value: 1 },
      uFlash: { value: 0 },
      uSmear: { value: opts.smear ?? 0.6 },
      uZoneTex: s.uZoneTex,
      uZoneP: s.uZoneP
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
}
