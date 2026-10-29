// All on-screen copy lives here. The title font is subset to exactly the
// characters in allText(), so after editing anything here re-run:
//   npm run fonts

export const MISSION = {
  code: 'BAIYAO ORBITAL',
  name: '白曜轨道站 · 插件服务器',
  scrollHint: '向下滚动',
};

// One entry per product, in rack order. `featured` products get their own scroll
// stop (drawer slides out); any others show on the rack and on hover.
// This is the official site's first batch (plugin-library-site/src/content/products.ts):
// same order, `id` = the site's slug, `tag` = its category, `desc` = its tagline
// without the closing 。. Keep the two in step; more products will be added later.
// 白曜重工 is the Windows desktop app, so it is tagged 直播软件, not as a plugin.
// A real preview image can be dropped in as src/assets/previews/<id>.webp|png|jpg.
export const PLUGINS = [
  { id: 'typing-challenge', name: '打字闯关', tag: '互动游戏', accent: '#7bdff2', featured: true, desc: '在直播间用中文打字闯关，观众礼物也能来捣乱' },
  { id: 'red-black-lock', name: '红黑破锁', tag: '互动游戏', accent: '#ef476f', featured: true, desc: '观众送礼加码，主播连按单键破锁逃出牢笼' },
  { id: 'critique-queue', name: '锐评排队', tag: '排队工具', accent: '#c3a6ff', featured: true, desc: '把观众排进队列，一位一位锐评，不冷场也不乱场' },
  { id: 'ice-cream-catch', name: '冰淇淋接球', tag: '互动游戏', accent: '#ffd6a5', featured: true, desc: '移动盘子接住掉落的冰淇淋，稳稳堆到目标高度' },
  { id: 'perler-beads', name: '拼豆', tag: '互动游戏', accent: '#ff9ecd', featured: true, desc: '一颗一颗拼出图案，礼物帮忙也捣乱，最后熨成 3D 成品' },
  { id: 'baiyao-studio', name: '白曜重工', tag: '直播软件', accent: '#adb5bd', featured: true, desc: '把直播间当成工作台：画布、插件、OBS 与 VTS 一起管' },
];

// range = [start, end] in scroll progress during which the story block shows.
// The featured plugin cards are added between the server and community blocks
// by buildStory() (see story.js).
export const SECTIONS = [
  {
    id: 'orbit',
    short: '轨道',
    range: [0.0, 0.1],
    label: 'ORBIT 01 · 近地轨道 408 KM',
    title: '白曜轨道站',
    body: '向下滚动，看它一块块展开',
  },
  {
    id: 'unfold',
    short: '展开',
    range: [0.13, 0.29],
    label: 'UNFOLD 02 · 舱段分离',
    title: '把空间站拆开看看',
    body: '131 个零件依次分离，露出藏在中间的核心',
  },
  {
    id: 'server',
    short: '服务器',
    range: [0.32, 0.385],
    label: 'SERVER 03 · 插件服务器',
    title: '核心是一台插件服务器',
    body: `每一格都是一件直播作品，首发 ${PLUGINS.length} 件`,
  },
  {
    id: 'community',
    short: '社区',
    range: [0.87, 0.94],
    label: 'COMMUNITY 04 · 社区频道',
    title: '信号接通了',
    body: '这里是我们的社区',
  },
  {
    id: 'end',
    short: '',
    range: [0.95, 1.01],
    label: 'END · 白曜',
    title: '下次直播见',
    body: '',
  },
];

export const PLUGIN_LABEL = (index, total, tag) =>
  `SLOT ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${tag}`;

// Douyin rows and the QR (src/assets/community/douyin-qr.webp) are the streamer's
// real profile info (2026-10-20; no fan group given, so no row for it). The feed
// wall and the always-on LIVE badge are still demo content.
export const COMMUNITY = {
  label: 'COMMUNITY · 社区频道',
  live: 'LIVE',
  title: '欢迎来到白曜的直播间',
  rows: [
    ['抖音号', '32562082908'],
    ['早上', '7:01 - 9:01'],
    ['晚上', '18:01 - 20:01'],
  ],
  qr: '扫码关注 @SL.白曜',
  wallTitle: '最新动态',
  wall: Array.from({ length: 22 }, (_, i) => {
    const actions = ['上船了', '点亮了灯牌', '加入了粉丝群', '送出一个小心心', '孵出了一只自己人'];
    return `曜粉 #${String(1000 + ((i * 7919) % 9000)).padStart(4, '0')} ${actions[i % actions.length]}`;
  }),
};

export const TRANSITION_TEXT = {
  title: '信号中断',
  sub: 'SIGNAL LOST · 正在接入社区频道',
};

export const TELEMETRY_LABELS = {
  altitude: 'ALT',
  velocity: 'VEL',
  plugins: '作品在线',
  clock: 'T+',
};

export const HOVER_HINT = '点击查看';

export const SERVER_TEXT = {
  header: 'BAIYAO PLUGIN SERVER',
  status: 'ONLINE',
  preview: '预览图（占位）',
};

export const CREDITS = [
  '空间站：NASA · 星图：NASA SVS',
  '地球贴图：Solar System Scope（CC BY 4.0）',
  '分离火花：Unity Labs（CC0）· 字体：得意黑 / Space Mono（OFL）',
];

export const PARTICLE_TEXT = '白曜';

export const LOADING_TEXT = 'LOADING';

// Characters cycled through while text "decodes". Latin and digits only, so
// scrambling never needs glyphs that are not already in the subset fonts.
export const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';

export const DYNAMIC_CHARS = '0123456789.:%+-/ KMSPLG';

export function allText() {
  return [
    ...Object.values(MISSION),
    ...PLUGINS.flatMap((p) => [p.name, p.tag, p.desc]),
    ...SECTIONS.flatMap((s) => [s.short, s.label, s.title, s.body]),
    PLUGIN_LABEL(0, PLUGINS.length, ''),
    COMMUNITY.label,
    COMMUNITY.live,
    COMMUNITY.title,
    ...COMMUNITY.rows.flat(),
    COMMUNITY.qr,
    COMMUNITY.wallTitle,
    ...COMMUNITY.wall,
    ...Object.values(TRANSITION_TEXT),
    ...Object.values(TELEMETRY_LABELS),
    HOVER_HINT,
    ...Object.values(SERVER_TEXT),
    ...CREDITS,
    PARTICLE_TEXT,
    LOADING_TEXT,
    SCRAMBLE_CHARS,
    DYNAMIC_CHARS,
  ].join('');
}
