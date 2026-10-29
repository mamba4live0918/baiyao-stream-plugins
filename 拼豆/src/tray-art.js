import * as THREE from 'three';

// Static views of real open-box geometry keep the colour tray inexpensive to
// display. The board and finished piece continue to use live WebGL scenes.
export function buildTrayArtwork(palette) {
  const output = new Map();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(240, 238, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x85909d, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(-5, 8, 7);
    scene.add(key);
    const camera = new THREE.OrthographicCamera(-3.45, 3.45, 3.6, -3.25, 0.1, 50);
    camera.position.set(0.7, 8.2, 6.5);
    camera.lookAt(0, 0, 0);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xe4eef2, roughness: 0.2, metalness: 0.02, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const rim = new THREE.MeshStandardMaterial({ color: 0xf5fbfd, roughness: 0.31, transparent: true, opacity: 0.84 });
    const floor = new THREE.MeshStandardMaterial({ color: 0xe0e9e9, roughness: 0.54, transparent: true, opacity: 0.63 });
    const box = (w, h, d, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };
    box(5.6, 0.12, 4.8, 0, -0.12, 0, floor);
    box(5.6, 0.9, 0.09, 0, 0.38, -2.35, glass);
    box(5.6, 0.9, 0.09, 0, 0.38, 2.35, glass);
    box(0.09, 0.9, 4.7, -2.75, 0.38, 0, glass);
    box(0.09, 0.9, 4.7, 2.75, 0.38, 0, glass);
    for (const z of [-2.37, 2.37]) box(5.67, 0.075, 0.12, 0, 0.86, z, rim);
    for (const x of [-2.78, 2.78]) box(0.12, 0.075, 4.72, x, 0.86, 0, rim);
    const ring = new THREE.LatheGeometry([
      new THREE.Vector2(0.135, -0.19), new THREE.Vector2(0.295, -0.19),
      new THREE.Vector2(0.325, -0.15), new THREE.Vector2(0.325, 0.15),
      new THREE.Vector2(0.295, 0.19), new THREE.Vector2(0.135, 0.19),
      new THREE.Vector2(0.135, -0.19),
    ], 18);
    const material = new THREE.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.18 });
    const beans = new THREE.InstancedMesh(ring, material, 65);
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let row = 0; row < 7; row++) for (let col = 0; col < 8; col++) {
      const seed = index * 2.399963;
      dummy.position.set(-2.25 + col * 0.64 + Math.sin(seed) * 0.09, 0.21 + (index % 5 === 0 ? 0.035 : 0), -1.9 + row * 0.62 + Math.cos(seed) * 0.055);
      dummy.rotation.set(Math.sin(seed) * 0.25, seed, Math.cos(seed) * 0.2);
      dummy.updateMatrix(); beans.setMatrixAt(index++, dummy.matrix);
    }
    for (let i = 0; i < 9; i++) {
      dummy.position.set(-1.8 + (i % 4) * 1.1, 0.58, -1.4 + Math.floor(i / 4) * 1.25);
      dummy.rotation.set(0.65 + i * 0.12, i * 1.7, 0.45);
      dummy.updateMatrix(); beans.setMatrixAt(index++, dummy.matrix);
    }
    beans.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
    const empty = renderer.domElement.toDataURL('image/png');
    scene.add(beans);
    for (const color of palette) {
      material.color.set(color.hex);
      renderer.render(scene, camera);
      output.set(color.hex, { empty, full: renderer.domElement.toDataURL('image/png') });
    }
    scene.traverse(object => { if (object.isMesh && object.geometry !== ring) object.geometry.dispose(); });
    ring.dispose(); glass.dispose(); rim.dispose(); floor.dispose(); material.dispose();
  } catch (error) {
    console.warn('装豆盒使用轻量显示', error.message);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return output;
}
