/* 万圣节砸砸乐试玩 · 占位素材（代码画的，正式版换成 Codex 画的图）
   每种素材画一次存成小图，播放时只是贴图，省 GPU。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { TAU, sprite } = HW.util;
  const OUT = 'rgba(70,32,12,.9)';

  function ellipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }

  // ---------- 南瓜灯：三种表情 ----------
  function pumpkin(face) {
    return sprite(220, 180, (g, W, H) => {
      const cx = W / 2, cy = H * 0.56, rx = W * 0.42, ry = H * 0.36;
      const rib = (dx, w, h, light) => {
        const gr = g.createRadialGradient(cx + dx - w * 0.3, cy - h * 0.35, 4, cx + dx, cy, Math.max(w, h) * 1.1);
        gr.addColorStop(0, light ? '#FFC46B' : '#FFB04A');
        gr.addColorStop(0.55, '#F58A22');
        gr.addColorStop(1, '#C0581A');
        g.fillStyle = gr;
        ellipse(g, cx + dx, cy, w, h);
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = OUT;
        g.stroke();
      };
      rib(-rx * 0.62, rx * 0.42, ry * 0.9);
      rib(rx * 0.62, rx * 0.42, ry * 0.9);
      rib(-rx * 0.3, rx * 0.46, ry * 0.97);
      rib(rx * 0.3, rx * 0.46, ry * 0.97);
      rib(0, rx * 0.44, ry, true);
      // 梗和小藤蔓
      g.fillStyle = '#5E7F32';
      g.strokeStyle = 'rgba(30,50,15,.9)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cx - 9, cy - ry + 6);
      g.quadraticCurveTo(cx - 6, cy - ry - 22, cx + 10, cy - ry - 30);
      g.lineTo(cx + 15, cy - ry - 22);
      g.quadraticCurveTo(cx + 4, cy - ry - 14, cx + 8, cy - ry + 6);
      g.closePath();
      g.fill(); g.stroke();
      g.strokeStyle = '#6E9A3C';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx + 6, cy - ry - 12);
      g.bezierCurveTo(cx + 34, cy - ry - 26, cx + 40, cy - ry + 2, cx + 26, cy - ry - 4);
      g.stroke();
      // 刻出来的脸：里面发光
      const glow = g.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, rx * 0.8);
      glow.addColorStop(0, '#FFF3A8');
      glow.addColorStop(0.5, '#FFD045');
      glow.addColorStop(1, '#FF9418');
      g.fillStyle = glow;
      g.strokeStyle = 'rgba(110,40,6,.95)';
      g.lineWidth = 2.5;
      g.beginPath();
      if (face === 0) {
        // 三角眼 + 锯齿笑
        g.moveTo(cx - 52, cy - 6); g.lineTo(cx - 34, cy - 34); g.lineTo(cx - 16, cy - 6); g.closePath();
        g.moveTo(cx + 16, cy - 6); g.lineTo(cx + 34, cy - 34); g.lineTo(cx + 52, cy - 6); g.closePath();
        g.moveTo(cx - 60, cy + 16);
        g.quadraticCurveTo(cx, cy + 62, cx + 60, cy + 16);
        g.lineTo(cx + 40, cy + 22); g.lineTo(cx + 30, cy + 12); g.lineTo(cx + 18, cy + 26); g.lineTo(cx + 6, cy + 14);
        g.lineTo(cx - 6, cy + 26); g.lineTo(cx - 18, cy + 14); g.lineTo(cx - 30, cy + 26); g.lineTo(cx - 40, cy + 14);
        g.closePath();
      } else if (face === 1) {
        // 圆眼 + 弯弯笑（可爱）
        g.ellipse(cx - 32, cy - 16, 14, 17, 0, 0, TAU);
        g.moveTo(cx + 46, cy - 16);
        g.ellipse(cx + 32, cy - 16, 14, 17, 0, 0, TAU);
        g.moveTo(cx - 34, cy + 18);
        g.quadraticCurveTo(cx, cy + 50, cx + 34, cy + 18);
        g.quadraticCurveTo(cx, cy + 32, cx - 34, cy + 18);
      } else {
        // 吃惊：圆眼 + O 嘴
        g.ellipse(cx - 32, cy - 14, 15, 15, 0, 0, TAU);
        g.moveTo(cx + 47, cy - 14);
        g.ellipse(cx + 32, cy - 14, 15, 15, 0, 0, TAU);
        g.moveTo(cx + 16, cy + 30);
        g.ellipse(cx, cy + 30, 16, 20, 0, 0, TAU);
      }
      g.fill('evenodd');
      g.stroke();
      if (face === 1) {
        g.fillStyle = 'rgba(255,120,120,.55)';
        ellipse(g, cx - 58, cy + 14, 12, 7); g.fill();
        ellipse(g, cx + 58, cy + 14, 12, 7); g.fill();
      }
      // 高光
      g.fillStyle = 'rgba(255,255,255,.35)';
      ellipse(g, cx - rx * 0.55, cy - ry * 0.45, 10, 18);
      g.fill();
    });
  }

  // ---------- 小幽灵：三种表情 ----------
  function ghost(face) {
    return sprite(150, 170, (g, W, H) => {
      const cx = W / 2, top = 18, bottom = H - 18, r = W * 0.36;
      g.beginPath();
      g.moveTo(cx - r, top + r);
      g.arc(cx, top + r, r, Math.PI, 0);
      g.lineTo(cx + r, bottom - 16);
      const bumps = 4, step = (2 * r) / bumps;
      for (let i = 0; i < bumps; i++) {
        const x0 = cx + r - i * step;
        g.quadraticCurveTo(x0 - step * 0.25, bottom + 8, x0 - step * 0.5, bottom - 10);
        g.quadraticCurveTo(x0 - step * 0.75, bottom - 26, x0 - step, bottom - 12);
      }
      g.closePath();
      const gr = g.createRadialGradient(cx - r * 0.3, top + r * 0.6, 4, cx, top + r * 1.3, r * 1.9);
      gr.addColorStop(0, '#FFFFFF');
      gr.addColorStop(0.7, '#F1EEFF');
      gr.addColorStop(1, '#D7D0F5');
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(120,105,180,.85)';
      g.stroke();
      // 小手
      g.fillStyle = '#F4F1FF';
      ellipse(g, cx - r - 6, top + r * 1.55, 12, 9); g.fill(); g.stroke();
      ellipse(g, cx + r + 6, top + r * 1.45, 12, 9); g.fill(); g.stroke();
      // 眼睛
      const ey = top + r * 0.95;
      g.fillStyle = '#2B2340';
      ellipse(g, cx - 17, ey, 8, 11); g.fill();
      ellipse(g, cx + 17, ey, 8, 11); g.fill();
      g.fillStyle = '#FFFFFF';
      ellipse(g, cx - 14, ey - 4, 3, 3.5); g.fill();
      ellipse(g, cx + 20, ey - 4, 3, 3.5); g.fill();
      g.fillStyle = 'rgba(255,130,170,.6)';
      ellipse(g, cx - 32, ey + 14, 9, 5); g.fill();
      ellipse(g, cx + 32, ey + 14, 9, 5); g.fill();
      g.fillStyle = '#2B2340';
      g.strokeStyle = '#2B2340';
      g.lineWidth = 3;
      g.lineCap = 'round';
      if (face === 0) { g.beginPath(); g.arc(cx, ey + 12, 8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      else if (face === 1) { ellipse(g, cx, ey + 20, 7, 9); g.fill(); }
      else {
        g.beginPath(); g.arc(cx, ey + 12, 8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        g.fillStyle = '#FF7FA8'; ellipse(g, cx + 3, ey + 22, 5, 6); g.fill();
      }
    });
  }

  // ---------- 药水瓶：颜色就是效果 ----------
  const POTIONS = {
    shrink: { color: '#A970FF', dark: '#6B3FC4', name: '缩小' },
    grow: { color: '#FF5C8A', dark: '#C42E5C', name: '变大' },
    green: { color: '#6FDB4F', dark: '#3E9E27', name: '变绿' },
    flip: { color: '#4FB3FF', dark: '#2275C4', name: '倒立' },
    fade: { color: '#F2D9FF', dark: '#B98AD6', name: '隐身' },
  };
  function potion(key) {
    const p = POTIONS[key];
    return sprite(110, 150, (g, W) => {
      const cx = W / 2, by = 96, r = 40;
      // 瓶子玻璃
      g.beginPath();
      g.moveTo(cx - 13, 30); g.lineTo(cx - 13, by - r + 8);
      g.arc(cx, by, r, -Math.PI / 2 - 1.24, -Math.PI / 2 + 1.24 + TAU, false);
      g.lineTo(cx + 13, 30); g.closePath();
      g.fillStyle = 'rgba(210,240,255,.45)'; g.fill();
      // 药水
      g.save(); g.clip();
      const lg = g.createLinearGradient(0, by - 10, 0, by + r);
      lg.addColorStop(0, p.color); lg.addColorStop(1, p.dark);
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(cx - r - 4, by - 6);
      g.bezierCurveTo(cx - 16, by - 18, cx + 10, by + 4, cx + r + 4, by - 10);
      g.lineTo(cx + r + 4, by + r + 4); g.lineTo(cx - r - 4, by + r + 4); g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (const [x, y, s] of [[cx - 12, by + 14, 5], [cx + 8, by + 22, 3.5], [cx + 16, by + 6, 2.5]]) { ellipse(g, x, y, s, s); g.fill(); }
      g.restore();
      // 玻璃轮廓 + 高光
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(40,40,80,.85)';
      g.beginPath();
      g.moveTo(cx - 13, 30); g.lineTo(cx - 13, by - r + 8);
      g.arc(cx, by, r, -Math.PI / 2 - 1.24, -Math.PI / 2 + 1.24 + TAU, false);
      g.lineTo(cx + 13, 30); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.arc(cx, by, r - 9, Math.PI * 1.05, Math.PI * 1.35); g.stroke();
      // 软木塞
      g.fillStyle = '#B07A4E'; g.strokeStyle = 'rgba(70,40,20,.9)'; g.lineWidth = 2.5;
      g.beginPath(); g.roundRect(cx - 16, 14, 32, 20, 6); g.fill(); g.stroke();
      // 瓶身小符号（不写字）
      g.strokeStyle = '#FFFFFF'; g.fillStyle = '#FFFFFF'; g.lineWidth = 4;
      const sy = by + 4;
      g.beginPath();
      if (key === 'shrink') { g.moveTo(cx, sy - 14); g.lineTo(cx, sy + 12); g.moveTo(cx - 10, sy + 2); g.lineTo(cx, sy + 12); g.lineTo(cx + 10, sy + 2); }
      else if (key === 'grow') { g.moveTo(cx, sy + 14); g.lineTo(cx, sy - 12); g.moveTo(cx - 10, sy - 2); g.lineTo(cx, sy - 12); g.lineTo(cx + 10, sy - 2); }
      else if (key === 'green') { g.ellipse(cx, sy, 9, 14, 0.6, 0, TAU); }
      else if (key === 'flip') { g.arc(cx, sy, 11, -0.3, Math.PI * 1.4); g.moveTo(cx + 11, sy - 12); g.lineTo(cx + 12, sy - 2); g.lineTo(cx + 2, sy - 3); }
      else { for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.moveTo(cx, sy); g.lineTo(cx + Math.cos(a) * 13, sy + Math.sin(a) * 13); } }
      g.stroke();
    });
  }

  // ---------- 绷带条 ----------
  function bandage(v) {
    return sprite(460, 64, (g, W, H) => {
      const pad = 6;
      g.beginPath();
      g.moveTo(pad + 10, pad);
      for (let x = pad + 10; x < W - pad - 10; x += 20) g.lineTo(x + 10, pad + (v === 1 ? 2 : 0) + ((x / 20) % 2) * 2);
      g.lineTo(W - pad, pad + 4);
      for (let y = pad + 4; y < H - pad; y += 8) g.lineTo(W - pad - ((y / 8) % 2 ? 9 : 0), y + 8);
      for (let x = W - pad - 10; x > pad + 10; x -= 20) g.lineTo(x - 10, H - pad - ((x / 20) % 2) * 2);
      g.lineTo(pad, H - pad - 4);
      for (let y = H - pad - 4; y > pad; y -= 8) g.lineTo(pad + ((y / 8) % 2 ? 9 : 0), y - 8);
      g.closePath();
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, '#F8F1E2'); lg.addColorStop(0.5, '#EFE4CC'); lg.addColorStop(1, '#DDCFB0');
      g.fillStyle = lg;
      g.fill();
      g.save(); g.clip();
      g.strokeStyle = 'rgba(160,140,100,.35)'; g.lineWidth = 1.5;
      for (let x = -H; x < W + H; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
      g.strokeStyle = 'rgba(140,120,80,.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, H * 0.3); g.lineTo(W, H * 0.33); g.moveTo(0, H * 0.7); g.lineTo(W, H * 0.68); g.stroke();
      g.fillStyle = 'rgba(150,120,80,.18)';
      for (let i = 0; i < 6; i++) { ellipse(g, 40 + ((i * 97 + v * 53) % (W - 80)), 18 + ((i * 31 + v * 17) % 30), 9, 5); g.fill(); }
      g.restore();
      g.strokeStyle = 'rgba(120,96,60,.7)'; g.lineWidth = 2; g.stroke();
    });
  }

  // ---------- 糖果 ----------
  const CANDY_COLORS = [['#FF8FB8', '#E0477F'], ['#7FE0C2', '#2FAE8A'], ['#FFD24A', '#E39A12'], ['#B99BFF', '#7B5BDE']];
  function candy(v) {
    return sprite(84, 56, (g, W, H) => {
      const cx = W / 2, cy = H / 2;
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(60,30,50,.85)';
      if (v < 4) {
        const [c, d] = CANDY_COLORS[v];
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + s * 14, cy); g.lineTo(cx + s * 38, cy - 15); g.lineTo(cx + s * 33, cy); g.lineTo(cx + s * 38, cy + 15); g.closePath();
          g.fillStyle = d; g.fill(); g.stroke();
        }
        const rg = g.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, 20);
        rg.addColorStop(0, '#FFFFFF'); rg.addColorStop(0.35, c); rg.addColorStop(1, d);
        g.fillStyle = rg; ellipse(g, cx, cy, 19, 17); g.fill(); g.stroke();
        if (v === 3) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 10, 0.3, 2.4); g.stroke(); }
      } else if (v === 4) {
        // 糖果玉米（万圣节经典）：白尖、橙中、黄底
        g.save();
        g.beginPath(); g.moveTo(cx, cy - 24); g.quadraticCurveTo(cx + 22, cy + 18, cx + 18, cy + 22); g.quadraticCurveTo(cx, cy + 27, cx - 18, cy + 22); g.quadraticCurveTo(cx - 22, cy + 18, cx, cy - 24); g.closePath();
        g.clip();
        g.fillStyle = '#FFD24A'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF8A1F'; g.fillRect(0, 0, W, cy + 10);
        g.fillStyle = '#FFF8EC'; g.fillRect(0, 0, W, cy - 6);
        g.restore();
        g.beginPath(); g.moveTo(cx, cy - 24); g.quadraticCurveTo(cx + 22, cy + 18, cx + 18, cy + 22); g.quadraticCurveTo(cx, cy + 27, cx - 18, cy + 22); g.quadraticCurveTo(cx - 22, cy + 18, cx, cy - 24); g.closePath();
        g.stroke();
      } else {
        // 棒棒糖
        g.fillStyle = '#F4E6D0'; g.fillRect(cx + 10, cy + 4, 26, 6); g.strokeRect(cx + 10, cy + 4, 26, 6);
        g.fillStyle = '#FFFFFF'; ellipse(g, cx - 6, cy - 2, 20, 20); g.fill();
        g.strokeStyle = '#FF5C8A'; g.lineWidth = 5;
        g.beginPath(); for (let a = 0; a < 12; a += 0.2) { const rr = a * 1.5; g.lineTo(cx - 6 + Math.cos(a) * rr, cy - 2 + Math.sin(a) * rr); } g.stroke();
        g.strokeStyle = 'rgba(60,30,50,.85)'; g.lineWidth = 2.5; ellipse(g, cx - 6, cy - 2, 20, 20); g.stroke();
      }
    });
  }

  // ---------- 南瓜糖果桶（后层：开口；前层：桶身） ----------
  function bucketBack() {
    return sprite(240, 220, (g, W) => {
      const cx = W / 2;
      g.fillStyle = '#5A2A0C';
      ellipse(g, cx, 66, 86, 22); g.fill();
    });
  }
  function bucketFront() {
    return sprite(240, 220, (g, W, H) => {
      const cx = W / 2, cy = 128;
      // 提手
      g.strokeStyle = '#3B2A3F'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 80, 70); g.bezierCurveTo(cx - 70, -6, cx + 70, -6, cx + 80, 70); g.stroke();
      // 桶身（下半个南瓜）
      g.save();
      g.beginPath(); g.rect(0, 64, W, H); g.clip();
      for (const [dx, w, h, light] of [[-56, 44, 74], [56, 44, 74], [-26, 50, 80], [26, 50, 80], [0, 48, 82, 1]]) {
        const gr = g.createRadialGradient(cx + dx - 14, cy - 30, 4, cx + dx, cy, 90);
        gr.addColorStop(0, light ? '#FFC46B' : '#FFB04A'); gr.addColorStop(0.55, '#F58A22'); gr.addColorStop(1, '#C0581A');
        g.fillStyle = gr; ellipse(g, cx + dx, cy, w, h); g.fill();
        g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
      }
      g.restore();
      // 桶口边
      g.lineWidth = 6; g.strokeStyle = '#D9701C';
      g.beginPath(); g.ellipse(cx, 66, 86, 22, 0, 0, Math.PI); g.stroke();
      g.lineWidth = 3; g.strokeStyle = OUT;
      g.beginPath(); g.ellipse(cx, 66, 89, 25, 0, 0, Math.PI); g.stroke();
      // 刻的笑脸
      const glow = g.createRadialGradient(cx, cy + 10, 2, cx, cy + 10, 70);
      glow.addColorStop(0, '#FFF3A8'); glow.addColorStop(0.5, '#FFD045'); glow.addColorStop(1, '#FF9418');
      g.fillStyle = glow; g.strokeStyle = 'rgba(110,40,6,.95)'; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cx - 44, cy + 2); g.lineTo(cx - 30, cy - 20); g.lineTo(cx - 16, cy + 2); g.closePath();
      g.moveTo(cx + 16, cy + 2); g.lineTo(cx + 30, cy - 20); g.lineTo(cx + 44, cy + 2); g.closePath();
      g.moveTo(cx - 46, cy + 20); g.quadraticCurveTo(cx, cy + 66, cx + 46, cy + 20);
      g.lineTo(cx + 30, cy + 26); g.lineTo(cx + 20, cy + 18); g.lineTo(cx + 8, cy + 30); g.lineTo(cx - 4, cy + 20); g.lineTo(cx - 16, cy + 30); g.lineTo(cx - 28, cy + 20);
      g.closePath();
      g.fill(); g.stroke();
    });
  }

  // ---------- 蝙蝠（每帧现画，翅膀会扇） ----------
  function drawBat(g, x, y, s, flap, hanging, rot = 0, alpha = 1) {
    g.save();
    g.translate(x, y);
    g.rotate(rot + (hanging ? Math.PI : 0));
    g.scale(s, s);
    g.globalAlpha *= alpha;
    g.lineJoin = 'round';
    const body = '#2A2238', edge = '#9C8CC8';
    if (!hanging) {
      const lift = Math.sin(flap);
      for (const side of [-1, 1]) {
        g.save();
        g.scale(side, 1);
        g.rotate(-0.25 - lift * 0.55);
        g.beginPath();
        g.moveTo(6, -6);
        g.quadraticCurveTo(30, -30, 62, -14);
        g.quadraticCurveTo(56, -2, 60, 8);
        g.quadraticCurveTo(48, 2, 42, 12);
        g.quadraticCurveTo(30, 4, 24, 14);
        g.quadraticCurveTo(16, 6, 6, 8);
        g.closePath();
        g.fillStyle = body; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = edge; g.stroke();
        g.restore();
      }
    } else {
      // 收起的翅膀把身体包住
      g.fillStyle = body; g.strokeStyle = edge; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(-10, 4, 11, 22, 0.25, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(10, 4, 11, 22, -0.25, 0, TAU); g.fill(); g.stroke();
      // 爪子（倒挂时朝上，抓着东西）
      g.strokeStyle = edge; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(-5, 24); g.lineTo(-6, 32); g.moveTo(5, 24); g.lineTo(6, 32); g.stroke();
    }
    // 身体 + 头 + 耳朵
    g.fillStyle = body; g.strokeStyle = edge; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(0, 4, 13, 17, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(-12, -10); g.lineTo(-14, -30); g.lineTo(-3, -16);
    g.lineTo(3, -16); g.lineTo(14, -30); g.lineTo(12, -10);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, -8, 13, 0, TAU); g.fill(); g.stroke();
    // 大眼睛 + 小尖牙（可爱不吓人）
    g.fillStyle = '#FFFFFF';
    g.beginPath(); g.arc(-5, -9, 4.6, 0, TAU); g.arc(5, -9, 4.6, 0, TAU); g.fill();
    g.fillStyle = '#2B2340';
    g.beginPath(); g.arc(-4.4, -8.4, 2.4, 0, TAU); g.arc(5.6, -8.4, 2.4, 0, TAU); g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath(); g.moveTo(-3.5, -1); g.lineTo(-2, 3); g.lineTo(-0.5, -1); g.moveTo(0.5, -1); g.lineTo(2, 3); g.lineTo(3.5, -1); g.fill();
    g.fillStyle = 'rgba(255,140,180,.6)';
    g.beginPath(); g.ellipse(-9, -3, 3, 2, 0, 0, TAU); g.ellipse(9, -3, 3, 2, 0, 0, TAU); g.fill();
    g.restore();
  }

  const A = (HW.art = {
    POTIONS,
    pumpkins: [], ghosts: [], potions: {}, bandages: [], candies: [],
    bucketBack: null, bucketFront: null,
    drawBat,
    init() {
      A.pumpkins = [0, 1, 2].map(pumpkin);
      A.ghosts = [0, 1, 2].map(ghost);
      for (const k of Object.keys(POTIONS)) A.potions[k] = potion(k);
      A.bandages = [0, 1, 2].map(bandage);
      A.candies = [0, 1, 2, 3, 4, 5].map(candy);
      A.bucketBack = bucketBack();
      A.bucketFront = bucketFront();
    },
  });
})();
