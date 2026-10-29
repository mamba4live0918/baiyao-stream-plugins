// 贡献榜（位置、大小可以在「摆位置」里拖）：今晚谁的灯送达最多、谁送糖、谁派南瓜精灵帮做，前 5 名。
// 榜上的数变了才重画那一张小图；平时只是贴图。榜是空的就不画（摆位置时画个空框）。
import { img, CANDIES } from './assets.js';
import { widgetRects } from './widgets.js';

export function createBoard(world) {
  let L = null, cache = { key: '', c: null };
  const rect = () => widgetRects(L, world.settings()).board;

  function render(rows, w, h, dpr) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const pad = h * 0.05, title = h * 0.17, rowH = (h - title - pad * 1.5) / 5, fs = rowH * 0.5;
    g.fillStyle = 'rgba(60,25,10,.3)';
    g.beginPath(); g.roundRect ? g.roundRect(0, h * 0.02, w, h * 0.98, h * 0.07) : g.rect(0, 0, w, h); g.fill();
    g.fillStyle = 'rgba(255,246,230,.95)'; g.strokeStyle = '#6E3A1C'; g.lineWidth = Math.max(2, h * 0.01);
    g.beginPath(); g.roundRect ? g.roundRect(1, 1, w - 2, h * 0.97, h * 0.07) : g.rect(1, 1, w - 2, h - 2); g.fill(); g.stroke();
    g.textBaseline = 'middle';
    g.font = `900 ${Math.round(title * 0.52)}px "Microsoft YaHei",sans-serif`;
    g.fillStyle = '#7A3B18'; g.textAlign = 'left';
    const lamp = img('pumpkin-1-lit');
    if (lamp) g.drawImage(lamp, pad, pad * 0.5, title * 0.95, title * 0.95);
    g.fillText('今晚贡献榜', pad + title, pad * 0.5 + title * 0.5);
    if (!rows.length) {
      g.font = `700 ${Math.round(fs * 0.9)}px "Microsoft YaHei",sans-serif`; g.fillStyle = '#9A7A62';
      g.fillText('灯送达、送糖、派精灵帮做都会上榜', pad, title + pad + rowH * 1.2);
      return c;
    }
    const icons = [['lanterns', 'pumpkin-1-lit'], ['candy', CANDIES[2]], ['help', 'sprite-2']];
    rows.forEach((f, i) => {
      const y = title + pad + rowH * (i + 0.5);
      if (i % 2 === 0) { g.fillStyle = 'rgba(255,190,110,.14)'; g.fillRect(pad * 0.5, y - rowH / 2, w - pad, rowH); }
      g.font = `900 ${Math.round(fs)}px "Microsoft YaHei",sans-serif`;
      g.fillStyle = i === 0 ? '#E8792B' : '#9A6A48'; g.textAlign = 'center';
      g.fillText(String(i + 1), pad + fs * 0.5, y);
      g.textAlign = 'left'; g.fillStyle = '#4A2410';
      let name = f.nick;
      const nameW = w * 0.42;
      while (g.measureText(name).width > nameW && name.length > 1) name = name.slice(0, -1);
      if (name !== f.nick) name = name.slice(0, -1) + '…';
      g.fillText(name, pad + fs * 1.3, y);
      // 右边：灯 / 糖 / 精灵 各几（是 0 的不显示），从右往左排
      let x = w - pad;
      g.font = `800 ${Math.round(fs * 0.85)}px "Microsoft YaHei",sans-serif`;
      for (const [k, key] of icons.slice().reverse()) {
        if (!f[k]) continue;
        const text = String(f[k]), tw = g.measureText(text).width, im = img(key), iw = rowH * (k === 'candy' ? 0.85 : 0.72), ih = k === 'candy' ? iw * 120 / 180 : iw;
        g.textAlign = 'right'; g.fillStyle = '#5A2A12';
        g.fillText(text, x, y);
        x -= tw + iw * 0.15;
        if (im) g.drawImage(im, x - iw, y - ih / 2, iw, ih);
        x -= iw + fs * 0.45;
      }
    });
    return c;
  }

  function draw(g, t, editing = false) {
    if (!L) return;
    const r = rect();
    if (!r) return;
    const rows = world.game.topFans(5);
    if (!rows.length && !editing) return;
    const dpr = world.dpr(), key = Math.round(r.w) + 'x' + Math.round(r.h) + '|' + dpr + '|' + rows.map(f => f.nick + ':' + f.lanterns + ':' + f.candy + ':' + f.help).join(',');
    if (cache.key !== key) cache = { key, c: render(rows, r.w, r.h, dpr) };
    g.drawImage(cache.c, r.x, r.y, r.w, r.h);
  }

  return { draw, relayout: next => { L = next; } };
}
