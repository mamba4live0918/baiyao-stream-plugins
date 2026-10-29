(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PuppetDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function aborted() { const error = new Error('动作演示已取消。'); error.name = 'AbortError'; return error; }
  function milliseconds(value, fallback) {
    const result = value === undefined ? fallback : value;
    if (!Number.isFinite(result) || result < 0 || result > 2147483647) throw new RangeError('演示等待时间必须为有效的非负毫秒数。');
    return result;
  }
  function timerDelay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(aborted()); return; }
      const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(aborted()); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
      signal.addEventListener('abort', cancel, { once: true });
    });
  }
  // The scheduler stops even if an injected delay/play ignores its AbortSignal.
  // The host play function still owns restoring its model and visual effects.
  function interruptible(invoke, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(aborted()); return; }
      let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true;
        signal.removeEventListener('abort', cancel);
        error ? reject(error) : resolve(value);
      };
      const cancel = () => finish(aborted());
      signal.addEventListener('abort', cancel, { once: true });
      try { Promise.resolve(invoke()).then(value => finish(null, value), error => finish(error)); }
      catch (error) { finish(error); }
    });
  }
  function create(options) {
    options = options || {};
    if (typeof options.play !== 'function' || typeof options.ready !== 'function') throw new TypeError('演示需要 play 和 ready 函数。');
    const countdownMs = milliseconds(options.countdownMs, 5000);
    const gapMs = milliseconds(options.gapMs, 2000);
    const actions=options.sequence===undefined?['hit','pinch','kick']:[...options.sequence];
    if(!actions.length||actions.length>10||actions.some(kind=>!['hit','hit-face','hit-head','pinch','kick','kick-shoe','kick-barefoot'].includes(kind)))throw new TypeError('演示动作序列无效。');
    const delay = options.delay || timerDelay;
    if (typeof delay !== 'function') throw new TypeError('delay 必须为函数。');
    let active = null;
    const report = error => { try { options.onError?.(error); } catch (_) { /* Preserve the original failure. */ } };
    const assertReady = () => { if (!options.ready()) throw new Error('演示尚未就绪，请确认连接与模型校准。'); };
    return {
      get running() { return active !== null; },
      cancel() { const run = active; if (run) { active = null; run.abort(); } },
      async start() {
        if (active) throw new Error('动作演示正在进行，请先停止当前演示。');
        let run;
        try {
          assertReady();
          run = new AbortController(); active = run;
          const check = () => { if (run.signal.aborted || active !== run) throw aborted(); };
          const wait = ms => interruptible(() => delay(ms, run.signal), run.signal);
          let remaining = countdownMs;
          while (remaining > 0) {
            check(); options.onCountdown?.(Math.ceil(remaining / 1000)); check();
            const step = Math.min(1000, remaining);
            await wait(step); remaining -= step;
          }
          check(); options.onCountdown?.(0); check();
          for (let index = 0; index < actions.length; index++) {
            check(); assertReady();
            await interruptible(() => options.play(actions[index], run.signal), run.signal);
            check();
            if (index < actions.length - 1 && gapMs > 0) await wait(gapMs);
          }
          check(); active = null; options.onDone?.();
        } catch (error) {
          if (error.name !== 'AbortError') report(error);
          throw error;
        } finally {
          if (active === run) active = null;
        }
      }
    };
  }
  return { create };
});
