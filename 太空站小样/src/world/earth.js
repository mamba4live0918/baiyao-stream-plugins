// Earth with day/night maps, drifting clouds, ocean glint and an atmosphere rim.
import { AdditiveBlending, BackSide, Group, Mesh, RepeatWrapping, ShaderMaterial, SphereGeometry } from 'three';

const SURFACE_VS = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SURFACE_FS = /* glsl */ `
  uniform sampler2D tDay;
  uniform sampler2D tNight;
  uniform sampler2D tClouds;
  uniform vec3 uSunDir;
  uniform float uCloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(cameraPosition - vPosW);
    float ndl = dot(N, L);

    vec3 day = texture2D(tDay, vUv).rgb;
    vec3 night = texture2D(tNight, vUv).rgb;
    float cloud = texture2D(tClouds, vUv + vec2(uCloudShift, 0.0)).r;

    float dayMix = smoothstep(-0.12, 0.22, ndl);
    vec3 lit = mix(day, vec3(0.92), cloud * 0.85) * max(ndl, 0.0) * 1.7;

    // Oceans are dark and blue-dominant in the day map: give them a sun glint.
    float ocean = smoothstep(0.03, 0.0, day.r) * smoothstep(0.0, 0.02, day.b - day.r);
    vec3 H = normalize(L + V);
    float glint = pow(max(dot(N, H), 0.0), 140.0) * ocean * (1.0 - cloud) * 4.0;

    vec3 cities = night * vec3(1.0, 0.72, 0.42) * 1.8 * (1.0 - cloud * 0.8);
    vec3 color = mix(cities, lit + glint * vec3(1.0, 0.9, 0.75), dayMix);

    float fresnel = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);
    float rimLit = smoothstep(-0.15, 0.4, ndl);
    vec3 rimColor = mix(vec3(1.0, 0.45, 0.2), vec3(0.3, 0.6, 1.0), smoothstep(-0.12, 0.12, ndl));
    color += fresnel * rimColor * rimLit * 0.7;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const ATMOSPHERE_VS = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Rendered on the back faces of a slightly larger sphere: strongest right at the
// planet's limb and fading to nothing at the shell's own silhouette.
const ATMOSPHERE_FS = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uLimb;
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  void main() {
    float limb = smoothstep(0.0, uLimb, -vNormalV.z);
    float intensity = pow(limb, 1.6) * (1.0 - smoothstep(uLimb, uLimb * 1.6, -vNormalV.z));
    float ndl = dot(normalize(vNormalW), normalize(uSunDir));
    float sunlit = smoothstep(-0.2, 0.25, ndl);
    vec3 color = mix(vec3(1.0, 0.42, 0.15), vec3(0.32, 0.62, 1.0), smoothstep(-0.15, 0.1, ndl));
    gl_FragColor = vec4(color * intensity * sunlit * 1.3, 1.0);
  }
`;

export function createEarth({ day, night, clouds, sunDirection, radius, center }) {
  const group = new Group();
  group.name = 'earth';
  group.position.set(center[0], center[1], center[2]);

  // The cloud layer drifts by offsetting u, so it must wrap around the globe.
  clouds.wrapS = RepeatWrapping;
  clouds.needsUpdate = true;

  const surfaceUniforms = {
    tDay: { value: day },
    tNight: { value: night },
    tClouds: { value: clouds },
    uSunDir: { value: sunDirection.clone() },
    uCloudShift: { value: 0 },
  };
  const surface = new Mesh(
    new SphereGeometry(radius, 160, 96),
    new ShaderMaterial({ uniforms: surfaceUniforms, vertexShader: SURFACE_VS, fragmentShader: SURFACE_FS }),
  );
  surface.rotation.z = 0.41; // axial tilt
  const baseSpin = 2.1; // puts daylight over ocean and cloud bands in the opening shot

  const shellScale = 1.035;
  const atmosphere = new Mesh(
    new SphereGeometry(radius * shellScale, 128, 64),
    new ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDirection.clone() },
        uLimb: { value: Math.sqrt(1 - 1 / (shellScale * shellScale)) },
      },
      vertexShader: ATMOSPHERE_VS,
      fragmentShader: ATMOSPHERE_FS,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );

  group.add(surface, atmosphere);

  return {
    group,
    update(time) {
      surface.rotation.y = baseSpin + time * 0.004;
      surfaceUniforms.uCloudShift.value = time * 0.0006;
    },
  };
}
