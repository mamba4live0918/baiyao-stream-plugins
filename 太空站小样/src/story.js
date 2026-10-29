// Pure layout of the plugin server and the scroll story (no three.js, testable).
import { PLUGIN_LABEL, PLUGINS, SECTIONS } from './content.js';
import { TIMELINE } from './config.js';

export const RACK = {
  slotHeight: 0.32,
  gap: 0.035,
  width: 2.3,
  depth: 1.5,
  headerHeight: 0.6,
  drawerTravel: 1.25, // how far a featured blade slides out
};

// Featured plugins are spread evenly down the rack so the camera travels its
// full height; the others fill the remaining slots in list order.
export function assignSlots(plugins) {
  const count = plugins.length;
  const featured = plugins.filter((p) => p.featured);
  const others = plugins.filter((p) => !p.featured);
  const slots = new Array(count).fill(null);
  featured.forEach((plugin, k) => {
    let slot = featured.length === 1 ? 0 : Math.round((k * (count - 1)) / (featured.length - 1));
    while (slots[slot]) slot++;
    slots[slot] = plugin;
  });
  let next = 0;
  for (let slot = 0; slot < count; slot++) if (!slots[slot]) slots[slot] = others[next++];
  return slots;
}

// Vertical layout of the rack, centred on y = 0, header unit on top.
export function rackLayout(count) {
  const pitch = RACK.slotHeight + RACK.gap;
  const height = RACK.headerHeight + RACK.gap + count * pitch;
  const top = height / 2;
  return {
    height,
    top,
    bottom: -top,
    headerY: top - RACK.headerHeight / 2,
    slotY: (slot) => top - RACK.headerHeight - RACK.gap - slot * pitch - RACK.slotHeight / 2,
  };
}

// One scroll window per featured plugin, in rack order (top to bottom). Any
// number of featured plugins shares the same stretch of scroll.
export function featuredWindows(slots) {
  const featured = [];
  slots.forEach((plugin, slot) => {
    if (plugin.featured) featured.push({ plugin, slot });
  });
  if (!featured.length) return [];
  const span = TIMELINE.pluginsEnd - TIMELINE.pluginsStart;
  const size = Math.min(TIMELINE.maxPluginWindow, span / featured.length);
  return featured.map((entry, order) => {
    const start = TIMELINE.pluginsStart + order * size;
    const end = start + size;
    return { ...entry, order, start, end, mid: (start + end) / 2 };
  });
}

// Which featured window p is in, and how far through it (0..1).
export function activeWindow(p, windows) {
  const index = windows.findIndex((w) => p >= w.start && p < w.end);
  if (index < 0) return null;
  const w = windows[index];
  return { index, local: (p - w.start) / (w.end - w.start) };
}

// The HUD story: fixed sections plus one card per featured plugin.
export function buildStory(slots, windows) {
  const cards = windows.map((w) => ({
    id: `plugin-${w.plugin.id}`,
    short: '',
    range: [w.start + 0.004, w.end - 0.004],
    label: PLUGIN_LABEL(w.slot, slots.length, w.plugin.tag),
    title: w.plugin.name,
    body: w.plugin.desc,
    plugin: w.plugin,
  }));
  const before = SECTIONS.filter((s) => s.range[0] < TIMELINE.pluginsStart);
  const after = SECTIONS.filter((s) => s.range[0] >= TIMELINE.pluginsStart);
  return [...before, ...cards, ...after];
}

export const SLOTS = assignSlots(PLUGINS);
export const WINDOWS = featuredWindows(SLOTS);
export const STORY = buildStory(SLOTS, WINDOWS);
