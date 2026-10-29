# 1.2 provider integration

User explicitly wants both OpenAI-compatible providers (DeepSeek/SiliconFlow/OpenRouter/custom) and native Anthropic Claude, using their own API keys in the app. Preserve local Codex mode and the existing dark UI. Do not provision or inspect real credentials. Test with isolated local fixtures, no paid real provider calls without keys supplied through the app.

## Transport — owned by transport worker
`electron/model-api.cjs` exports:
- `normalizeBaseUrl(value)` -> normalized base URL (no trailing slash); HTTPS required except loopback HTTP; reject credentials/query/hash. Input is base path, not full completion endpoint (reject /chat/completions or /messages with clear instruction). HTTP allowed only localhost/127.0.0.1/[::1].
- `requestCompletion({config,apiKey,system,prompt,signal,onProgress,fetchImpl=globalThis.fetch})` -> Promise<{text}>.
- `testConnection({config,apiKey,signal,fetchImpl=globalThis.fetch})` -> Promise<{ok:true,latencyMs,model,message}>.
- `extractHtml(text)` -> full HTML or throws.
config = {protocol:'openai-compatible'|'anthropic',baseUrl,model,maxTokens}.
Endpoint baseUrl + '/chat/completions' for compatible, + '/messages' for anthropic. Presets bases include /v1 where appropriate (OpenRouter /api/v1). Use Bearer auth vs x-api-key plus anthropic-version 2023-06-01. Server-side Node fetch only; renderer network isolation stays unchanged. Redirect policy error (never forward keys to a new host). No arbitrary headers or tool execution. Do not log request bodies, keys, response code or reasoning. onProgress({characters}) emits bounded content progress.
Support SSE split chunks and regular JSON responses. Stream only content text, ignore reasoning/thinking. Generation must detect length/max_tokens truncation, provider errors, malformed/premature streams and cap total response (20MiB) before artifact promotion. Abort cancels fetch/body reading. Errors include useful HTTP code but never raw response messages that might echo secrets. Connection test is an explicitly initiated short completion, no project content; a valid structured response ending at token budget may count as connection success even if only reasoning was returned. Enforce timeout (~30s test / 10min generation), no automatic retries/extra billing. Tests: real loopback HTTP fixture, auth/body shapes, streaming, JSON, errors, truncation, abort, redirect denial, extraction.

## Public settings — owned by parent
bootstrap.settings and settings.save result:
{codexPath,engine:'codex'|'api',activeProvider:'deepseek'|'openrouter'|'siliconflow'|'custom'|'anthropic',keyStorageAvailable:boolean,providers:[{id,name,protocol,baseUrl,model,maxTokens,hasKey,keyStorage:'encrypted'|'session'|'missing',keyError?:string}]}.
Presets: DeepSeek https://api.deepseek.com/v1, OpenRouter https://openrouter.ai/api/v1, SiliconFlow https://api.siliconflow.cn/v1, custom empty, Claude https://api.anthropic.com/v1. All model strings initially empty: user enters exact model ID (avoid stale model menus). maxTokens default8192, configurable256..131072. No default key.
Status remains legacy Codex shape in Codex mode, with engine:'codex',ready bool added. API mode returns {engine:'api',ready,available:true,loggedIn:hasKey,providerName,model,authLabel:'API配置',dataDir,...}; ready means configured, not network-tested. UI must say 已配置, not 已连接, unless an actual test succeeded.

New actions:
- settings.save {codexPath?,engine?,activeProvider?} -> public settings. Legacy {codexPath} works; preserve unrelated config.
- providers.save {id,baseUrl,model,maxTokens,apiKey?:string,clearKey?:boolean} -> public settings. Blank/omitted key preserves existing key. Nonblank replaces. clearKey removes it. Key is never returned. Changing credential destination origin with an existing key requires explicitly entering a replacement or clearing it; no silent forwarding to new host.
- providers.test {id} -> testConnection result using SAVED config only. UI save then test or disables test while unsaved. Explain a small request may incur usage. Must not send project files.
Main allowlist must add provider actions. SafeStorage codec supplied by Electron only: {encrypt(plaintext)->base64Ciphertext,decrypt(base64Ciphertext)->plaintext}; when unavailable, memory-only session keys, clearly labeled; no plaintext file fallback. One atomic private state snapshot stores configuration and ciphertext; return only sanitized public settings, no user key ever in app bundle/logs/generated file. Development browser uses session-only keys.

## UI — owned by renderer worker
Own src/ProviderSettings.jsx and changes to App.jsx/dark.css only. Retain dark design. Settings gains clear Codex / API mode selection, provider selection, Base URL, exact model ID, max output tokens, password key input (never reveal saved key), saved/session state, Save config, Test connection, Clear key. Leave native Codex path and storage controls available. Values load from actual settings, switching provider never carries typed key to another profile. Save clears input after success; failure retains input for retry. Changing engine should explicitly save selection. API save may combine providers.save then settings.save to activate; show actual result and refresh status. Parent service blocks changes during active job; UI also disables.
App generation readiness and sidebar/button/progress copy depend on selected engine/provider instead of hardcoded Codex. Job has optional engineLabel, running label generic '正在制作'. API response generates HTML directly but cannot autonomously open browser/run tests; make this meaningful distinction once in settings help. No additional external UI design generation required for small addition to established system.

## Service integration — parent
Snapshot active provider/key at job start, choose existing Codex runner or API runner. API runner builds system from essential bundled skill and runtime/event rules, user message contains brief/settings and previous HTML when modifying. Return only complete self-contained HTML, not shell/filesystem instructions. Use AbortController, validateHtml + unchanged check then existing atomic promote. Cancellation/failure leaves previous artifact. Use bounded redacted progress summaries only. Clear keys from snapshots after run. Existing Codex tests continue unchanged.
