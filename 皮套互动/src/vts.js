(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PuppetVTS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PLUGIN_NAME = '皮套互动整蛊';
  const PLUGIN_DEVELOPER = 'PuppetInteraction';
  const TOKEN_KEY = 'puppet-interaction:vts-token:v1';
  const AUTH_TYPES = new Set(['AuthenticationTokenRequest', 'AuthenticationRequest', 'APIStateRequest']);
  function error(message, code) { const e = new Error(message); if (code !== undefined) e.code = code; return e; }
  function abortError() { const e = error('动作已停止'); e.name = 'AbortError'; return e; }
  function callback(options, name, ...args) { try { if (typeof options[name] === 'function') options[name](...args); } catch (_) { /* Host callbacks cannot invalidate a protocol session. */ } }

  class Client {
    constructor(options) {
      this.options = options || {};
      this.model = null;
      this.hotkeys = [];
      this.inputs = [];
      this.authenticated = false;
      this.sessionId = 0;
      this.modelRevision = 0;
      this._requestCounter = 0;
      this._pending = new Map();
      this._listeners = new Set();
      this._socket = null;
      this._poll = null;
      this._refreshing = null;
      this._openingReject = null;
      this._memoryToken = null;
    }

    _status(state, text) { callback(this.options, 'onStatus', state, text); }
    _report(e) { callback(this.options, 'onError', e); }
    _storage(method, value) {
      try {
        const storage = Object.prototype.hasOwnProperty.call(this.options, 'storage') ? this.options.storage : globalThis.localStorage;
        if (!storage) throw error('浏览器存储不可用');
        return storage[method](TOKEN_KEY, value);
      } catch (_) {
        this._report(error('VTS 授权存储不可用；本页可临时使用，下次打开可能需要重新授权。', 'STORAGE'));
        return null;
      }
    }
    _setModel(model) {
      const next = model && model.modelLoaded && typeof model.modelID === 'string' && model.modelID ? model : null;
      const changed = (this.model && this.model.modelID) !== (next && next.modelID);
      this.model = next;
      if (changed) {
        this.modelRevision++;
        this.hotkeys = []; this.inputs = [];
        for (const listener of this._listeners) listener();
        callback(this.options, 'onModel', this.model);
      }
    }
    _subscribeLifecycle(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }
    _drop(reason, state) {
      this.sessionId++;
      this.authenticated = false;
      clearTimeout(this._poll); this._poll = null; this._refreshing = null;
      const socket = this._socket; this._socket = null;
      if (this._openingReject) { const reject = this._openingReject; this._openingReject = null; reject(reason); }
      for (const pending of this._pending.values()) { clearTimeout(pending.timer); pending.reject(reason); }
      this._pending.clear();
      this._setModel(null); this.hotkeys = []; this.inputs = [];
      for (const listener of this._listeners) listener();
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try { socket.close(); } catch (_) { /* Already closed. */ }
      }
      if (state) this._status(state, reason.message);
    }
    disconnect() { this._drop(error('VTS 连接已断开', 'DISCONNECTED'), 'disconnected'); }

    async connect(port = 8001) {
      const number = Number(port);
      if (!Number.isInteger(number) || number < 1 || number > 65535) throw error('VTS 端口必须是 1–65535 的整数。', 'INVALID_PORT');
      this._drop(error('VTS 连接已替换', 'DISCONNECTED'));
      const generation = this.sessionId;
      this._status('connecting', '正在连接 VTS…');
      try {
        const Socket = this.options.WebSocket || globalThis.WebSocket;
        if (typeof Socket !== 'function') throw error('此浏览器不支持 WebSocket。');
        const socket = new Socket('ws://127.0.0.1:' + number);
        this._socket = socket;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(error('连接 VTS 超时，请检查插件 API 开关和端口。', 'TIMEOUT')), this.options.connectTimeout ?? 6000);
          const finish = (fn, value) => { clearTimeout(timer); this._openingReject = null; fn(value); };
          this._openingReject = e => finish(reject, e);
          socket.onopen = () => { if (generation === this.sessionId) finish(resolve); };
          socket.onerror = () => {
            if (generation !== this.sessionId) return;
            const e = error('VTS 连接失败或已断开，请检查插件 API 开关和端口。', 'DISCONNECTED');
            this._report(e); this._drop(e, 'error');
          };
          socket.onclose = () => {
            if (generation !== this.sessionId) return;
            this._drop(error('VTS 连接已断开；未完成动作不会重放。', 'DISCONNECTED'), 'disconnected');
          };
          socket.onmessage = event => this._receive(event, generation);
        });
        if (generation !== this.sessionId) throw error('VTS 连接已断开', 'DISCONNECTED');
        this._status('authorizing', '正在认证；首次连接请在 VTS 中允许“皮套互动整蛊”。');
        const stored = this._memoryToken || this._storage('getItem');
        let accepted = false;
        if (typeof stored === 'string' && stored.length > 0 && stored.length <= 64) {
          try { accepted = !!(await this.request('AuthenticationRequest', { pluginName: PLUGIN_NAME, pluginDeveloper: PLUGIN_DEVELOPER, authenticationToken: stored })).authenticated; }
          catch (e) { if (e.code !== 50 && e.code !== 51) throw e; }
          if (!accepted) { this._memoryToken = null; this._storage('removeItem'); }
        }
        if (!accepted) {
          const token = await this.request('AuthenticationTokenRequest', { pluginName: PLUGIN_NAME, pluginDeveloper: PLUGIN_DEVELOPER });
          if (!token || typeof token.authenticationToken !== 'string' || !token.authenticationToken || token.authenticationToken.length > 64) throw error('VTS 返回了无效的授权令牌。');
          const auth = await this.request('AuthenticationRequest', { pluginName: PLUGIN_NAME, pluginDeveloper: PLUGIN_DEVELOPER, authenticationToken: token.authenticationToken });
          if (!auth.authenticated) throw error('VTS 未允许此插件：' + (auth.reason || '认证失败'), 'AUTH_DENIED');
          this._memoryToken = token.authenticationToken;
          this._storage('setItem', token.authenticationToken);
        }
        if (generation !== this.sessionId) throw error('VTS 连接已断开', 'DISCONNECTED');
        this.authenticated = true;
        await this.request('EventSubscriptionRequest', { eventName: 'ModelLoadedEvent', subscribe: true, config: {} });
        try { await this.refresh(); }
        catch (e) { if (e.code !== 'MODEL_CHANGED') throw e; await this.refresh(); }
        this._scheduleRefresh(generation);
        return this.model;
      } catch (e) {
        if (generation === this.sessionId) { this._report(e); this._drop(e, 'error'); }
        throw e;
      }
    }

    _receive(event, generation) {
      if (generation !== this.sessionId) return;
      let payload;
      try { payload = JSON.parse(event.data); } catch (_) { this._report(error('VTS 返回了无法解析的数据。', 'PROTOCOL')); return; }
      if (!payload || typeof payload !== 'object') return;
      if (payload.messageType === 'ModelLoadedEvent' && this.authenticated) {
        this._setModel(payload.data);
        this._status(this.model ? 'connected' : 'no-model', this.model ? 'VTS 模型已切换，请重新确认校准。' : 'VTS 已连接，请加载 Live2D 模型。');
        // Let any older in-flight refresh settle; its revision check will reject stale data.
        const previous = this._refreshing || Promise.resolve();
        previous.catch(() => {}).then(() => {
          if (generation === this.sessionId && this.authenticated) this.refresh().catch(e => { if (generation === this.sessionId && e.code !== 'MODEL_CHANGED') this._report(e); });
        });
        return;
      }
      const pending = this._pending.get(payload.requestID);
      if (!pending || pending.generation !== generation) return;
      if (payload.messageType !== 'APIError' && payload.messageType !== pending.type.replace(/Request$/, 'Response')) return;
      clearTimeout(pending.timer); this._pending.delete(payload.requestID);
      if (payload.messageType === 'APIError') pending.reject(error('VTS: ' + (payload.data?.message || '请求失败'), payload.data?.errorID));
      else pending.resolve(payload.data || {});
    }

    request(type, data) {
      if (!this._socket || this._socket.readyState !== 1) return Promise.reject(error('VTS 连接已断开，动作不会稍后重放。', 'DISCONNECTED'));
      if (!this.authenticated && !AUTH_TYPES.has(type)) return Promise.reject(error('VTS 尚未授权。', 'NOT_AUTHENTICATED'));
      const generation = this.sessionId;
      const id = 'puppet-' + generation + '-' + (++this._requestCounter);
      const timeout = type === 'AuthenticationTokenRequest' ? (this.options.authorizationTimeout ?? 60000) : (this.options.requestTimeout ?? 3500);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this._pending.delete(id); reject(error('VTS 请求超时：' + type, 'TIMEOUT')); }, timeout);
        this._pending.set(id, { resolve, reject, timer, generation, type });
        const body = { apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID: id, messageType: type };
        if (data !== undefined) body.data = data;
        try { this._socket.send(JSON.stringify(body)); }
        catch (_) { clearTimeout(timer); this._pending.delete(id); reject(error('VTS 发送失败，动作不会稍后重放。', 'DISCONNECTED')); }
      });
    }

    async refresh() {
      if (!this.authenticated) throw error('VTS 尚未授权。', 'NOT_AUTHENTICATED');
      if (this._refreshing) return this._refreshing;
      const generation = this.sessionId;
      const initialRevision = this.modelRevision;
      const job = (async () => {
        const model = await this.request('CurrentModelRequest');
        if (generation !== this.sessionId) throw error('VTS 连接已断开', 'DISCONNECTED');
        if (initialRevision !== this.modelRevision) throw error('VTS 模型已切换，忽略旧模型读取。', 'MODEL_CHANGED');
        this._setModel(model);
        if (!this.model) { this.hotkeys = []; this.inputs = []; this._status('no-model', 'VTS 已连接，请加载 Live2D 模型。'); return null; }
        const revision = this.modelRevision;
        const [hotkeys, inputs] = await Promise.all([
          this.request('HotkeysInCurrentModelRequest', { modelID: this.model.modelID }),
          this.request('InputParameterListRequest')
        ]);
        if (generation !== this.sessionId || revision !== this.modelRevision) throw error('VTS 模型已切换，请重新校准。', 'MODEL_CHANGED');
        if (inputs.modelID && inputs.modelID !== this.model.modelID) { this._setModel(null); throw error('VTS 模型在读取参数时切换，请重新刷新。', 'MODEL_CHANGED'); }
        this.hotkeys = Array.isArray(hotkeys.availableHotkeys) ? hotkeys.availableHotkeys.filter(x => x && typeof x.hotkeyID === 'string') : [];
        const seen = new Set();
        this.inputs = [...(Array.isArray(inputs.defaultParameters) ? inputs.defaultParameters : []), ...(Array.isArray(inputs.customParameters) ? inputs.customParameters : [])].filter(x => {
          if (!x || typeof x.name !== 'string' || seen.has(x.name)) return false;
          seen.add(x.name); return true;
        });
        this._status('connected', 'VTS 已连接：' + this.model.modelName);
        return this.model;
      })();
      this._refreshing = job;
      try { return await job; } finally { if (this._refreshing === job) this._refreshing = null; }
    }

    _scheduleRefresh(generation) {
      const interval = this.options.refreshInterval ?? 1000;
      if (!interval || generation !== this.sessionId || !this.authenticated) return;
      clearTimeout(this._poll);
      this._poll = setTimeout(async () => {
        try { await this.refresh(); }
        catch (e) { if (generation === this.sessionId && e.code !== 'MODEL_CHANGED') { this._report(e); this._drop(error('VTS 状态读取失败，已停止控制：' + e.message, e.code), 'error'); } }
        this._scheduleRefresh(generation);
      }, Math.max(20, interval));
    }
  }

  const activeActions = new WeakSet();
  function finiteSetting(value, fallback, min, max, label) {
    const n = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw error(label + '必须在 ' + min + '–' + max + ' 范围内。', 'INVALID_SETTINGS');
    return n;
  }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function cleanZero(value) { return value === 0 ? 0 : value; }
  function curve(progress, knots) {
    for (let index = 1; index < knots.length; index++) {
      const previous = knots[index - 1], next = knots[index];
      if (progress <= next[0]) {
        const position = clamp((progress - previous[0]) / (next[0] - previous[0]), 0, 1);
        const eased = position * position * (3 - 2 * position);
        return previous[1] + (next[1] - previous[1]) * eased;
      }
    }
    return knots[knots.length - 1][1];
  }
  const HIT_HEAD = [[0, .08], [.10, 1], [.22, 1], [.38, .34], [.55, -.24], [.72, .08], [.86, -.025], [1, 0]];
  const HIT_EYES = [[0, .12], [.10, 1], [.26, 1], [.55, .35], [.78, 0], [1, 0]];
  const PINCH_EYES = [[0, .03], [.12, .30], [.22, .60], [.78, .60], [.86, .20], [.90, 0], [1, 0]];
  const PINCH_GRIP = [[0, .02], [.12, .45], [.22, 1], [.78, 1], [.90, 0], [1, 0]];
  const KICK_FLIGHT = [[0, 0], [.10, 0], [.52, 1], [.66, 1], [.96, 0], [1, 0]];
  const KICK_SPIN = [[0, 0], [.10, 0], [.64, 720], [1, 720]];
  function wrapAngle(angle) { return cleanZero(((angle + 180) % 360 + 360) % 360 - 180); }

  // Pure normalized timeline. Custom pinch values use parameterEnvelope,
  // never the signed head curve, so release recoil cannot reverse their sign.
  function motionSample(kind, progress, intensity = 1, direction = 'left', hitTarget = 'face') {
    if (!['hit', 'pinch', 'pinch-left', 'pinch-right', 'kick'].includes(kind)) throw error('未知互动动作。', 'INVALID_ACTION');
    const time = finiteSetting(progress, 0, 0, 1, '动作进度');
    const strength = finiteSetting(intensity, 1, 0, 3, '动作强度');
    if (direction !== 'left' && direction !== 'right') throw error('互动方向必须为 left 或 right。', 'INVALID_SETTINGS');
    const sign = kind === 'pinch-right' || direction === 'right' ? -1 : 1;
    const pinch = kind.startsWith('pinch');
    const head = kind === 'kick' || pinch ? 0 : curve(time, HIT_HEAD);
    const eye = kind === 'kick' ? 0 : curve(time, pinch ? PINCH_EYES : HIT_EYES);
    const grip = pinch ? clamp(curve(time, PINCH_GRIP), 0, 1) : 0;
    const parameters = {
      FaceAngleX: cleanZero(clamp(sign * head * (pinch ? 2.5 : 26) * strength, -30, 30)),
      FaceAngleZ: cleanZero(clamp(sign * head * (pinch ? 4 : 22) * strength, -30, 30)),
      FacePositionX: pinch ? 0 : cleanZero(clamp(sign * head * .55 * strength, -2, 2)),
      FacePositionY: pinch ? 0 : cleanZero(clamp(-.20 * Math.max(0, head) * strength, -.75, .75)),
      EyeOpenLeft: cleanZero(-clamp(eye * strength, 0, pinch ? .65 : 1)),
      EyeOpenRight: cleanZero(-clamp(eye * strength, 0, pinch ? .65 : 1))
    };
    if(kind==='hit'&&hitTarget==='head'){
      parameters.FaceAngleX=0;parameters.FaceAngleY=cleanZero(clamp(-22*head*strength,-30,30));
      parameters.FaceAngleZ=cleanZero(clamp(sign*5*head*strength,-12,12));
      parameters.FacePositionX=0;parameters.FacePositionY=cleanZero(-.12*Math.max(0,head)*strength);
    }
    if(kind==='hit'&&hitTarget==='face'){
      parameters.FaceAngleX=cleanZero(clamp(sign*12*head*strength,-30,30));
      parameters.FaceAngleZ=cleanZero(clamp(sign*9*head*strength,-30,30));
      parameters.FacePositionX=cleanZero(clamp(sign*.08*head*strength,-.3,.3));
      parameters.FacePositionY=cleanZero(-.04*Math.max(0,head)*strength);
    }
    const flight = kind === 'kick' ? curve(time, KICK_FLIGHT) * Math.min(strength, 1.5) : 0;
    const spin = kind === 'kick' && strength > 0 ? sign * curve(time, KICK_SPIN) : 0;
    return { parameters, parameterEnvelope: grip, modelOffset: {
      positionX: cleanZero(sign * .40 * flight), positionY: cleanZero(.05 * flight), rotation: wrapAngle(spin), shrink: Math.min(.9, .70 * flight), recenter: Math.min(1,flight)
    } };
  }

  async function runAction(client, kind, settings, hooks) {
    settings = settings || {}; hooks = hooks || {};
    if (!['hit', 'pinch', 'pinch-left', 'pinch-right', 'kick'].includes(kind)) throw error('未知互动动作。', 'INVALID_ACTION');
    if (!client || !client.authenticated) throw error('VTS 已断开或尚未授权。', 'DISCONNECTED');
    if (!client.model || !client.model.modelID) throw error('VTS 尚未加载模型。', 'NO_MODEL');
    if (activeActions.has(client)) throw error('已有动作正在执行，请按顺序排队。', 'BUSY');
    if (hooks.signal?.aborted) throw abortError();
    const pinch = kind.startsWith('pinch');
    const intensity = finiteSetting(settings.intensity, 1, 0, 3, '动作强度');
    const hitTarget=settings.hitTarget??'face';
    if(kind==='hit'&&!['face','head'].includes(hitTarget))throw error('打击部位无效。','INVALID_SETTINGS');
    const kickShrink=finiteSetting(settings.kickShrink,.70,0,.95,'踢飞缩小幅度');
    const duration = finiteSetting(settings.duration, pinch ? 4 : kind === 'kick' ? 3.2 : 1, .05, pinch ? 15 : 5, '动作时长');
    const requestedDirection = settings.direction === undefined ? 'left' : settings.direction;
    if (requestedDirection !== 'left' && requestedDirection !== 'right') throw error('互动方向必须为 left 或 right。', 'INVALID_SETTINGS');
    const session = client.sessionId, revision = client.modelRevision, modelID = client.model.modelID;
    const available = new Map((client.inputs || []).map(p => [p.name, p]));
    let selected = null, selectedValue = 0;
    if (pinch && settings.parameter) {
      selected = available.get(settings.parameter);
      if (!selected) throw error('未找到此 VTS 输入参数；不能使用 Live2D 输出 ID。', 'INVALID_PARAMETER');
      if (/^Face(?:Angle|Position)[XYZ]$/.test(selected.name)) throw error('捏脸不再驱动头部角度或位置，请选择脸颊参数或只使用通用反馈。', 'INVALID_PARAMETER');
      if (!Number.isFinite(selected.min) || !Number.isFinite(selected.max) || selected.min > selected.max) throw error('输入参数范围无效，请刷新 VTS 参数列表。', 'INVALID_PARAMETER');
      selectedValue = finiteSetting(settings.parameterValue, 0, Math.max(-1000000, selected.min), Math.min(1000000, selected.max), '输入参数值');
      if ((selected.name === 'EyeOpenLeft' || selected.name === 'EyeOpenRight') && selectedValue > 0) throw error('闭眼反馈不能叠加正数眼睛参数。', 'INVALID_PARAMETER');
    }
    if (settings.hotkeyID && !(client.hotkeys || []).some(h => h.hotkeyID === settings.hotkeyID)) throw error('未找到此模型的表情／动作热键，请重新选择。', 'INVALID_HOTKEY');
    const parameterIDs = new Set();
    if (kind !== 'kick') {
      for (const id of Object.keys(motionSample(kind, 0, intensity, requestedDirection,hitTarget).parameters)) if (available.has(id) && !(pinch && /^Face(?:Angle|Position)[XYZ]$/.test(id))) parameterIDs.add(id);
      if (selected) parameterIDs.add(selected.name);
      if (!parameterIDs.size && !settings.hotkeyID && !pinch) throw error('此模型没有可用的互动输入参数，请检查 VTS 参数映射。', 'NO_PARAMETERS');
    }
    activeActions.add(client);
    let mutated = false, baseline = null, actionError = null;
    const sessionError = () => {
      if (!client.authenticated || client.sessionId !== session) return error('VTS 已断开，无法恢复本次动作；请检查模型位置。不会重放此动作。', 'DISCONNECTED');
      if (!client.model || client.model.modelID !== modelID || client.modelRevision !== revision) return error('VTS 模型已切换，已停止本次动作，不会操作新模型。', 'MODEL_CHANGED');
      return null;
    };
    const assertCurrent = () => { const e = sessionError(); if (e) throw e; if (hooks.signal?.aborted) throw abortError(); };
    const guarded = promise => new Promise((resolve, reject) => {
      let unsubscribe, settled = false;
      const finish = (e, value) => {
        if (settled) return; settled = true;
        hooks.signal?.removeEventListener('abort', abort); if (unsubscribe) unsubscribe();
        e ? reject(e) : resolve(value);
      };
      const abort = () => finish(abortError());
      const check = () => { const e = sessionError(); if (e) finish(e); };
      hooks.signal?.addEventListener('abort', abort, { once: true });
      if (typeof client._subscribeLifecycle === 'function') unsubscribe = client._subscribeLifecycle(check);
      Promise.resolve(promise).then(value => finish(null, value), e => finish(e));
      if (hooks.signal?.aborted) abort(); else check();
    });
    const wait = ms => new Promise((resolve, reject) => {
      let timer, unsubscribe;
      const finish = e => { clearTimeout(timer); hooks.signal?.removeEventListener('abort', abort); if (unsubscribe) unsubscribe(); e ? reject(e) : resolve(); };
      const abort = () => finish(abortError());
      const check = () => { const e = sessionError(); if (e) finish(e); };
      hooks.signal?.addEventListener('abort', abort, { once: true });
      if (typeof client._subscribeLifecycle === 'function') unsubscribe = client._subscribeLifecycle(check);
      timer = setTimeout(() => { try { assertCurrent(); finish(); } catch (e) { finish(e); } }, ms);
      if (hooks.signal?.aborted) abort(); else check();
    });
    const impact = () => { assertCurrent(); if (typeof hooks.onImpact === 'function') hooks.onImpact(); assertCurrent(); };
    const inject = (progress, clear = false) => {
      const sample = motionSample(kind, progress, intensity, requestedDirection,hitTarget);
      return client.request('InjectParameterDataRequest', { faceFound: false, mode: 'add', parameterValues: [...parameterIDs].map(id => ({
        id, value: clear ? 0 : cleanZero(selected && id === selected.name ? selectedValue * sample.parameterEnvelope : sample.parameters[id])
      })) });
    };
    const waitUntil = async deadline => {
      while (Date.now() < deadline) await wait(Math.min(34, deadline - Date.now()));
      assertCurrent();
    };
    const readSameModel = async () => {
      const current = await client.request('CurrentModelRequest');
      const e = sessionError(); if (e) throw e;
      if (!current.modelLoaded || current.modelID !== modelID) {
        if (typeof client._setModel === 'function') client._setModel(current);
        throw error('VTS 模型已切换，已停止本次动作，不会操作新模型。', 'MODEL_CHANGED');
      }
      return current;
    };
    const triggerHotkey = async () => {
      if (!settings.hotkeyID) return;
      await guarded(client.request('HotkeyTriggerRequest', { hotkeyID: settings.hotkeyID }));
      assertCurrent();
      // Hotkeys may load another model. Check both events and a fresh snapshot
      // before issuing any subsequent parameter or position mutation.
      await guarded(readSameModel());
      assertCurrent();
    };
    try {
      assertCurrent();
      if (kind === 'kick') {
        const current = await guarded(readSameModel()); assertCurrent();
        const p = current.modelPosition;
        if (!p || !['positionX', 'positionY', 'rotation', 'size'].every(k => Number.isFinite(p[k]))) throw error('VTS 未提供有效模型位置，不能安全执行踢动作。', 'INVALID_POSITION');
        baseline = { positionX: p.positionX, positionY: p.positionY, rotation: p.rotation, size: p.size };
        const start = Date.now(), length = duration * 1000;
        impact();
        await triggerHotkey(); assertCurrent();
        // Absolute 30fps samples avoid shortest-path interpolation cancelling
        // a full turn. All transforms derive from the captured baseline.
        do {
          assertCurrent();
          const progress = Math.min(1, (Date.now() - start) / length);
          const offset = motionSample('kick', progress, intensity, requestedDirection).modelOffset;
          mutated = true;
          await guarded(client.request('MoveModelRequest', {
            timeInSeconds: 0, valuesAreRelativeToModel: false,
            positionX: clamp(baseline.positionX * (1-offset.recenter) + offset.positionX, -1000, 1000), positionY: clamp(baseline.positionY * (1-offset.recenter) + offset.positionY, -1000, 1000),
            rotation: wrapAngle(baseline.rotation + offset.rotation), size: clamp(baseline.size + (-100 - baseline.size) * Math.min(.95,offset.shrink/.70*kickShrink), -100, 100)
          }));
          const remaining = length - (Date.now() - start);
          if (remaining <= 0) break;
          await wait(Math.min(33, remaining));
        } while (Date.now() - start < length);
      } else {
        await guarded(readSameModel()); assertCurrent();
        const start = Date.now(), length = duration * 1000;
        impact();
        await triggerHotkey(); assertCurrent();
        do {
          assertCurrent();
          const progress = Math.min(1, (Date.now() - start) / length);
          if (parameterIDs.size) { mutated = true; await guarded(inject(progress)); }
          const remaining = length - (Date.now() - start);
          if (remaining <= 0) break;
          await wait(Math.min(34, remaining));
        } while (Date.now() - start < length);
      }
    } catch (e) { actionError = e; }
    finally {
      if (mutated) {
        try {
          const e = sessionError(); if (e) throw e;
          await readSameModel();
          const changed = sessionError(); if (changed) throw changed;
          if (kind === 'kick') await client.request('MoveModelRequest', { ...baseline, timeInSeconds: 0, valuesAreRelativeToModel: false });
          else await inject(1, true);
        } catch (e) {
          // Cleanup failure must stay visible even when the initiating reason was Stop.
          if (!actionError || actionError.name === 'AbortError') actionError = e;
          callback(client.options || {}, 'onError', e);
        }
      }
      activeActions.delete(client);
    }
    if (actionError) throw actionError;
    return { kind, modelID };
  }

  return { Client, runAction, motionSample };
});
