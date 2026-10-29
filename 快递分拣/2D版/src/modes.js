/* 两种玩法的差异表：筐、槽位、文字、效果名、关卡字段（纯数据，可直接用 Node 测试） */
import { BIN_NAMES } from './garbage-catalog.js';

export const MODES = {
  express: {
    id: 'express', label: '快递分拣',
    bins: [
      { hex: '#e2503f', dark: '#9f2e22', three: 0xd9483a, icon: 0, short: '红' },
      { hex: '#f2ae1c', dark: '#b47c06', three: 0xf0aa1a, icon: 1, short: '黄' },
      { hex: '#2d84d8', dark: '#1b5b9c', three: 0x2a80d4, icon: 2, short: '蓝' },
    ],
    scanTitle: '扫码台', scanHint: '扫码台 · 撕掉面单的件拿过来扫一下', scanFirst: '先去扫码台扫一下面单', dockSign: '待 分 拣', unit: '件',
  },
  garbage: {
    id: 'garbage', label: '垃圾分类',
    bins: [
      { hex: '#2a6fcf', dark: '#1a4c96', three: 0x2a6fcf },
      { hex: '#d6403a', dark: '#97261f', three: 0xd6403a },
      { hex: '#2f9b55', dark: '#1d6b39', three: 0x2f9b55 },
      { hex: '#3d4246', dark: '#24282b', three: 0x41474c },
    ],
    scanTitle: '识别台', scanHint: '识别台 · 糊了泥的垃圾拿过来照一下', scanFirst: '先去识别台照一下', dockSign: '待 分 类', unit: '件',
  },
};
export const MODE_IDS = Object.keys(MODES);

export function binLabels(mode, naming) {
  return mode === 'garbage' ? [...(BIN_NAMES[naming] || BIN_NAMES.national)] : MODES.express.bins.map(b => b.short);
}

/* 12 种观众效果。label 按模式取；max 是单次效果量上限；unit 显示用 */
export const EFFECTS = [
  { id: 'truck', label: { express: '又来一车', garbage: '又来一车垃圾' }, unit: '件', max: 60 },
  { id: 'blind', label: { express: '爆箱盲盒', garbage: '大垃圾袋' }, unit: '件', max: 20 },
  { id: 'seal', label: { express: '封筐', garbage: '封桶' }, unit: '秒', max: 60 },
  { id: 'speed', label: { express: '传送带加速', garbage: '传送带加速' }, unit: '秒', max: 30 },
  { id: 'leak', label: { express: '筐底漏了', garbage: '桶底漏了' }, unit: '秒', max: 60 },
  { id: 'strip', label: { express: '撕掉面单', garbage: '糊上泥巴' }, unit: '件', max: 10 },
  { id: 'tape', label: { express: '缠胶带', garbage: '套塑料袋' }, unit: '件', max: 10 },
  { id: 'kick', label: { express: '踹一脚', garbage: '踹一脚' }, unit: '次', max: 3 },
  { id: 'help', label: { express: '我来帮忙', garbage: '我来帮忙' }, unit: '件', max: 30 },
  { id: 'audit', label: { express: '质检抽查', garbage: '督导检查' }, unit: '秒', max: 60 },
  { id: 'tricky', label: { express: '刁钻垃圾', garbage: '刁钻垃圾' }, unit: '件', max: 10 },
  { id: 'prank', label: { express: '捣乱无人机', garbage: '捣乱无人机' }, unit: '件', max: 10 },
];
export const EFF = Object.fromEntries(EFFECTS.map(e => [e.id, e]));
/* 快递模式没有垃圾可扔：刁钻垃圾按"又来一车"同量执行，保证观众送礼总有效果 */
export const resolveEffect = (id, mode) => (id === 'tricky' && mode !== 'garbage' ? 'truck' : id);
export const effLabel = (id, mode) => { const e = EFF[resolveEffect(id, mode)]; return e ? e.label[mode] || e.label.express : id; };

export const ACTION_ALIAS = {
  truck: 'truck', '又来一车': 'truck', '又来一车垃圾': 'truck', '环卫车': 'truck', rush: 'truck', add: 'truck',
  blind: 'blind', big: 'blind', giant: 'blind', '超大件': 'blind', '盲盒': 'blind', '爆箱盲盒': 'blind', '大垃圾袋': 'blind', '垃圾袋': 'blind',
  seal: 'seal', swap: 'seal', '封筐': 'seal', '封桶': 'seal',
  speed: 'speed', fast: 'speed', '加速': 'speed', '传送带加速': 'speed',
  leak: 'leak', '漏筐': 'leak', '筐底漏了': 'leak', '漏桶': 'leak', '桶底漏了': 'leak',
  strip: 'strip', '撕面单': 'strip', '撕掉面单': 'strip', '糊泥': 'strip', '糊泥巴': 'strip', '糊上泥巴': 'strip',
  tape: 'tape', sticky: 'tape', '缠胶带': 'tape', '套袋': 'tape', '套塑料袋': 'tape',
  kick: 'kick', '踹一脚': 'kick',
  help: 'help', robot: 'help', '帮忙': 'help', '我来帮忙': 'help',
  audit: 'audit', inspect: 'audit', '抽查': 'audit', '质检抽查': 'audit', '督导检查': 'audit', '督导': 'audit',
  tricky: 'tricky', '刁钻': 'tricky', '刁钻垃圾': 'tricky',
  prank: 'prank', '捣乱': 'prank', '捣乱无人机': 'prank',
};

/* 关卡编辑卡片的字段：[键, 显示名, 颜色类] */
export const LEVEL_FIELDS = {
  express: [['red', '红件', 'c0'], ['yellow', '黄件', 'c1'], ['blue', '蓝件', 'c2'], ['tape', '缠胶带'], ['strip', '无面单'], ['blind', '盲盒个数'], ['blindSize', '盲盒内件数'], ['speed', '传送带倍速'], ['time', '限时(秒)']],
  garbage: [['rec', '可回收', 'g0'], ['haz', '有害', 'g1'], ['kit', '厨余', 'g2'], ['oth', '其他', 'g3'], ['bag', '套塑料袋'], ['mud', '糊泥巴'], ['blind', '大垃圾袋'], ['blindSize', '袋内件数'], ['speed', '传送带倍速'], ['time', '限时(秒)']],
};
