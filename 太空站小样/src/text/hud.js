// Mission-control overlay drawn in WebGL: mission ID, live telemetry, the story
// block for the current part of the scroll, a hover card for rack blades, an
// orbit progress rail and the signal-loss card.
import { BufferAttribute, BufferGeometry, LineSegments, OrthographicCamera, Scene, ShaderMaterial, Vector3 } from 'three';
import { SdfText } from './sdfText.js';
import { CREDITS, HOVER_HINT, MISSION, PLUGIN_LABEL, SCRAMBLE_CHARS, TELEMETRY_LABELS, TRANSITION_TEXT } from '../content.js';
import { COLORS } from '../config.js';
import { clamp, smoothstep } from '../core/math.js';

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const ICE = rgb(COLORS.ice);
const AMBER = rgb(COLORS.amber);
const DIM = rgb(COLORS.dim);

const LINE_VS = /* glsl */ `
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const LINE_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() { gl_FragColor = vec4(uColor, uOpacity); }
`;

function lineMaterial(color, opacity) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Vector3(...color) }, uOpacity: { value: opacity } },
    vertexShader: LINE_VS,
    fragmentShader: LINE_FS,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

// Moves value towards target at a constant rate (units per second).
const approach = (value, target, rate, dt) =>
  value < target ? Math.min(target, value + rate * dt) : Math.max(target, value - rate * dt);

export function createHud(atlas, { story, slots, reduceMotion }) {
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 1, 0, -10, 10);
  const add = (options, text) => {
    const t = new SdfText(atlas, { scramble: SCRAMBLE_CHARS, ...options });
    t.setText(text);
    scene.add(t);
    return t;
  };

  const missionCode = add({ font: 'monoBold', size: 12, color: AMBER, letterSpacing: 0.22 }, MISSION.code);
  const missionName = add({ font: 'title', size: 15, color: ICE }, MISSION.name);
  missionName.opacity = 0.72;

  const telemetry = ['altitude', 'velocity', 'plugins', 'clock'].map((key) => ({
    key,
    label: add({ font: 'mono', size: 12, color: DIM, letterSpacing: 0.08 }, TELEMETRY_LABELS[key]),
    value: add({ font: 'mono', size: 12, color: ICE, align: 'right', letterSpacing: 0.06 }, ''),
  }));

  const blocks = story.map((section) => {
    const block = {
      section,
      label: add({ font: 'monoBold', size: 12, color: section.plugin ? rgb(section.plugin.accent) : AMBER, letterSpacing: 0.2 }, section.label),
      title: add({ font: 'title', size: 72, color: ICE, lineHeight: 1.1 }, section.title),
      body: add({ font: 'title', size: 19, color: ICE }, section.body),
      reveal: 0,
      target: 0,
      glitch: 0,
    };
    block.body.opacity = 0.8;
    for (const t of [block.label, block.title, block.body]) {
      t.reveal = 0;
      t.visible = false;
    }
    return block;
  });

  // Hover card for rack blades: left middle, which is empty sky in every rack
  // shot (the rack sits right of centre, the story block bottom-left). Desktop only.
  const hover = {
    label: add({ font: 'monoBold', size: 12, color: AMBER, letterSpacing: 0.18 }, ''),
    title: add({ font: 'title', size: 32, color: ICE }, ''),
    body: add({ font: 'title', size: 16, color: ICE, maxChars: 64 }, ''),
    hint: add({ font: 'mono', size: 11, color: DIM, letterSpacing: 0.12 }, ''),
    slot: -1,
    reveal: 0,
  };

  const signalTitle = add({ font: 'title', size: 56, color: ICE, align: 'center' }, TRANSITION_TEXT.title);
  const signalSub = add({ font: 'mono', size: 12, color: AMBER, align: 'center', letterSpacing: 0.16 }, TRANSITION_TEXT.sub);
  const credits = add(
    { font: 'mono', size: 11, color: ICE, align: 'right', lineHeight: 1.75, maxChars: 240, halo: 1 },
    CREDITS.join('\n'),
  );
  const hint = add({ font: 'title', size: 15, color: ICE, align: 'center' }, MISSION.scrollHint);
  const railSections = story.filter((s) => s.short);
  const railLabels = railSections.map((s) => add({ font: 'title', size: 13, color: DIM, align: 'right' }, s.short));
  credits.reveal = 0;

  const rail = new LineSegments(new BufferGeometry(), lineMaterial(DIM, 0.45));
  const marker = new LineSegments(new BufferGeometry(), lineMaterial(AMBER, 1));
  marker.geometry.setAttribute('position', new BufferAttribute(new Float32Array([-8, 0, 0, 8, 0, 0]), 3));
  const hintLine = new LineSegments(new BufferGeometry(), lineMaterial(ICE, 0.6));
  hintLine.geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, -26, 0]), 3));
  scene.add(rail, marker, hintLine);

  const state = { width: 1, height: 1, railTop: 0, railBottom: 0, small: false, intro: 0, creditsReveal: 0 };

  function layoutHover() {
    const x = clamp(state.width * 0.035, 18, 56) + 2;
    let y = state.height * 0.66;
    hover.label.position.set(x, y, 0);
    y -= hover.label.height + 8;
    hover.title.position.set(x, y, 0);
    y -= hover.title.height + 4;
    hover.body.position.set(x, y, 0);
    y -= hover.body.height + 6;
    hover.hint.position.set(x, y, 0);
  }

  function resize(width, height) {
    state.width = width;
    state.height = height;
    camera.right = width;
    camera.top = height;
    camera.updateProjectionMatrix();

    const m = clamp(width * 0.035, 18, 56);
    const titleSize = clamp(Math.min(width * 0.06, height * 0.11), 34, 104);
    const bodySize = clamp(titleSize * 0.26, 15, 21);
    state.small = width < 720;

    missionCode.position.set(m, height - m, 0);
    missionName.position.set(m, height - m - 22, 0);

    const column = state.small ? 150 : 200;
    telemetry.forEach((t, i) => {
      const y = height - m - i * 20;
      t.label.position.set(width - m - column, y, 0);
      t.value.position.set(width - m, y, 0);
    });

    for (const b of blocks) {
      b.title.setSize(b.section.plugin ? titleSize * 0.82 : titleSize);
      b.body.setSize(bodySize);
      let y = m;
      if (b.section.body) {
        y += b.body.height;
        b.body.position.set(m + 2, y, 0);
        y += 14;
      }
      y += b.title.height;
      b.title.position.set(m, y, 0);
      y += 12 + b.label.height;
      b.label.position.set(m + 2, y, 0);
    }

    signalTitle.position.set(width / 2, height / 2 + 44, 0);
    signalSub.position.set(width / 2, height / 2 - 24, 0);

    // Credits sit bottom-right beside the closing title when there is room for
    // both (measured), otherwise left-aligned above it.
    const closing = blocks[blocks.length - 1];
    credits.setSize(state.small ? 9.5 : 11);
    const fitsBeside = !state.small && m + closing.title.width + 32 + credits.width <= width - m;
    if (fitsBeside) {
      credits.setAlign('right');
      credits.position.set(width - m, m + credits.height, 0);
    } else {
      credits.setAlign('left');
      credits.position.set(m + 2, closing.label.position.y + 16 + credits.height, 0);
    }

    hint.position.set(width / 2, m + 64, 0);
    hintLine.position.set(width / 2, m + 36, 0);

    const railX = width - m * 0.7;
    state.railTop = height * 0.66;
    state.railBottom = height * 0.34;
    const span = state.railTop - state.railBottom;
    const points = [railX, state.railTop, 0, railX, state.railBottom, 0];
    railSections.forEach((s, i) => {
      const y = state.railTop - Math.max(0, s.range[0]) * span;
      points.push(railX - 5, y, 0, railX + 5, y, 0);
      railLabels[i].position.set(railX - 12, y + 9, 0);
    });
    rail.geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
    marker.position.x = railX;
    layoutHover();
  }

  function updateHover(info, time, dt, glitchScale) {
    // The drawer that is already out has its own story card; no duplicate.
    const wanted = !state.small && info.hover && info.hover.slot !== info.activeSlot ? info.hover : null;
    if (wanted && wanted.slot !== hover.slot) {
      hover.slot = wanted.slot;
      const plugin = wanted.plugin;
      hover.label.setColor(rgb(plugin.accent));
      hover.label.setText(PLUGIN_LABEL(wanted.slot, slots.length, plugin.tag));
      hover.title.setText(plugin.name);
      hover.body.setText(plugin.desc);
      hover.hint.setText(plugin.featured ? HOVER_HINT : '');
      hover.reveal = 0;
      layoutHover();
    }
    hover.reveal = approach(hover.reveal, wanted ? 1 : 0, wanted ? 3 : 4, dt);
    if (hover.reveal === 0) hover.slot = -1;
    const parts = [hover.label, hover.title, hover.body, hover.hint];
    parts.forEach((t, i) => {
      t.reveal = clamp(hover.reveal * 1.4 - i * 0.12);
      t.visible = hover.reveal > 0;
      t.glitch = glitchScale * (1 - hover.reveal) * 0.6;
      t.update(time);
    });
  }

  function update(p, time, dt, info) {
    state.intro = Math.min(1, state.intro + dt * 0.8);
    missionCode.reveal = state.intro;
    missionName.reveal = clamp(state.intro * 1.3 - 0.3);
    missionCode.update(time);
    missionName.update(time);

    const values = {
      altitude: `${info.altitude.toFixed(1)} KM`,
      velocity: `${info.velocity.toFixed(2)} KM/S`,
      plugins: info.plugins,
      clock: info.clock,
    };
    for (const t of telemetry) {
      t.value.setText(values[t.key]);
      t.label.reveal = state.intro;
      t.value.reveal = state.intro;
      t.label.update(time);
      t.value.update(time);
    }

    const glitchScale = reduceMotion ? 0.3 : 1;
    const active = story.findIndex((s) => p >= s.range[0] && p < s.range[1]);
    blocks.forEach((b, i) => {
      const target = i === active ? 1 : 0;
      if (target !== b.target) {
        b.target = target;
        b.glitch = 1;
      }
      b.reveal = approach(b.reveal, target, target ? 0.85 : 2.8, dt);
      b.glitch = Math.max(0, b.glitch - dt * 2.2);
      const g = glitchScale * b.glitch * b.glitch;
      // Staggered, but every line must reach exactly 1 when the block is fully shown.
      b.label.reveal = clamp(b.reveal * 1.6);
      b.title.reveal = clamp((b.reveal - 0.12) / 0.8);
      b.body.reveal = clamp((b.reveal - 0.25) / 0.7);
      for (const t of [b.label, b.title, b.body]) {
        t.glitch = g;
        t.visible = b.reveal > 0;
        t.update(time);
      }
    });

    updateHover(info, time, dt, glitchScale);

    const peak = info.transitionPeak;
    const showSignal = smoothstep(0.3, 0.7, peak);
    const flicker = 0.6 + 0.4 * Math.random();
    signalTitle.visible = signalSub.visible = showSignal > 0.01;
    signalTitle.opacity = showSignal * flicker;
    signalSub.opacity = showSignal;
    signalTitle.glitch = glitchScale * (0.5 + 0.5 * peak);
    signalSub.glitch = glitchScale * 0.4;
    signalTitle.update(time);
    signalSub.update(time);

    state.creditsReveal = approach(state.creditsReveal, p > 0.95 ? 1 : 0, 0.7, dt);
    credits.reveal = state.creditsReveal;
    credits.opacity = 0.78;
    credits.visible = state.creditsReveal > 0;
    credits.update(time);

    // On narrow screens the hint would sit on the title; the first section's copy
    // already says to scroll.
    const hintOpacity = state.small ? 0 : (1 - smoothstep(0.01, 0.05, p)) * state.intro;
    hint.visible = hintLine.visible = hintOpacity > 0.01;
    hint.opacity = hintOpacity * (0.65 + 0.35 * Math.sin(time * 2.5));
    hintLine.material.uniforms.uOpacity.value = hintOpacity * 0.6;
    hintLine.scale.y = 0.4 + 0.6 * ((time * 0.8) % 1);

    const railVisible = !state.small;
    rail.visible = marker.visible = railVisible;
    marker.position.y = state.railTop - p * (state.railTop - state.railBottom);
    let currentRail = -1;
    railSections.forEach((s, i) => {
      if (p >= s.range[0]) currentRail = i;
    });
    railLabels.forEach((label, i) => {
      label.visible = railVisible;
      label.setColor(i === currentRail ? ICE : DIM);
      label.opacity = (i === currentRail ? 1 : 0.6) * state.intro;
    });
  }

  return { scene, camera, resize, update };
}
