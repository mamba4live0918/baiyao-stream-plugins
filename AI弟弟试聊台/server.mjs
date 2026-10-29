import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const maxBodyBytes = 8 * 1024 * 1024;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) return false;
  return messages.every(m => {
    if (!m || !['system', 'user', 'assistant'].includes(m.role)) return false;
    if (typeof m.content === 'string') return m.content.length > 0 && m.content.length <= 100000;
    if (m.role !== 'user' || !Array.isArray(m.content) || m.content.length < 1 || m.content.length > 8) return false;
    return m.content.every(part => part && ((part.type === 'text' && typeof part.text === 'string' && part.text.length <= 100000) || (part.type === 'image_url' && typeof part.image_url?.url === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(part.image_url.url))));
  });
}
async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createApp({ fetchImpl = fetch } = {}) {
  return createServer(async (req, res) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/i.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) {
      return json(res, 403, { error: '仅允许本机页面访问。' });
    }
    let url;
    try { url = new URL(req.url, `http://${host}`); } catch { return json(res, 400, { error: '请求地址无效。' }); }
    if (url.pathname === '/api/chat') {
      if (req.method !== 'POST') return json(res, 405, { error: '请求方法不支持。' });
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: '请发送 JSON 请求。' });
      let body;
      try { body = await readJson(req); } catch { return json(res, 400, { error: '请求格式错误或内容过大。' }); }
      if (!body || typeof body.apiKey !== 'string' || !body.apiKey.trim() || body.apiKey.length > 512 || /[\r\n]/.test(body.apiKey) || !validMessages(body.messages)) {
        return json(res, 400, { error: '请填写有效的 API Key 和聊天消息。' });
      }
      try {
        const upstream = await fetchImpl('https://api.deepseek.com/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.apiKey.trim()}` },
          body: JSON.stringify({ model: 'deepseek-flash', thinking: { type: 'disabled' }, messages: body.messages }),
          signal: AbortSignal.timeout(60000),
        });
        if (!upstream.ok) {
          if (upstream.status === 401 || upstream.status === 403) return json(res, 401, { error: 'API Key 未通过验证，请检查密钥。' });
          if (upstream.status === 402) return json(res, 402, { error: 'API 账户余额不足，请检查账户。' });
          if (upstream.status === 429) return json(res, 429, { error: '请求太频繁，请稍后重试。' });
          return json(res, 502, { error: `模型服务暂时不可用（${upstream.status}），请稍后重试。` });
        }
        const result = await upstream.json();
        const text = result?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) return json(res, 502, { error: '模型没有返回有效文字，请重试。' });
        return json(res, 200, { text, usage: result.usage ?? null });
      } catch (err) {
        return json(res, 502, { error: err?.name === 'TimeoutError' ? '模型请求超时，请稍后重试。' : '无法连接模型服务，请检查网络后重试。' });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '请求方法不支持。' });
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: '请求地址无效。' }); }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filename = resolve(root, relative);
    if (!filename.startsWith(root + sep)) return json(res, 404, { error: '文件不存在。' });
    try {
      const content = await readFile(filename);
      res.writeHead(200, { 'Content-Type': types[extname(filename).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { json(res, 404, { error: '文件不存在。' }); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8765);
  createApp().listen(port, '127.0.0.1', () => console.log(`试聊台已启动：http://127.0.0.1:${port}`));
}
