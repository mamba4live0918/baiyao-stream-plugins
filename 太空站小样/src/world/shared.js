// Shader snippets and helpers shared by world objects.
import { Vector3 } from 'three';

// Camera-facing quad: PlaneGeometry(1, 1) scaled by uScale around the object origin.
// Works for any camera because the basis is read from viewMatrix per draw.
export const BILLBOARD_VS = /* glsl */ `
  uniform float uScale;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = center + (right * position.x + up * position.y) * uScale;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

export const HASH_GLSL = /* glsl */ `
  float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

export const vec3From = (arr) => new Vector3(arr[0], arr[1], arr[2]);
