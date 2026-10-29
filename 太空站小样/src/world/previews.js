// Canvas-drawn textures for the plugin server: blade faceplates, the header unit
// and placeholder previews. A real screenshot replaces a placeholder when it is
// saved as src/assets/previews/<plugin id>.webp (or .png / .jpg).
import { CanvasTexture, SRGBColorSpace, TextureLoader } from 'three';
import { FONT_FAMILIES } from '../core/loader.js';
import { SERVER_TEXT } from '../content.js';

const REAL_PREVIEWS = import.meta.glob('../assets/previews/*.{webp,png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const TITLE = `"${FONT_FAMILIES.title}"`;
const MONO = `"${FONT_FAMILIES.mono}", ${TITLE}`;

// Where on the faceplate (fraction of its width) the status LED sits. The left
// handle covers roughly 0.02–0.045, so everything starts to the right of it.
export const LED_X = 0.07;

function canvas2d(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function brushedMetal(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#20262f');
  gradient.addColorStop(1, '#12161c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < height * 1.2; i++) {
    ctx.fillRect(Math.random() * width, Math.random() * height, 40 + Math.random() * 160, 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.fillRect(0, 0, width, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, height - 2, width, 2);
}

const slotCode = (slot) => String(slot + 1).padStart(2, '0');

export function faceplateTexture(plugin, slot) {
  const [canvas, ctx] = canvas2d(1024, 148);
  brushedMetal(ctx, 1024, 148);

  // LED socket (the glowing LED itself is a small mesh on top of this).
  ctx.fillStyle = '#07090c';
  ctx.beginPath();
  ctx.arc(LED_X * 1024, 74, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffb15c';
  ctx.font = `700 30px ${MONO}`;
  ctx.fillText(slotCode(slot), 96, 76);

  ctx.fillStyle = plugin.accent;
  ctx.fillRect(146, 30, 6, 88);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e8f1ff';
  ctx.font = `400 58px ${TITLE}`;
  ctx.fillText(plugin.name, 172, 86);
  ctx.fillStyle = '#8da2bf';
  ctx.font = `400 22px ${MONO}`;
  ctx.fillText(`PLG-${slotCode(slot)} · ${plugin.tag}`, 174, 124);

  ctx.fillStyle = '#07090c';
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.roundRect(704 + i * 16, 34, 8, 80, 4);
    ctx.fill();
  }
  return toTexture(canvas);
}

export function headerTexture(total) {
  const [canvas, ctx] = canvas2d(1024, 280);
  brushedMetal(ctx, 1024, 280);
  ctx.fillStyle = '#ffb15c';
  ctx.fillRect(0, 0, 1024, 4);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffb15c';
  ctx.font = `700 44px ${MONO}`;
  ctx.fillText(SERVER_TEXT.header, 40, 96);
  ctx.fillStyle = '#8da2bf';
  ctx.font = `400 26px ${MONO}`;
  ctx.fillText(`${total} PLUGINS · ${SERVER_TEXT.status}`, 42, 146);

  // Decorative activity bars.
  for (let i = 0; i < 28; i++) {
    const h = 20 + Math.random() * 70;
    ctx.fillStyle = i % 7 === 3 ? '#ffb15c' : 'rgba(89,225,255,0.75)';
    ctx.fillRect(600 + i * 13, 230 - h, 7, h);
  }
  ctx.fillStyle = 'rgba(141,162,191,0.4)';
  ctx.fillRect(40, 196, 520, 2);
  return toTexture(canvas);
}

function darken(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * factor));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function placeholderPreview(plugin) {
  const [canvas, ctx] = canvas2d(768, 432);
  const gradient = ctx.createLinearGradient(0, 0, 768, 432);
  gradient.addColorStop(0, darken(plugin.accent, 0.5));
  gradient.addColorStop(1, '#0a0d14');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 768, 432);

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 768; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 432);
    ctx.stroke();
  }
  for (let y = 0; y <= 432; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(768, y);
    ctx.stroke();
  }
  ctx.strokeStyle = plugin.accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  for (const [x, y, r] of [[620, 90, 120], [120, 360, 90], [690, 380, 50]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${plugin.name.length > 5 ? 84 : 104}px ${TITLE}`;
  ctx.fillText(plugin.name, 384, 218);

  ctx.font = `400 26px ${MONO}`;
  const tagWidth = ctx.measureText(plugin.tag).width + 40;
  ctx.strokeStyle = plugin.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(384 - tagWidth / 2, 252, tagWidth, 44, 22);
  ctx.stroke();
  ctx.fillStyle = plugin.accent;
  ctx.fillText(plugin.tag, 384, 283);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(232,241,255,0.55)';
  ctx.font = `400 20px ${MONO}`;
  ctx.fillText(SERVER_TEXT.preview, 744, 412);
  return toTexture(canvas);
}

export function previewTexture(plugin) {
  const key = Object.keys(REAL_PREVIEWS).find((path) => path.split('/').pop().replace(/\.\w+$/, '') === plugin.id);
  if (!key) return placeholderPreview(plugin);
  const texture = new TextureLoader().load(REAL_PREVIEWS[key]);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
