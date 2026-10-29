import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.mjs';

async function running(fetchImpl, fn) {
  const server = createApp({ fetchImpl });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const request = (url, body, headers = {}) => fetch(url + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('chat sends selected messages to DeepSeek and returns response', async () => {
  const calls = [];
  await running(async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ choices: [{ message: { content: '你好呀！' } }], usage: { total_tokens: 15 } }), { status: 200 });
  }, async url => {
    const response = await request(url, { apiKey: 'test-secret', messages: [{ role: 'user', content: '你好' }] });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: '你好呀！', usage: { total_tokens: 15 } });
    assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(calls[0].options.body), { model: 'deepseek-flash', thinking: { type: 'disabled' }, messages: [{ role: 'user', content: '你好' }] });
  });
});

test('bad inputs do not reach the model', async () => {
  let calls = 0;
  await running(async () => { calls++; }, async url => {
    const response = await request(url, { apiKey: '', messages: [] });
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });
});

test('upstream errors are safe and never echo secret', async () => {
  await running(async () => new Response('{"error":"test-secret"}', { status: 401 }), async url => {
    const response = await request(url, { apiKey: 'test-secret', messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(response.status, 401);
    assert.ok(!(await response.text()).includes('test-secret'));
  });
});

test('cross-origin web requests cannot invoke proxy', async () => {
  let calls = 0;
  await running(async () => { calls++; }, async url => {
    const response = await request(url, { apiKey: 'test-secret', messages: [{ role: 'user', content: 'hello' }] }, { origin: 'https://example.com' });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  });
});

test('image messages are forwarded with text and data URL intact', async () => {
  const messages = [{ role: 'user', content: [{ type: 'text', text: '看看' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] }];
  await running(async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).messages, messages);
    return new Response(JSON.stringify({ choices: [{ message: { content: '图片' } }] }));
  }, async url => {
    const response = await request(url, { apiKey: 'test-secret', messages });
    assert.equal(response.status, 200);
  });
});

test('invalid remote images are rejected', async () => {
  let calls = 0;
  await running(async () => { calls++; }, async url => {
    const response = await request(url, { apiKey: 'test-secret', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }] }] });
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });
});
