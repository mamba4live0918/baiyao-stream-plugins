// Scene layout, timeline and palette. Progress values are scroll fractions (0..1).

export const SCROLL_PAGES = 12; // page height in viewport heights

export const TIMELINE = {
  unfold: [0.12, 0.27], // exploded view: pieces separate, bolts fire
  ring: [0.24, 0.35], // pieces move out to a slowly turning ring
  ghostFade: [0.24, 0.31],
  rackReveal: [0.27, 0.36], // server rack scans in from the bottom
  pluginsStart: 0.385, // first featured plugin window
  pluginsEnd: 0.793, // featured windows share [pluginsStart, pluginsEnd]
  maxPluginWindow: 0.09, // ...but a few plugins do not stretch longer than this each
  transition: [0.8, 0.86], // signal lost -> community screen
  screenBoot: [0.84, 0.9],
  particles: [0.93, 0.995],
};

export const STATION_SIZE = 12; // largest dimension of the station, in scene units

export const RING = {
  radius: 15,
  spread: 3, // radial jitter
  height: 2.4, // vertical jitter
  turn: 2.2, // radians the ring turns per unit of scroll progress
};

export const EARTH = {
  radius: 95,
  center: [0, -118, -30],
};

// From the right and slightly towards the opening camera, so the station is
// side-lit and the Earth shows a terminator.
export const SUN_DIRECTION = [0.85, 0.35, 0.3];

// The community screen floats away from the station; camera B films it.
export const SCREEN = {
  center: [0, -6, -70],
  width: 16,
  height: 9,
};

// Particles that form the closing "白曜", just above the screen.
export const PARTICLES = {
  center: [0, 2.6, -68],
  width: 9,
  count: 6000,
};

// Palette. HUD colours are display (sRGB) values; scene colours are linear multipliers.
export const COLORS = {
  void: '#04060b',
  ice: '#e8f1ff',
  amber: '#ffb15c',
  cyan: '#59e1ff',
  dim: '#8da2bf',
};

export const MAX_PIXEL_RATIO = 1.5;
