import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../_deps/three.module.js';
import { RestingBatches } from '../src/resting-batches.js';

test('12000 independent items share draw batches and keep identity when removed', () => {
  const scene = new THREE.Scene(), pool = new RestingBatches(THREE, scene), geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial();
  const items = [];
  for (let i = 0; i < 12000; i++) {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(i % 100, Math.floor(i / 100), 0); scene.add(mesh);
    const b = { id: i, mesh }; items.push(b); pool.add(b);
  }
  assert.equal(pool.size, 12000); assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0].count, 12000);
  assert.ok(pool.near({ x: 10, y: 10, z: 0 }, 1).some(b => b.id === 1010));
  assert.ok(pool.near({ x: 10, y: 10, z: 0 }, 1).length < 100);
  pool.remove(items[42]); pool.remove(items[11999]);
  assert.equal(pool.size, 11998); assert.equal(scene.children[0].count, 11998);
  assert.ok(!pool.near(items[42].mesh.position, .1).includes(items[42]));
  for (const b of items) pool.remove(b);
  assert.equal(pool.size, 0); assert.equal(scene.children.length, 0);
});
