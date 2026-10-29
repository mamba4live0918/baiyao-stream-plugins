// 特效粒子：挖下来的块、碎片、糖果、火星、烟、光圈、飘字。都有寿命，没有特效时整个画面停下来不画。
const TAU = Math.PI * 2;

export function createFx() {
  const list = [];

  /**
   * kind：'img'（图块：块、碎片、糖、烟）、'spark'（亮点）、'ring'（光圈）、'flash'（一团光）、'text'（飘字）
   * 通用：x y vx vy g（重力）life（秒）；img：sprite w h rot vr alpha grow fade floor bounce；text：text size color
   */
  function add(p) {
    list.push({ t: 0, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, alpha: 1, grow: 0, fade: 0.35, life: 1, ...p });
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      if (p.t >= p.life) { list.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.floor !== undefined && p.y > p.floor) {
        p.y = p.floor;
        if (Math.abs(p.vy) > 60 * (p.u || 1)) { p.vy *= -(p.bounce ?? 0.35); p.vx *= 0.7; p.vr *= 0.6; }
        else { p.vy = 0; p.vx *= 0.85; p.vr *= 0.8; }
      }
    }
    return list.length;
  }

  function draw(g) {
    for (const p of list) {
      const k = p.t / p.life, fade = k > 1 - p.fade ? (1 - k) / p.fade : 1;
      const a = p.alpha * Math.max(0, Math.min(1, p.fadeIn ? Math.min(fade, p.t / p.fadeIn) : fade));
      if (a <= 0.003) continue;
      g.save();
      g.globalAlpha = a;
      if (p.kind === 'img' && p.sprite) {
        const s = 1 + p.grow * k;
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.drawImage(p.sprite, -p.w * s / 2, -p.h * s / 2, p.w * s, p.h * s);
      } else if (p.kind === 'spark') {
        g.globalCompositeOperation = 'lighter';
        const r = p.r * (1 - k * 0.6);
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, p.core || 'rgba(255,250,215,1)');
        gr.addColorStop(0.4, p.color || 'rgba(255,190,70,.8)');
        gr.addColorStop(1, 'rgba(255,140,30,0)');
        g.fillStyle = gr;
        g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.kind === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) ** 2);
        g.strokeStyle = p.color || '#FFE08A';
        g.lineWidth = p.width * (1 - k);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, TAU);
        g.stroke();
      } else if (p.kind === 'flash') {
        g.globalCompositeOperation = 'lighter';
        const r = p.r * (0.6 + 0.4 * k);
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, p.core || 'rgba(255,245,200,.95)');
        gr.addColorStop(0.35, p.color || 'rgba(255,190,80,.55)');
        gr.addColorStop(1, 'rgba(255,140,40,0)');
        g.fillStyle = gr;
        g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.kind === 'text') {
        const s = p.pop ? Math.min(1, 0.6 + p.t * 6) : 1;
        g.translate(p.x, p.y);
        g.scale(s, s);
        g.font = `900 ${Math.round(p.size)}px "Microsoft YaHei","PingFang SC",sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = Math.max(3, p.size * 0.22);
        g.strokeStyle = p.stroke || '#4A2410';
        g.strokeText(p.text, 0, 0);
        g.fillStyle = p.color || '#FFE9A8';
        g.fillText(p.text, 0, 0);
      }
      g.restore();
    }
  }

  return { add, update, draw, get count() { return list.length; }, clear: () => { list.length = 0; } };
}
