import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFinishedGeometry, exportFinishedGlb, IRON_STYLES } from '../src/finished-viewer.js';

function piece(style, cells = ['#e34572']) {
  return createFinishedGeometry({ cells, size: Math.sqrt(cells.length), style });
}

function rayHits(geometry, x, fromBelow = false, z = 0) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, fromBelow ? -2 : 2, z),
    new THREE.Vector3(0, fromBelow ? 1 : -1, 0),
  );
  return ray.intersectObject(mesh).length > 0;
}

test('all three ironing styles remain genuine double-sided 3D shapes with open center holes', () => {
  for (const style of ['light', 'standard', 'fusion']) {
    const geometry = piece(style);
    try {
      assert.equal(rayHits(geometry, 0), false, `${style} top hole is closed`);
      assert.equal(rayHits(geometry, 0, true), false, `${style} bottom hole is closed`);
      assert.equal(rayHits(geometry, 0.27), true, `${style} has no solid top surface`);
      assert.equal(rayHits(geometry, 0.27, true), true, `${style} has no solid bottom surface`);
      geometry.computeBoundingBox();
      assert.ok(geometry.boundingBox.max.y - geometry.boundingBox.min.y > 0.2);
    } finally {
      geometry.dispose();
    }
  }
});

test('longer ironing makes the piece flatter and shrinks, but does not seal, the holes', () => {
  const geometries = ['light', 'standard', 'fusion'].map(style => piece(style));
  try {
    const heights = geometries.map(geometry => {
      geometry.computeBoundingBox();
      return geometry.boundingBox.max.y - geometry.boundingBox.min.y;
    });
    assert.ok(heights[0] > heights[1] && heights[1] > heights[2], `unexpected heights ${heights}`);
    assert.equal(rayHits(geometries[0], 0.1), false);
    assert.equal(rayHits(geometries[1], 0.1), false);
    assert.equal(rayHits(geometries[2], 0.1), true);
  } finally {
    geometries.forEach(geometry => geometry.dispose());
  }
});

test('transparent cells stay empty and the mesh retains the selected bead colors', () => {
  const geometry = piece('standard', ['#ff0000', null, null, '#0000ff']);
  try {
    assert.equal(rayHits(geometry, -0.27, false, -0.5), true);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const emptyRay = new THREE.Raycaster(new THREE.Vector3(0.5, 2, -0.5), new THREE.Vector3(0, -1, 0));
    assert.equal(emptyRay.intersectObject(mesh).length, 0);
    const color = geometry.getAttribute('color');
    assert.ok(color && color.count > 0);
    let red = false;
    let blue = false;
    for (let i = 0; i < color.count; i++) {
      red ||= color.getX(i) > 0.9 && color.getZ(i) < 0.1;
      blue ||= color.getZ(i) > 0.9 && color.getX(i) < 0.1;
    }
    assert.ok(red && blue);
  } finally {
    geometry.dispose();
  }
});

test('the finished mesh exports a binary glTF file', async () => {
  // Three's browser exporter uses FileReader for the final in-memory Blob.
  const originalFileReader = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => {
        this.result = result;
        this.onloadend?.();
      });
    }
  };
  const geometry = piece('light');
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
  try {
    const blob = await exportFinishedGlb(mesh);
    assert.equal(blob.type, 'model/gltf-binary');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'glTF');
    assert.ok(bytes.length > 1000);
  } finally {
    globalThis.FileReader = originalFileReader;
    geometry.dispose();
    mesh.material.dispose();
  }
});

test('a 48 by 48 finished piece remains one bounded mesh', () => {
  const geometry = createFinishedGeometry({ size: 48, cells: Array(48 * 48).fill('#e34572'), style: 'fusion' });
  try {
    assert.ok(geometry.getAttribute('position').count < 500_000);
    assert.ok(geometry.index.count > 0);
  } finally {
    geometry.dispose();
  }
});

test('the five requested finishes include a closed front and open back for single-sided melting', () => {
  assert.deepEqual(IRON_STYLES.map(style=>style.id),['matte','crinkle','soft','double','flat']);
  const open=piece('double'),flat=piece('flat');
  assert.equal(rayHits(open,0),false);
  assert.equal(rayHits(flat,0),true);
  const mesh=new THREE.Mesh(flat,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const hits=new THREE.Raycaster(new THREE.Vector3(0,-2,0),new THREE.Vector3(0,1,0)).intersectObject(mesh);
  assert.ok(hits.length && hits[0].point.y > 0, 'the underside center must remain a recess, with the seal on the front');
  open.dispose();flat.dispose();mesh.material.dispose();
});

test('crumpled-paper relief is repeatable for a saved seed and different for another piece', () => {
  const make=seed=>createFinishedGeometry({cells:['#ef4b5a'],size:1,style:'crinkle',seed});
  const a=make(123),b=make(123),c=make(456);
  assert.deepEqual([...a.attributes.position.array],[...b.attributes.position.array]);
  assert.notDeepEqual([...a.attributes.position.array],[...c.attributes.position.array]);
  [a,b,c].forEach(g=>g.dispose());
});

test('finish quality: standard keeps the old mesh, higher tiers add detail within a vertex budget', async () => {
  const { finishDetail, surfaceField } = await import('../src/finished-viewer.js');
  const cells = Array(46 * 46).fill(null).map((_, i) => (i % 3 ? '#e34572' : null));
  const counts = {};
  for (const quality of ['standard', 'high', 'ultra']) {
    const g = createFinishedGeometry({ cells, size: 46, style: 'double', quality });
    counts[quality] = g.attributes.position.count;
    assert.equal(g.userData.quality, quality);
    g.dispose();
  }
  assert.equal(counts.standard, cells.filter(Boolean).length * 7 * 16, 'standard keeps 16 segments on a large board');
  assert.ok(counts.high > counts.standard && counts.ultra > counts.high, JSON.stringify(counts));
  const full = createFinishedGeometry({ size: 48, cells: Array(48 * 48).fill('#e34572'), style: 'matte', quality: 'ultra' });
  assert.ok(full.attributes.position.count < 1_000_000);
  full.dispose();
  assert.equal(createFinishedGeometry({ cells: ['#e34572'], size: 1, style: 'double', quality: 'nonsense' }).userData.quality, 'high');
  const d = finishDetail('ultra', 46, 1304);
  assert.ok(d.texSide > finishDetail('high', 46, 1304).texSide && d.texSide <= 4096);
  // 贴图高度场的颗粒按世界坐标定义：两种分辨率在同一点的起伏接近。
  const low = surfaceField('matte', 3, 8, 256), high = surfaceField('matte', 3, 8, 1024);
  let worst = 0;
  for (let y = 0; y < 256; y += 17) for (let x = 0; x < 256; x += 13) worst = Math.max(worst, Math.abs(low[y * 256 + x] - high[(y * 4 + 2) * 1024 + x * 4 + 2]));
  assert.ok(worst < 0.004, `grain should not depend on resolution, diff ${worst}`);
});

test('worker-ready finished data matches the direct mesh and carries transferable surface maps', async () => {
  const { buildFinishedData, transferablesOf, surfaceMapData } = await import('../src/finished-viewer.js');
  const cells = Array(8 * 8).fill(null).map((_, i) => (i % 5 ? '#e34572' : '#2d6cdf'));
  for (const style of ['double', 'matte', 'flat']) {
    const direct = createFinishedGeometry({ cells, size: 8, style, seed: 9, quality: 'high' });
    const data = buildFinishedData({ cells, size: 8, style, seed: 9, quality: 'high' });
    assert.deepEqual([...data.geometry.position], [...direct.attributes.position.array]);
    assert.deepEqual([...data.geometry.normal], [...direct.attributes.normal.array]);
    assert.equal(data.geometry.index.length, direct.index.count);
    assert.equal(data.geometry.userData.quality, 'high');
    assert.equal(!!data.maps, style !== 'double');
    if (data.maps) assert.equal(data.maps.normal.length, data.maps.side ** 2 * 4);
    assert.equal(new Set(transferablesOf(data)).size, transferablesOf(data).length);
    direct.dispose();
  }
  // 行序预先上下翻转：第一行数据对应原高度场的最后一行。
  const maps = surfaceMapData('matte', 3, 4, 64), again = surfaceMapData('matte', 3, 4, 64);
  assert.deepEqual([...maps.normal.slice(0, 64)], [...again.normal.slice(0, 64)]);
  assert.equal(surfaceMapData('double', 3, 4, 64), null);
});
