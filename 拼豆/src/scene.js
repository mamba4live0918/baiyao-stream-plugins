import * as THREE from 'three';
import {colorByHex} from './patterns.js';

const PITCH = 1;

function beadGeometry() {
  const inner = 0.19;
  const outer = 0.36;
  const half = 0.21;
  return new THREE.LatheGeometry([
    new THREE.Vector2(inner, -half),
    new THREE.Vector2(outer - 0.025, -half),
    new THREE.Vector2(outer, -half + 0.04),
    new THREE.Vector2(outer, half - 0.04),
    new THREE.Vector2(outer - 0.025, half),
    new THREE.Vector2(inner, half),
    new THREE.Vector2(inner, -half),
  ], 24);
}

function labelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,.90)';
  ctx.beginPath();
  ctx.roundRect(12, 36, 104, 56, 20);
  ctx.fill();
  ctx.fillStyle = '#29324a';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPegScene({ container, size, pattern, palette, onCell }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    return createFallback({ container, size, pattern, palette, onCell, error });
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'three-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);
  const targetGroup = new THREE.Group();
  boardGroup.add(targetGroup);
  const beadGroup = new THREE.Group();
  scene.add(beadGroup);
  const ambient = new THREE.AmbientLight(0xffffff, 2.1);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-10, 20, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -35;
  key.shadow.camera.right = 35;
  key.shadow.camera.top = 35;
  key.shadow.camera.bottom = -35;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffceee, 0.85);
  fill.position.set(10, 8, -9);
  scene.add(fill);

  const boardMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd9f6ff, metalness: 0.0, roughness: 0.19, transmission: 0.64,
    thickness: 0.5, transparent: true, opacity: 0.77, side: THREE.DoubleSide,
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(size + 0.8, 0.24, size + 0.8), boardMaterial);
  base.position.y = -0.12;
  base.receiveShadow = true;
  boardGroup.add(base);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size + 0.85, 0.28, size + 0.85)),
    new THREE.LineBasicMaterial({ color: 0xb7ddea, transparent: true, opacity: 0.8 }),
  );
  edge.position.y = -0.12;
  boardGroup.add(edge);

  const peg = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xeafaff, roughness: 0.14, metalness: 0.02, transmission: 0.45, transparent: true, opacity: 0.9 }),
    size * size,
  );
  peg.castShadow = true;
  peg.receiveShadow = true;
  const helper = new THREE.Object3D();
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      helper.position.set((col - (size - 1) / 2) * PITCH, 0.25, (row - (size - 1) / 2) * PITCH);
      helper.updateMatrix();
      peg.setMatrixAt(row * size + col, helper.matrix);
    }
  }
  peg.instanceMatrix.needsUpdate = true;
  boardGroup.add(peg);

  const beadGeo = beadGeometry();
  const materialCache = new Map();
  const labels = new Map();
  const labelMaterials = new Map();
  const labelPlane = new THREE.PlaneGeometry(0.56, 0.56);
  const beads = new Map();
  const targetByIndex = Array(size * size).fill(null);
  const targetInstances = [];
  let hintVisible = true;
  let hover = null;
  let shakeUntil = 0;
  let zoom = 1;

  const hoverRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.037, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x448ddc, transparent: true, opacity: 0.95 }),
  );
  hoverRing.rotation.x = Math.PI / 2;
  hoverRing.position.y = 0.67;
  hoverRing.visible = false;
  scene.add(hoverRing);

  function hexMaterial(hex, ghost = false) {
    const key = `${hex}:${ghost}`;
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(hex), roughness: ghost ? 0.4 : 0.22, metalness: 0.02,
        clearcoat: 0.82, clearcoatRoughness: 0.15, transparent: ghost,
        opacity: ghost ? 0.34 : 1, depthWrite: !ghost,
      }));
    }
    return materialCache.get(key);
  }

  function showPattern(nextPattern) {
    for (const mesh of targetInstances) {
      targetGroup.remove(mesh);
      mesh.dispose();
    }
    targetInstances.length = 0;
    targetByIndex.fill(null);
    const grouped = new Map();
    for (let index = 0; index < nextPattern.cells.length; index++) {
      const color = nextPattern.cells[index];
      if (!color) continue;
      const key = color.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(index);
    }
    const helper = new THREE.Object3D();
    const labelHelper = new THREE.Object3D();
    for (const [color, indices] of grouped) {
      const code = palette.find(item => item.hex.toLowerCase() === color)?.code ?? '?';
      if (!labels.has(code)) labels.set(code, labelTexture(code));
      if (!labelMaterials.has(code)) labelMaterials.set(code, new THREE.MeshBasicMaterial({
        map: labels.get(code), transparent: true, depthTest: false,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      const mesh = new THREE.InstancedMesh(beadGeo, hexMaterial(color, true), indices.length);
      const labelMesh = new THREE.InstancedMesh(labelPlane, labelMaterials.get(code), indices.length);
      mesh.frustumCulled = false;
      labelMesh.frustumCulled = false;
      labelMesh.renderOrder = 2;
      for (let local = 0; local < indices.length; local++) {
        const index = indices[local];
        const row = Math.floor(index / size);
        const col = index % size;
        const x = (col - (size - 1) / 2) * PITCH;
        const z = (row - (size - 1) / 2) * PITCH;
        helper.position.set(x, 0.21, z);
        helper.updateMatrix();
        const beadMatrix = helper.matrix.clone();
        mesh.setMatrixAt(local, beadMatrix);
        labelHelper.position.set(x, 0.69, z);
        labelHelper.quaternion.copy(camera.quaternion);
        labelHelper.updateMatrix();
        const labelMatrix = labelHelper.matrix.clone();
        labelMesh.setMatrixAt(local, labelMatrix);
        targetByIndex[index] = { mesh, labelMesh, local, beadMatrix, labelMatrix, visible: true };
      }
      mesh.instanceMatrix.needsUpdate = true;
      labelMesh.instanceMatrix.needsUpdate = true;
      targetGroup.add(mesh, labelMesh);
      targetInstances.push(mesh, labelMesh);
    }
    setHintVisible(hintVisible);
  }

  function setHintVisible(visible) {
    hintVisible = !!visible;
    targetGroup.visible = hintVisible;
  }

  function addBead(bead) {
    if (beads.has(bead.id)) return;
    const mesh = new THREE.Mesh(beadGeo, hexMaterial(bead.color));
    mesh.position.set((bead.col - (size - 1) / 2) * PITCH, 0.21, (bead.row - (size - 1) / 2) * PITCH);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    beadGroup.add(mesh);
    beads.set(bead.id, mesh);
    updateTarget(bead.row, bead.col, false);
  }

  function removeBead(id, row, col) {
    const mesh = beads.get(id);
    if (mesh) {
      mesh.parent?.remove(mesh);
      beads.delete(id);
    }
    if (row != null && col != null) updateTarget(row, col, true);
  }

  function updateTarget(row, col, visible) {
    const target = targetByIndex[row * size + col];
    if (!target || target.visible === visible) return;
    target.visible = visible;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    target.mesh.setMatrixAt(target.local, visible ? target.beadMatrix : hidden);
    target.labelMesh.setMatrixAt(target.local, visible ? target.labelMatrix : hidden);
    target.mesh.instanceMatrix.needsUpdate = true;
    target.labelMesh.instanceMatrix.needsUpdate = true;
  }

  function updateBeadColor(bead) {
    const mesh = beads.get(bead.id);
    if (mesh) mesh.material = hexMaterial(bead.color);
  }

  function updatePoses(poses) {
    for (const pose of poses) {
      const mesh = beads.get(pose.id);
      if (!mesh) continue;
      const wantedParent = pose.state === 'seated' ? boardGroup : beadGroup;
      if (mesh.parent !== wantedParent) wantedParent.attach(mesh);
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
    }
  }

  function setHover(cell) {
    hover = cell;
    hoverRing.visible = !!cell;
    if (cell) hoverRing.position.set((cell.col - (size - 1) / 2), 0.68, (cell.row - (size - 1) / 2));
  }

  function setZoom(value) { zoom = Math.max(0.65, Math.min(2.6, value)); resize(); }
  function getZoom() { return zoom; }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const span = size * (aspect < 1 ? 1.75 : 1.43) / zoom;
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.position.set(size * 0.75, size * 1.25, size * 0.98);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.42);
  const pointer = new THREE.Vector2();
  const crossing = new THREE.Vector3();
  function cellFromClient(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const pegHits = raycaster.intersectObject(peg, false);
    if (pegHits.length && Number.isInteger(pegHits[0].instanceId)) {
      const index = pegHits[0].instanceId;
      return { row: Math.floor(index / size), col: index % size };
    }
    if (!raycaster.ray.intersectPlane(plane, crossing)) return null;
    const col = Math.round(crossing.x + (size - 1) / 2);
    const row = Math.round(crossing.z + (size - 1) / 2);
    return row >= 0 && col >= 0 && row < size && col < size ? { row, col } : null;
  }

  function shakeVisual() { shakeUntil = performance.now() + 620; }

  function render() {
    const remaining = shakeUntil - performance.now();
    if (remaining > 0) {
      const strength = remaining / 620;
      boardGroup.rotation.z = Math.sin(performance.now() * 0.07) * 0.045 * strength;
      boardGroup.rotation.x = Math.cos(performance.now() * 0.09) * 0.037 * strength;
    } else {
      boardGroup.rotation.set(0, 0, 0);
    }
    renderer.render(scene, camera);
  }

  function clearBeads() {
    for (const mesh of beads.values()) mesh.parent?.remove(mesh);
    beads.clear();
    for (let index = 0; index < targetByIndex.length; index++) {
      if (targetByIndex[index]) updateTarget(Math.floor(index / size), index % size, true);
    }
  }

  function destroy() {
    resizeObserver.disconnect();
    clearBeads();
    for (const mesh of targetInstances) mesh.dispose();
    for (const texture of labels.values()) texture.dispose();
    for (const material of labelMaterials.values()) material.dispose();
    for (const material of materialCache.values()) material.dispose();
    labelPlane.dispose();
    beadGeo.dispose();
    hoverRing.geometry.dispose();
    hoverRing.material.dispose();
    base.geometry.dispose();
    boardMaterial.dispose();
    edge.geometry.dispose();
    edge.material.dispose();
    peg.geometry.dispose();
    peg.material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  renderer.domElement.addEventListener('pointermove', event => setHover(cellFromClient(event.clientX, event.clientY)));
  renderer.domElement.addEventListener('pointerleave', () => setHover(null));
  renderer.domElement.addEventListener('click', event => onCell?.(cellFromClient(event.clientX, event.clientY), event));
  renderer.domElement.addEventListener('wheel', event => {
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.12 : -0.12));
  }, { passive: false });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  showPattern(pattern);
  return { isFallback: false, element: renderer.domElement, showPattern, addBead, removeBead, updateBeadColor, updatePoses, setHintVisible, setTargetVisibility: updateTarget, setHover, cellFromClient, setZoom, getZoom, shakeVisual, render, clearBeads, destroy };
}

function createFallback({ container, size, pattern, palette, onCell, error }) {
  const grid = document.createElement('div');
  grid.className = 'fallback-grid';
  grid.style.gridTemplateColumns = `repeat(${size},1fr)`;
  grid.setAttribute('aria-label', '2D 拼豆盘降级显示');
  container.appendChild(grid);
  const cells = [];
  for (let index = 0; index < size * size; index++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fallback-cell';
    const row = Math.floor(index / size);
    const col = index % size;
    button.addEventListener('click', event => onCell?.({ row, col }, event));
    grid.appendChild(button);
    cells.push(button);
  }
  let current = pattern;
  let visible = true;
  function draw() {
    for (let i = 0; i < cells.length; i++) {
      const color = current.cells[i];
      const code = colorByHex(color)?.code ?? '';
      if (!cells[i].dataset.placed) {
        cells[i].style.backgroundColor = color && visible ? `${color}55` : 'rgba(255,255,255,.18)';
        cells[i].textContent = color && visible ? code : '';
      }
    }
  }
  draw();
  return {
    isFallback: true, error,
    setErrors(errors){const byIndex=new Map(errors.map(b=>[b.row*size+b.col,b.type]));cells.forEach((cell,index)=>{const type=byIndex.get(index);cell.classList.toggle('bead-error',!!type);cell.classList.toggle('bead-extra',type==='extra');cell.title=type==='extra'?'多余豆，空手点击取走':type?'错色豆，空手点击取走':'';});},
    showPattern(value) { current = value; draw(); },
    addBead(bead) { const cell = cells[bead.row * size + bead.col]; cell.dataset.placed = bead.id; cell.style.backgroundColor = bead.color; cell.textContent = ''; },
    removeBead(id, row, col) {
      const index = Number.isInteger(row) && Number.isInteger(col)
        ? row * size + col
        : cells.findIndex(cell => cell.dataset.placed === id);
      const cell = cells[index];
      if (!cell) return;
      delete cell.dataset.placed;
      draw();
    },
    updateBeadColor(bead) { cells[bead.row * size + bead.col].style.backgroundColor = bead.color; },
    setTargetVisibility() {},
    updatePoses() {}, setHintVisible(value) { visible = value; draw(); },
    setZoom() {}, getZoom() { return 1; }, shakeVisual() {}, render() {}, clearBeads() { for (const cell of cells) delete cell.dataset.placed; draw(); },
    destroy() { grid.remove(); },
  };
}
