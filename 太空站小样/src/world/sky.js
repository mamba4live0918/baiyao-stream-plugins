// Star map sphere (NASA SVS Deep Star Maps 2020, equirectangular).
import { Color, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';

export function createSky(texture) {
  const geometry = new SphereGeometry(4000, 64, 32);
  // Flip so the panorama reads correctly from inside the sphere.
  geometry.scale(-1, 1, 1);
  const material = new MeshBasicMaterial({
    map: texture,
    color: new Color(1.15, 1.15, 1.2),
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  // Tilt so the Milky Way arcs behind the station in the opening shot.
  mesh.rotation.set(0.42, 2.35, -0.38);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}
