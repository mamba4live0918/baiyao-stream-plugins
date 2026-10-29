// 本地预览：node serve.cjs → http://127.0.0.1:8773/（根目录为「淘金」文件夹，默认打开簸箕版试玩页）
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8773);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

http.createServer((req, res) => {
  let file;
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    file = path.resolve(root, '.' + (name === '/' ? '/淘金-簸箕试玩.html' : name));
    if (name.includes('\0') || (file !== root && !file.startsWith(root + path.sep))) throw new Error('outside');
  } catch {
    res.writeHead(400).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`淘金簸箕版预览: http://127.0.0.1:${port}/`));
