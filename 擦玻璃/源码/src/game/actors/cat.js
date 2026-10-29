/* 猫猫：沿用原来的 12 帧猫立绘，从左边或右边走过，每一步在玻璃上留一个泥脚印（第一个脚印挂名字）。
   走的那条线避开露脸区。点它一下：吓一跳、"喵！"、跳一下然后加速跑掉，后面不再留脚印。 */
import * as THREE from 'three';
import catURL from '../../../assets/cat-walk.webp';
import { LAYER } from '../../glass/stage.js';
import { createSprite } from '../../glass/sprites.js';
import { artPaw } from '../../art/stains-art.js';
import { canvas } from '../../art/ink.js';
import { rng, rand, clamp, pick } from '../../util.js';

const FRAMES = 12;
let catImg = null;
function catImage() {
  if (!catImg) {
    catImg = new Image();
    catImg.src = catURL;
  }
  return catImg;
}
catImage();

function shadowArt(w, h) {
  const { c, g } = canvas(w, h);
  const gr = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(40,30,30,.32)');
  gr.addColorStop(1, 'rgba(40,30,30,0)');
  g.fillStyle = gr;
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(1, h / w);
  g.beginPath();
  g.arc(0, 0, w / 2, 0, Math.PI * 2);
  g.restore();
  g.fill();
  return { canvas: c, w, h };
}

/* 找一条横穿画面、不碰露脸区的高度 */
function pathY(game, S) {
  const { stage } = game.ctx;
  const z = stage.zone;
  const ok = [];
  for (let k = 0.16; k <= 0.9; k += 0.02) {
    const y = k * stage.H;
    if (!z || y + S * 0.5 < z.cy - z.hh - z.feather || y - S * 0.5 > z.cy + z.hh + z.feather) ok.push(y);
  }
  return ok.length ? pick(ok) : stage.H * 0.84;
}

export function createCat(game, { owner, paws, speed }) {
  const { stage, audio, glare, hud, particles } = game.ctx;
  const u = stage.unit;
  const S = 250 * u;
  const dir = Math.random() < 0.5 ? 1 : -1;
  let x = dir > 0 ? -S * 0.6 : stage.W + S * 0.6;
  const y0 = pathY(game, S);
  const img = catImage();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.NoColorSpace;
  tex.repeat.set(1 / FRAMES, 1);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  if (img.complete) tex.needsUpdate = true;
  else img.addEventListener('load', () => (tex.needsUpdate = true), { once: true });
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S, S), material);
  mesh.renderOrder = LAYER.ACTOR + 10;
  stage.scene.add(mesh);
  const sh = shadowArt(S * 0.8, S * 0.22);
  const shadow = createSprite(stage, sh.canvas, sh.w, sh.h, LAYER.ACTOR + 9);
  const tag = game.ctx.labels.add(`@${owner.name} 的猫`, '');
  let t = 0;
  let v = (speed ?? 1) * 230 * u;
  let scared = 0;
  let stepT = 0.18;
  let alt = 1;
  let left = Math.round(paws);
  let first = true;
  let hop = 0;
  audio.meow();

  return {
    kind: 'cat',
    owner,
    get at() {
      return { x, y: y0 };
    },
    hit(px, py) {
      if (scared) return null;
      if (Math.abs(px - x) > S * 0.4 || Math.abs(py - y0) > S * 0.4) return null;
      return {
        click() {
          scared = 1;
          v *= 3.2;
          hop = 1;
          audio.meow();
          audio.knock();
          glare.tap(px, py);
          particles.sparkle(x, y0 - S * 0.3, 4, 40);
          hud.toast(`白曜把 @${owner.name} 的猫吓跑了`, 'catch');
        }
      };
    },
    update(dt) {
      t += dt;
      x += dir * v * dt;
      hop = Math.max(0, hop - dt * 3);
      const bob = Math.sin(t * 13) * 3 * u;
      const lift = Math.sin((1 - hop) * Math.PI) * hop * 60 * u;
      const y = y0 + bob - lift;
      tex.offset.x = (Math.floor(t * (scared ? 24 : 13)) % FRAMES) / FRAMES;
      mesh.position.set(x, stage.H - y, 0);
      mesh.scale.set(dir, 1, 1);
      shadow.set(x, y0 + S * 0.44, 0, 1 - lift / (120 * u), 0.9);
      tag.set(x, y0 - S * 0.56, scared ? 0 : 1);
      /* 一步一个泥脚印（吓跑以后不再留） */
      stepT -= dt;
      if (!scared && left > 0 && stepT <= 0) {
        stepT = 0.3;
        alt = -alt;
        const px = x - dir * S * 0.12;
        const py = y0 + S * 0.36 + alt * S * 0.06;
        if (px > 20 * u && px < stage.W - 20 * u && !game.inZone(px, py, 40 * u * game.messScale())) {
          left--;
          game.addStain({ kind: 'paw', label: '猫爪印', owner, tag: first, x: px, y: py, rot: (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + rand(-0.2, 0.2), art: artPaw(rng((Math.random() * 1e9) | 0), 62 * u * game.messScale(), u, Math.min(2, stage.dpr)), toughness: 1, opacity: 0.9, smear: 0.4, pop: 0.08 });
          first = false;
          audio.tap();
        }
      }
      return dir > 0 ? x < stage.W + S * 0.7 : x > -S * 0.7;
    },
    dispose() {
      stage.scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      tex.dispose();
      shadow.dispose();
      tag.remove();
    }
  };
}

export { clamp };
