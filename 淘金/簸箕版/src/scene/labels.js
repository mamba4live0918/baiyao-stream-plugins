/* 淘金 3D · 名字牌：画在画布上的圆角小牌子，做成始终朝向镜头的精灵。名字完整显示，太长就缩小字号 */
import * as THREE from 'three';
import { cvs } from '../util.js';

const FONT = '"TJRound","Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';

export function makeLabel(text, o = {}) {
  const H = 96;
  const c0 = cvs(8, 8).getContext('2d');
  let size = 50;
  c0.font = `700 ${size}px ${FONT}`;
  const maxW = 820;
  while (c0.measureText(text).width > maxW && size > 26) {
    size -= 2;
    c0.font = `700 ${size}px ${FONT}`;
  }
  const badge = o.badge || '';
  const textW = Math.min(maxW, c0.measureText(text).width);
  const badgeW = badge ? 74 : 0;
  const W = Math.ceil(textW + badgeW + 56);
  const c = cvs(W, H);
  const g = c.getContext('2d');
  const r = H / 2 - 6;
  g.beginPath();
  g.roundRect(4, 6, W - 8, H - 12, r);
  g.fillStyle = o.bg || 'rgba(255,248,232,.96)';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = o.border || '#d99a48';
  g.stroke();
  if (badge) {
    g.fillStyle = o.badgeBg || '#d99a48';
    g.beginPath();
    g.arc(4 + r + 4, H / 2, r - 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `800 36px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(badge, 4 + r + 4, H / 2 + 2);
  }
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = o.fg || '#6a3a12';
  g.fillText(text, 28 + badgeW, H / 2 + 2, maxW);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  const h = o.height || 0.34;
  s.scale.set((h * W) / H, h, 1);
  s.renderOrder = 10;
  s.userData.dispose = () => {
    t.dispose();
    mat.dispose();
  };
  return s;
}

export function disposeLabel(s) {
  if (s && s.userData.dispose) s.userData.dispose();
}
