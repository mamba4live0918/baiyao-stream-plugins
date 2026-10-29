// 图片：构建时整包内嵌（assets/inline.mjs），开页时一次解码好，画的时候只 drawImage。
import DATA, { SIZES } from '../assets/inline.mjs';

const images = new Map();
let ready = null;

/** 解码全部图片。解码失败的那张跳过（画的地方会判空），不会卡住整个插件。 */
export function loadImages(env = globalThis) {
  if (ready) return ready;
  ready = Promise.all(Object.entries(DATA).map(([key, src]) => new Promise(resolve => {
    const im = new env.Image();
    im.onload = () => { images.set(key, im); resolve(); };
    im.onerror = () => resolve();
    im.src = src;
  })));
  return ready;
}

export const img = key => images.get(key) || null;
export const size = key => SIZES[key] || [1, 1];
export const CANDIES = [0, 1, 2, 3, 4, 5].map(i => 'candy-' + i);
