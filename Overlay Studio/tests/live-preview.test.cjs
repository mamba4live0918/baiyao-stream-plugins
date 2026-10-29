'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const load = () => import('../src/live-preview.mjs');
const token = '12345678-1234-1234-1234-123456789012';
const finding = { severity: 'error', title: 'Runtime error', detail: 'Something failed' };

test('preview messages require both the current iframe source and its channel token', async () => {
  const { readPreviewMessage } = await load();
  const frame = {};
  const data = { type: 'overlay-studio-preview', token, findings: [finding] };
  assert.deepEqual(readPreviewMessage({ source: frame, data }, frame, token), [finding]);
  assert.equal(readPreviewMessage({ source: {}, data }, frame, token), null);
  assert.equal(readPreviewMessage({ source: frame, data: { ...data, token: 'old-channel' } }, frame, token), null);
  assert.equal(readPreviewMessage({ source: frame, data: { type: 'system.capturePreview', token, action: 'capture' } }, frame, token), null);
});
test('diagnostics are bounded and accept no actions or unrecognized severity', async () => {
  const { readPreviewMessage } = await load();
  const frame = {};
  const result = readPreviewMessage({ source: frame, data: { type: 'overlay-studio-preview', token, findings: [{ ...finding, title: 'x'.repeat(200), detail: 'y'.repeat(4000), action: 'delete' }, { severity: 'execute', title: 'Bad', detail: 'Bad' }, ...Array(50).fill(finding)] } }, frame, token);
  assert.equal(result?.length, 30);
  assert.equal(result[0].title.length, 120);
  assert.equal(result[0].detail.length, 2000);
  assert.equal(result[0].action, undefined);
  assert.ok(result.every(item => item.severity === 'error'));
});
test('instrumentation executes before author scripts and reports runtime errors without native access', async () => {
  const { instrumentPreviewDocument } = await load();
  const source = instrumentPreviewDocument('<!doctype html><html><body><script>throw Error("author error")</script></body></html>', token);
  const match = source.match(/^<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'the diagnostics listener must precede author content');
  const events = {}, messages = [];
  const window = { addEventListener: (name, callback) => { events[name] = callback; }, parent: { postMessage: (...args) => messages.push(args) } };
  const document = { addEventListener() {} };
  vm.runInNewContext(match[1], { window, document, Set, String, setTimeout() {}, getComputedStyle() {} });
  events.error({ message: 'author error', lineno: 3, colno: 4 });
  events.unhandledrejection({ reason: { message: 'rejected work' } });
  assert.equal(messages.length, 2);
  assert.equal(messages[0][0].token, token);
  assert.equal(messages[0][0].findings[0].severity, 'error');
  assert.match(messages[0][0].findings[0].detail, /author error/);
  assert.equal(messages[0][1], '*', 'opaque iframe requires wildcard target but parent authenticates source');
  assert.equal(window.studio, undefined);
});
test('channel tokens cannot inject markup into the instrumentation', async () => {
  const { instrumentPreviewDocument } = await load();
  assert.throws(() => instrumentPreviewDocument('<html></html>', '</script><script>alert(1)</script>'));
});
test('resource failures, opaque background and overflow are reported with a bounded diagnostic count', async () => {
  const { instrumentPreviewDocument } = await load();
  const script = instrumentPreviewDocument('<html></html>', token).match(/^<script>([\s\S]*?)<\/script>/)[1];
  const events = {}, messages = [];
  const window = { addEventListener: (name, callback) => { events[name] = callback; }, parent: { postMessage: message => messages.push(message) } };
  let ready;
  const document = { documentElement: { scrollWidth: 201, clientWidth: 100 }, body: {}, addEventListener: (_name, callback) => { ready = callback; } };
  vm.runInNewContext(script, { window, document, Set, String, setTimeout: callback => callback(), getComputedStyle: () => ({ backgroundColor: 'rgb(255, 0, 0)', backgroundImage: 'none' }) });
  ready();
  events.error({ target: { tagName: 'IMG' } });
  assert.ok(messages.some(message => message.findings[0].title.includes('背景')));
  assert.ok(messages.some(message => message.findings[0].title.includes('溢出')));
  assert.ok(messages.some(message => message.findings[0].title.includes('资源')));
  for (let index = 0; index < 60; index++) events.error({ message: `error ${index}` });
  assert.equal(messages.length, 30);
});
test('review-only revision updates retain unsaved HTML and advance the matching base revision', async () => {
  const { createLiveDraft, reconcileLiveDraft } = await load();
  const project = { id: 'p', html: '<html>saved</html>', revision: 4 };
  const draft = { ...createLiveDraft(project), html: '<html>local edit</html>' };
  const reconciled = reconcileLiveDraft({ ...project, revision: 5 }, draft);
  assert.equal(reconciled.html, draft.html);
  assert.equal(reconciled.baseRevision, 5);
  assert.equal(reconciled.conflict, false);
});
test('a changed saved artifact exposes a conflict without replacing the live draft', async () => {
  const { createLiveDraft, reconcileLiveDraft } = await load();
  const project = { id: 'p', html: 'saved', revision: 4 };
  const draft = { ...createLiveDraft(project), html: 'local edit' };
  const result = reconcileLiveDraft({ ...project, html: 'new server version', revision: 5 }, draft);
  assert.equal(result.html, 'local edit');
  assert.equal(result.baseRevision, 4);
  assert.equal(result.conflict, true);
});
test('clean stale drafts adopt the latest artifact and committed drafts become clean', async () => {
  const { createLiveDraft, reconcileLiveDraft } = await load();
  const old = { id: 'p', html: 'old', revision: 1 };
  const latest = { ...old, html: 'new', revision: 2 };
  assert.deepEqual(reconcileLiveDraft(latest, createLiveDraft(old)), createLiveDraft(latest));
  assert.deepEqual(reconcileLiveDraft(latest, { ...createLiveDraft(old), html: 'new' }), createLiveDraft(latest));
});
