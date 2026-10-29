import CURATED from './generated-patterns.json' with {type:'json'};
import VARIANTS from './generated-pattern-variants.json' with {type:'json'};

// 板格范围：V5.4 起上限 64，放大图纸可以用到原图里的更多细节。
export const MIN_BOARD=16,MAX_BOARD=64;
/** Pixel-art patterns and image-to-bead sampling. All grid operations are pure. */

export const BEAD_PALETTE = Object.freeze([
  ['P01', '奶油白', '#fff9ea'], ['P02', '墨黑', '#242339'],
  ['P03', '草莓红', '#ef4b5a'], ['P04', '莓果深红', '#ac3447'],
  ['P05', '樱花粉', '#ff9fc5'], ['P06', '浅樱粉', '#ffd1df'],
  ['P07', '蜜橘', '#ff914d'], ['P08', '柠檬黄', '#ffd54d'],
  ['P09', '淡奶黄', '#fff1a8'], ['P10', '嫩叶绿', '#9cdb72'],
  ['P11', '青草绿', '#54ad65'], ['P12', '松针绿', '#327953'],
  ['P13', '天空蓝', '#7ccbea'], ['P14', '湖蓝', '#367ac3'],
  ['P15', '深海蓝', '#3d4d8d'], ['P16', '丁香紫', '#c6a7e8'],
  ['P17', '葡萄紫', '#8c63b4'], ['P18', '可可棕', '#9e6550'],
  ['P19', '饼干棕', '#d8ad82'], ['P20', '奶茶色', '#f3d3a1'],
  ['P21', '岩灰', '#7d8b99'], ['P22', '银白灰', '#c9d3d5'],
  ['P23', '湖水青', '#42ada7'], ['P24', '薄荷青', '#8de1d5'],
  ['P25', '金砂', '#e8ac43'], ['P26', '蜜桃奶', '#f9d6b7'],
  ['P27', '夜紫', '#553d69'], ['P28', '苔藓绿', '#778d4f'],
  ['P29', '蜜桃橙', '#ffb592'], ['P30', '梅子红', '#8f4a67'],
  ['P31', '芽黄', '#dce66b'], ['P32', '杏黄', '#efbf65'],
  ['P33', '南瓜橙', '#e6782f'], ['P34', '浅青绿', '#c3e3bc'],
  ['P35', '翡翠绿', '#13834e'], ['P36', '冰青', '#cbe9e4'],
  ['P37', '雾蓝', '#bddde9'], ['P38', '海洋青', '#15adc5'],
  ['P39', '钴蓝', '#1758b4'], ['P40', '蓝紫', '#5044b5'],
  ['P41', '浅薰衣草', '#e1d0ec'], ['P42', '兰花紫', '#a77bcc'],
  ['P43', '玫红', '#e62c91'], ['P44', '酒红', '#a42445'],
  ['P45', '樱桃红', '#e52738'], ['P46', '暖白', '#eee7d8'],
  ['P47', '暖灰', '#aaa59b'], ['P48', '炭灰', '#505052'],
].map(([code, name, hex]) => Object.freeze({code, name, hex})));

const PALETTE_BY_HEX = new Map(BEAD_PALETTE.map(color => [color.hex, color]));
const PALETTE_RGB = BEAD_PALETTE.map(shade => ({
  hex: shade.hex,
  red: parseInt(shade.hex.slice(1, 3), 16),
  green: parseInt(shade.hex.slice(3, 5), 16),
  blue: parseInt(shade.hex.slice(5, 7), 16),
}));
const COLOR = Object.freeze({
  W: '#fff9ea', K: '#242339', R: '#ef4b5a', D: '#ac3447',
  P: '#ff9fc5', p: '#ffd1df', O: '#ff914d', Y: '#ffd54d',
  c: '#fff1a8', g: '#9cdb72', G: '#54ad65', H: '#327953',
  b: '#7ccbea', B: '#367ac3', N: '#3d4d8d', l: '#c6a7e8',
  V: '#8c63b4', C: '#9e6550', t: '#d8ad82', q: '#f3d3a1',
  X: '#7d8b99', x: '#c9d3d5', T: '#42ada7', u: '#8de1d5',
  A: '#e8ac43', F: '#f9d6b7', v: '#553d69', M: '#778d4f',
  E: '#ffb592', m: '#8f4a67',
});

export function colorByHex(hex) {
  return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? PALETTE_BY_HEX.get(hex.toLowerCase()) || {hex:hex.toLowerCase(),code:hex.toUpperCase(),name:'自选颜色'} : null;
}

export const CATEGORIES = Object.freeze([
 {id:'cats-rabbits',name:'猫猫与兔兔'}, {id:'animals',name:'治愈萌宠'}, {id:'desserts',name:'甜品咖啡馆'}, {id:'characters',name:'小小人物'}, {id:'fantasy',name:'奇幻世界'}, {id:'floral',name:'花束与挂饰'},
].map(Object.freeze));

const BASE = 16;

function makeDrawer() {
  const cells = Array(BASE * BASE).fill(null);
  const set = (x, y, color) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < BASE && y >= 0 && y < BASE) cells[y * BASE + x] = color === null ? null : COLOR[color];
  };
  const rect = (x, y, width, height, color) => {
    for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) set(xx, yy, color);
  };
  const ellipse = (cx, cy, rx, ry, color) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, color);
      }
    }
  };
  const line = (x0, y0, x1, y1, color, width = 1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3 || 1;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps;
      const y = y0 + (y1 - y0) * i / steps;
      if (width <= 1) set(x, y, color);
      else ellipse(x, y, width / 2, width / 2, color);
    }
  };
  const poly = (points, color) => {
    for (let y = 0; y < BASE; y++) for (let x = 0; x < BASE; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a[1] > y + .5) !== (b[1] > y + .5) &&
            x + .5 < (b[0] - a[0]) * (y + .5 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      if (inside) set(x, y, color);
    }
  };
  return {cells, s: set, r: rect, e: ellipse, l: line, p: poly};
}

// Every preset is composed on its own sixteen-pixel canvas. The small, hard
// edges are intentional: enlarging a board preserves the pixel-art language.
const SPECS = [
  ['cherries', '樱桃', 'fruits', d => {
    d.l(8, 3, 5, 9, 'H'); d.l(8, 3, 11, 9, 'H'); d.e(8, 3, 2, 1, 'G');
    d.e(5, 11, 3, 3, 'R'); d.e(11, 11, 3, 3, 'D'); d.s(4, 10, 'P'); d.s(10, 10, 'P');
  }],
  ['apple', '红苹果', 'fruits', d => {
    d.e(8, 9, 6, 5, 'D'); d.e(8, 9, 5, 5, 'R'); d.e(5, 6, 3, 2, 'R'); d.e(11, 6, 3, 2, 'R');
    d.l(8, 5, 9, 2, 'C', 2); d.p([[9, 3], [14, 2], [12, 5], [9, 5]], 'G'); d.e(5, 8, 1, 2, 'P');
  }],
  ['strawberry', '草莓', 'fruits', d => {
    d.p([[3, 5], [13, 5], [14, 8], [8, 15], [2, 8]], 'R');
    d.p([[2, 5], [5, 4], [6, 2], [8, 4], [10, 2], [11, 4], [14, 5], [10, 7], [8, 5], [6, 7]], 'G');
    for (const [x, y] of [[5, 8], [9, 8], [7, 10], [11, 10], [8, 13]]) d.s(x, y, 'c');
  }],
  ['watermelon', '西瓜片', 'fruits', d => {
    d.p([[8, 2], [15, 13], [1, 13]], 'H'); d.p([[8, 2], [14, 11], [2, 11]], 'R');
    d.l(2, 12, 14, 12, 'g', 2); for (const [x, y] of [[7, 6], [10, 8], [5, 9], [8, 10]]) d.s(x, y, 'K');
  }],
  ['lemon', '柠檬', 'fruits', d => {
    d.e(8, 9, 6, 4, 'Y'); d.p([[1, 8], [5, 7], [5, 11]], 'Y'); d.p([[11, 7], [15, 9], [11, 11]], 'Y');
    d.e(6, 7, 2, 1, 'c'); d.e(10, 10, 2, 1, 'A'); d.l(8, 5, 9, 3, 'H');
  }],
  ['orange', '橘子', 'fruits', d => {
    d.e(8, 9, 6, 6, 'O'); d.e(6, 7, 2, 2, 'E'); d.l(8, 4, 8, 2, 'C');
    d.p([[8, 3], [13, 2], [11, 5], [8, 5]], 'G'); d.s(12, 11, 'A');
  }],
  ['grapes', '葡萄串', 'fruits', d => {
    d.l(7, 2, 9, 5, 'H'); d.p([[7, 3], [3, 3], [5, 6], [8, 5]], 'G');
    for (const [x, y] of [[6, 6], [10, 6], [4, 9], [8, 9], [12, 9], [6, 12], [10, 12], [8, 14]]) d.e(x, y, 2, 2, 'V');
    d.s(5, 5, 'l'); d.s(9, 8, 'l');
  }],
  ['peach', '蜜桃', 'fruits', d => {
    d.e(8, 9, 6, 5, 'E'); d.e(5, 7, 3, 3, 'P'); d.e(11, 7, 3, 3, 'E');
    d.l(8, 6, 9, 13, 'R'); d.l(8, 4, 9, 2, 'C'); d.p([[9, 3], [14, 2], [12, 5]], 'G');
  }],
  ['pineapple', '菠萝', 'fruits', d => {
    d.p([[5, 5], [11, 5], [13, 8], [11, 14], [5, 14], [3, 8]], 'Y');
    d.p([[8, 6], [6, 1], [9, 4], [10, 1], [11, 6]], 'G');
    for (let i = 0; i < 4; i++) {d.l(4 + i * 2, 6, 9 + i, 13, 'A'); d.l(12 - i * 2, 6, 7 - i, 13, 'O');}
  }],
  ['cake', '奶油蛋糕', 'fruits', d => {
    d.r(2, 7, 12, 7, 't'); d.r(2, 9, 12, 2, 'R'); d.r(2, 12, 12, 2, 'C');
    d.e(8, 7, 6, 2, 'W'); d.e(5, 6, 2, 2, 'W'); d.e(11, 6, 2, 2, 'W');
    d.l(8, 4, 8, 2, 'Y'); d.s(8, 1, 'O');
  }],
  ['icecream', '草莓甜筒', 'fruits', d => {
    d.p([[4, 7], [12, 7], [8, 15]], 't'); d.l(5, 9, 10, 13, 'C'); d.l(11, 9, 7, 13, 'C');
    d.e(8, 6, 5, 4, 'P'); d.e(6, 5, 2, 1, 'p'); d.e(9, 2, 1, 1, 'R');
  }],
  ['donut', '糖霜甜甜圈', 'fruits', d => {
    d.e(8, 8, 6, 6, 'C'); d.e(8, 7, 6, 4, 'P'); d.e(8, 8, 2, 2, null);
    for (const [x, y, color] of [[4, 5, 'Y'], [11, 5, 'B'], [12, 9, 'W'], [5, 11, 'G'], [8, 3, 'R']]) d.s(x, y, color);
  }],

  ['cat', '小猫', 'animals', d => {
    d.p([[2, 3], [5, 5], [8, 4], [11, 5], [14, 3], [14, 11], [11, 14], [5, 14], [2, 11]], 'C');
    d.p([[3, 5], [3, 2], [6, 5]], 'P'); d.p([[10, 5], [13, 2], [13, 5]], 'P');
    d.s(5, 9, 'K'); d.s(11, 9, 'K'); d.e(8, 11, 1, 1, 'P');
    d.l(2, 11, 6, 11, 'K'); d.l(10, 11, 14, 11, 'K');
  }],
  ['dog', '小狗', 'animals', d => {
    d.e(8, 9, 5, 5, 't'); d.e(3, 7, 2, 4, 'C'); d.e(13, 7, 2, 4, 'C');
    d.e(8, 11, 3, 2, 'q'); d.s(6, 8, 'K'); d.s(10, 8, 'K'); d.e(8, 10, 1, 1, 'K'); d.s(9, 12, 'P');
  }],
  ['rabbit', '小兔子', 'animals', d => {
    d.e(5, 4, 2, 4, 'W'); d.e(11, 4, 2, 4, 'W'); d.e(5, 4, 1, 3, 'P'); d.e(11, 4, 1, 3, 'P');
    d.e(8, 10, 6, 5, 'W'); d.s(5, 9, 'K'); d.s(11, 9, 'K'); d.e(8, 11, 1, 1, 'P');
    d.r(7, 12, 1, 2, 'W'); d.r(9, 12, 1, 2, 'W');
  }],
  ['bear', '小熊', 'animals', d => {
    d.e(4, 4, 2, 2, 'C'); d.e(12, 4, 2, 2, 'C'); d.e(8, 9, 6, 5, 'C');
    d.e(8, 11, 3, 2, 'q'); d.s(6, 8, 'K'); d.s(10, 8, 'K'); d.e(8, 10, 1, 1, 'K');
  }],
  ['panda', '熊猫', 'animals', d => {
    d.e(4, 4, 2, 2, 'K'); d.e(12, 4, 2, 2, 'K'); d.e(8, 9, 6, 5, 'W');
    d.e(5, 9, 2, 2, 'K'); d.e(11, 9, 2, 2, 'K'); d.s(5, 9, 'W'); d.s(11, 9, 'W');
    d.e(8, 12, 2, 1, 'K');
  }],
  ['fox', '小狐狸', 'animals', d => {
    d.p([[1, 3], [5, 5], [8, 4], [11, 5], [15, 3], [13, 12], [8, 15], [3, 12]], 'O');
    d.p([[3, 4], [3, 2], [6, 5]], 'P'); d.p([[10, 5], [13, 2], [13, 4]], 'P');
    d.p([[3, 10], [8, 13], [13, 10], [10, 14], [6, 14]], 'W');
    d.s(5, 9, 'K'); d.s(11, 9, 'K'); d.s(8, 12, 'K');
  }],
  ['frog', '小青蛙', 'animals', d => {
    d.e(4, 5, 3, 3, 'G'); d.e(12, 5, 3, 3, 'G'); d.e(8, 10, 7, 5, 'G');
    d.e(4, 5, 2, 2, 'W'); d.e(12, 5, 2, 2, 'W'); d.s(4, 5, 'K'); d.s(12, 5, 'K');
    d.l(5, 11, 11, 11, 'H'); d.s(4, 9, 'P'); d.s(12, 9, 'P');
  }],
  ['penguin', '小企鹅', 'animals', d => {
    d.e(8, 8, 6, 7, 'K'); d.e(8, 10, 4, 5, 'W'); d.e(5, 5, 2, 2, 'W'); d.e(11, 5, 2, 2, 'W');
    d.s(5, 5, 'K'); d.s(11, 5, 'K'); d.p([[6, 8], [10, 8], [8, 10]], 'O');
    d.r(3, 14, 4, 1, 'O'); d.r(9, 14, 4, 1, 'O');
  }],
  ['fish', '蓝色小鱼', 'animals', d => {
    d.p([[3, 8], [0, 4], [0, 12]], 'B'); d.e(9, 8, 6, 5, 'B');
    d.p([[7, 4], [10, 1], [11, 5]], 'b'); d.s(11, 7, 'K'); d.l(8, 10, 11, 11, 'N');
  }],
  ['whale', '小鲸鱼', 'animals', d => {
    d.e(8, 9, 7, 4, 'B'); d.p([[2, 8], [0, 5], [0, 11]], 'B'); d.p([[12, 9], [15, 5], [15, 11]], 'B');
    d.e(8, 11, 5, 2, 'b'); d.s(11, 8, 'K'); d.l(6, 5, 6, 2, 'b');
    d.l(6, 2, 4, 1, 'b'); d.l(6, 2, 8, 1, 'b');
  }],
  ['bee', '小蜜蜂', 'animals', d => {
    d.e(5, 5, 3, 3, 'W'); d.e(10, 5, 3, 3, 'W'); d.e(8, 10, 6, 4, 'Y');
    d.r(5, 7, 2, 7, 'K'); d.r(9, 7, 2, 7, 'K'); d.e(12, 10, 2, 3, 'Y');
    d.s(13, 9, 'K'); d.l(12, 6, 13, 3, 'K');
  }],
  ['butterfly', '蝴蝶', 'animals', d => {
    d.e(4, 6, 4, 4, 'P'); d.e(12, 6, 4, 4, 'V'); d.e(4, 11, 3, 3, 'R'); d.e(12, 11, 3, 3, 'l');
    d.r(7, 5, 2, 9, 'K'); d.l(7, 5, 5, 2, 'K'); d.l(8, 5, 11, 2, 'K');
    d.s(3, 5, 'W'); d.s(13, 5, 'W');
  }],

  ['flower', '五瓣花', 'nature', d => {
    d.l(8, 8, 8, 15, 'H', 2); d.p([[8, 11], [3, 10], [6, 13]], 'G'); d.p([[8, 12], [13, 10], [11, 13]], 'G');
    for (const [x, y] of [[8, 4], [4, 6], [5, 10], [11, 10], [12, 6]]) d.e(x, y, 3, 3, 'P');
    d.e(8, 8, 2, 2, 'Y');
  }],
  ['sunflower', '向日葵', 'nature', d => {
    d.l(8, 9, 8, 15, 'H', 2); d.e(5, 13, 3, 1, 'G');
    for (const [x, y] of [[8, 2], [4, 4], [12, 4], [2, 8], [14, 8], [4, 11], [12, 11]]) d.e(x, y, 2, 3, 'Y');
    d.e(8, 7, 4, 4, 'C'); d.s(7, 6, 'A'); d.s(10, 8, 'A');
  }],
  ['tree', '小树', 'nature', d => {
    d.r(7, 9, 3, 6, 'C'); d.e(8, 7, 6, 5, 'H'); d.e(5, 7, 3, 3, 'G'); d.e(11, 5, 3, 3, 'G');
    d.e(8, 3, 3, 2, 'g');
  }],
  ['cactus', '仙人掌', 'nature', d => {
    d.r(6, 4, 5, 10, 'G'); d.e(8, 4, 2, 2, 'G'); d.r(3, 7, 3, 5, 'G'); d.r(10, 8, 3, 4, 'G');
    d.e(3, 7, 1, 2, 'G'); d.e(12, 8, 1, 2, 'G'); d.r(4, 13, 9, 2, 'C');
    for (const [x, y] of [[7, 6], [10, 9], [4, 10], [8, 12]]) d.s(x, y, 'H');
  }],
  ['mushroom', '蘑菇', 'nature', d => {
    d.r(6, 8, 4, 6, 'W'); d.e(8, 7, 7, 5, 'R'); d.r(1, 7, 14, 2, 'D');
    d.e(5, 5, 2, 1, 'W'); d.e(10, 4, 2, 1, 'W'); d.s(7, 11, 'K'); d.s(9, 11, 'K');
  }],
  ['cloud', '棉花云', 'nature', d => {
    d.e(5, 9, 4, 3, 'b'); d.e(10, 7, 4, 4, 'b'); d.e(12, 10, 3, 3, 'b');
    d.r(3, 10, 10, 3, 'W'); d.e(7, 8, 4, 3, 'W'); d.e(11, 9, 3, 3, 'W');
  }],
  ['rainbow', '彩虹', 'nature', d => {
    for (const [radius, color] of [[7, 'R'], [6, 'O'], [5, 'Y'], [4, 'G'], [3, 'B']]) {
      for (let x = 1; x < 16; x++) for (let y = 2; y < 12; y++) {
        const dist = Math.hypot(x - 8, y - 10);
        if (y <= 10 && dist >= radius - .55 && dist < radius + .45) d.s(x, y, color);
      }
    }
    d.e(2, 12, 2, 1, 'W'); d.e(14, 12, 2, 1, 'W');
  }],
  ['mountain', '雪山', 'nature', d => {
    d.p([[1, 14], [6, 3], [11, 14]], 'X'); d.p([[7, 14], [11, 6], [15, 14]], 'N');
    d.p([[4, 7], [6, 3], [8, 7], [6, 6]], 'W'); d.p([[9, 10], [11, 6], [13, 10], [11, 9]], 'W');
    d.r(1, 14, 14, 1, 'G');
  }],
  ['campfire', '篝火', 'nature', d => {
    d.l(3, 13, 12, 14, 'C', 3); d.l(12, 12, 3, 14, 't', 3);
    d.p([[8, 2], [11, 7], [12, 11], [9, 13], [5, 12], [4, 8]], 'O');
    d.p([[8, 5], [10, 9], [8, 12], [6, 11], [6, 8]], 'Y');
  }],
  ['wave', '海浪', 'nature', d => {
    d.e(5, 7, 4, 5, 'b'); d.e(5, 8, 2, 3, null); d.e(11, 10, 6, 4, 'B');
    d.r(1, 11, 14, 3, 'B'); d.e(11, 11, 3, 1, 'b'); d.s(4, 4, 'W');
  }],

  ['star', '闪亮星星', 'space', d => {
    d.p([[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]], 'Y');
    d.s(6, 7, 'c'); d.s(10, 7, 'c'); d.s(8, 9, 'A');
  }],
  ['moon', '弯月', 'space', d => {
    d.e(8, 8, 6, 6, 'Y'); d.e(11, 6, 5, 5, null); d.s(4, 10, 'c'); d.s(7, 13, 'A');
  }],
  ['sun', '太阳', 'space', d => {
    d.e(8, 8, 4, 4, 'Y'); d.e(8, 8, 2, 2, 'O');
    for (const [x, y] of [[8, 1], [8, 15], [1, 8], [15, 8], [3, 3], [13, 3], [3, 13], [13, 13]]) d.l(8, 8, x, y, 'Y');
    d.e(8, 8, 4, 4, 'Y'); d.s(6, 8, 'C'); d.s(10, 8, 'C');
  }],
  ['planet', '环形星球', 'space', d => {
    d.e(8, 8, 5, 5, 'V'); d.e(6, 6, 2, 1, 'l');
    d.l(1, 11, 14, 5, 'Y', 2); d.l(2, 13, 15, 7, 'A');
    d.e(8, 8, 3, 3, 'V'); d.s(7, 7, 'l');
  }],
  ['rocket', '小火箭', 'space', d => {
    d.p([[8, 1], [11, 5], [11, 12], [5, 12], [5, 5]], 'W');
    d.p([[8, 1], [11, 5], [5, 5]], 'R'); d.p([[5, 9], [2, 13], [5, 13]], 'B'); d.p([[11, 9], [14, 13], [11, 13]], 'B');
    d.e(8, 7, 2, 2, 'b'); d.p([[6, 12], [10, 12], [8, 16]], 'O'); d.s(8, 14, 'Y');
  }],
  ['alien', '小外星人', 'space', d => {
    d.e(8, 8, 6, 6, 'g'); d.e(5, 8, 2, 3, 'K'); d.e(11, 8, 2, 3, 'K');
    d.l(6, 12, 10, 12, 'H'); d.l(5, 3, 4, 1, 'G'); d.l(11, 3, 12, 1, 'G');
  }],
  ['ufo', '飞碟', 'space', d => {
    d.e(8, 7, 4, 4, 'b'); d.e(8, 9, 7, 3, 'X'); d.r(2, 9, 12, 2, 'l');
    for (const x of [4, 8, 12]) d.s(x, 10, 'Y'); d.p([[5, 12], [11, 12], [14, 15], [2, 15]], 'u');
  }],
  ['wand', '魔法棒', 'space', d => {
    d.l(3, 14, 11, 5, 'v', 2); d.p([[11, 1], [12, 4], [15, 4], [13, 6], [14, 9], [11, 7], [8, 9], [9, 6], [7, 4], [10, 4]], 'Y');
    for (const [x, y] of [[2, 5], [4, 2], [14, 12]]) d.s(x, y, 'b');
  }],

  ['heart', '爱心', 'objects', d => {
    d.e(5, 5, 4, 4, 'R'); d.e(11, 5, 4, 4, 'R'); d.p([[1, 6], [15, 6], [8, 15]], 'R');
    d.e(5, 4, 2, 1, 'P');
  }],
  ['bow', '蝴蝶结', 'objects', d => {
    d.p([[1, 4], [7, 6], [7, 10], [1, 12], [3, 8]], 'P');
    d.p([[15, 4], [9, 6], [9, 10], [15, 12], [13, 8]], 'P');
    d.e(8, 8, 2, 2, 'R'); d.l(7, 10, 5, 15, 'R', 2); d.l(9, 10, 11, 15, 'R', 2);
  }],
  ['potion', '魔法药水', 'objects', d => {
    d.r(6, 2, 4, 4, 'X'); d.r(5, 1, 6, 2, 'C'); d.p([[6, 5], [10, 5], [13, 9], [12, 14], [4, 14], [3, 9]], 'x');
    d.p([[4, 10], [12, 10], [12, 13], [4, 13]], 'V'); d.s(6, 11, 'l'); d.s(10, 8, 'W');
  }],
  ['umbrella', '小雨伞', 'objects', d => {
    d.e(8, 8, 7, 5, 'B'); d.r(1, 8, 14, 3, 'B'); d.e(4, 10, 2, 1, 'b'); d.e(12, 10, 2, 1, 'b');
    d.l(8, 9, 8, 14, 'C'); d.l(8, 14, 11, 14, 'C'); d.s(11, 13, 'C');
  }],
  ['house', '小房子', 'objects', d => {
    d.p([[1, 7], [8, 1], [15, 7]], 'R'); d.r(3, 7, 10, 8, 'q'); d.r(6, 10, 4, 5, 'C');
    d.r(4, 8, 2, 2, 'b'); d.r(10, 8, 2, 2, 'b'); d.s(9, 12, 'Y');
  }],
  ['key', '金钥匙', 'objects', d => {
    d.e(5, 5, 4, 4, 'A'); d.e(5, 5, 2, 2, null); d.l(8, 8, 14, 14, 'A', 2);
    d.l(12, 12, 14, 10, 'A', 2); d.l(13, 13, 15, 11, 'A', 2);
  }],
  ['crown', '小皇冠', 'objects', d => {
    d.p([[2, 4], [5, 8], [8, 2], [11, 8], [14, 4], [13, 13], [3, 13]], 'Y');
    d.r(3, 12, 10, 2, 'A'); d.s(5, 10, 'R'); d.s(8, 8, 'B'); d.s(11, 10, 'V');
  }],
  ['music', '音乐音符', 'objects', d => {
    d.r(9, 2, 2, 10, 'K'); d.p([[9, 2], [14, 3], [14, 5], [9, 4]], 'K');
    d.e(6, 12, 4, 2, 'K'); d.e(5, 11, 1, 1, 'N');
  }],
  ['gift', '礼物盒', 'objects', d => {
    d.r(2, 6, 12, 8, 'R'); d.r(1, 5, 14, 3, 'D'); d.r(7, 5, 2, 9, 'Y'); d.r(2, 9, 12, 1, 'P');
    d.e(5, 4, 3, 2, 'Y'); d.e(11, 4, 3, 2, 'Y'); d.e(8, 5, 2, 2, 'A');
  }],
  ['camera', '拍立得相机', 'objects', d => {
    d.r(2, 5, 12, 9, 'x'); d.r(4, 3, 5, 2, 'X'); d.r(10, 6, 2, 1, 'R');
    d.e(8, 9, 4, 4, 'K'); d.e(8, 9, 3, 3, 'B'); d.e(7, 8, 1, 1, 'b');
  }],
];

const SPEC_BY_ID = new Map(SPECS.map(spec => [spec[0], spec]));
const CURATED_BY_ID=new Map(CURATED.map(item=>[item.id,item]));
export const PRESETS=Object.freeze(CURATED.map(({id,name,category,width,height,source})=>Object.freeze({id,name,category,width,height,source:Object.freeze(source)})));
export const isLegacyPreset=id=>SPEC_BY_ID.has(id);

export function listPresets(category) {
  return PRESETS.filter(item => category === undefined || item.category === category);
}

function boardSize(size) {
  if (!Number.isInteger(size) || size < MIN_BOARD || size > MAX_BOARD) throw new RangeError(`拼豆板格数须为 ${MIN_BOARD}–${MAX_BOARD} 的整数`);
  return size;
}

export function mapGridToBoard(cells, width, height, size) {
  boardSize(size);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      !cells || cells.length !== width * height) throw new RangeError('图案尺寸或像素数据无效');
  const output = Array(size * size).fill(null);
  const scale = Math.min(size / width, size / height);
  const drawnWidth = Math.max(1, Math.round(width * scale));
  const drawnHeight = Math.max(1, Math.round(height * scale));
  const left = Math.floor((size - drawnWidth) / 2);
  const top = Math.floor((size - drawnHeight) / 2);
  for (let y = 0; y < drawnHeight; y++) {
    const sy = Math.min(height - 1, Math.floor((y + .5) * height / drawnHeight));
    for (let x = 0; x < drawnWidth; x++) {
      const sx = Math.min(width - 1, Math.floor((x + .5) * width / drawnWidth));
      output[(top + y) * size + left + x] = cells[sy * width + sx] || null;
    }
  }
  return output;
}

// 生成图纸的全部尺寸：原生版本加上从高清原图重新取样的缩小 / 放大版本（颜色只用原生调色板）。
const variantCache=new Map();
export function patternVariants(id){
  if(variantCache.has(id))return variantCache.get(id);
  const ready=CURATED_BY_ID.get(id);if(!ready)return[];
  const extra=VARIANTS[id],list=[{width:ready.width,height:ready.height,cells:ready.cells,beads:ready.cells.filter(Boolean).length,native:true}];
  for(const v of extra?.variants||[])list.push({width:v.w,height:v.h,cells:[...v.d].map(ch=>ch==='.'?null:extra.palette[ch.charCodeAt(0)-97]),beads:v.beads,native:false});
  list.sort((a,b)=>Math.max(a.width,a.height)-Math.max(b.width,b.height)||(a.native?-1:1));
  variantCache.set(id,list);return list;
}
/** 适合某个板格的图纸版本：放得下的最大版本；板格比最小版本还小时用最小版本。 */
export function variantForBoard(id,size){
  const list=patternVariants(id);if(!list.length)return null;
  let best=list[0];for(const v of list)if(Math.max(v.width,v.height)<=size)best=v;
  return best;
}
export function createPresetPattern(id, size = 24, { fit = 'native' } = {}) {
  boardSize(size);
  const ready=CURATED_BY_ID.get(id);
  if(ready){
    // fit:'native' 用原生图纸（板格不足时自动扩大，保持 V5.0 行为）；fit:'board' 按板格换成缩小或放大的版本。
    const art=fit==='board'?variantForBoard(id,size):patternVariants(id).find(v=>v.native);
    size=Math.max(size,art.width,art.height);const cells=Array(size*size).fill(null),left=Math.floor((size-art.width)/2),top=Math.floor((size-art.height)/2);
    for(let row=0;row<art.height;row++)for(let col=0;col<art.width;col++)cells[(row+top)*size+col+left]=art.cells[row*art.width+col];
    return{id:ready.id,name:ready.name,category:ready.category,size,cells,sourceCells:[...cells],colorTier:'original',nativeWidth:art.width,nativeHeight:art.height,originalWidth:ready.width,originalHeight:ready.height,variant:art.native?'native':Math.max(art.width,art.height)<Math.max(ready.width,ready.height)?'smaller':'larger',source:{...ready.source},preview:{width:art.width,height:art.height,cells:[...art.cells]}};
  }
  const spec = SPEC_BY_ID.get(id);
  if (!spec) throw new RangeError('未找到预设图案');
  const drawing = makeDrawer();
  spec[3](drawing);
  const centered = Array(size * size).fill(null);
  const offset = Math.floor((size - BASE) / 2);
  for (let row = 0; row < BASE; row++) for (let col = 0; col < BASE; col++) {
    centered[(row + offset) * size + col + offset] = drawing.cells[row * BASE + col];
  }
  return {
    id: spec[0], name: spec[1], category: spec[2], size,
    cells: centered,
    preview: {width: BASE, height: BASE, cells: drawing.cells.slice()},
  };
}

export const COLOR_TIERS = [48,96,144,256,'original'];
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const distance=(a,b)=>(a[0]-b[0])**2*.30+(a[1]-b[1])**2*.59+(a[2]-b[2])**2*.11;
function buildExtendedPalette(){
 const result=[...BEAD_PALETTE],seen=new Set(result.map(s=>s.hex)),candidates=[];
 for(let r=0;r<=255;r+=51)for(let g=0;g<=255;g+=51)for(let b=0;b<=255;b+=51)candidates.push([r,g,b]);
 for(let n=0;n<=255;n+=8)candidates.push([n,n,n]);
 for(let r=32;r<256;r+=64)for(let g=32;g<256;g+=64)for(let b=32;b<256;b+=64)candidates.push([r,g,b]);
 const pool=candidates.map(ch=>({ch,hex:'#'+ch.map(n=>n.toString(16).padStart(2,'0')).join(''),score:Math.min(...result.map(s=>distance(ch,rgb(s.hex))))})).filter(c=>!seen.has(c.hex));
 while(result.length<256&&pool.length){let best=0;for(let i=1;i<pool.length;i++)if(pool[i].score>pool[best].score)best=i;const chosen=pool.splice(best,1)[0];const shade=Object.freeze({hex:chosen.hex,code:`P${String(result.length+1).padStart(2,'0')}`,name:'扩展色 '+chosen.hex.toUpperCase()});result.push(shade);PALETTE_BY_HEX.set(shade.hex,shade);for(const c of pool)c.score=Math.min(c.score,distance(c.ch,chosen.ch));}
 return Object.freeze(result);
}
export const FULL_PALETTE=buildExtendedPalette();
// Dedicated stable, short labels keep generated colors readable on tiny pegs.
const generatedHexes=[...new Set(CURATED.flatMap(p=>p.cells.filter(Boolean)))].sort();
export const GENERATED_PALETTE=Object.freeze(generatedHexes.map((hex,index)=>{
 const shade=PALETTE_BY_HEX.get(hex)||Object.freeze({hex,code:`G${String(index+1).padStart(3,'0')}`,name:'图纸色 '+hex.toUpperCase()});
 PALETTE_BY_HEX.set(hex,shade);return shade;
}));
export const validColorTier=value=>COLOR_TIERS.includes(value);
export const paletteForTier=tier=>FULL_PALETTE.slice(0,validColorTier(tier)&&tier!=='original'?tier:256);
export function nearestShade(red,green,blue,tier=48){
 if(tier==='original')return '#'+[red,green,blue].map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
 let best=FULL_PALETTE[0],score=Infinity;for(const shade of paletteForTier(tier)){const d=distance([red,green,blue],rgb(shade.hex));if(d<score){best=shade;score=d;}}return best.hex;
}
export function recolorPattern(pattern,tier=48){
 const source=pattern.sourceCells||pattern.cells;
 return {...pattern,colorTier:tier,sourceCells:[...source],cells:source.map(hex=>hex?nearestShade(...rgb(hex),tier):null)};
}

function rgbaHex(data, index, alphaThreshold) {
  if (data[index + 3] < alphaThreshold) return null;
  return '#' + [data[index], data[index + 1], data[index + 2]]
    .map(channel => channel.toString(16).padStart(2, '0')).join('');
}

export function rasterToPattern(image, size, options = {}) {
  boardSize(size);
  const {width, height, data} = image || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 4096 || height > 4096 || width * height > 4194304 ||
      !data || data.length !== width * height * 4) throw new RangeError('图片尺寸或 RGBA 数据无效');
  const threshold = Number.isInteger(options.alphaThreshold) ? options.alphaThreshold : 128;
  if (threshold < 0 || threshold > 255) throw new RangeError('透明度阈值无效');
  const previewScale = Math.min(1, 64 / Math.max(width, height));
  const previewWidth = Math.max(1, Math.round(width * previewScale));
  const previewHeight = Math.max(1, Math.round(height * previewScale));
  const previewCells = Array(previewWidth * previewHeight);
  for (let y = 0; y < previewHeight; y++) for (let x = 0; x < previewWidth; x++) {
    const sx = Math.min(width - 1, Math.floor((x + .5) * width / previewWidth));
    const sy = Math.min(height - 1, Math.floor((y + .5) * height / previewHeight));
    previewCells[y * previewWidth + x] = rgbaHex(data, (sy * width + sx) * 4, threshold);
  }
  const cells = Array(size * size).fill(null);
  const sourceCells = Array(size * size).fill(null);
  const scale = Math.min(size / width, size / height);
  const drawnWidth = Math.max(1, Math.round(width * scale));
  const drawnHeight = Math.max(1, Math.round(height * scale));
  const left = Math.floor((size - drawnWidth) / 2);
  const top = Math.floor((size - drawnHeight) / 2);
  for (let y = 0; y < drawnHeight; y++) {
    const sy0 = Math.floor(y * height / drawnHeight);
    const sy1 = Math.max(sy0 + 1, Math.ceil((y + 1) * height / drawnHeight));
    for (let x = 0; x < drawnWidth; x++) {
      const sx0 = Math.floor(x * width / drawnWidth);
      const sx1 = Math.max(sx0 + 1, Math.ceil((x + 1) * width / drawnWidth));
      let red = 0, green = 0, blue = 0, visible = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const at = (sy * width + sx) * 4;
        if (data[at + 3] < threshold) continue;
        red += data[at]; green += data[at + 1]; blue += data[at + 2]; visible++;
      }
      if(visible){const index=(top+y)*size+left+x;sourceCells[index]=nearestShade(Math.round(red/visible),Math.round(green/visible),Math.round(blue/visible),'original');cells[index]=nearestShade(Math.round(red/visible),Math.round(green/visible),Math.round(blue/visible),options.colorTier||48);}
    }
  }
  return {
    id: 'custom', name: options.name || '自定义图片', category: 'custom', size,
    cells,sourceCells,colorTier:options.colorTier||48,
    preview: {width: previewWidth, height: previewHeight, cells: previewCells},
  };
}
