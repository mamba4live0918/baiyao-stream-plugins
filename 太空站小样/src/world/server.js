// The plugin server at the core of the station: a rack with one blade per plugin.
// It scans in from the bottom, featured blades slide out like drawers with a
// pop-up preview screen, and hovered blades nudge out with a cyan LED.
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight } from 'three';
import { activeWindow, RACK, rackLayout } from '../story.js';
import { TIMELINE } from '../config.js';
import { damp, easeInOutCubic, lerp, remap } from '../core/math.js';
import { faceplateTexture, headerTexture, LED_X, previewTexture } from './previews.js';

// World-space scan line: fragments above uRevealY are discarded and a cyan
// band glows just below it, so the rack builds up from the bottom.
function createReveal() {
  const uniforms = { uRevealY: { value: -100 }, uRevealGlow: { value: 0 } };
  const compile = (shader) => {
    shader.uniforms.uRevealY = uniforms.uRevealY;
    shader.uniforms.uRevealGlow = uniforms.uRevealGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRevealY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRevealY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRevealY;\nuniform float uRevealY;\nuniform float uRevealGlow;')
      .replace('void main() {', 'void main() {\n  if (vRevealY > uRevealY) discard;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(0.35, 0.9, 1.0) * 4.0 * smoothstep(0.18, 0.0, uRevealY - vRevealY) * uRevealGlow;',
      );
  };
  return { uniforms, compile };
}

const POPUP = { width: 1.6, height: 0.9 };

export function createServer({ slots, windows }) {
  const group = new Group();
  group.name = 'server';
  group.visible = false;
  const layout = rackLayout(slots.length);
  const reveal = createReveal();
  const standard = (params) => {
    const material = new MeshStandardMaterial(params);
    material.onBeforeCompile = reveal.compile;
    return material;
  };

  const W = RACK.width;
  const D = RACK.depth;
  const H = layout.height;
  const frame = standard({ color: 0x2a2f38, metalness: 0.85, roughness: 0.35 });
  const bodyMaterial = standard({ color: 0x1a1e25, metalness: 0.7, roughness: 0.45 });
  const handleMaterial = standard({ color: 0x8b94a3, metalness: 0.9, roughness: 0.25 });

  // Everything the pointer can hit. Blades and pop-ups carry their slot; the
  // frame carries -1 so it blocks blades behind it instead of picking them.
  const pickables = [];
  const blocker = (mesh) => {
    mesh.userData.slot = -1;
    pickables.push(mesh);
    return mesh;
  };

  const postGeometry = new BoxGeometry(0.09, H + 0.24, 0.09);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = blocker(new Mesh(postGeometry, frame));
      post.position.set(sx * (W / 2 + 0.06), 0, sz * (D / 2 - 0.04));
      group.add(post);
    }
  }
  const plateGeometry = new BoxGeometry(W + 0.3, 0.08, D + 0.06);
  for (const sy of [-1, 1]) {
    const plate = blocker(new Mesh(plateGeometry, frame));
    plate.position.y = sy * (H / 2 + 0.12);
    group.add(plate);
  }
  const back = blocker(
    new Mesh(
      new PlaneGeometry(W, H),
      standard({ color: 0x0b0e13, metalness: 0.2, roughness: 0.8, emissive: new Color(0.02, 0.06, 0.09) }),
    ),
  );
  back.position.z = -D / 2;
  group.add(back);

  const headerTex = headerTexture(slots.length);
  const header = new Group();
  header.position.y = layout.headerY;
  header.add(blocker(new Mesh(new BoxGeometry(W - 0.1, RACK.headerHeight, D), bodyMaterial)));
  const headerFace = blocker(
    new Mesh(
      new PlaneGeometry(W - 0.1, RACK.headerHeight),
      standard({ map: headerTex, emissiveMap: headerTex, emissive: new Color(1, 1, 1), emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.5 }),
    ),
  );
  headerFace.position.z = D / 2 + 0.002;
  header.add(headerFace);
  group.add(header);

  const faceGeometry = new PlaneGeometry(W - 0.1, RACK.slotHeight);
  const bodyGeometry = new BoxGeometry(W - 0.1, RACK.slotHeight, D);
  const handleGeometry = new BoxGeometry(0.05, RACK.slotHeight * 0.7, 0.05);
  const ledGeometry = new BoxGeometry(0.045, 0.045, 0.02);

  function makePopup(plugin, slot) {
    const pivot = new Group(); // hinge on the blade's top front edge
    const backing = new Mesh(new BoxGeometry(POPUP.width + 0.08, POPUP.height + 0.08, 0.03), frame);
    backing.position.set(0, POPUP.height / 2, -0.02);
    const screen = new Mesh(
      new PlaneGeometry(POPUP.width, POPUP.height),
      new MeshBasicMaterial({ map: previewTexture(plugin), color: new Color(0.95, 0.95, 0.95) }),
    );
    screen.position.set(0, POPUP.height / 2, 0.001);
    backing.userData.slot = slot;
    screen.userData.slot = slot;
    pickables.push(backing, screen);
    pivot.add(backing, screen);
    pivot.rotation.x = -Math.PI / 2; // folded flat on top of the blade
    pivot.visible = false;
    return pivot;
  }

  const blades = slots.map((plugin, slot) => {
    const blade = new Group();
    blade.position.y = layout.slotY(slot);
    const body = new Mesh(bodyGeometry, bodyMaterial);
    const faceTex = faceplateTexture(plugin, slot);
    const faceMaterial = standard({
      map: faceTex,
      emissiveMap: faceTex,
      emissive: new Color(1, 1, 1),
      emissiveIntensity: 0.3,
      metalness: 0.4,
      roughness: 0.5,
    });
    const face = new Mesh(faceGeometry, faceMaterial);
    face.position.z = D / 2 + 0.002;
    body.userData.slot = slot;
    face.userData.slot = slot;
    pickables.push(body, face);
    blade.add(body, face);
    for (const sx of [-1, 1]) {
      const handle = new Mesh(handleGeometry, handleMaterial);
      handle.position.set(sx * (W / 2 - 0.12), 0, D / 2 + 0.03);
      blade.add(handle);
    }
    const ledMaterial = new MeshBasicMaterial({ color: new Color(0.2, 1, 0.5) });
    ledMaterial.onBeforeCompile = reveal.compile; // LEDs appear with the scan line too
    const led = new Mesh(ledGeometry, ledMaterial);
    led.position.set(-(W - 0.1) / 2 + LED_X * (W - 0.1), 0, D / 2 + 0.012);
    blade.add(led);
    let popup = null;
    if (plugin.featured) {
      popup = makePopup(plugin, slot);
      popup.position.set(0, RACK.slotHeight / 2 + 0.005, D / 2 - 0.02);
      blade.add(popup);
    }
    group.add(blade);
    return { plugin, slot, blade, faceMaterial, ledMaterial, popup, nudge: 0, phase: Math.random() * 6.28, rate: 1.5 + Math.random() * 3 };
  });

  // Lights live outside the toggled group: a light appearing later would force
  // every lit material to recompile mid-scroll.
  const lights = new Group();
  lights.name = 'server-lights';
  const warm = new PointLight(0xffd2a0, 0, 14, 2);
  warm.position.set(3, 2.5, 4.5);
  const cool = new PointLight(0x59e1ff, 0, 12, 2);
  cool.position.set(-3.2, -1, 2.5);
  lights.add(warm, cool);

  let revealed = 0;

  return {
    group,
    lights,
    layout,

    // Rack slot under the ray, or -1. Only once the rack is fully built. The
    // raycaster ignores `visible`, so folded (hidden) pop-ups are skipped here.
    pick(raycaster) {
      if (!group.visible || revealed < 1) return -1;
      for (const hit of raycaster.intersectObjects(pickables, false)) {
        let shown = true;
        for (let o = hit.object; o; o = o.parent) shown = shown && o.visible;
        if (shown) return hit.object.userData.slot;
      }
      return -1;
    },

    update(p, time, dt, hoveredSlot) {
      revealed = easeInOutCubic(remap(p, TIMELINE.rackReveal[0], TIMELINE.rackReveal[1]));
      group.visible = p > TIMELINE.rackReveal[0] - 0.005;
      reveal.uniforms.uRevealY.value = lerp(layout.bottom - 0.3, layout.top + 0.35, revealed);
      reveal.uniforms.uRevealGlow.value = revealed > 0 && revealed < 1 ? 1 : 0;
      warm.intensity = 30 * revealed;
      cool.intensity = 22 * revealed;

      const active = activeWindow(p, windows);
      const activeSlot = active ? windows[active.index].slot : -1;
      for (const b of blades) {
        let out = 0;
        let unfold = 0;
        if (b.slot === activeSlot) {
          const l = active.local;
          out = easeInOutCubic(remap(l, 0.02, 0.22)) * (1 - easeInOutCubic(remap(l, 0.86, 0.99)));
          unfold = easeInOutCubic(remap(l, 0.14, 0.36)) * (1 - easeInOutCubic(remap(l, 0.8, 0.94)));
        }
        const hovered = hoveredSlot === b.slot;
        b.nudge = damp(b.nudge, hovered ? 0.14 : 0, 12, dt);
        b.blade.position.z = out * RACK.drawerTravel + b.nudge;
        if (b.popup) {
          b.popup.visible = unfold > 0.001;
          b.popup.rotation.x = lerp(-Math.PI / 2, -0.18, unfold);
        }

        const blink = 0.55 + 0.45 * Math.sin(time * b.rate + b.phase);
        if (b.slot === activeSlot) b.ledMaterial.color.setRGB(4.0, 2.2, 0.6);
        else if (hovered) b.ledMaterial.color.setRGB(0.8, 3.5, 4.0);
        else b.ledMaterial.color.setRGB(0.25 * blink, 1.6 * blink, 0.6 * blink);
        b.faceMaterial.emissiveIntensity = b.slot === activeSlot || hovered ? 0.6 : 0.3;
      }
    },
  };
}
