const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { crc32 } = require('node:zlib');
const { randomUUID } = require('node:crypto');
const { createStorage } = require('../electron/storage.cjs');
let refs = {};
try { refs = require('../electron/reference-files.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q==';
const file = (name = '参考.png', data = PNG, mime = 'image/png', usage = 'style') => ({ name, dataUrl: `data:${mime};base64,${data}`, usage });
async function storageFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'overlay-references-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return createStorage(root);
}
test('validates real PNG/JPEG bytes and UTF8 markdown without trusting caller metadata', () => {
  assert.equal(typeof refs.validateReferenceFile, 'function');
  const png = refs.validateReferenceFile(file());
  assert.equal(png.kind, 'image'); assert.equal(png.mime, 'image/png'); assert.equal(png.size, Buffer.from(PNG, 'base64').length); assert.ok(Buffer.isBuffer(png.buffer));
  assert.equal(refs.validateReferenceFile(file('人像.JPEG', JPEG, 'image/jpeg', 'character')).mime, 'image/jpeg');
  const text = refs.validateReferenceFile(file('需求.md', Buffer.from('你好\n# 需求').toString('base64'), 'text/plain', 'requirements'));
  assert.equal(text.kind, 'text'); assert.equal(text.buffer.toString(), '你好\n# 需求');
  assert.equal(refs.validateReferenceFile({ ...file(), usage: undefined }).usage, 'general');
});
test('rejects unsupported extensions, MIME spoofing, paths and noncanonical base64', () => {
  assert.equal(typeof refs.validateReferenceFile, 'function');
  for (const input of [file('x.svg'), file('x.html'), file('../x.png'), file('C:\\x.png'), file('x.png', JPEG), file('x.jpg', PNG, 'image/jpeg'), file('x.png', PNG.replace('A', '!')), file('x.png', PNG + '\n'), file('x.png', PNG.replace(/=$/, '')), { name: 'x.png', path: 'C:\\secret.png' }, { ...file(), usage: 'execute' }, { ...file(), dataUrl: 'https://example.com/x.png' }]) assert.throws(() => refs.validateReferenceFile(input));
});
test('rejects excessive dimensions, truncated images, oversized images/text and invalid UTF8/NUL', () => {
  assert.equal(typeof refs.validateReferenceFile, 'function');
  const oversized = Buffer.from(PNG, 'base64'); oversized.writeUInt32BE(4097, 16);
  const largeJpeg = Buffer.from(JPEG, 'base64'); const sof = largeJpeg.indexOf(Buffer.from([0xff, 0xc0])); largeJpeg.writeUInt16BE(4097, sof + 5);
  for (const input of [file('x.png', oversized.toString('base64')), file('x.jpg', largeJpeg.toString('base64'), 'image/jpeg'), file('x.png', Buffer.from(PNG, 'base64').subarray(0, 24).toString('base64')), file('x.jpg', Buffer.from(JPEG, 'base64').subarray(0, 200).toString('base64'), 'image/jpeg'), file('x.png', Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')), file('x.txt', Buffer.alloc(65537, 97).toString('base64'), 'text/plain'), file('x.md', Buffer.from([0xff]).toString('base64'), 'text/plain'), file('x.txt', Buffer.from('a\0b').toString('base64'), 'text/plain')]) assert.throws(() => refs.validateReferenceFile(input));
  assert.equal(refs.validateReferenceFile(file('edge.txt', Buffer.alloc(65536, 97).toString('base64'), 'text/plain')).size, 65536);
});
test('accepts a valid PNG at 4 MiB without regex stack exhaustion', () => {
  const original = Buffer.from(PNG, 'base64');
  const chunk = Buffer.alloc(4 * 1024 * 1024 - original.length, 120);
  chunk.writeUInt32BE(chunk.length - 12, 0); chunk.write('tEXt', 4); chunk.write('Comment\0', 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  const large = Buffer.concat([original.subarray(0, -12), chunk, original.subarray(-12)]);
  assert.equal(refs.validateReferenceFile(file('large.png', large.toString('base64'))).size, 4 * 1024 * 1024);
});
test('stored references roundtrip with generated image suffixes, labels and removal by omission', async t => {
  assert.equal(typeof refs.storeReference, 'function');
  const storage = await storageFixture(t); const projectId = randomUUID();
  const image = await refs.storeReference(storage, projectId, refs.validateReferenceFile(file()));
  const jpeg = await refs.storeReference(storage, projectId, refs.validateReferenceFile(file('人像.jpg', JPEG, 'image/jpeg', 'character')));
  const text = await refs.storeReference(storage, projectId, refs.validateReferenceFile(file('需求.md', Buffer.from('使用蓝色').toString('base64'), 'text/plain', 'requirements')));
  assert.deepEqual(Object.keys(image).sort(), ['id', 'kind', 'mime', 'name', 'size', 'usage']);
  assert.equal((await refs.readReference(storage, projectId, image)).dataUrl, file().dataUrl);
  assert.equal((await refs.readReference(storage, projectId, text)).text, '使用蓝色');
  const inputs = await refs.collectReferenceInputs(storage, projectId, [image, jpeg, text]);
  assert.deepEqual(inputs.images, [{ mime: 'image/png', data: PNG, name: '参考.png', usage: 'style' }, { mime: 'image/jpeg', data: JPEG, name: '人像.jpg', usage: 'character' }]);
  assert.match(inputs.imagePaths[0], /[a-f0-9-]+\.png$/); assert.match(inputs.imagePaths[1], /[a-f0-9-]+\.jpg$/);
  assert.deepEqual(await fs.readFile(inputs.imagePaths[0]), Buffer.from(PNG, 'base64'));
  for (const label of ['参考.png', 'style', '人像.jpg', 'character', '需求.md', 'requirements', '使用蓝色']) assert.ok(inputs.text.includes(label));
  assert.deepEqual(await refs.collectReferenceInputs(storage, projectId, []), { images: [], text: '', imagePaths: [] });
  assert.equal((await refs.readReference(storage, projectId, image)).dataUrl, file().dataUrl);
  await assert.rejects(refs.readReference(storage, '../outside', image));
  await assert.rejects(refs.readReference(storage, projectId, { ...image, id: '../outside' }));
  await assert.rejects(refs.readReference(storage, projectId, { ...image, mime: 'text/html' }));
});
test('readBuffer returns bounded binary bytes and refuses outside paths and linked files', async t => {
  const storage = await storageFixture(t); assert.equal(typeof storage.readBuffer, 'function');
  const bytes = Buffer.from([0, 255, 128, 1]); await storage.atomic('projects/binary.bin', bytes);
  assert.deepEqual(await storage.readBuffer('projects/binary.bin', 4), bytes);
  await assert.rejects(storage.readBuffer('projects/binary.bin', 3));
  await assert.rejects(storage.readBuffer('../outside.bin', 10));
  await assert.rejects(storage.readBuffer('projects/binary.bin', -1));
  await fs.link(path.join(storage.root, 'projects/binary.bin'), path.join(storage.root, 'projects/hardlink.bin'));
  await assert.rejects(storage.readBuffer('projects/hardlink.bin', 4));
});
