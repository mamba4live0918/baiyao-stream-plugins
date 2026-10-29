/* 25 种垃圾的二次元扁平画法（和 art.js 同一套笔法）。
   每件：size = 外框宽高（米）；body = 碰撞形状：box [宽, 高] / circle 半径 / poly 顶点（米，中心为原点、y 向上）；
   draw(g)：画在以自身中心为原点、y 向下、单位为米的坐标里。 */
import { INK, LINE, shape, rr, stroke, shine, dots, tone } from './art.js';

/* 小工具（只用 moveTo / lineTo，shape 算阴影外框时也认得）：星形、十字 */
const starPath = (p, cx, cy, r, n = 5, k = .48) => { for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r * k : r; if (i) p.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); else p.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } };
const plusPath = (p, cx, cy, a, b) => { [[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]].forEach(([x, y], i) => { if (i) p.lineTo(cx + x, cy + y); else p.moveTo(cx + x, cy + y); }); };

export const ITEMS = {
  bottle: {
    size: [.42, 1.0], body: { poly: [[-.17, -.5], [.17, -.5], [.19, .14], [.08, .32], [.08, .5], [-.08, .5], [-.08, .32], [-.19, .14]] },
    draw(g) {
      shape(g, p => { p.moveTo(-.17, .48); p.lineTo(.17, .48); p.quadraticCurveTo(.2, .46, .2, .4); p.lineTo(.2, -.06); p.quadraticCurveTo(.2, -.18, .09, -.28); p.lineTo(.08, -.36); p.lineTo(-.08, -.36); p.lineTo(-.09, -.28); p.quadraticCurveTo(-.2, -.18, -.2, -.06); p.lineTo(-.2, .4); p.quadraticCurveTo(-.2, .46, -.17, .48); }, '#a8e6f0');
      shape(g, p => rr(p, -.2, .02, .4, .2, .02), '#ffd36e', { shadeSide: 'b' });
      stroke(g, p => { p.moveTo(-.12, .12); p.lineTo(.04, .12); }, .022, tone('#ffd36e', -.45));
      shape(g, p => rr(p, -.1, -.5, .2, .15, .03), '#4f8fe6', { shadeSide: 'r' });
      for (const y of [-.47, -.42]) stroke(g, p => { p.moveTo(-.07, y); p.lineTo(.07, y); }, .012, tone('#4f8fe6', -.4));
      shine(g, -.11, -.08, .03, .14, 0, .8); shine(g, -.11, .32, .025, .06, 0, .7);
    },
  },
  can: {
    size: [.5, .78], body: { box: [.5, .78] },
    draw(g) {
      shape(g, p => rr(p, -.24, -.36, .48, .72, .06), '#ef5d5d');
      shape(g, p => rr(p, -.25, -.39, .5, .09, .03), '#d9dee6', { shadeSide: 'b' });
      shape(g, p => rr(p, -.25, .3, .5, .09, .03), '#d9dee6', { shadeSide: 'b' });
      g.save(); g.beginPath(); rr(g, -.24, -.3, .48, .6, .02); g.clip();
      g.beginPath(); g.moveTo(-.3, .02); g.bezierCurveTo(-.1, -.12, .1, .14, .3, -.02); g.lineTo(.3, .08); g.bezierCurveTo(.1, .24, -.1, -.02, -.3, .12); g.closePath(); g.fillStyle = '#fff6e8'; g.fill();
      stroke(g, p => { p.moveTo(-.3, .02); p.bezierCurveTo(-.1, -.12, .1, .14, .3, -.02); }, .018, tone('#ef5d5d', -.35)); g.restore();   // 波浪线也裁在罐身里，不再从两边戳出去
      shine(g, -.15, -.12, .028, .13, 0, .7); shine(g, -.16, .14, .02, .06, 0, .6);
    },
  },
  newspaper: {
    size: [1.0, .66], body: { box: [.98, .5] },
    draw(g) {
      shape(g, p => { p.moveTo(-.48, -.2); p.lineTo(.02, -.3); p.lineTo(.48, -.22); p.lineTo(.46, .26); p.lineTo(.0, .3); p.lineTo(-.47, .24); }, '#f4efe4', { shadeSide: 'r', shadeK: -.08 });
      stroke(g, p => { p.moveTo(.02, -.3); p.lineTo(.0, .3); }, .018, tone('#f4efe4', -.35));
      shape(g, p => rr(p, -.4, -.17, .32, .1, .01), '#5a6270', { noShade: true, line: .012 });
      for (let i = 0; i < 4; i++) stroke(g, p => { p.moveTo(-.4, -.02 + i * .07); p.lineTo(-.08, -.04 + i * .07); }, .016, '#b8b1a4');
      shape(g, p => rr(p, .08, -.17, .3, .18, .01), '#cfd9e6', { noShade: true, line: .012 });
      for (let i = 0; i < 3; i++) stroke(g, p => { p.moveTo(.08, .07 + i * .07); p.lineTo(.38, .06 + i * .07); }, .016, '#b8b1a4');
    },
  },
  carton: {
    size: [1.0, .78], body: { box: [.96, .7] },
    draw(g) {
      shape(g, p => rr(p, -.46, -.3, .92, .64, .03), '#dba56c');
      shape(g, p => { p.moveTo(-.46, -.3); p.lineTo(-.32, -.42); p.lineTo(.05, -.38); p.lineTo(0, -.3); }, '#e8b77e', { shadeSide: 'b' });
      shape(g, p => { p.moveTo(.0, -.3); p.lineTo(.08, -.4); p.lineTo(.46, -.36); p.lineTo(.46, -.3); }, '#cf975c', { noShade: true });
      shape(g, p => rr(p, -.07, -.3, .14, .64, .01), '#c9b18e', { noShade: true, line: .014 });
      shape(g, p => rr(p, .14, -.08, .24, .16, .02), '#ffffff', { noShade: true, line: .012 });
      stroke(g, p => { p.moveTo(.18, -.03); p.lineTo(.33, -.03); p.moveTo(.18, .03); p.lineTo(.28, .03); }, .014, '#9aa3ad');
      for (const [x, y] of [[-.32, .14], [-.24, .2]]) stroke(g, p => { p.moveTo(x, y); p.lineTo(x + .08, y - .02); }, .014, tone('#dba56c', -.35));
    },
  },
  battery: {
    size: [.34, .8], body: { box: [.32, .78] },
    draw(g) {
      shape(g, p => rr(p, -.16, -.34, .32, .72, .07), '#3d3f4c', { shadeK: -.25 });
      shape(g, p => rr(p, -.16, -.34, .32, .2, .06), '#f2a65a', { shadeSide: 'r' });
      shape(g, p => rr(p, -.06, -.41, .12, .08, .02), '#d9dee6', { noShade: true });
      shape(g, p => rr(p, -.16, .08, .32, .1, .01), '#7fe0a4', { noShade: true, line: .014 });
      stroke(g, p => { p.moveTo(-.05, -.24); p.lineTo(.05, -.24); p.moveTo(0, -.29); p.lineTo(0, -.19); }, .03, '#ffffff');
      shine(g, -.09, .0, .022, .12, 0, .45);
    },
  },
  banana: {
    size: [.92, .7], body: { poly: [[-.42, -.18], [-.1, -.32], [.3, -.28], [.44, -.08], [.18, .2], [-.2, .28]] },
    draw(g) {
      // 三瓣香蕉皮：中间连着，向外翻
      shape(g, p => { p.moveTo(-.05, -.05); p.bezierCurveTo(-.25, -.2, -.45, -.05, -.44, .2); p.bezierCurveTo(-.3, .12, -.18, .06, -.05, .08); }, '#ffd54f');
      shape(g, p => { p.moveTo(.0, -.04); p.bezierCurveTo(.2, -.25, .42, -.12, .44, .14); p.bezierCurveTo(.3, .06, .18, .04, .05, .08); }, '#ffcc33');
      shape(g, p => { p.moveTo(-.07, .06); p.bezierCurveTo(-.12, .22, -.02, .32, .1, .32); p.bezierCurveTo(.08, .2, .1, .12, .07, .05); }, '#ffe07a');
      shape(g, p => { p.moveTo(-.06, -.04); p.bezierCurveTo(-.05, -.18, .02, -.3, .06, -.34); p.lineTo(.1, -.31); p.bezierCurveTo(.06, -.24, .04, -.12, .06, -.03); }, '#ffd54f', { noShade: true });
      shape(g, p => rr(p, .03, -.38, .08, .06, .02), '#7a5230', { noShade: true, line: .014 });
      dots(g, [[-.36, .14], [.37, .09], [.06, .27]], .025, '#8a5a2b');
      shine(g, -.24, -.06, .02, .07, -1, .6);
    },
  },
  apple: {
    size: [.5, .76], body: { poly: [[-.2, -.32], [.2, -.32], [.14, 0], [.2, .3], [-.2, .3], [-.14, 0]] },
    draw(g) {
      shape(g, p => { p.moveTo(-.22, -.18); p.bezierCurveTo(-.24, -.36, -.06, -.36, 0, -.3); p.bezierCurveTo(.06, -.36, .24, -.36, .22, -.18); p.bezierCurveTo(.16, -.12, -.16, -.12, -.22, -.18); }, '#ff7b7b');
      shape(g, p => { p.moveTo(-.15, -.14); p.bezierCurveTo(-.08, -.04, -.1, .08, -.15, .18); p.lineTo(.15, .18); p.bezierCurveTo(.1, .08, .08, -.04, .15, -.14); }, '#fff2d6', { shadeSide: 'r', shadeK: -.07 });
      shape(g, p => { p.moveTo(-.2, .2); p.bezierCurveTo(-.24, .36, .24, .36, .2, .2); p.bezierCurveTo(.12, .14, -.12, .14, -.2, .2); }, '#ff7b7b');
      dots(g, [[-.03, -.02], [.03, .06]], .028, '#6b4026');
      stroke(g, p => { p.moveTo(0, -.3); p.quadraticCurveTo(.02, -.4, .07, -.43); }, .03, '#6b4026');
      shape(g, p => { p.moveTo(.04, -.38); p.quadraticCurveTo(.16, -.46, .2, -.36); p.quadraticCurveTo(.12, -.32, .04, -.38); }, '#74c36b', { noShade: true, line: .014 });
      shine(g, -.13, -.24, .02, .04, -1, .8);
    },
  },
  fishbone: {
    size: [1.1, .46], body: { box: [1.06, .3] },
    draw(g) {
      shape(g, p => { p.moveTo(-.54, 0); p.quadraticCurveTo(-.5, -.2, -.3, -.2); p.lineTo(-.24, -.16); p.lineTo(-.24, .16); p.lineTo(-.3, .2); p.quadraticCurveTo(-.5, .2, -.54, 0); }, '#eef1f5');
      dots(g, [[-.42, -.05]], .035, INK);
      stroke(g, p => { p.moveTo(-.24, 0); p.lineTo(.36, 0); }, .045, INK);
      stroke(g, p => { p.moveTo(-.24, 0); p.lineTo(.36, 0); }, .025, '#eef1f5');
      for (let i = 0; i < 5; i++) { const x = -.14 + i * .11, h = .16 - i * .015; stroke(g, p => { p.moveTo(x, 0); p.quadraticCurveTo(x + .03, -h * .7, x - .02, -h); p.moveTo(x, 0); p.quadraticCurveTo(x + .03, h * .7, x - .02, h); }, .03, INK); stroke(g, p => { p.moveTo(x, 0); p.quadraticCurveTo(x + .03, -h * .7, x - .02, -h); p.moveTo(x, 0); p.quadraticCurveTo(x + .03, h * .7, x - .02, h); }, .014, '#eef1f5'); }
      shape(g, p => { p.moveTo(.34, 0); p.lineTo(.54, -.18); p.quadraticCurveTo(.48, 0, .54, .18); }, '#eef1f5', { noShade: true });
    },
  },
  tissue: {
    size: [.62, .5], body: { circle: .25 },
    draw(g) {
      shape(g, p => { p.moveTo(-.28, .02); p.quadraticCurveTo(-.3, -.18, -.12, -.22); p.quadraticCurveTo(-.02, -.28, .08, -.22); p.quadraticCurveTo(.28, -.22, .28, -.04); p.quadraticCurveTo(.31, .12, .18, .2); p.quadraticCurveTo(.04, .26, -.08, .2); p.quadraticCurveTo(-.26, .22, -.28, .02); }, '#fbfbfd', { shadeK: -.1 });
      stroke(g, p => { p.moveTo(-.16, -.08); p.lineTo(-.04, -.02); p.lineTo(-.1, .08); p.moveTo(.06, -.14); p.lineTo(.12, -.02); p.lineTo(.2, .02); p.moveTo(-.02, .1); p.lineTo(.08, .12); }, .016, '#b9c0cc');
    },
  },
  milktea: {
    size: [.56, 1.06], body: { poly: [[-.24, -.32], [.24, -.32], [.18, .5], [-.18, .5]] },
    draw(g) {
      shape(g, p => { p.moveTo(-.24, -.3); p.lineTo(.24, -.3); p.lineTo(.18, .5); p.lineTo(-.18, .5); }, '#f7f3ec', { shadeK: -.06 });
      g.save(); g.beginPath(); g.moveTo(-.23, -.18); g.lineTo(.23, -.18); g.lineTo(.18, .5); g.lineTo(-.18, .5); g.closePath(); g.clip(); g.fillStyle = '#c9925d'; g.fillRect(-.3, -.04, .6, .6); g.restore();
      stroke(g, p => { p.moveTo(-.22, -.04); p.lineTo(.22, -.04); }, .016, tone('#c9925d', -.3));
      dots(g, [[-.1, .4], [.0, .43], [.1, .4], [-.06, .32], [.05, .33], [-.12, .25], [.1, .26]], .035, '#3b2a24');
      dots(g, [[-.11, .39], [.09, .39], [-.07, .31]], .01, '#ffffff');
      shape(g, p => { p.moveTo(-.27, -.3); p.quadraticCurveTo(0, -.52, .27, -.3); }, '#f0f4f8', { noShade: true });
      shape(g, p => rr(p, -.28, -.33, .56, .06, .03), '#e2e8ef', { noShade: true });
      shape(g, p => { p.moveTo(.02, -.42); p.lineTo(.12, -.53); p.lineTo(.17, -.49); p.lineTo(.07, -.38); }, '#ff8fb1', { noShade: true, line: .016 });
      shine(g, -.15, .02, .02, .1, .1, .5);
    },
  },
  bigbone: {
    size: [1.0, .42], body: { box: [.96, .3] },
    draw(g) {
      const end = (x, s) => { g.moveTo(x, -.07); g.arc(x + s * .04, -.1, .1, Math.PI * (s > 0 ? .9 : .1), Math.PI * (s > 0 ? 2.4 : -1.4), s < 0); };
      shape(g, p => { p.moveTo(-.34, -.07); p.lineTo(.34, -.07); p.quadraticCurveTo(.4, -.22, .48, -.12); p.quadraticCurveTo(.55, -.02, .44, 0); p.quadraticCurveTo(.55, .02, .48, .12); p.quadraticCurveTo(.4, .22, .34, .07); p.lineTo(-.34, .07); p.quadraticCurveTo(-.4, .22, -.48, .12); p.quadraticCurveTo(-.55, .02, -.44, 0); p.quadraticCurveTo(-.55, -.02, -.48, -.12); p.quadraticCurveTo(-.4, -.22, -.34, -.07); }, '#fff8ea', { shadeSide: 'b', shadeK: -.1 });
      shine(g, -.1, -.03, .12, .015, 0, .8);
      void end;
    },
  },
  diaper: {
    size: [.86, .6], body: { box: [.84, .5] },
    draw(g) {
      shape(g, p => { p.moveTo(-.42, -.24); p.lineTo(.42, -.24); p.lineTo(.4, -.04); p.quadraticCurveTo(.14, .04, .1, .26); p.lineTo(-.1, .26); p.quadraticCurveTo(-.14, .04, -.4, -.04); }, '#ffffff', { shadeK: -.08 });
      shape(g, p => rr(p, -.42, -.27, .84, .09, .04), '#bfe3ff', { noShade: true });
      for (const x of [-.36, .26]) shape(g, p => rr(p, x, -.2, .1, .08, .02), '#ffd1e3', { noShade: true, line: .014 });
      dots(g, [[-.18, -.06], [.0, -.1], [.16, -.06], [-.05, .08], [.08, .1]], .028, '#ffe28a');
    },
  },

  /* ---------- 以下 13 种后补，笔法、线宽和上面一致 ---------- */
  glass: {
    size: [.36, 1.08], body: { poly: [[-.16, -.53], [.16, -.53], [.17, .02], [.075, .54], [-.075, .54], [-.17, .02]] },
    draw(g) {
      shape(g, p => { p.moveTo(-.13, .52); p.lineTo(.13, .52); p.quadraticCurveTo(.165, .52, .165, .47); p.lineTo(.165, -.02); p.bezierCurveTo(.165, -.15, .06, -.15, .06, -.27); p.lineTo(.06, -.46); p.lineTo(-.06, -.46); p.lineTo(-.06, -.27); p.bezierCurveTo(-.06, -.15, -.165, -.15, -.165, -.02); p.lineTo(-.165, .47); p.quadraticCurveTo(-.165, .52, -.13, .52); }, '#5cbf7f', { shadeK: -.2 });
      shape(g, p => rr(p, -.165, .07, .33, .25, .02), '#fff3d6', { shadeSide: 'b', shadeK: -.08 });
      shape(g, p => p.ellipse(0, .195, .1, .065, 0, 0, Math.PI * 2), '#ef6450', { noShade: true, line: .014 });
      stroke(g, p => { p.moveTo(-.055, .195); p.lineTo(.055, .195); }, .02, '#fff3d6');
      shape(g, p => rr(p, -.06, -.38, .12, .07, .01), '#fff3d6', { noShade: true, line: .014 });
      shape(g, p => rr(p, -.078, -.535, .156, .09, .025), '#f2c230', { shadeSide: 'b' });
      for (const x of [-.035, 0, .035]) stroke(g, p => { p.moveTo(x, -.5); p.lineTo(x, -.468); }, .01, tone('#f2c230', -.4));
      shine(g, -.105, -.04, .024, .085, .12, .8); shine(g, -.105, .42, .02, .055, 0, .7); shine(g, -.03, -.42, .009, .022, 0, .7);
    },
  },
  shirt: {
    size: [.94, .66], body: { poly: [[-.25, -.32], [.25, -.32], [.46, .05], [.27, .25], [.1, .3], [-.1, .3], [-.27, .25], [-.46, .05]] },
    draw(g) {
      const c = '#8fd0f2', d = tone(c, -.32);
      shape(g, p => { p.moveTo(-.1, -.3); p.lineTo(-.27, -.25); p.lineTo(-.46, -.05); p.lineTo(-.35, .07); p.lineTo(-.25, -.01); p.lineTo(-.25, .3); p.quadraticCurveTo(-.12, .33, 0, .3); p.quadraticCurveTo(.12, .27, .25, .31); p.lineTo(.25, -.01); p.lineTo(.35, .07); p.lineTo(.46, -.05); p.lineTo(.27, -.25); p.lineTo(.1, -.3); p.quadraticCurveTo(0, -.17, -.1, -.3); }, c);
      stroke(g, p => { p.moveTo(-.085, -.27); p.quadraticCurveTo(0, -.135, .085, -.27); }, .016, d);
      stroke(g, p => { p.moveTo(-.415, -.09); p.lineTo(-.31, .025); p.moveTo(.415, -.09); p.lineTo(.31, .025); }, .016, d);
      shape(g, p => starPath(p, 0, .07, .1), '#ffd36e', { noShade: true, line: .016 });
      stroke(g, p => { p.moveTo(-.2, .15); p.quadraticCurveTo(-.15, .21, -.07, .23); p.moveTo(.13, -.13); p.quadraticCurveTo(.18, -.07, .19, .01); }, .016, d);
      shine(g, -.17, -.13, .018, .06, .5, .6);
    },
  },
  tube: {
    size: [1.1, .2], body: { box: [1.08, .18] },
    draw(g) {
      const glass = p => rr(p, -.46, -.075, .92, .15, .075), pins = s => p => { p.moveTo(s * .5, -.04); p.lineTo(s * .535, -.04); p.moveTo(s * .5, .04); p.lineTo(s * .535, .04); };
      for (const s of [-1, 1]) { stroke(g, pins(s), .032, INK); stroke(g, pins(s), .012, '#e2e6ec'); }
      shape(g, glass, '#f4f8fc', { shadeSide: 'b', shadeK: -.09 });
      g.save(); g.beginPath(); glass(g); g.clip(); g.fillStyle = 'rgba(105,115,130,.3)'; g.fillRect(-.47, -.08, .085, .16); g.fillRect(.385, -.08, .085, .16); g.restore();
      stroke(g, glass, LINE);
      for (const s of [-1, 1]) { shape(g, p => rr(p, s > 0 ? .43 : -.51, -.09, .08, .18, .025), '#b4bec9', { shadeSide: 'b' }); stroke(g, p => { p.moveTo(s * .47, -.075); p.lineTo(s * .47, .075); }, .012, tone('#b4bec9', -.35)); }
      shine(g, -.08, -.036, .3, .012, 0, .9); shine(g, .28, -.036, .07, .01, 0, .8);
    },
  },
  medicine: {
    size: [.8, .62], body: { poly: [[-.39, -.24], [.34, -.29], [.39, -.21], [.39, .02], [.04, .3], [-.39, .3]] },
    draw(g) {
      // 药盒（后）+ 铝箔药板（前，略斜）
      shape(g, p => rr(p, -.38, -.29, .42, .52, .03), '#fbfbfd', { shadeK: -.08 });
      shape(g, p => rr(p, -.38, -.29, .42, .11, .03), '#4cc38a', { shadeSide: 'b' });
      shape(g, p => plusPath(p, -.17, .0, .1, .035), '#4cc38a', { noShade: true, line: .016 });
      stroke(g, p => { p.moveTo(-.31, .15); p.lineTo(-.04, .15); }, .018, '#c3c9d2');
      g.save(); g.translate(.17, .11); g.rotate(.16);
      shape(g, p => rr(p, -.2, -.15, .4, .3, .04), '#dde3ea', { shadeK: -.1 });
      for (let i = 0; i < 6; i++) {
        const x = -.12 + (i % 3) * .12, y = i < 3 ? -.065 : .065;
        if (i === 4) { shape(g, p => p.ellipse(x, y, .042, .036, 0, 0, Math.PI * 2), '#aab3be', { noShade: true, line: .012 }); continue; }   // 已经抠掉的空泡
        if (i < 3) { const cap = p => rr(p, x - .045, y - .03, .09, .06, .03); g.beginPath(); cap(g); g.fillStyle = '#ffd36e'; g.fill(); g.save(); g.clip(); g.fillStyle = '#ef6450'; g.fillRect(x - .05, y - .04, .05, .08); g.restore(); stroke(g, cap, .014); }
        else shape(g, p => p.arc(x, y, .036, 0, Math.PI * 2), '#5aa6ef', { line: .014 });
        shine(g, x - .018, y - .012, .012, .006, 0, .85);
      }
      g.restore();
    },
  },
  paint: {
    size: [.62, .8], body: { poly: [[-.29, -.4], [.29, -.4], [.29, .2], [.13, .39], [-.13, .39], [-.29, .2]] },
    draw(g) {
      const handle = p => p.ellipse(0, -.15, .255, .225, 0, Math.PI, Math.PI * 2);
      stroke(g, handle, .05, INK); stroke(g, handle, .02, '#c9d1da');
      shape(g, p => rr(p, -.26, -.18, .52, .56, .03), '#dfe5ec');
      shape(g, p => rr(p, -.26, -.04, .52, .27, .01), '#fffaf0', { noShade: true, line: .014 });
      for (const [r, c] of [[.15, '#ef6450'], [.11, '#f2c230'], [.07, '#3d8fe0']]) stroke(g, p => p.arc(0, .21, r, Math.PI * 1.08, Math.PI * 1.92), .034, c);
      shape(g, p => rr(p, -.29, -.23, .58, .08, .03), '#c9d1da', { shadeSide: 'b' });
      shape(g, p => rr(p, -.28, .33, .56, .07, .03), '#c9d1da', { shadeSide: 'b' });
      // 漫出桶沿、顺着桶身往下流的油漆
      shape(g, p => { p.moveTo(-.29, -.19); p.quadraticCurveTo(-.29, -.25, -.22, -.25); p.lineTo(.22, -.25); p.quadraticCurveTo(.29, -.25, .29, -.19); p.lineTo(.29, -.15); p.quadraticCurveTo(.26, -.12, .21, -.13); p.lineTo(.21, .05); p.arc(.17, .05, .04, 0, Math.PI); p.lineTo(.13, -.11); p.quadraticCurveTo(.04, -.09, -.06, -.12); p.lineTo(-.07, -.06); p.arc(-.1, -.06, .03, 0, Math.PI); p.lineTo(-.13, -.12); p.quadraticCurveTo(-.22, -.11, -.29, -.15); }, '#3d8fe0', { shadeSide: 'r', shadeK: -.18 });
      shine(g, .17, .03, .012, .03, 0, .8); shine(g, -.12, -.21, .07, .012, 0, .7);
      for (const s of [-1, 1]) shape(g, p => p.arc(s * .265, -.14, .032, 0, Math.PI * 2), '#b4bec9', { noShade: true, line: .016 });
    },
  },
  thermo: {
    size: [.9, .18], body: { box: [.88, .15] },
    draw(g) {
      shape(g, p => rr(p, -.36, -.062, .8, .124, .062), '#eef7fc', { shadeSide: 'b', shadeK: -.08 });
      for (let i = 0; i < 14; i++) { const x = -.2 + i * .042; stroke(g, p => { p.moveTo(x, -.034); p.lineTo(x, i % 5 ? -.012 : .004); }, .01, i === 7 ? '#ef6450' : '#8592a0'); }
      stroke(g, p => { p.moveTo(-.33, .024); p.lineTo(.1, .024); }, .026, '#98a3af');
      shape(g, p => p.arc(-.37, 0, .075, 0, Math.PI * 2), '#c3ccd6', { shadeK: -.22 });
      shine(g, -.395, -.028, .024, .014, -.5, .9); shine(g, .12, -.045, .2, .008, 0, .85);
    },
  },
  spray: {
    size: [.42, .92], body: { poly: [[-.19, -.44], [.19, -.44], [.19, .22], [.12, .44], [-.08, .44], [-.19, .22]] },
    draw(g) {
      shape(g, p => rr(p, -.075, -.44, .15, .15, .03), '#ef6450', { shadeSide: 'r' });
      shape(g, p => rr(p, .06, -.41, .07, .045, .015), '#3c4048', { noShade: true, line: .014 });
      shape(g, p => { p.moveTo(-.18, -.2); p.quadraticCurveTo(-.18, -.31, -.07, -.31); p.lineTo(.07, -.31); p.quadraticCurveTo(.18, -.31, .18, -.2); }, '#d9dee6', { shadeSide: 'r' });
      shape(g, p => rr(p, -.18, -.23, .36, .63, .04), '#ffc83d');
      shape(g, p => rr(p, -.18, -.15, .36, .07, .01), '#ef6450', { noShade: true, line: .014 });
      // 标志：圆圈里一只圆滚滚的小甲虫，上面一道禁止斜杠
      shape(g, p => p.arc(0, .12, .12, 0, Math.PI * 2), '#ffffff', { noShade: true, line: .016 });
      stroke(g, p => { for (const s of [-1, 1]) { p.moveTo(s * .03, .11); p.lineTo(s * .075, .095); p.moveTo(s * .035, .15); p.lineTo(s * .08, .165); p.moveTo(s * .01, .05); p.quadraticCurveTo(s * .02, .02, s * .05, .025); } }, .014, '#5a3d2e');
      shape(g, p => p.ellipse(0, .13, .042, .052, 0, 0, Math.PI * 2), '#6b4a3a', { noShade: true, line: .012 });
      dots(g, [[0, .07]], .026, '#6b4a3a');
      stroke(g, p => { p.arc(0, .12, .095, 0, Math.PI * 2); p.moveTo(-.067, .053); p.lineTo(.067, .187); }, .022, '#ef4a3f');
      shape(g, p => rr(p, -.19, .37, .38, .06, .02), '#d9dee6', { shadeSide: 'b' });
      shine(g, -.12, -.02, .022, .13, 0, .6);
    },
  },
  melon: {
    size: [.92, .5], body: { poly: [[-.46, .2], [-.38, -.06], [-.2, -.19], [0, -.235], [.2, -.19], [.38, -.06], [.46, .2]] },
    draw(g) {
      // 啃剩的一弯瓜皮：外圈深绿皮、浅绿、白瓤，靠里还剩一点红瓤和瓜子，里沿是三口牙印
      const rind = p => { p.moveTo(-.45, -.2); p.bezierCurveTo(-.42, .36, .42, .36, .45, -.2); p.quadraticCurveTo(.4, .0, .2, -.06); p.quadraticCurveTo(0, .02, -.2, -.06); p.quadraticCurveTo(-.4, .0, -.45, -.2); };
      shape(g, rind, '#3f9e4d', { noShade: true });
      g.save(); g.beginPath(); rind(g); g.clip();
      for (const [a, y, c] of [[.43, .347, '#8fd16a'], [.41, .293, '#f1f8d2'], [.37, .233, '#ff8f8f']]) { g.beginPath(); g.moveTo(-a, -.3); g.bezierCurveTo(-a + .02, y, a - .02, y, a, -.3); g.closePath(); g.fillStyle = c; g.fill(); }
      g.restore(); stroke(g, rind, LINE);
      for (const [x, y, a] of [[-.2, .02, .5], [0, .05, 0], [.2, .02, -.5]]) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -.028); g.quadraticCurveTo(.022, .004, 0, .022); g.quadraticCurveTo(-.022, .004, 0, -.028); g.fillStyle = '#3b2a24'; g.fill(); g.restore(); }
      shine(g, -.3, .06, .015, .045, .9, .5);
    },
  },
  eggshell: {
    size: [.66, .46], body: { poly: [[-.3, -.22], [.12, -.22], [.32, -.04], [.3, .08], [.02, .2], [-.22, .2], [-.33, .02]] },
    draw(g) {
      // 两半蛋壳：锯齿破口，口里露出白色内壁
      const half = (x, y, a, r, d) => {
        g.save(); g.translate(x, y); g.rotate(a);
        const rim = p => { p.moveTo(-r, 0); for (let i = 1; i <= 8; i++) p.lineTo(-r + i * r / 4, i % 2 ? -r * .3 : 0); };
        shape(g, p => { rim(p); p.ellipse(0, 0, r, d, 0, 0, Math.PI); }, '#f6dcbc', { shadeK: -.12 });
        g.beginPath(); rim(g); g.quadraticCurveTo(0, d * .35, -r, 0); g.fillStyle = '#fff8ee'; g.fill();
        stroke(g, p => { p.moveTo(-r, 0); p.quadraticCurveTo(0, d * .35, r, 0); }, .016); stroke(g, rim, LINE);
        dots(g, [[-r * .45, d * .5], [r * .3, d * .62], [r * .55, d * .3]], .012, '#d8b48c');
        g.restore();
      };
      half(-.13, -.06, -.26, .2, .24); half(.17, -.07, .6, .165, .2);
    },
  },
  veg: {
    size: [.8, .62], body: { poly: [[-.38, -.12], [-.2, -.29], [.2, -.29], [.38, -.12], [.3, .1], [.05, .3], [-.05, .3], [-.3, .1]] },
    draw(g) {
      // 一小把打蔫的青菜叶：两片叶子根部挨在一起、互相叠着，波浪边、白色叶梗、叶脉，叶边有几点发黄
      const leaf = (x, y, a, L, W, c) => {
        g.save(); g.translate(x, y); g.rotate(a);
        const w = t => W * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), .75), n = 5;
        shape(g, p => { p.moveTo(0, 0); for (let i = 1; i <= n; i++) { const t = i / n, m = t - .5 / n; p.quadraticCurveTo(-w(m) * 1.25, -L * m, -w(t), -L * t); } for (let i = n - 1; i >= 0; i--) { const t = i / n, m = t + .5 / n; p.quadraticCurveTo(w(m) * 1.25, -L * m, w(t), -L * t); } }, c);
        stroke(g, p => { for (const t of [.3, .5, .68]) for (const s of [-1, 1]) { p.moveTo(s * .01, -L * t); p.quadraticCurveTo(s * w(t) * .4, -L * (t + .04), s * w(t + .08) * .75, -L * (t + .12)); } }, .014, tone(c, -.28));
        shape(g, p => { p.moveTo(-.05, 0); p.quadraticCurveTo(-.014, -L * .45, 0, -L * .82); p.quadraticCurveTo(.014, -L * .45, .05, 0); }, '#eef6d4', { noShade: true, line: .014 });
        dots(g, [[-w(.72) * .62, -L * .72], [w(.38) * .72, -L * .38]], .024, 'rgba(201,176,74,.85)');
        g.restore();
      };
      leaf(.04, .24, .4, .52, .2, '#5aa84a'); leaf(-.04, .25, -.32, .55, .21, '#8fd36a');
    },
  },
  butt: {
    size: [.42, .14], body: { box: [.42, .12] },
    draw(g) {
      const end = p => { p.lineTo(-.2, -.03); p.lineTo(-.183, -.008); p.lineTo(-.205, .016); p.lineTo(-.168, .044); };
      shape(g, p => { p.moveTo(.06, -.05); p.lineTo(-.1, -.05); p.quadraticCurveTo(-.15, -.054, -.168, -.036); end(p); p.quadraticCurveTo(-.13, .052, -.1, .05); p.lineTo(.06, .05); }, '#fbfbfd', { shadeSide: 'b', shadeK: -.1 });
      shape(g, p => { p.moveTo(-.168, -.036); end(p); p.quadraticCurveTo(-.15, .004, -.168, -.036); }, '#80848d', { noShade: true, line: .014 });
      dots(g, [[-.188, .0], [-.176, .026]], .009, '#c9ced6');
      stroke(g, p => { p.moveTo(-.055, -.044); p.quadraticCurveTo(-.068, 0, -.06, .044); }, .012, '#c3c9d2');
      shape(g, p => rr(p, .035, -.058, .175, .116, .03), '#f2a65a', { shadeSide: 'b' });
      dots(g, [[.075, -.022], [.11, .02], [.15, -.026], [.18, .018], [.13, -.004]], .01, '#d9843a');
      stroke(g, p => { p.moveTo(.05, -.045); p.lineTo(.05, .045); }, .012, '#fff3d6');
    },
  },
  bowl: {
    size: [.84, .5], body: { poly: [[-.4, -.1], [-.3, -.2], [.3, -.2], [.41, -.1], [.41, .22], [-.15, .24], [-.3, .1]] },
    draw(g) {
      // 青花小碗：右前方崩掉一块，缺口里露出碗内壁；旁边掉着一片碎瓷
      const E = (p, a0, a1) => p.ellipse(0, -.1, .38, .085, 0, a0, a1, true);
      const side = p => { p.bezierCurveTo(.37, .08, .25, .16, .14, .17); p.lineTo(.15, .22); p.lineTo(-.15, .22); p.lineTo(-.14, .17); p.bezierCurveTo(-.25, .16, -.37, .08, -.38, -.1); };
      const broken = p => { p.moveTo(-.38, -.1); E(p, Math.PI, 1.12); p.lineTo(.19, .02); p.lineTo(.23, -.01); p.lineTo(.265, .05); p.lineTo(.3, .0); p.lineTo(.335, -.045); E(p, .42, 0); side(p); };
      g.fillStyle = '#dfe6ee'; g.beginPath(); g.ellipse(0, -.1, .38, .085, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(-.38, -.1); E(g, Math.PI, 0); side(g); g.fill();
      stroke(g, p => p.ellipse(0, -.1, .38, .085, 0, Math.PI, Math.PI * 2), LINE);
      shape(g, broken, '#fbfbfd', { shadeK: -.1 });
      g.save(); g.beginPath(); broken(g); g.clip();
      stroke(g, p => p.ellipse(0, -.065, .37, .085, 0, Math.PI, 0, true), .04, '#3d6fc2');
      stroke(g, p => p.ellipse(0, -.03, .36, .085, 0, Math.PI, 0, true), .012, '#3d6fc2');
      for (const x of [-.22, -.05, .1]) stroke(g, p => { p.moveTo(x - .04, .1); p.quadraticCurveTo(x - .02, .07, x, .1); p.quadraticCurveTo(x + .02, .13, x + .04, .1); }, .014, '#3d6fc2');
      g.restore(); stroke(g, broken, LINE);
      stroke(g, p => { p.moveTo(.265, .05); p.lineTo(.24, .09); p.lineTo(.26, .12); p.lineTo(.225, .155); }, .014);
      shape(g, p => { p.moveTo(.3, .215); p.lineTo(.325, .16); p.quadraticCurveTo(.37, .14, .405, .165); p.lineTo(.39, .225); }, '#fbfbfd', { noShade: true, line: .02 });
      stroke(g, p => { p.moveTo(.335, .175); p.quadraticCurveTo(.365, .162, .392, .178); }, .018, '#3d6fc2');
      shine(g, -.27, .02, .02, .06, .5, .8);
    },
  },
  durian: {
    size: [.84, .52], body: { poly: [[-.41, -.04], [-.3, -.19], [0, -.24], [.3, -.19], [.41, -.04], [.36, .1], [.25, .22], [-.25, .22], [-.36, .1]] },
    draw(g) {
      // 半个榴莲壳：一圈尖刺，口朝上露出白色内瓤，还剩一小块果肉
      const c = '#a8c444', oy = -.13;
      shape(g, p => { const n = 24; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI, k = i % 2 ? 1.13 : 1, x = Math.cos(a) * .36 * k, y = oy + .02 + Math.sin(a) * .31 * k; if (i) p.lineTo(x, y); else p.moveTo(x, y); } }, c, { shadeK: -.2 });
      for (const [x, y] of [[-.22, .0], [0, .03], [.22, .0], [-.12, .12], [.12, .12]]) stroke(g, p => { p.moveTo(x - .028, y + .02); p.lineTo(x, y - .02); p.lineTo(x + .028, y + .02); }, .014, tone(c, -.35));
      shape(g, p => p.ellipse(0, oy, .37, .105, 0, 0, Math.PI * 2), '#e6df92', { shadeSide: 'b', shadeK: -.1 });
      shape(g, p => p.ellipse(0, oy + .005, .3, .07, 0, 0, Math.PI * 2), '#fff6da', { noShade: true, line: .016 });
      stroke(g, p => { p.moveTo(-.15, oy - .045); p.quadraticCurveTo(-.1, oy, -.16, oy + .05); p.moveTo(.12, oy - .05); p.quadraticCurveTo(.07, oy, .13, oy + .055); }, .012, '#e3cf8c');
      shape(g, p => p.ellipse(0, oy + .01, .07, .035, .2, 0, Math.PI * 2), '#ffd54f', { noShade: true, line: .012 });
    },
  },
};

