'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

function redact(text) {
  return String(text).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, '[已隐藏凭据]')
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [已隐藏凭据]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1[已隐藏凭据]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[已隐藏凭据]')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}
function lineReader(onLine, max = 65536) {
  const decoder = new StringDecoder('utf8');
  let pending = '', dropping = false;
  function consume(text) {
    for (const segment of text.split(/(?<=\n)/)) {
      const end = segment.endsWith('\n');
      if (!dropping) {
        if (pending.length + segment.length > max) { pending = ''; dropping = true; }
        else pending += segment;
      }
      if (end) { if (!dropping) onLine(pending.trim()); pending = ''; dropping = false; }
    }
  }
  return { write(chunk) { consume(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))); }, end() { consume(decoder.end()); if (pending && !dropping) onLine(pending.trim()); pending = ''; } };
}
async function resolveCodex(selected = '') {
  if (selected) {
    if (typeof selected !== 'string' || !path.isAbsolute(selected) || selected.includes('\0')) throw new Error('Codex 路径必须是可执行文件的绝对路径');
    if (process.platform === 'win32' && path.extname(selected).toLowerCase() !== '.exe') throw new Error('请选择 codex.exe（不支持 cmd / ps1 脚本）');
    if (!(await fs.stat(selected)).isFile()) throw new Error('Codex 路径不是文件');
    return selected;
  }
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir.replace(/^"|"$/g, ''), name);
    if (await fs.stat(candidate).then(s => s.isFile(), () => false)) return candidate;
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const base = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    const directories = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    const candidates = [];
    for (const entry of directories.filter(d => d.isDirectory())) {
      const candidate = path.join(base, entry.name, 'codex.exe');
      const stat = await fs.stat(candidate).catch(() => null);
      if (stat?.isFile()) candidates.push({ candidate, mtime: stat.mtimeMs });
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    if (candidates.length) return candidates[0].candidate;
  }
  throw new Error('未找到 Codex。请安装 Codex 或在设置中选择 codex.exe。');
}
function terminate(child) {
  if (!child) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
    const killer = cp.spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => { try { child.kill(); } catch {} });
  } else { try { child.kill('SIGTERM'); } catch {} }
}
function probe(spawn, file, args) {
  return new Promise(resolve => {
    let child, text = '', settled = false;
    const done = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { terminate(child); done({ code: -1, text: 'Codex 状态检查超时' }); }, 8000);
    try {
      child = spawn(file, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const collect = chunk => { if (text.length < 32768) text += chunk.toString().slice(0, 32768 - text.length); };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      child.on('error', error => done({ code: -1, text: redact(error.message) }));
      child.on('close', code => done({ code, text: redact(text.trim()) }));
    } catch (error) { done({ code: -1, text: redact(error.message) }); }
  });
}
async function getStatus(selected, dataDir, spawn = cp.spawn) {
  const status = { available: false, loggedIn: false, version: '', path: '', authLabel: '未登录', dataDir, skillName: 'build-live-overlay-games' };
  try {
    status.path = await resolveCodex(selected);
    const version = await probe(spawn, status.path, ['--version']);
    status.available = version.code === 0;
    if (!status.available) throw new Error(version.text || 'Codex 无法启动');
    status.version = version.text.slice(0, 200);
    const login = await probe(spawn, status.path, ['login', 'status']);
    status.loggedIn = login.code === 0 && /logged in/i.test(login.text);
    status.authLabel = status.loggedIn ? (/ChatGPT/i.test(login.text) ? 'ChatGPT 登录' : 'Codex 已登录') : '未登录';
    if (!status.loggedIn) status.error = '请先在 Codex 中登录，再返回工作台刷新状态。';
  } catch (error) { status.error = redact(error.message).slice(0, 1000); }
  return status;
}
module.exports = { redact, lineReader, resolveCodex, terminate, getStatus };
