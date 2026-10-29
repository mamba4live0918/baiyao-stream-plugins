const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const api = require('../electron/model-api.cjs');
const KEY = 'TEST_KEY_DO_NOT_EXPOSE';
const HTML = '<!doctype html><html><body>你好</body></html>';
const oa = (content = HTML, reason = 'stop') => ({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: reason }] });
const ant = (reason = 'end_turn') => ({ type: 'message', role: 'assistant', content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: HTML }], stop_reason: reason });
const event = (data, type) => `${type ? `event: ${type}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
async function fixture(t, handler) {
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    await handler(req, res, body ? JSON.parse(body) : null);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}/v1`;
}
function options(baseUrl, protocol = 'openai-compatible', extra = {}) {
  return { config: { protocol, baseUrl, model: 'fixture-model', maxTokens: 8192 }, apiKey: KEY, system: 'System instruction', prompt: 'Project prompt', ...extra };
}
test('base URL validation rejects unsafe transports and completion endpoints', () => {
  assert.equal(typeof api.normalizeBaseUrl, 'function');
  assert.equal(api.normalizeBaseUrl(' https://example.com/api/v1/ '), 'https://example.com/api/v1');
  assert.equal(api.normalizeBaseUrl('http://[::1]:8000/v1'), 'http://[::1]:8000/v1');
  for (const value of ['http://example.com', 'ftp://localhost', 'https://user:secret@example.com', 'https://example.com?v=secret', 'https://example.com#secret', 'https://example.com/v1/chat/completions/', 'https://example.com/v1/messages']) {
    assert.throws(() => api.normalizeBaseUrl(value));
  }
});
for (const protocol of ['openai-compatible', 'anthropic']) {
  test(`${protocol} JSON sends correct auth/body and returns only text`, async t => {
    let received;
    const base = await fixture(t, (req, res, body) => { received = { url: req.url, headers: req.headers, body }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(protocol === 'anthropic' ? ant() : oa())); });
    assert.deepEqual(await api.requestCompletion(options(base, protocol)), { text: HTML });
    assert.equal(received.body.model, 'fixture-model');
    assert.equal(received.body.max_tokens, 8192);
    assert.equal(received.body.stream, true);
    if (protocol === 'anthropic') {
      assert.equal(received.url, '/v1/messages'); assert.equal(received.headers['x-api-key'], KEY); assert.equal(received.headers['anthropic-version'], '2023-06-01'); assert.equal(received.headers.authorization, undefined);
      assert.equal(received.body.system, 'System instruction'); assert.deepEqual(received.body.messages, [{ role: 'user', content: 'Project prompt' }]);
    } else {
      assert.equal(received.url, '/v1/chat/completions'); assert.equal(received.headers.authorization, `Bearer ${KEY}`); assert.equal(received.headers['x-api-key'], undefined);
      assert.deepEqual(received.body.messages, [{ role: 'system', content: 'System instruction' }, { role: 'user', content: 'Project prompt' }]);
    }
  });
  test(`${protocol} SSE survives byte-split UTF-8 and ignores reasoning`, async t => {
    const content = protocol === 'anthropic'
      ? event({ type: 'message_start', message: { type: 'message', content: [], stop_reason: null } }, 'message_start') + event({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'private' } }, 'content_block_delta') + event({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: HTML } }, 'content_block_delta') + event({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }, 'message_delta') + event({ type: 'message_stop' }, 'message_stop')
      : event({ choices: [{ index: 0, delta: { reasoning_content: 'private' } }] }) + event({ choices: [{ index: 0, delta: { content: HTML } }] }) + event({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + event('[DONE]');
    const base = await fixture(t, async (_req, res) => { res.setHeader('content-type', 'text/event-stream'); for (const byte of Buffer.from(content)) { res.write(Buffer.from([byte])); await new Promise(resolve => setImmediate(resolve)); } res.end(); });
    const progress = [];
    assert.deepEqual(await api.requestCompletion(options(base, protocol, { onProgress: p => progress.push(p) })), { text: HTML });
    assert.ok(progress.length); assert.deepEqual(progress.at(-1), { characters: HTML.length });
    assert.ok(progress.every(p => Object.keys(p).join() === 'characters'));
  });
  test(`${protocol} generation rejects token-limit truncation`, async t => {
    const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(protocol === 'anthropic' ? ant('max_tokens') : oa(HTML, 'length'))); });
    await assert.rejects(api.requestCompletion(options(base, protocol)), /截断|token|truncat/i);
  });
  test(`${protocol} connection accepts structured reasoning-only budget completion`, async t => {
    let body;
    const base = await fixture(t, (_req, res, input) => { body = input; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(protocol === 'anthropic' ? { ...ant('max_tokens'), content: [{ type: 'thinking', thinking: 'private' }] } : oa(null, 'length'))); });
    const result = await api.testConnection(options(base, protocol));
    assert.equal(result.ok, true); assert.equal(result.model, 'fixture-model'); assert.ok(result.latencyMs >= 0);
    assert.ok(body.max_tokens <= 64); assert.ok(!JSON.stringify(body).includes('Project prompt'));
  });
}
test('HTTP errors never echo response secrets', async t => {
  const base = await fixture(t, (_req, res) => { res.statusCode = 401; res.end(JSON.stringify({ error: { message: KEY } })); });
  await assert.rejects(api.requestCompletion(options(base)), error => /401/.test(error.message) && !error.message.includes(KEY));
});
test('redirects never forward authorization or retry requests', async t => {
  let destinationRequests = 0; let sourceRequests = 0;
  const destination = await fixture(t, (_req, res) => { destinationRequests++; res.end(JSON.stringify(oa())); });
  const base = await fixture(t, (_req, res) => { sourceRequests++; res.writeHead(307, { location: destination + '/chat/completions' }); res.end(); });
  await assert.rejects(api.requestCompletion(options(base)));
  assert.equal(sourceRequests, 1); assert.equal(destinationRequests, 0);
});
for (const [name, payload] of [
  ['premature SSE without DONE', event({ choices: [{ index: 0, delta: { content: HTML }, finish_reason: 'stop' }] })],
  ['DONE without finish reason', event({ choices: [{ index: 0, delta: { content: HTML } }] }) + event('[DONE]')],
  ['malformed SSE', 'data: {broken\n\n'],
  ['provider stream error', event({ error: { message: KEY } })],
  ['truncated stream', event({ choices: [{ index: 0, delta: { content: HTML }, finish_reason: 'length' }] }) + event('[DONE]')],
]) test(`rejects ${name}`, async t => {
  const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end(payload); });
  await assert.rejects(api.requestCompletion(options(base)), error => !error.message.includes(KEY));
});
test('rejects incomplete Anthropic message before message_stop', async t => {
  const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end(event({ type: 'content_block_delta', delta: { type: 'text_delta', text: HTML } }) + event({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })); });
  await assert.rejects(api.requestCompletion(options(base, 'anthropic')));
});
test('Anthropic preserves initial text in content_block_start', async t => {
  const base = await fixture(t, (_req, res) => {
    res.setHeader('content-type', 'text/event-stream');
    res.end(event({ type: 'message_start', message: { type: 'message', content: [], stop_reason: null } }) + event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '<html>' } }) + event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '</html>' } }) + event({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + event({ type: 'message_stop' }));
  });
  assert.deepEqual(await api.requestCompletion(options(base, 'anthropic')), { text: '<html></html>' });
});
for (const [name, payload] of [['malformed JSON', '{bad'], ['empty choices', '{"choices":[]}'], ['provider JSON error', JSON.stringify({ error: { message: KEY } })]]) test(`rejects ${name} without leaking data`, async t => {
  const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(payload); });
  await assert.rejects(api.requestCompletion(options(base)), error => !error.message.includes(KEY));
});
test('connection test times out a stalled HTTP response after 30 seconds', { timeout: 35000 }, async t => {
  const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.write(':waiting\n\n'); });
  const start = Date.now();
  await assert.rejects(api.testConnection(options(base)), /超时|timeout/i);
  assert.ok(Date.now() - start < 33000);
});
test('refuses tool-call completion even when text contains complete HTML', async t => {
  const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(oa(HTML, 'tool_calls'))); });
  await assert.rejects(api.requestCompletion(options(base)));
});
test('pre-aborted request does not send any HTTP request', async t => {
  let count = 0;
  const base = await fixture(t, (_req, res) => { count++; res.end(JSON.stringify(oa())); });
  const controller = new AbortController(); controller.abort(KEY);
  await assert.rejects(api.requestCompletion(options(base, 'openai-compatible', { signal: controller.signal })), { name: 'AbortError' });
  assert.equal(count, 0);
});
test('abort cancels an active body read and does not leak signal reason', async t => {
  const controller = new AbortController();
  const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.write(':waiting\n\n'); setTimeout(() => controller.abort(KEY), 25); });
  await assert.rejects(api.requestCompletion(options(base, 'openai-compatible', { signal: controller.signal })), error => error.name === 'AbortError' && !error.message.includes(KEY));
});
test('rejects responses larger than 20 MiB', async t => {
  const base = await fixture(t, (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(oa('x'.repeat(20 * 1024 * 1024)))); });
  await assert.rejects(api.requestCompletion(options(base)), /20|过大|limit/i);
});
test('extractHtml unwraps a full document and refuses fragments or missing end', () => {
  assert.equal(api.extractHtml(`Here is the result:\n\`\`\`html\n${HTML}\n\`\`\``), HTML);
  assert.equal(api.extractHtml(HTML), HTML);
  for (const value of ['<div>fragment</div>', '<!doctype html><html><body>unfinished', 'no html']) assert.throws(() => api.extractHtml(value));
});

const REFERENCE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const referenceImage = { mime: 'image/png', data: REFERENCE_PNG, name: '参考.png', usage: 'style' };
for (const protocol of ['openai-compatible', 'anthropic']) {
  test(`${protocol} multimodal includes real image bytes and preserves text prompt`, async t => {
    let received;
    const base = await fixture(t, (_req, res, body) => { received = body; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(protocol === 'anthropic' ? ant() : oa())); });
    assert.deepEqual(await api.requestCompletion(options(base, protocol, { images: [referenceImage] })), { text: HTML });
    const content = received.messages.at(-1).content;
    assert.ok(Array.isArray(content));
    assert.deepEqual(content[0], { type: 'text', text: 'Project prompt' });
    assert.deepEqual(content[1], protocol === 'anthropic'
      ? { type: 'image', source: { type: 'base64', media_type: 'image/png', data: REFERENCE_PNG } }
      : { type: 'image_url', image_url: { url: `data:image/png;base64,${REFERENCE_PNG}` } });
  });
  test(`${protocol} image HTTP400 gives vision hint and does not retry without image`, async t => {
    let requests = 0;
    const base = await fixture(t, (_req, res) => { requests++; res.statusCode = 400; res.end(KEY + REFERENCE_PNG); });
    await assert.rejects(api.requestCompletion(options(base, protocol, { images: [referenceImage] })), error => /400/.test(error.message) && /看图|视觉|vision/i.test(error.message) && !error.message.includes(KEY) && !error.message.includes(REFERENCE_PNG));
    assert.equal(requests, 1);
  });
}
test('multimodal validation rejects remote inputs, spoofed bytes, invalid count, and oversized images before HTTP', async t => {
  let requests = 0;
  const base = await fixture(t, (_req, res) => { requests++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(oa())); });
  for (const images of [null, 'image', Array(5).fill(referenceImage), [{ ...referenceImage, mime: 'image/svg+xml' }], [{ ...referenceImage, data: 'https://example.com/image.png' }], [{ ...referenceImage, data: Buffer.from('<svg/>').toString('base64') }], [{ ...referenceImage, data: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64') }]]) {
    await assert.rejects(api.requestCompletion(options(base, 'openai-compatible', { images })));
  }
  assert.equal(requests, 0);
});
test('connection test is image free even when image input is supplied', async t => {
  let received;
  const base = await fixture(t, (_req, res, body) => { received = body; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(oa('OK'))); });
  assert.equal((await api.testConnection(options(base, 'openai-compatible', { images: [referenceImage] }))).ok, true);
  assert.equal(received.messages.at(-1).content, 'Reply OK.');
});
