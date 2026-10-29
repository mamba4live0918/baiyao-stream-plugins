import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeWindow, assignSlots, buildStory, featuredWindows, RACK, rackLayout } from '../src/story.js';
import { PLUGINS } from '../src/content.js';
import { TIMELINE } from '../src/config.js';

test('every plugin gets exactly one rack slot', () => {
  const slots = assignSlots(PLUGINS);
  assert.equal(slots.length, PLUGINS.length);
  assert.equal(new Set(slots).size, PLUGINS.length);
});

test('featured plugins are spread from the top slot to the bottom slot', () => {
  const slots = assignSlots(PLUGINS);
  const featuredSlots = slots.flatMap((p, i) => (p.featured ? [i] : []));
  assert.equal(featuredSlots[0], 0);
  assert.equal(featuredSlots[featuredSlots.length - 1], PLUGINS.length - 1);
  const gaps = featuredSlots.slice(1).map((slot, i) => slot - featuredSlots[i]);
  assert.ok(gaps.every((gap) => gap >= 1));
  assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `uneven gaps ${gaps}`);
});

test('spreading leaves non-featured plugins between the featured ones', () => {
  const plugins = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, featured: i < 6 }));
  const featuredSlots = assignSlots(plugins).flatMap((p, i) => (p.featured ? [i] : []));
  assert.deepEqual(featuredSlots, [0, 3, 6, 10, 13, 16]);
});

test('rack slots are evenly pitched and centred around y = 0', () => {
  const layout = rackLayout(5);
  const pitch = RACK.slotHeight + RACK.gap;
  for (let i = 1; i < 5; i++) assert.ok(Math.abs(layout.slotY(i - 1) - layout.slotY(i) - pitch) < 1e-9);
  assert.ok(Math.abs(layout.top + layout.bottom) < 1e-9);
  assert.ok(layout.headerY > layout.slotY(0));
});

test('featured windows follow each other and end before the transition', () => {
  const windows = featuredWindows(assignSlots(PLUGINS));
  assert.equal(windows.length, PLUGINS.filter((p) => p.featured).length);
  assert.equal(windows[0].start, TIMELINE.pluginsStart);
  for (let i = 1; i < windows.length; i++) assert.ok(Math.abs(windows[i].start - windows[i - 1].end) < 1e-9);
  assert.ok(windows[windows.length - 1].end <= TIMELINE.transition[0]);
});

test('any number of featured plugins fits before the transition', () => {
  for (const count of [0, 1, 3, 8, 12]) {
    const plugins = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, tag: 't', desc: 'd', featured: i < count }));
    const windows = featuredWindows(assignSlots(plugins));
    assert.equal(windows.length, count);
    if (count) assert.ok(windows[count - 1].end <= TIMELINE.transition[0] + 1e-9, `${count} featured`);
    for (let i = 1; i < count; i++) assert.ok(windows[i].start >= windows[i - 1].end - 1e-9);
  }
});

test('activeWindow reports the window and how far through it we are', () => {
  const windows = featuredWindows(assignSlots(PLUGINS));
  const w = windows[2];
  const hit = activeWindow(w.start + (w.end - w.start) / 4, windows);
  assert.equal(hit.index, 2);
  assert.ok(Math.abs(hit.local - 0.25) < 1e-9);
  assert.equal(activeWindow(TIMELINE.pluginsStart - 0.01, windows), null);
});

test('story blocks are in scroll order and never overlap', () => {
  const slots = assignSlots(PLUGINS);
  const story = buildStory(slots, featuredWindows(slots));
  for (let i = 1; i < story.length; i++) {
    assert.ok(story[i].range[0] >= story[i - 1].range[1], `${story[i - 1].id} overlaps ${story[i].id}`);
  }
  const cards = story.filter((s) => s.plugin);
  assert.equal(cards.length, PLUGINS.filter((p) => p.featured).length);
});
