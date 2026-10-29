// Sun (shadow-casting key light + HDR disc), earthshine fill and a reflection map.
import {
  AdditiveBlending,
  BackSide,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { BILLBOARD_VS } from './shared.js';

const SUN_FS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float core = smoothstep(0.07, 0.0, r) * 40.0;
    float glow = exp(-r * 6.0) * 3.5;
    float streak = exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 2.2) * 2.5;
    vec3 color = vec3(1.0, 0.92, 0.8) * (core + glow) + vec3(0.55, 0.75, 1.0) * streak;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const ENV_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ENV_FS = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 space = vec3(0.004, 0.006, 0.012);
    vec3 earth = vec3(0.05, 0.11, 0.22);
    vec3 color = mix(earth, space, smoothstep(-0.35, 0.1, d.y));
    color += vec3(1.0, 0.92, 0.8) * pow(max(dot(d, normalize(uSunDir)), 0.0), 900.0) * 60.0;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createLighting(renderer, scene, sunDirection) {
  const sun = new DirectionalLight(0xfff2e0, 3.4);
  sun.position.copy(sunDirection).multiplyScalar(60);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -22;
  cam.right = 22;
  cam.top = 22;
  cam.bottom = -22;
  cam.near = 20;
  cam.far = 110;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Space above, blue earthshine from below.
  scene.add(new HemisphereLight(0x1b2a44, 0x3a6bb0, 0.5));

  const envScene = new Scene();
  envScene.add(
    new Mesh(
      new SphereGeometry(10, 64, 32),
      new ShaderMaterial({
        uniforms: { uSunDir: { value: sunDirection.clone() } },
        vertexShader: ENV_VS,
        fragmentShader: ENV_FS,
        side: BackSide,
      }),
    ),
  );
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();

  const disc = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: { uScale: { value: 700 } },
      vertexShader: BILLBOARD_VS,
      fragmentShader: SUN_FS,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  disc.position.copy(sunDirection).multiplyScalar(3200);
  disc.frustumCulled = false;
  disc.name = 'sun-disc';
  scene.add(disc);

  return { sun };
}
