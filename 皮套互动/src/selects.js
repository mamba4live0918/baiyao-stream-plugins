(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PuppetSelects = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var roots = new WeakMap();
  var entries = new Map();
  var active = null;
  var serial = 0;

  function attr(node, key, value) {
    if (value === null) { if (node.hasAttribute(key)) node.removeAttribute(key); }
    else if (node.getAttribute(key) !== String(value)) node.setAttribute(key, String(value));
  }
  function labelText(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || node.matches('select,button,input,textarea,.ui-select')) return '';
    return Array.from(node.childNodes).map(labelText).join(' ');
  }
  function nameFor(select) {
    var explicit = select.getAttribute('aria-label');
    if (explicit && explicit.trim()) return explicit.trim();
    var labelled = (select.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(function (id) {
      var node = select.ownerDocument.getElementById(id);
      return node ? labelText(node) : '';
    }).join(' ').trim();
    if (labelled) return labelled.replace(/\s+/g, ' ');
    var text = Array.from(select.labels || []).map(labelText).join(' ').replace(/\s+/g, ' ').trim();
    return text || select.title || select.name || select.id || '选择选项';
  }
  function optionData(select) {
    return Array.from(select.options).map(function (option, index) {
      var group = option.parentElement;
      return { index: index, value: option.value, text: option.label || option.textContent,
        disabled: option.disabled || !!(group && group.tagName === 'OPTGROUP' && group.disabled), hidden: option.hidden };
    });
  }
  function enabledIndices(entry) { return entry.options.filter(function (option) { return !option.disabled && !option.hidden; }).map(function (option) { return option.index; }); }
  function firstIndex(entry) {
    var enabled = enabledIndices(entry);
    return enabled.includes(entry.select.selectedIndex) ? entry.select.selectedIndex : (enabled[0] === undefined ? -1 : enabled[0]);
  }
  function closeMenu(restoreFocus) {
    if (!active) return;
    var entry = active; active = null;
    if (entry.menu) entry.menu.remove();
    entry.menu = null;
    attr(entry.button, 'aria-expanded', 'false');
    attr(entry.button, 'aria-activedescendant', null);
    if (restoreFocus && entry.button.isConnected && !entry.button.disabled) entry.button.focus({ preventScroll: true });
  }
  function positionMenu(entry) {
    if (!entry.menu) return;
    var view = entry.state.view;
    var rect = entry.button.getBoundingClientRect();
    var margin = 8, gap = 5;
    var width = Math.max(1, view.innerWidth), height = Math.max(1, view.innerHeight);
    var menuWidth = Math.min(Math.max(rect.width, 200), Math.max(1, width - margin * 2));
    var menu = entry.menu;
    menu.style.width = menuWidth + 'px';
    menu.style.maxHeight = Math.max(1, Math.min(320, height - margin * 2)) + 'px';
    var naturalHeight = Math.min(menu.scrollHeight + 2, 320, Math.max(1, height - margin * 2));
    var below = Math.max(0, height - margin - rect.bottom - gap);
    var above = Math.max(0, rect.top - gap - margin);
    var useAbove = below < naturalHeight && above > below;
    var available = Math.min(320, useAbove ? above : below, Math.max(1, height - margin * 2));
    if (available < 30) available = Math.max(1, height - margin * 2);
    var actualHeight = Math.min(naturalHeight, available);
    var top = useAbove ? rect.top - gap - actualHeight : rect.bottom + gap;
    top = Math.max(margin, Math.min(top, height - margin - actualHeight));
    menu.style.left = Math.max(margin, Math.min(rect.left, width - margin - menuWidth)) + 'px';
    menu.style.top = top + 'px';
    menu.style.maxHeight = available + 'px';
  }
  function highlight(entry, index, scroll) {
    entry.activeIndex = index;
    if (!entry.menu) return;
    var current;
    entry.menu.querySelectorAll('[role="option"]').forEach(function (button) {
      var selected = Number(button.dataset.index) === index;
      button.classList.toggle('is-active', selected);
      if (selected) current = button;
    });
    attr(entry.button, 'aria-activedescendant', current ? current.id : null);
    if (scroll && current) current.scrollIntoView({ block: 'nearest' });
  }
  function commit(entry, index) {
    var option = entry.options.find(function (item) { return item.index === index; });
    if (!option || option.disabled || option.hidden || entry.button.disabled) return;
    // Set selectedIndex as well so duplicate option values preserve native selection semantics.
    entry.select.selectedIndex = index;
    closeMenu(true);
    entry.select.dispatchEvent(new entry.state.view.Event('input', { bubbles: true }));
    entry.select.dispatchEvent(new entry.state.view.Event('change', { bubbles: true }));
    if (entries.has(entry.select)) refreshEntry(entry);
  }
  function fillMenu(entry) {
    var menu = entry.menu;
    menu.replaceChildren();
    entry.options.forEach(function (option) {
      if (option.hidden) return;
      var button = entry.state.doc.createElement('button');
      button.type = 'button'; button.className = 'ui-select-option'; button.tabIndex = -1;
      button.id = entry.menuID + '-option-' + option.index;
      button.dataset.index = option.index;
      button.textContent = option.text;
      button.disabled = option.disabled;
      attr(button, 'role', 'option');
      attr(button, 'aria-selected', option.index === entry.select.selectedIndex ? 'true' : 'false');
      menu.append(button);
    });
    if (!menu.childElementCount) {
      var empty = entry.state.doc.createElement('div');
      empty.className = 'ui-select-empty'; empty.textContent = '暂无选项'; menu.append(empty);
    }
    positionMenu(entry);
    highlight(entry, entry.activeIndex, false);
  }
  function openMenu(entry, edge) {
    refreshEntry(entry);
    if (entry.button.disabled || !entry.button.isConnected || !entry.button.getClientRects().length) return;
    if (active) closeMenu(false);
    active = entry;
    var indices = enabledIndices(entry);
    entry.activeIndex = edge === 'last' ? (indices[indices.length - 1] ?? -1) : edge === 'first' ? (indices[0] ?? -1) : firstIndex(entry);
    var menu = entry.state.doc.createElement('div');
    menu.className = 'ui-select-menu'; menu.id = entry.menuID;
    attr(menu, 'role', 'listbox'); attr(menu, 'aria-label', nameFor(entry.select));
    entry.menu = menu;
    menu.addEventListener('pointerdown', function (event) { if (event.target.closest('[role="option"]')) event.preventDefault(); });
    menu.addEventListener('click', function (event) {
      var option = event.target.closest('[role="option"]');
      if (option && menu.contains(option)) commit(entry, Number(option.dataset.index));
    });
    entry.state.doc.body.append(menu);
    attr(entry.button, 'aria-expanded', 'true');
    fillMenu(entry);
    entry.button.focus({ preventScroll: true });
    highlight(entry, entry.activeIndex, true);
  }
  function onKey(entry, event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Spacebar', 'Escape', 'Tab'].includes(event.key)) return;
    if (event.key === 'Tab') { if (active === entry) closeMenu(false); return; }
    if (event.key === 'Escape') return; // Captured at document level before the host's Escape handler.
    event.preventDefault(); event.stopPropagation();
    if (entry.button.disabled) return;
    if (active !== entry) { openMenu(entry, event.key === 'End' ? 'last' : event.key === 'Home' ? 'first' : undefined); return; }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') { commit(entry, entry.activeIndex); return; }
    var indices = enabledIndices(entry);
    if (!indices.length) return;
    var index = indices.indexOf(entry.activeIndex);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = indices.length - 1;
    else index = Math.max(0, Math.min(indices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    highlight(entry, indices[index], true);
  }
  function refreshEntry(entry) {
    if (!entry.state.root.contains(entry.select) || !entry.select.isConnected) { dispose(entry); return; }
    var data = optionData(entry.select);
    var signature = JSON.stringify(data);
    var changed = signature !== entry.signature;
    entry.options = data; entry.signature = signature;
    var selected = data[entry.select.selectedIndex];
    var text = selected ? selected.text : '请选择';
    if (entry.text.textContent !== text) entry.text.textContent = text;
    entry.button.disabled = entry.select.matches(':disabled');
    attr(entry.button, 'data-select-id', entry.select.id || null);
    attr(entry.button, 'aria-label', nameFor(entry.select));
    attr(entry.button, 'title', selected ? selected.text : null);
    if (active === entry) {
      if (entry.button.disabled || !entry.button.getClientRects().length) { closeMenu(false); return; }
      if (!enabledIndices(entry).includes(entry.activeIndex)) entry.activeIndex = firstIndex(entry);
      if (changed) fillMenu(entry);
      else entry.menu.querySelectorAll('[role="option"]').forEach(function (button) {
        attr(button, 'aria-selected', Number(button.dataset.index) === entry.select.selectedIndex ? 'true' : 'false');
      });
    }
  }
  function dispose(entry) {
    if (active === entry) closeMenu(false);
    entry.select.removeEventListener('input', entry.nativeChange);
    entry.select.removeEventListener('change', entry.nativeChange);
    entry.button.removeEventListener('click', entry.click);
    entry.button.removeEventListener('keydown', entry.keydown);
    entries.delete(entry.select); entry.state.entries.delete(entry);
    entry.select.hidden = entry.original.hidden;
    attr(entry.select, 'aria-hidden', entry.original.ariaHidden);
    attr(entry.select, 'tabindex', entry.original.tabindex);
    if (entry.select.parentNode === entry.wrapper) entry.wrapper.replaceWith(entry.select);
    else entry.wrapper.remove();
  }
  function enhance(state, select) {
    if (entries.has(select) || select.multiple) return;
    var wrapper = state.doc.createElement('span'); wrapper.className = 'ui-select';
    var button = state.doc.createElement('button'); button.type = 'button'; button.className = 'ui-select-trigger';
    var text = state.doc.createElement('span'); text.className = 'ui-select-text'; button.append(text);
    var entry = { state: state, select: select, wrapper: wrapper, button: button, text: text,
      menuID: 'puppet-select-menu-' + (++serial), menu: null, options: [], signature: '', activeIndex: -1,
      original: { hidden: select.hidden, ariaHidden: select.getAttribute('aria-hidden'), tabindex: select.getAttribute('tabindex') } };
    attr(button, 'role', 'combobox'); attr(button, 'aria-haspopup', 'listbox');
    attr(button, 'aria-expanded', 'false'); attr(button, 'aria-controls', entry.menuID);
    select.before(wrapper); wrapper.append(select, button);
    select.hidden = true; attr(select, 'aria-hidden', 'true'); attr(select, 'tabindex', '-1');
    entries.set(select, entry); state.entries.add(entry);
    entry.click = function (event) { event.preventDefault(); if (active === entry) closeMenu(false); else openMenu(entry); };
    entry.keydown = function (event) { onKey(entry, event); };
    entry.nativeChange = function () { refreshEntry(entry); };
    button.addEventListener('click', entry.click); button.addEventListener('keydown', entry.keydown);
    select.addEventListener('input', entry.nativeChange); select.addEventListener('change', entry.nativeChange);
    refreshEntry(entry);
  }
  function refresh(select) {
    if (select) { if (entries.has(select)) refreshEntry(entries.get(select)); return; }
    Array.from(entries.values()).forEach(refreshEntry);
  }
  function setup(root) {
    if (!root || typeof root.querySelectorAll !== 'function') throw new TypeError('PuppetSelects.setup 需要设置容器元素。');
    if (roots.has(root)) { roots.get(root).reconcile(); return roots.get(root).api; }
    var doc = root.ownerDocument || root;
    var state = { root: root, doc: doc, view: doc.defaultView, entries: new Set(), destroyed: false };
    state.reconcile = function () {
      if (state.destroyed) return;
      if (!root.isConnected) { state.api.destroy(); return; }
      Array.from(state.entries).forEach(function (entry) { if (!root.contains(entry.select) || !entry.select.isConnected) dispose(entry); });
      root.querySelectorAll('select').forEach(function (select) { enhance(state, select); });
      Array.from(state.entries).forEach(refreshEntry);
    };
    function outside(event) {
      if (!active || active.state !== state) return;
      if (!active.wrapper.contains(event.target) && !active.menu.contains(event.target)) closeMenu(false);
    }
    function scrolled(event) {
      if (active && active.state === state && !active.menu.contains(event.target)) closeMenu(false);
    }
    function resized() { if (active && active.state === state) closeMenu(false); }
    function escape(event) {
      if (event.key === 'Escape' && active && active.state === state) {
        event.preventDefault(); event.stopImmediatePropagation(); closeMenu(true);
      }
    }
    state.api = { refresh: refresh, destroy: function () {
      if (state.destroyed) return;
      state.destroyed = true; state.observer.disconnect();
      Array.from(state.entries).forEach(dispose);
      doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('focusin', outside, true);
      doc.removeEventListener('scroll', scrolled, true); doc.removeEventListener('keydown', escape, true);
      state.view.removeEventListener('resize', resized); roots.delete(root);
    } };
    state.observer = new state.view.MutationObserver(function (records) {
      var relevant = records.some(function (mutation) {
        var node = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (!root.isConnected) return true;
        if (node && root.contains(node)) {
          if (node.closest('select')) return true;
          if (!node.closest('.ui-select')) return true;
          // Detect a native select removed from its wrapper, but ignore our own text/ARIA updates.
          return mutation.type === 'childList' && Array.from(mutation.removedNodes).some(function (removed) { return removed.nodeType === 1 && (removed.matches('select') || removed.querySelector('select')); });
        }
        return false;
      });
      if (relevant) state.reconcile();
    });
    roots.set(root, state);
    state.reconcile();
    state.observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'label', 'selected', 'value', 'aria-label', 'aria-labelledby', 'title'] });
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('focusin', outside, true);
    doc.addEventListener('scroll', scrolled, true); doc.addEventListener('keydown', escape, true);
    state.view.addEventListener('resize', resized);
    return state.api;
  }
  return { setup: setup, refresh: refresh };
}));
