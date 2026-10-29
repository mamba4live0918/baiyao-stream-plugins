const DB_NAME = 'peg-bead-finished-gallery';
const STORE_NAME = 'finished';
const MAX_FINISHED = 50;

function storageError(action, cause) {
  const detail = cause?.message || cause?.name || '浏览器存储不可用';
  return new Error(`成品库${action}失败：${detail}`);
}

function validCells(cells, size) {
  if (!Number.isSafeInteger(size) || size < 1 || !Array.isArray(cells) || cells.length !== size * size) return false;
  for (let index = 0; index < cells.length; index++) {
    if (!Object.hasOwn(cells, index)) return false;
    const color = cells[index];
    if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) return false;
  }
  return true;
}

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('成品数据不完整。');
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const style = typeof record.style === 'string' ? record.style.trim() : '';
  if (!id || id.length > 128 || !name || name.length > 128 || !style || style.length > 64) {
    throw new Error('成品编号、名称或烫制样式无效。');
  }
  if (!Number.isSafeInteger(record.size) || record.size < 1) throw new Error('成品尺寸无效。');
  if (!validCells(record.cells, record.size)) throw new Error('成品 3D 豆色网格无效，必须与画板尺寸一致且只含十六进制色值。');
  if (typeof record.pngDataUrl !== 'string' ||
      !/^data:image\/png;base64,[a-z0-9+/]+={0,2}$/i.test(record.pngDataUrl)) {
    throw new Error('成品图片必须是 PNG 图片。');
  }
  const createdAt = record.createdAt;
  const time = typeof createdAt === 'number' ? createdAt : typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(time) || time < 0) throw new Error('成品创建时间无效。');
  const textureSeed = record.textureSeed ?? 1;
  if (!Number.isSafeInteger(textureSeed) || textureSeed < 0 || textureSeed > 0xffffffff) throw new Error('成品纹理编号无效。');
  return { id, name, size: record.size, style, pngDataUrl: record.pngDataUrl, createdAt,
    textureSeed,
    cells: record.cells.map(color => color === null ? null : color.toLowerCase()) };
}

function dateNumber(value) {
  return typeof value === 'number' ? value : Date.parse(value);
}

export function createGalleryStore({ indexedDB = globalThis.indexedDB } = {}) {
  let dbPromise = null;

  function database() {
    if (!indexedDB || typeof indexedDB.open !== 'function') {
      return Promise.reject(new Error('IndexedDB 存储不可用，请检查浏览器存储权限。'));
    }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open(DB_NAME, 1); }
      catch (error) { reject(storageError('打开', error)); return; }
      let settled = false;
      function fail(error) {
        if (settled) return;
        settled = true;
        reject(storageError('打开', error));
      }
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        } catch (error) { fail(error); }
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('数据库被其他页面占用'));
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true;
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
    }).catch(error => {
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  }

  async function save(rawRecord) {
    const record = validateRecord(rawRecord);
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE_NAME, 'readwrite'); }
      catch (error) { reject(storageError('保存', error)); return; }
      let problem = null;
      let settled = false;
      const store = tx.objectStore(STORE_NAME);
      const countRequest = store.count();
      countRequest.onerror = () => { problem = storageError('保存', countRequest.error); };
      countRequest.onsuccess = () => {
        const getRequest = store.get(record.id);
        getRequest.onerror = () => { problem = storageError('保存', getRequest.error); };
        getRequest.onsuccess = () => {
          if (countRequest.result >= MAX_FINISHED && getRequest.result === undefined) {
            problem = new Error(`成品库最多保存 ${MAX_FINISHED} 份，请先删除旧成品。`);
            tx.abort();
            return;
          }
          const putRequest = store.put(record);
          putRequest.onerror = () => { problem = storageError('保存', putRequest.error); };
        };
      };
      tx.oncomplete = () => { settled = true; resolve(record); };
      tx.onerror = () => { problem ||= storageError('保存', tx.error); };
      tx.onabort = () => {
        if (!settled) reject(problem || storageError('保存', tx.error));
      };
    });
  }

  async function list() {
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE_NAME, 'readonly'); }
      catch (error) { reject(storageError('读取', error)); return; }
      const request = tx.objectStore(STORE_NAME).getAll();
      let problem = null;
      request.onerror = () => { problem = storageError('读取', request.error); };
      tx.onerror = () => { problem ||= storageError('读取', tx.error); };
      tx.onabort = () => reject(problem || storageError('读取', tx.error));
      tx.oncomplete = () => {
        const records = (Array.isArray(request.result) ? request.result : []).map(record => {
          const has3DData = validCells(record.cells, record.size);
          return { ...record, cells: has3DData ? record.cells : null, has3DData };
        });
        records.sort((a, b) => dateNumber(b.createdAt) - dateNumber(a.createdAt));
        resolve(records);
      };
    });
  }

  async function remove(id) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('要删除的成品编号无效。');
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE_NAME, 'readwrite'); }
      catch (error) { reject(storageError('删除', error)); return; }
      const request = tx.objectStore(STORE_NAME).delete(id.trim());
      let problem = null;
      request.onerror = () => { problem = storageError('删除', request.error); };
      tx.onerror = () => { problem ||= storageError('删除', tx.error); };
      tx.onabort = () => reject(problem || storageError('删除', tx.error));
      tx.oncomplete = () => resolve();
    });
  }

  return { save, list, remove };
}
