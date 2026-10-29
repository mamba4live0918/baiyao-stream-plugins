import test from 'node:test';
import assert from 'node:assert/strict';

const galleryModule = await import('../src/gallery.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const { createGalleryStore } = galleryModule;

function fakeIndexedDB() {
  const records = new Map();
  const fake = { failNextPut: false, seed: record => records.set(record.id, structuredClone(record)) };
  let hasStore = false;
  const db = {
    objectStoreNames: { contains: name => name === 'finished' && hasStore },
    createObjectStore(name) {
      if (name !== 'finished') throw Error('wrong store');
      hasStore = true;
    },
    close() {},
    transaction(name) {
      if (name !== 'finished' || !hasStore) throw Error('missing store');
      let pending = 0;
      let aborted = false;
      const transaction = {
        oncomplete: null, onabort: null, onerror: null, error: null,
        abort() { aborted = true; queueMicrotask(() => transaction.onabort?.()); },
        objectStore() {
          function request(work) {
            const req = { result: undefined, error: null, onsuccess: null, onerror: null };
            pending++;
            queueMicrotask(() => {
              if (aborted) return;
              try {
                req.result = work();
                req.onsuccess?.();
              } catch (error) {
                req.error = error;
                transaction.error = error;
                req.onerror?.();
                aborted = true;
                queueMicrotask(() => transaction.onabort?.());
              }
              pending--;
              if (!aborted && pending === 0) queueMicrotask(() => {
                if (!aborted && pending === 0) transaction.oncomplete?.();
              });
            });
            return req;
          }
          return {
            count: () => request(() => records.size),
            get: id => request(() => structuredClone(records.get(id))),
            getAll: () => request(() => structuredClone([...records.values()])),
            put: record => request(() => {
              if (fake.failNextPut) {
                fake.failNextPut = false;
                throw Error('quota full');
              }
              records.set(record.id, structuredClone(record));
              return record.id;
            }),
            delete: id => request(() => records.delete(id))
          };
        }
      };
      return transaction;
    }
  };
  fake.open = () => {
    const req = { result: undefined, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      req.result = db;
      if (!hasStore) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  };
  return fake;
}

function finished(id, createdAt = 1000) {
  return {
    id, name: `作品 ${id}`, size: 16, style: 'classic',
    pngDataUrl: 'data:image/png;base64,iVBORw0KGgo=', createdAt,
    cells: Array.from({ length: 16 * 16 }, (_, index) => index === 0 ? '#ff0000' : null),
  };
}

test('saves, lists newest first, and removes finished pieces', async () => {
  assert.equal(typeof createGalleryStore, 'function');
  const gallery = createGalleryStore({ indexedDB: fakeIndexedDB() });
  await gallery.save(finished('older', 1000));
  await gallery.save(finished('newer', 2000));
  const pieces = await gallery.list();
  assert.deepEqual(pieces.map(piece => piece.id), ['newer', 'older']);
  assert.equal(pieces[0].has3DData, true);
  assert.deepEqual(pieces[0].cells, finished('newer', 2000).cells);
  await gallery.remove('older');
  assert.deepEqual((await gallery.list()).map(piece => piece.id), ['newer']);
});

test('saved textured finishes retain the exact texture seed', async () => {
  const gallery=createGalleryStore({indexedDB:fakeIndexedDB()});
  await gallery.save({...finished('textured'),style:'crinkle',textureSeed:381709});
  assert.equal((await gallery.list())[0].textureSeed,381709);
});

test('keeps at most fifty pieces and lets an existing piece be updated', async () => {
  const gallery = createGalleryStore({ indexedDB: fakeIndexedDB() });
  for (let i = 0; i < 50; i++) await gallery.save(finished(`piece-${i}`, i));
  await assert.rejects(gallery.save(finished('piece-50')), /50/);
  await gallery.save({ ...finished('piece-0'), name: '更新后' });
  const pieces = await gallery.list();
  assert.equal(pieces.length, 50);
  assert.equal(pieces.find(piece => piece.id === 'piece-0').name, '更新后');
});

test('reports storage unavailability and failed writes instead of losing pieces silently', async () => {
  const unavailable = createGalleryStore({ indexedDB: null });
  await assert.rejects(unavailable.save(finished('one')), /存储|IndexedDB/i);
  const fake = fakeIndexedDB();
  const gallery = createGalleryStore({ indexedDB: fake });
  await gallery.save(finished('safe'));
  fake.failNextPut = true;
  await assert.rejects(gallery.save(finished('failed')), /quota full|空间|保存失败/i);
  assert.deepEqual((await gallery.list()).map(piece => piece.id), ['safe']);
});

test('rejects incomplete or non-PNG finished pieces before writing', async () => {
  const gallery = createGalleryStore({ indexedDB: fakeIndexedDB() });
  await assert.rejects(gallery.save({ ...finished('wrong'), pngDataUrl: 'javascript:alert(1)' }), /PNG|图片/i);
  await assert.rejects(gallery.save({ ...finished('wrong'), size: 0 }), /尺寸|大小/i);
  assert.deepEqual(await gallery.list(), []);
});

test('rejects incorrect 3D grid length and non-hex colors before saving', async () => {
  const gallery = createGalleryStore({ indexedDB: fakeIndexedDB() });
  await assert.rejects(gallery.save({ ...finished('short'), cells: [null] }), /豆色|网格|尺寸|3D/i);
  const wrongColor = finished('wrong-color');
  wrongColor.cells[4] = 'red';
  await assert.rejects(gallery.save(wrongColor), /豆色|色值|3D/i);
  const sparse = finished('sparse');
  delete sparse.cells[4];
  await assert.rejects(gallery.save(sparse), /豆色|网格|3D/i);
  assert.deepEqual(await gallery.list(), []);
});

test('lists a legacy PNG-only piece as viewable but without rebuildable 3D data', async () => {
  const fake = fakeIndexedDB();
  const legacy = finished('legacy');
  delete legacy.cells;
  fake.seed(legacy);
  const gallery = createGalleryStore({ indexedDB: fake });
  const pieces = await gallery.list();
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].pngDataUrl, legacy.pngDataUrl);
  assert.equal(pieces[0].has3DData, false);
  assert.equal(pieces[0].cells, null);
});
