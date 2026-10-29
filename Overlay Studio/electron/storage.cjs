'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_HTML = 20 * 1024 * 1024;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function identifier(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error('Invalid identifier / 无效的项目或版本编号');
  return value;
}
function validateHtml(html) {
  if (typeof html !== 'string') throw new Error('HTML 必须是文本');
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML) throw new Error('HTML 大小不能超过 20 MiB');
  // HTML permits omitted head/body tags; the bundled starter uses that valid form.
  const document = html.replace(/<!--[^]*?-->/g, '').trim();
  if (!document || html.includes('\0') || !/^(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s|>)/i.test(document) || !/<\/html\s*>\s*$/i.test(document)) {
    throw new Error('需要完整的 HTML 文档（包含 html 开始和结束标签）');
  }
  return html;
}
function fields(input, existing = {}) {
  const value = { ...existing, ...input };
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 || /[\x00-\x1f]/.test(value.name)) throw new Error('项目名称须为 1–100 个字符');
  if (value.brief !== undefined && (typeof value.brief !== 'string' || value.brief.length > 30000)) throw new Error('需求描述须为不超过 30000 字符的文本');
  const width = value.width ?? 1920, height = value.height ?? 1080;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 100 || height < 100 || width > 7680 || height > 7680) throw new Error('画布宽高须为 100–7680 的整数');
  if (value.style !== undefined && (typeof value.style !== 'string' || value.style.length > 200)) throw new Error('风格须为不超过 200 字符的文本');
  return { name: value.name.trim(), brief: value.brief || '', width, height, style: value.style || '清新简约' };
}
async function createStorage(root) {
  if (!root || !path.isAbsolute(root)) throw new Error('Data root must be an absolute path');
  root = path.resolve(root);
  await fs.mkdir(root, { recursive: true });
  // Reject linked components even above the managed root. No caller-supplied path is accepted thereafter.
  let ancestor = root;
  while (true) {
    if ((await fs.lstat(ancestor)).isSymbolicLink()) throw new Error('Data 路径不能包含链接');
    const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent;
  }
  const canonical = await fs.realpath(root);
  async function checked(relative, allowMissing = false) {
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Path outside managed data');
    const parts = path.relative(root, target).split(path.sep).filter(Boolean);
    let cursor = root;
    if ((await fs.lstat(root)).isSymbolicLink() || await fs.realpath(root) !== canonical) throw new Error('Managed root 路径已改变');
    for (let i = 0; i < parts.length; i++) {
      cursor = path.join(cursor, parts[i]);
      try {
        const stat = await fs.lstat(cursor);
        if (stat.isSymbolicLink()) throw new Error('Linked 路径不允许访问');
        if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('Invalid directory 路径');
        if (stat.isFile() && stat.nlink !== 1) throw new Error('Hard-linked 文件不允许访问');
      } catch (error) { if (allowMissing && error.code === 'ENOENT') break; throw error; }
    }
    return target;
  }
  async function mkdir(relative) { const target = await checked(relative, true); await fs.mkdir(target, { recursive: true }); await checked(relative); return target; }
  async function read(relative, limit = MAX_HTML) {
    const target = await checked(relative);
    const handle = await fs.open(target, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw new Error('Invalid file or 文件大小超过限制');
      const buffer = Buffer.alloc(stat.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) { const result = await handle.read(buffer, bytes, buffer.length - bytes, null); if (!result.bytesRead) break; bytes += result.bytesRead; }
      if (bytes > limit || bytes > stat.size) throw new Error('File changed while reading');
      await checked(relative);
      return buffer.subarray(0, bytes).toString('utf8');
    } finally { await handle.close(); }
  }
  async function readBuffer(relative, limit = MAX_HTML) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_HTML) throw new Error('Invalid binary file limit');
    const target = await checked(relative);
    const handle = await fs.open(target, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw new Error('Invalid file or 文件大小超过限制');
      const buffer = Buffer.alloc(stat.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) { const result = await handle.read(buffer, bytes, buffer.length - bytes, null); if (!result.bytesRead) break; bytes += result.bytesRead; }
      if (bytes > limit || bytes !== stat.size) throw new Error('File changed while reading');
      await checked(relative);
      return buffer.subarray(0, bytes);
    } finally { await handle.close(); }
  }
  async function atomic(relative, content) {
    const target = await checked(relative, true);
    const temporary = `${relative}.${randomUUID()}.tmp`;
    const tempPath = await checked(temporary, true);
    const handle = await fs.open(tempPath, 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    try { await checked(relative, true); await checked(temporary); await fs.rename(tempPath, target); }
    catch (error) { await fs.unlink(tempPath).catch(() => {}); throw error; }
  }
  await mkdir('projects'); await mkdir('jobs');
  return { root, checked, mkdir, read, readBuffer, atomic };
}
module.exports = { createStorage, identifier, fields, validateHtml, MAX_HTML };
