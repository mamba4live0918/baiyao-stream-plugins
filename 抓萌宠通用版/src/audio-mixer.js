(function(root, factory) {
  const PetAudioMixer = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = PetAudioMixer;
  else root.PetAudioMixer = PetAudioMixer;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  const STORAGE_KEY = 'pet-catch-audio-levels-v1';
  const COMMON = new Set(['start', 'ask', 'yes', 'no', 'clap', 'clapbeat', 'grab', 'home', 'recall', 'tornado', 'boom', 'ballpop', 'boxopen', 'boxreveal']);
  let serial = 0;
  function validLevel(value) { return Number.isInteger(value) && value >= 0 && value <= 100; }
  function validKey(key) {
    return typeof key === 'string' && (key.startsWith('audio:') && COMMON.has(key.slice(6)) || /^tier:[\w-]{1,60}$/.test(key));
  }
  function checkKey(key) { if (!validKey(key)) throw new TypeError('Invalid audio source key'); }
  function checkBase(base) { if (!Number.isFinite(base)) throw new TypeError('Audio base volume must be finite'); }
  class PetAudioMixer {
    constructor(options = {}) {
      this._master = 30;
      this._levels = Object.create(null);
      this._players = new WeakMap();
      this._active = new Set();
      this._gains = new Set();
      this._documents = new Set();
      this._id = 'pet-mixer-' + (++serial);
      this._controlSerial = 0;
      this._onWarning = typeof options.onWarning === 'function' ? options.onWarning : () => {};
      this._storage = null;
      try {
        const store = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : root.localStorage;
        if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') throw Error('Storage unavailable');
        const raw = store.getItem(STORAGE_KEY);
        if (raw !== null) {
          const data = JSON.parse(raw);
          if (!data || Array.isArray(data) || !validLevel(data.master) || !data.levels || typeof data.levels !== 'object' || Array.isArray(data.levels)) throw Error('Invalid saved audio settings');
          for (const [key, value] of Object.entries(data.levels)) if (!validKey(key) || !validLevel(value)) throw Error('Invalid saved audio source');
          this._master = data.master;
          Object.assign(this._levels, data.levels);
        }
        this._storage = store;
      } catch {
        this._warn('音量设置无法读取，已保留原记录；本页使用默认音量，调整仅在本次页面有效。');
      }
    }
    _warn(message) { try { this._onWarning(message); } catch {} }
    getMaster() { return this._master; }
    getLevel(key) { checkKey(key); return this._levels[key] ?? 100; }
    volume(key, base = 1) {
      checkBase(base);
      return Math.max(0, Math.min(1, this._master * this.getLevel(key) * base / 10000));
    }
    setMaster(value) {
      if (!validLevel(value)) throw new RangeError('Master volume must be an integer from 0 to 100');
      this._master = value;
      this._changed();
      return value;
    }
    setLevel(key, value) {
      checkKey(key);
      if (!validLevel(value)) throw new RangeError('Source volume must be an integer from 0 to 100');
      this._levels[key] = value;
      this._changed();
      return value;
    }
    _changed() {
      for (const entry of this._active) {
        if (entry.audio.paused || entry.audio.ended) this._active.delete(entry);
        else entry.audio.volume = this.volume(entry.key, entry.base);
      }
      for (const entry of this._gains) entry.node.gain.value = this.volume(entry.key, entry.base);
      for (const doc of this._documents) {
        for (const control of doc.querySelectorAll('[data-pet-audio-mixer="' + this._id + '"]')) this._syncControl(control);
      }
      if (!this._storage) return;
      try { this._storage.setItem(STORAGE_KEY, JSON.stringify({ master: this._master, levels: this._levels })); }
      catch {
        this._storage = null;
        this._warn('音量设置保存失败，本页调整仍生效；旧记录已保留，关闭后本次调整可能丢失。');
      }
    }
    attach(audio, key, base = 1) {
      checkKey(key); checkBase(base);
      if (!audio || typeof audio.addEventListener !== 'function' || typeof audio.removeEventListener !== 'function') throw new TypeError('Expected an audio player');
      this._players.get(audio)?.dispose();
      const entry = { audio, key, base };
      const play = () => { audio.volume = this.volume(key, base); this._active.add(entry); };
      const stop = () => this._active.delete(entry);
      const dispose = () => {
        stop();
        audio.removeEventListener('play', play);
        for (const type of ['pause', 'ended', 'error']) audio.removeEventListener(type, stop);
        if (this._players.get(audio)?.dispose === dispose) this._players.delete(audio);
      };
      this._players.set(audio, { dispose });
      audio.addEventListener('play', play);
      for (const type of ['pause', 'ended', 'error']) audio.addEventListener(type, stop);
      audio.volume = this.volume(key, base);
      if (!audio.paused && !audio.ended) this._active.add(entry);
      return dispose;
    }
    attachGain(node, key, base = 1) {
      checkKey(key); checkBase(base);
      if (!node?.gain || typeof node.gain.value !== 'number') throw new TypeError('Expected a volume GainNode');
      const entry = { node, key, base };
      node.gain.value = this.volume(key, base);
      this._gains.add(entry);
      return () => this._gains.delete(entry);
    }
    mountMaster(container) { return this._mount(container, 'master', '总音量'); }
    mountLevel(container, key, label) { checkKey(key); return this._mount(container, key, label); }
    _mount(container, key, label) {
      if (!container?.ownerDocument || typeof container.append !== 'function') throw new TypeError('Expected a control container');
      if (typeof label !== 'string' || !label.trim()) throw new TypeError('Expected an accessible volume label');
      const doc = container.ownerDocument, control = doc.createElement('label'), title = doc.createElement('span'), input = doc.createElement('input'), output = doc.createElement('output');
      control.className = 'audio-level-control';
      control.dataset.petAudioMixer = this._id;
      control.dataset.audioLevel = key;
      title.className = 'audio-level-label'; title.textContent = label;
      input.className = 'audio-level-range'; input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
      input.id = this._id + '-level-' + (++this._controlSerial);
      input.setAttribute('aria-label', label);
      output.className = 'audio-level-value'; output.setAttribute('for', input.id);
      control.append(title, input, output);
      this._syncControl(control);
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (!validLevel(value)) { this._syncControl(control); return; }
        if (key === 'master') this.setMaster(value); else this.setLevel(key, value);
      });
      container.append(control);
      // Query connected controls on changes; rerendered rows are never retained.
      this._documents.add(doc);
      return control;
    }
    _syncControl(control) {
      const key = control.dataset.audioLevel, value = key === 'master' ? this.getMaster() : this.getLevel(key);
      control.querySelector('input').value = String(value);
      control.querySelector('output').textContent = value + '%';
    }
  }
  return PetAudioMixer;
});
