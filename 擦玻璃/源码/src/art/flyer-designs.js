/* 擦玻璃 · 17 种小广告（玻璃上的小告示）的版式。
   每种：aspect（高/宽）、stick（怎么粘的：paste 浆糊 / tape 胶带 / note 便利贴 / sticker 不干胶）、paper（纸）、back（纸背面颜色）、
   draw(g, k)：在以纸中心为原点的坐标里排版。k = { w, h, u, at（'@名字'）, title(默认标题)（观众"贴xxx"时换成他的字）, random }。
   内容按抖音直播的规矩来：不出现联系方式、价格和钱、招聘、二维码/条码、真实品牌、礼物和粉丝团、低俗的东西，
   都是和这块玻璃有关的、好玩又正向的小告示；观众的名字只写成"谁贴的"。 */
import { FONTS as F, txt, tabs, stamp, pill, halftone, hazard, INK, tone } from './flyer-kit.js';
import { rr } from './ink.js';
import * as I from './flyer-icons.js';

const RED = '#e0342b';

function band(g, x, y, w, h, color, r = 0) {
  g.save();
  g.beginPath();
  rr(g, x, y, w, h, r);
  g.fillStyle = color;
  g.fill();
  g.restore();
}

function dashedBox(g, x, y, w, h, color, u) {
  g.save();
  g.setLineDash([5 * u, 4 * u]);
  g.lineWidth = 1.6 * u;
  g.strokeStyle = color;
  g.beginPath();
  rr(g, x, y, w, h, 6 * u);
  g.stroke();
  g.restore();
}

function lines(g, list, x, y0, step, o) {
  list.forEach((t, i) => txt(g, t, x, y0 + i * step, o));
}

/* 小爱心只撒在四周边框里，不压字 */
function heartFrame(g, w, h, random) {
  for (let i = 0; i < 18; i++) {
    const side = i % 4;
    const along = random() - 0.5;
    const inset = 0.42 + random() * 0.05;
    const hx = side < 2 ? along * w * 0.9 : (side === 2 ? -1 : 1) * w * inset;
    const hy = side < 2 ? (side === 0 ? -1 : 1) * h * inset : along * h * 0.9;
    I.heart(g, hx, hy, w * (0.035 + random() * 0.03), 'rgba(255,150,185,.6)');
  }
}

export const DESIGNS = [
  {
    id: 'wash', aspect: 1.38, stick: 'paste', paper: { kind: 'plain', color: '#fffdf6' }, back: '#efe8da',
    draw(g, k) {
      const { w, h, u } = k;
      txt(g, k.title('今日擦玻璃'), 0, -h * 0.36, { size: w * 0.15, maxW: w * 0.84, font: F.hei, weight: 900, color: RED, stroke: '#ffffff', strokeW: w * 0.03, shadow: 'rgba(224,52,43,.18)' });
      txt(g, '擦得透亮 · 不留水痕', 0, -h * 0.25, { size: w * 0.058, maxW: w * 0.8, color: '#6b7a8a', weight: 700 });
      I.squeegee(g, -w * 0.1, -h * 0.08, w * 0.34, 0.45);
      I.drop(g, w * 0.2, -h * 0.13, w * 0.11);
      I.drop(g, w * 0.3, -h * 0.03, w * 0.08, '#8fd8ff');
      I.drop(g, -w * 0.32, -h * 0.02, w * 0.07, '#8fd8ff');
      txt(g, `贴的人：${k.at}`, 0, h * 0.13, { size: w * 0.07, maxW: w * 0.86, weight: 900 });
      tabs(g, w, h, u, { y0: h * 0.24, n: 6, text: '加油擦' });
    }
  },
  {
    id: 'cat', aspect: 1.42, stick: 'tape', paper: { kind: 'plain', color: '#fbfbf8' }, back: '#ecebe5',
    draw(g, k) {
      const { w, h, u } = k;
      txt(g, k.title('寻猫启事'), 0, -h * 0.385, { size: w * 0.15, maxW: w * 0.86, font: F.hei, weight: 900, color: '#1f1b1a' });
      band(g, -w * 0.3, -h * 0.315, w * 0.6, 2.5 * u, RED);
      g.save();
      g.translate(-w * 0.17, -h * 0.13);
      g.rotate(-0.06);
      band(g, -w * 0.2, -w * 0.2, w * 0.4, w * 0.4, '#ffffff', 2 * u);
      g.strokeStyle = '#c9c4bb';
      g.lineWidth = 1.4 * u;
      g.strokeRect(-w * 0.2, -w * 0.2, w * 0.4, w * 0.4);
      band(g, -w * 0.17, -w * 0.17, w * 0.34, w * 0.3, '#dceefa');
      I.catFace(g, 0, -w * 0.01, w * 0.27);
      g.restore();
      lines(g, ['小名：咪咪', '特征：会踩玻璃', '怕水，爱吃小鱼干'], w * 0.2, -h * 0.215, h * 0.06, { size: w * 0.054, maxW: w * 0.42, weight: 700, color: '#3c3330' });
      txt(g, '快回家吧！', w * 0.21, -h * 0.03, { size: w * 0.07, maxW: w * 0.42, weight: 900, color: RED, font: F.hei });
      txt(g, `看到请告诉 ${k.at}`, 0, h * 0.11, { size: w * 0.06, maxW: w * 0.88, weight: 800 });
      tabs(g, w, h, u, { y0: h * 0.22, n: 6, text: '喵喵喵', font: F.song });
    }
  },
  {
    id: 'sort', aspect: 1.25, stick: 'paste', paper: { kind: 'plain', color: '#f3fbe9' }, back: '#e0ead6',
    draw(g, k) {
      const { w, h, u } = k;
      band(g, -w / 2, -h / 2, w, h * 0.2, '#2f9e5b');
      txt(g, k.title('垃圾分类'), 0, -h * 0.4, { size: w * 0.15, maxW: w * 0.88, font: F.hei, weight: 900, color: '#ffffff', shadow: 'rgba(0,0,0,.25)' });
      I.recycle(g, -w * 0.25, -h * 0.1, w * 0.36);
      [['蛋壳', '厨余'], ['纸团', '可回收'], ['泥巴', '别糊玻璃']].forEach(([a, b], i) => {
        const y = -h * 0.2 + i * h * 0.085;
        txt(g, a, w * 0.05, y, { size: w * 0.06, maxW: w * 0.16, align: 'left', weight: 900 });
        txt(g, '→ ' + b, w * 0.2, y, { size: w * 0.056, maxW: w * 0.26, align: 'left', weight: 700, color: '#2f7a4b' });
      });
      pill(g, 0, h * 0.15, w * 0.62, h * 0.09, '分好类 · 保护环境', '#2f9e5b', '#ffffff', u);
      txt(g, `提醒人：${k.at}`, 0, h * 0.34, { size: w * 0.07, maxW: w * 0.88, weight: 900, font: F.hei });
    }
  },
  {
    id: 'club', aspect: 1.3, stick: 'paste', paper: { kind: 'plain', color: '#ffe4ee' }, back: '#f0d6e0',
    draw(g, k) {
      const { w, h, u, random } = k;
      heartFrame(g, w, h, random);
      I.chibi(g, 0, -h * 0.17, w * 0.42);
      g.save();
      g.beginPath();
      g.moveTo(-w * 0.46, h * 0.04);
      g.lineTo(w * 0.46, h * 0.04);
      g.lineTo(w * 0.4, h * 0.11);
      g.lineTo(w * 0.46, h * 0.18);
      g.lineTo(-w * 0.46, h * 0.18);
      g.lineTo(-w * 0.4, h * 0.11);
      g.closePath();
      g.fillStyle = '#ff6f9c';
      g.fill();
      g.lineWidth = 2 * u;
      g.strokeStyle = INK;
      g.stroke();
      g.restore();
      txt(g, k.title('擦玻璃同好会'), 0, h * 0.112, { size: w * 0.1, maxW: w * 0.8, font: F.round, weight: 900, color: '#ffffff', stroke: '#c93d6c', strokeW: w * 0.02 });
      txt(g, '一起擦 · 一起亮晶晶', 0, h * 0.26, { size: w * 0.062, maxW: w * 0.86, weight: 800, color: '#b23a62' });
      txt(g, `发起人：${k.at}`, 0, h * 0.37, { size: w * 0.066, maxW: w * 0.86, weight: 900 });
    }
  },
  {
    id: 'key', aspect: 0.72, stick: 'sticker', paper: { kind: 'sticker', color: '#ffd23e', edge: '#c9a21f' }, back: '#f4f1ea',
    draw(g, k) {
      const { w, h } = k;
      txt(g, k.title('钥匙招领'), -w * 0.12, -h * 0.15, { size: h * 0.26, maxW: w * 0.62, font: F.hei, weight: 900, color: RED, stroke: '#ffffff', strokeW: h * 0.04 });
      I.key(g, w * 0.32, -h * 0.13, h * 0.36, -0.7);
      txt(g, '在玻璃上捡到钥匙一把', 0, h * 0.13, { size: h * 0.09, maxW: w * 0.86, weight: 900, color: '#3b2a10' });
      band(g, -w / 2, h * 0.26, w, h * 0.24, '#1f1d1d');
      txt(g, `失主请找 ${k.at}`, 0, h * 0.38, { size: h * 0.1, maxW: w * 0.88, weight: 900, color: '#ffd23e' });
    }
  },
  {
    id: 'water', aspect: 0.82, stick: 'sticker', paper: { kind: 'sticker', color: '#2f8bdc', edge: '#1f5f99' }, back: '#f4f1ea',
    draw(g, k) {
      const { w, h, u } = k;
      txt(g, k.title('节约用水'), -w * 0.1, -h * 0.22, { size: h * 0.2, maxW: w * 0.62, font: F.hei, weight: 900, color: '#ffffff', stroke: '#173f66', strokeW: h * 0.035 });
      I.pipe(g, w * 0.3, -h * 0.24, h * 0.32);
      txt(g, '擦玻璃也别浪费水', 0, h * 0.06, { size: h * 0.085, maxW: w * 0.88, weight: 800, color: '#e8f6ff' });
      txt(g, '一滴一滴都珍贵', 0, h * 0.18, { size: h * 0.075, maxW: w * 0.8, weight: 700, color: '#bfe2ff' });
      pill(g, 0, h * 0.35, w * 0.8, h * 0.14, `人人有责 · ${k.at}`, '#ffd23e', '#173f66', u);
    }
  },
  {
    id: 'lesson', aspect: 1.32, stick: 'tape', paper: { kind: 'lined', color: '#fdfdf8' }, back: '#ecece4',
    draw(g, k) {
      const { w, h, u } = k;
      g.save();
      g.strokeStyle = RED;
      g.lineWidth = 2.4 * u;
      g.beginPath();
      g.ellipse(-w * 0.2, -h * 0.34, w * 0.2, h * 0.075, -0.08, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      txt(g, '笔记', -w * 0.2, -h * 0.34, { size: w * 0.12, font: F.kai, weight: 900, color: RED });
      I.star(g, w * 0.24, -h * 0.35, w * 0.12);
      const hand = { font: F.kai, weight: 700, color: '#25324a', align: 'left', maxW: w * 0.78 };
      txt(g, k.title('刮玻璃小课堂'), -w * 0.34, -h * 0.19, { ...hand, size: w * 0.088, weight: 900 });
      lines(g, ['第1课：从上往下刮', '第2课：刮条斜一点', '第3课：别刮到脸！'], -w * 0.34, -h * 0.08, h * 0.075, { ...hand, size: w * 0.064 });
      I.squeegee(g, w * 0.27, h * 0.16, w * 0.22, -0.5);
      txt(g, `记笔记：${k.at}`, -w * 0.34, h * 0.32, { ...hand, size: w * 0.07, weight: 900 });
    }
  },
  {
    id: 'card', aspect: 0.52, stick: 'sticker', paper: { kind: 'ticket', color: '#23264a', edge: '#151733' }, back: '#e9e6dc',
    draw(g, k) {
      const { w, h, u } = k;
      const stubX = w * 0.26;
      g.save();
      g.setLineDash([3 * u, 3 * u]);
      g.strokeStyle = 'rgba(255,214,120,.6)';
      g.lineWidth = 1.4 * u;
      g.beginPath();
      g.moveTo(stubX, -h / 2 + 4 * u);
      g.lineTo(stubX, h / 2 - 4 * u);
      g.stroke();
      g.restore();
      halftone(g, -w / 2 + 6 * u, -h / 2 + 6 * u, w * 0.7, h * 0.4, 'rgba(255,214,120,.1)', 7 * u, 2.2 * u);
      txt(g, k.title('到此一擦'), -w * 0.12, -h * 0.2, { size: h * 0.26, maxW: w * 0.66, font: F.round, weight: 900, color: '#ffd678', shadow: 'rgba(0,0,0,.4)' });
      txt(g, '擦玻璃纪念卡 · No.0001', -w * 0.12, h * 0.06, { size: h * 0.085, maxW: w * 0.66, weight: 700, color: '#d9dcff' });
      txt(g, `持卡人：${k.at}`, -w * 0.12, h * 0.25, { size: h * 0.1, maxW: w * 0.66, weight: 900, color: '#ffffff' });
      I.star(g, w * 0.375, -h * 0.1, h * 0.32, '#ffd678');
      txt(g, '纪念', w * 0.375, h * 0.24, { size: h * 0.1, maxW: w * 0.2, weight: 900, color: '#ffd678' });
    }
  },
  {
    id: 'menu', aspect: 1.42, stick: 'paste', paper: { kind: 'plain', color: '#fffaf2' }, back: '#efe6d8',
    draw(g, k) {
      const { w, h, u } = k;
      band(g, -w / 2, -h / 2, w, h * 0.17, '#ff8a3d');
      txt(g, k.title('猫猫今日食谱'), 0, -h * 0.415, { size: w * 0.12, maxW: w * 0.86, font: F.round, weight: 900, color: '#ffffff', stroke: '#c75a1c', strokeW: w * 0.02 });
      I.bowl(g, -w * 0.26, -h * 0.2, w * 0.32);
      [['早', '小鱼干'], ['中', '猫罐头'], ['晚', '冻干']].forEach(([a, b], i) => {
        const y = -h * 0.27 + i * h * 0.07;
        txt(g, a + '：', -w * 0.06, y, { size: w * 0.056, maxW: w * 0.12, align: 'left', weight: 900, color: '#c75a1c' });
        txt(g, b, w * 0.06, y, { size: w * 0.056, maxW: w * 0.34, align: 'left', weight: 800 });
      });
      dashedBox(g, -w * 0.4, h * 0.0, w * 0.8, h * 0.2, '#ff8a3d', u);
      txt(g, '开饭时间：现在！', 0, h * 0.07, { size: w * 0.08, maxW: w * 0.7, font: F.hei, weight: 900, color: RED });
      txt(g, '吃完再来踩玻璃', 0, h * 0.155, { size: w * 0.045, maxW: w * 0.7, weight: 700, color: '#8a6a50' });
      txt(g, `喂猫人：${k.at}`, 0, h * 0.34, { size: w * 0.07, maxW: w * 0.86, weight: 900 });
    }
  },
  {
    id: 'exercise', aspect: 1.3, stick: 'paste', paper: { kind: 'plain', color: '#fbfbfb' }, back: '#e9e9e6',
    draw(g, k) {
      const { w, h, u } = k;
      hazard(g, -w / 2, -h / 2, w, h * 0.07);
      hazard(g, -w / 2, h / 2 - h * 0.07, w, h * 0.07);
      txt(g, k.title('擦玻璃健身操'), 0, -h * 0.31, { size: w * 0.12, maxW: w * 0.9, font: F.hei, weight: 900, color: '#1f1d1d' });
      pill(g, 0, -h * 0.2, w * 0.56, h * 0.085, '全体起立！', RED, '#ffffff', u);
      I.dumbbell(g, 0, -h * 0.03, w * 0.5, -0.25);
      txt(g, '练出麒麟臂', 0, h * 0.13, { size: w * 0.085, maxW: w * 0.8, weight: 900, font: F.hei });
      txt(g, '刮玻璃再也不累', 0, h * 0.215, { size: w * 0.06, maxW: w * 0.8, weight: 700, color: '#5d5d5d' });
      txt(g, `领操：${k.at}`, 0, h * 0.33, { size: w * 0.068, maxW: w * 0.86, weight: 900 });
    }
  },
  {
    id: 'lost', aspect: 1.2, stick: 'tape', paper: { kind: 'kraft', color: '#d9b98a', edge: '#a8844f' }, back: '#cdb187',
    draw(g, k) {
      const { w, h } = k;
      txt(g, k.title('失物招领'), 0, -h * 0.33, { size: w * 0.14, maxW: w * 0.86, font: F.kai, weight: 900, color: '#4a2f17' });
      I.crackedEgg(g, 0, -h * 0.1, w * 0.42);
      txt(g, '捡到鸡蛋一枚（已碎）', 0, h * 0.1, { size: w * 0.064, maxW: w * 0.88, font: F.kai, weight: 900, color: '#3d2614' });
      txt(g, '蛋黄还在玻璃上', 0, h * 0.2, { size: w * 0.052, maxW: w * 0.8, font: F.kai, weight: 700, color: '#5d3c20' });
      txt(g, `失主请找 ${k.at}`, 0, h * 0.33, { size: w * 0.064, maxW: w * 0.88, font: F.kai, weight: 900, color: '#3d2614' });
    }
  },
  {
    id: 'view', aspect: 1.36, stick: 'paste', paper: { kind: 'plain', color: '#ffffff', grid: 'rgba(120,160,200,.16)' }, back: '#eaeaea',
    draw(g, k) {
      const { w, h, u } = k;
      g.save();
      g.lineWidth = 3 * u;
      g.strokeStyle = RED;
      g.strokeRect(-w * 0.38, -h * 0.44, w * 0.76, h * 0.16);
      g.restore();
      txt(g, k.title('玻璃观景台'), 0, -h * 0.36, { size: w * 0.12, maxW: w * 0.7, font: F.hei, weight: 900, color: RED });
      I.glassHouse(g, -w * 0.25, -h * 0.13, w * 0.32);
      lines(g, ['采光：极好', '视野：360°', '开放：全天'], w * 0.0, -h * 0.2, h * 0.06, { size: w * 0.056, maxW: w * 0.46, align: 'left', weight: 800 });
      txt(g, `导游：${k.at}`, 0, h * 0.1, { size: w * 0.07, maxW: w * 0.86, weight: 900 });
      tabs(g, w, h, u, { y0: h * 0.2, n: 7, text: '风景真好' });
    }
  },
  {
    id: 'squad', aspect: 1.36, stick: 'paste', paper: { kind: 'plain', color: '#fffef9' }, back: '#ece9df',
    draw(g, k) {
      const { w, h, u, random } = k;
      band(g, -w / 2, -h / 2, w, h * 0.16, RED);
      txt(g, k.title('擦窗小队集合'), 0, -h * 0.42, { size: w * 0.12, maxW: w * 0.88, font: F.hei, weight: 900, color: '#ffffff' });
      I.bucket(g, -w * 0.24, -h * 0.17, w * 0.24);
      I.squeegee(g, w * 0.02, -h * 0.17, w * 0.26, 0.6);
      stamp(g, w * 0.3, -h * 0.17, w * 0.13, '赞', u, random, { paper: '#fffef9' });
      ['自带刮刀', '动作要快', '擦完有掌声'].forEach((t, i) => {
        const y = h * 0.0 + i * h * 0.075;
        txt(g, '✔', -w * 0.3, y, { size: w * 0.06, color: '#2f9e5b', weight: 900 });
        txt(g, t, -w * 0.22, y, { size: w * 0.064, maxW: w * 0.6, align: 'left', weight: 800 });
      });
      txt(g, `队长：${k.at}`, 0, h * 0.34, { size: w * 0.07, maxW: w * 0.86, weight: 900 });
    }
  },
  {
    id: 'note', aspect: 1, stick: 'note', size: 0.78, paper: { kind: 'note', color: '#ffe873', edge: '#d8bd3c' }, back: '#f0dc72',
    draw(g, k) {
      const { w, h } = k;
      g.save();
      const gr = g.createLinearGradient(0, -h / 2, 0, -h / 2 + h * 0.12);
      gr.addColorStop(0, 'rgba(160,130,20,.16)');
      gr.addColorStop(1, 'rgba(160,130,20,0)');
      g.fillStyle = gr;
      g.fillRect(-w / 2, -h / 2, w, h * 0.12);
      g.restore();
      const t = k.title('白曜到此一游');
      const half = Math.ceil([...t].length / 2);
      const l1 = [...t].slice(0, half).join('');
      const l2 = [...t].slice(half).join('');
      const hand = { font: F.hand, weight: 900, color: '#3a2c55', maxW: w * 0.84 };
      txt(g, l1, 0, -h * 0.2, { ...hand, size: w * 0.15, rot: -0.05 });
      if (l2) txt(g, l2, w * 0.03, -h * 0.02, { ...hand, size: w * 0.15, rot: -0.03 });
      I.heart(g, w * 0.3, h * 0.14, w * 0.14);
      txt(g, `—— ${k.at}`, w * 0.04, h * 0.32, { ...hand, size: w * 0.085, rot: -0.02 });
    }
  },
  {
    id: 'luck', aspect: 1.18, stick: 'sticker', paper: { kind: 'sticker', color: '#e85a5a', edge: '#a8302f' }, back: '#f4f1ea',
    draw(g, k) {
      const { w, h, u } = k;
      txt(g, k.title('好运贴纸'), 0, -h * 0.37, { size: w * 0.14, maxW: w * 0.86, font: F.hei, weight: 900, color: '#ffe082', shadow: 'rgba(0,0,0,.25)' });
      band(g, -w * 0.25, -h * 0.27, w * 0.5, w * 0.5, '#fff6e0', 6 * u);
      I.clover(g, 0, -h * 0.27 + w * 0.25, w * 0.36);
      I.star(g, w * 0.34, h * 0.1, w * 0.12);
      I.star(g, -w * 0.36, h * 0.02, w * 0.08, '#fff1a8');
      txt(g, '擦一下 · 转转运', 0, h * 0.25, { size: w * 0.06, maxW: w * 0.7, weight: 800, color: '#fff0f0' });
      txt(g, `${k.at} 送你的好运`, 0, h * 0.37, { size: w * 0.062, maxW: w * 0.86, weight: 900, color: '#ffffff' });
    }
  },
  {
    id: 'parcel', aspect: 0.68, stick: 'sticker', paper: { kind: 'label', color: '#fbfbf9', edge: '#bdbab3' }, back: '#f4f1ea',
    draw(g, k) {
      const { w, h, u } = k;
      band(g, -w / 2, -h / 2, w, h * 0.22, '#1f1d1d');
      txt(g, k.title('易碎品'), 0, -h * 0.39, { size: h * 0.13, maxW: w * 0.8, weight: 900, color: '#ffffff', font: F.hei, spacing: 4 * u });
      I.crackedEgg(g, -w * 0.24, -h * 0.1, h * 0.36);
      I.glassHouse(g, w * 0.24, -h * 0.1, h * 0.3);
      txt(g, `收件人：${k.at}`, -w * 0.42, h * 0.1, { size: h * 0.085, maxW: w * 0.84, align: 'left', weight: 800 });
      txt(g, '寄件人：玻璃那边的人', -w * 0.42, h * 0.21, { size: h * 0.07, maxW: w * 0.84, align: 'left', weight: 700, color: '#5d5a55' });
      ['易碎', '小心轻放', '勿压'].forEach((t, i) => {
        const x = -w * 0.3 + i * w * 0.3;
        g.save();
        g.strokeStyle = '#1f1d1d';
        g.lineWidth = 1.4 * u;
        g.strokeRect(x - w * 0.13, h * 0.29, w * 0.26, h * 0.13);
        g.restore();
        txt(g, t, x, h * 0.355, { size: h * 0.065, maxW: w * 0.22, weight: 900 });
      });
    }
  },
  {
    id: 'truck', aspect: 1.25, stick: 'paste', paper: { kind: 'plain', color: '#eaf8e4' }, back: '#dbe8d4',
    draw(g, k) {
      const { w, h, u } = k;
      txt(g, k.title('鸡蛋运输中'), 0, -h * 0.35, { size: w * 0.13, maxW: w * 0.86, font: F.hei, weight: 900, color: '#2f8a4c', stroke: '#ffffff', strokeW: w * 0.025 });
      I.truck(g, 0, -h * 0.1, w * 0.48);
      txt(g, '请勿急刹 · 小心轻放', 0, h * 0.1, { size: w * 0.064, maxW: w * 0.86, weight: 800 });
      pill(g, 0, h * 0.21, w * 0.56, h * 0.085, '目的地：这块玻璃', '#2f8a4c', '#ffffff', u);
      txt(g, `司机：${k.at}`, 0, h * 0.35, { size: w * 0.07, maxW: w * 0.86, weight: 900 });
    }
  }
];

export { tone };
