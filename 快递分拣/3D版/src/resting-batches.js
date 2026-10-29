// 实例化只合并绘制，物件身份和变换仍逐件保留；空间索引用于局部拾取/支撑检查。
export class RestingBatches {
  constructor(THREE, scene) { this.T = THREE; this.scene = scene; this.groups = new Map(); this.items = new Map(); this.cells = new Map(); this.matrix = new THREE.Matrix4(); this.maxDim = 0; }
  get size() { return this.items.size; }
  cell(p) { return [p.x, p.y, p.z].map(v => Math.floor(v / 2)).join(','); }
  createMesh(bucket, capacity) {
    const mesh = new this.T.InstancedMesh(bucket.geo, bucket.mat, capacity);
    mesh.count = bucket.refs.length; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    if (bucket.mesh) {
      for (let i = 0; i < bucket.refs.length; i++) { bucket.mesh.getMatrixAt(i, this.matrix); mesh.setMatrixAt(i, this.matrix); }
      this.scene.remove(bucket.mesh); bucket.mesh.dispose();
    }
    bucket.mesh = mesh; bucket.capacity = capacity; this.scene.add(mesh);
  }
  add(b) {
    if (this.items.has(b)) return;
    this.maxDim = Math.max(this.maxDim, ...(b.dims || [1]));
    b.mesh.updateMatrixWorld(true);
    const record = { parts: [], cell: this.cell(b.mesh.position) };
    b.mesh.traverse(m => {
      if (!m.isMesh) return;
      const key = m.geometry.uuid + '|' + [].concat(m.material).map(x => x.uuid).join(',');
      let bucket = this.groups.get(key);
      if (!bucket) { bucket = { key, geo: m.geometry, mat: m.material, refs: [], capacity: 0, mesh: null }; this.groups.set(key, bucket); }
      if (bucket.refs.length === bucket.capacity) this.createMesh(bucket, Math.max(64, bucket.capacity * 2));
      const ref = { bucket, index: bucket.refs.length };
      bucket.refs.push(ref); bucket.mesh.setMatrixAt(ref.index, m.matrixWorld); bucket.mesh.count = bucket.refs.length; bucket.mesh.instanceMatrix.needsUpdate = true; record.parts.push(ref);
    });
    this.items.set(b, record);
    if (!this.cells.has(record.cell)) this.cells.set(record.cell, new Set()); this.cells.get(record.cell).add(b);
    this.scene.remove(b.mesh);
  }
  remove(b) {
    const record = this.items.get(b); if (!record) return;
    for (const ref of record.parts) {
      const g = ref.bucket, last = g.refs.pop();
      if (last !== ref) { g.mesh.getMatrixAt(last.index, this.matrix); g.mesh.setMatrixAt(ref.index, this.matrix); last.index = ref.index; g.refs[ref.index] = last; }
      g.mesh.count = g.refs.length; g.mesh.instanceMatrix.needsUpdate = true;
      if (!g.refs.length) { this.scene.remove(g.mesh); g.mesh.dispose(); this.groups.delete(g.key); }
    }
    const cell = this.cells.get(record.cell); cell.delete(b); if (!cell.size) this.cells.delete(record.cell);
    this.items.delete(b);
    if (!this.items.size) this.maxDim = 0;
  }
  near(p, radius = 2) {
    const out = [];
    for (let x = Math.floor((p.x-radius)/2); x <= Math.floor((p.x+radius)/2); x++)
      for (let y = Math.floor((p.y-radius)/2); y <= Math.floor((p.y+radius)/2); y++)
        for (let z = Math.floor((p.z-radius)/2); z <= Math.floor((p.z+radius)/2); z++) {
          const cell = this.cells.get(`${x},${y},${z}`); if (cell) for (const b of cell) if (Math.abs(b.mesh.position.x-p.x)<=radius && Math.abs(b.mesh.position.y-p.y)<=radius && Math.abs(b.mesh.position.z-p.z)<=radius) out.push(b);
        }
    return out;
  }
}
