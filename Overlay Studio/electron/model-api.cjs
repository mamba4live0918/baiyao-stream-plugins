'use strict';

const { validateReferenceFile } = require('./reference-files.cjs');

const TOKEN_LIMITS = require('./token-limits.json');
const MAX_BYTES = 20 * 1024 * 1024;
class TransportError extends Error {}
const fail = message => { throw new TransportError(message); };

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(typeof value === 'string' ? value.trim() : ''); }
  catch { fail('Base URL 无效，请输入完整的 HTTPS 地址。'); }
  if (url.username || url.password || url.search || url.hash || /[?#]/.test(value)) fail('Base URL 不可包含凭据、查询参数或片段。');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) fail('Base URL 必须使用 HTTPS（本机回环地址除外）。');
  let path;
  try { path = decodeURIComponent(url.pathname).replace(/\/+$/, ''); } catch { fail('Base URL 路径无效。'); }
  if (/\/(?:chat\/completions|messages)$/i.test(path)) fail('请输入 API 的 Base URL（例如 /v1），不要包含 /chat/completions 或 /messages。');
  return url.toString().replace(/\/+$/, '');
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { fail('模型返回了无法解析的 JSON 数据。'); }
}

async function perform({ config, apiKey, system, prompt, images = [], signal, onProgress, fetchImpl = globalThis.fetch }, connection) {
  const base = normalizeBaseUrl(config?.baseUrl);
  const anthropic = config?.protocol === 'anthropic';
  if (!anthropic && config?.protocol !== 'openai-compatible') fail('不支持的 API 协议。');
  if (typeof config.model !== 'string' || !config.model.trim()) fail('请先填写模型 ID。');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) fail('请先填写有效的 API Key。');
  const maxTokens = connection ? 32 : config.maxTokens;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > TOKEN_LIMITS.max) fail('输出 token 上限无效。');
  if (!Array.isArray(images) || images.length > 4) fail('参考图片须为数组，最多 4 张。');
  for (const image of images) {
    if (!image || !['image/png', 'image/jpeg'].includes(image.mime) || typeof image.data !== 'string') fail('参考图片格式无效，仅支持 PNG/JPEG。');
    try {
      validateReferenceFile({ name: image.name || (image.mime === 'image/png' ? 'reference.png' : 'reference.jpg'), dataUrl: `data:${image.mime};base64,${image.data}`, usage: image.usage });
    } catch { fail('参考图片无效，请检查 PNG/JPEG 格式、4 MiB 大小及 4096 像素宽高限制。'); }
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort(); }, connection ? 30_000 : 600_000);
  timer.unref?.();
  let reader;
  let text = '';
  let lastProgress = 0;
  let lastCharacters = -1;
  function progress(final = false) {
    const now = Date.now();
    if (typeof onProgress === 'function' && text.length !== lastCharacters && (final || now - lastProgress >= 100)) {
      lastProgress = now;
      lastCharacters = text.length;
      onProgress({ characters: text.length });
    }
  }
  function append(value) {
    if (typeof value !== 'string') fail('模型返回的文本格式无效。');
    text += value;
    progress();
  }
  let finishReason;
  let ended = false;
  let structured = false;
  function consume(data) {
    if (!data || typeof data !== 'object' || data.error || data.type === 'error') fail('模型服务返回错误，请检查配置或稍后重试。');
    if (anthropic) {
      if (data.type === 'content_block_delta') {
        if (data.delta?.type === 'text_delta') append(data.delta.text);
      } else if (data.type === 'content_block_start') {
        if (data.content_block?.type === 'text') append(data.content_block.text);
      } else if (data.type === 'message_delta') {
        if (data.delta?.stop_reason) finishReason = data.delta.stop_reason;
      } else if (data.type === 'message_start') {
        structured = data.message?.type === 'message';
      } else if (data.type === 'message_stop') {
        ended = true;
      } else if (data.type === 'message' && Array.isArray(data.content)) {
        structured = true;
        for (const block of data.content) if (block.type === 'text') append(block.text);
        finishReason = data.stop_reason;
        ended = true;
      }
    } else {
      if (!Array.isArray(data.choices)) fail('模型返回的 completion 格式无效。');
      const choice = data.choices.find(item => item.index === 0 || item.index === undefined);
      if (!choice) return; // A final stream usage event may have no choices.
      structured = true;
      const content = choice.delta?.content ?? choice.message?.content;
      if (content !== null && content !== undefined) append(content);
      if (choice.finish_reason) finishReason = choice.finish_reason;
      if (choice.message) ended = true;
    }
  }
  try {
    const content = images.length ? [
      { type: 'text', text: prompt },
      ...images.map(image => anthropic
        ? { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }
        : { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } }),
    ] : prompt;
    const body = {
      model: config.model.trim(), max_tokens: maxTokens, stream: true,
      ...(anthropic ? { system, messages: [{ role: 'user', content }] } : { messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
    };
    const response = await fetchImpl(base + (anthropic ? '/messages' : '/chat/completions'), {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json', ...(anthropic ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 400 && images.length) fail('模型服务拒绝了图片请求（HTTP 400）。请选择支持看图的视觉模型，或移除参考图片后重试。');
      fail(`模型服务请求失败（HTTP ${response.status}）。请检查 API Key、模型 ID 和服务状态。`);
    }
    if (!response.body) fail('模型服务返回了空响应。');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body.cancel().catch(() => {});
      fail('模型响应超过 20 MiB 限制。');
    }
    const streaming = (response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let buffer = '';
    let eventData = [];
    let streamDone = false;
    function dispatch() {
      if (!eventData.length) return;
      const payload = eventData.join('\n'); eventData = [];
      if (streamDone) fail('模型流结束后仍返回了数据。');
      if (payload === '[DONE]') {
        if (anthropic) fail('模型流协议无效。');
        streamDone = true;
      } else {
        consume(parseJson(payload));
        if (anthropic && ended) streamDone = true;
      }
    }
    function readLines(final = false) {
      let match;
      while ((match = /\r\n|\n|\r/.exec(buffer))) {
        // A CRLF pair can be split across network chunks.
        if (match[0] === '\r' && match.index === buffer.length - 1 && !final) break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (!line) dispatch();
        else if (line.startsWith('data:')) eventData.push(line.slice(5).replace(/^ /, ''));
      }
    }
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) fail('模型响应超过 20 MiB 限制。');
      buffer += decoder.decode(chunk.value, { stream: true });
      if (streaming) readLines();
    }
    buffer += decoder.decode();
    if (streaming) {
      readLines(true);
      if (buffer.trim() || eventData.length || !streamDone) fail('模型流提前结束或格式不完整，请重试。');
    } else consume(parseJson(buffer));
    if (controller.signal.aborted) throw new Error();
    if (!structured || !finishReason || (!streaming && !ended)) fail('模型响应缺少完整的结束信息。');
    if (['length', 'max_tokens'].includes(finishReason)) {
      if (!connection) fail('模型输出因 token 上限被截断，请提高输出上限后重试。');
    } else if (!(anthropic ? ['end_turn', 'stop_sequence'] : ['stop']).includes(finishReason)) {
      fail('模型未正常完成文本输出，请检查模型能力或调整请求。');
    }
    if (!connection && !text.trim()) fail('模型没有返回文本内容。');
    progress(true);
    return { text };
  } catch (error) {
    if (timedOut) throw new TransportError('模型请求超时，请重试。');
    if (signal?.aborted) { const cancelled = new Error('模型请求已取消。'); cancelled.name = 'AbortError'; throw cancelled; }
    if (error instanceof TransportError) throw error;
    // Do not expose raw provider, fetch, callback or abort messages: they may contain credentials.
    throw new TransportError('模型请求失败：网络连接、重定向或响应格式异常。');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

function requestCompletion(options) { return perform(options, false); }

async function testConnection({ config, apiKey, signal, fetchImpl = globalThis.fetch }) {
  const started = Date.now();
  await perform({ config, apiKey, signal, fetchImpl, system: 'Reply briefly.', prompt: 'Reply OK.' }, true);
  return { ok: true, latencyMs: Date.now() - started, model: config.model, message: '连接成功，模型已响应。' };
}

function extractHtml(value) {
  if (typeof value !== 'string') fail('模型没有返回完整 HTML。');
  const match = /(?:<!doctype\s+html\b[^>]*>\s*)?<html\b[^>]*>[\s\S]*<\/html\s*>/i.exec(value);
  if (!match) fail('模型没有返回完整 HTML 文档，请重试。');
  return match[0].trim();
}

module.exports = { normalizeBaseUrl, requestCompletion, testConnection, extractHtml };

