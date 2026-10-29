/* 统计与榜单：今天擦掉几处、累计几处、今天的捣乱榜/帮忙榜。存本机 localStorage，读写失败只是不保存。
   试玩/预览来源照常计数，但不进榜单（和淘金一样）。日期换了，"今天"清零，累计保留。 */
const SAVE_GAP = 2000;
const BOARD_MAX = 200;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const realSource = s => s === 'gift' || s === 'chat' || s === 'like' || s === 'action';

const dict = src => {
  const d = Object.create(null);
  if (src && typeof src === 'object') for (const [k, v] of Object.entries(src)) if (typeof v === 'number' && Number.isFinite(v)) d[k] = v;
  return d;
};

function fresh(total = 0) {
  return { v: 1, day: today(), today: 0, total, strokes: 0, mess: dict(), help: dict() };
}

export function createStats(key, onChange = () => {}) {
  let st = fresh();
  let dirty = false;
  let lastSave = 0;
  let readable = true;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && v.v === 1) st = { ...fresh(Number(v.total) || 0), day: String(v.day || ''), today: Number(v.today) || 0, strokes: Number(v.strokes) || 0, mess: dict(v.mess), help: dict(v.help) };
    }
  } catch (e) {
    readable = false;
  }
  function rollDay() {
    if (st.day !== today()) st = fresh(st.total);
  }
  function bump(map, name, n) {
    if (!name) return;
    map[name] = (map[name] || 0) + n;
    const keys = Object.keys(map);
    if (keys.length > BOARD_MAX) {
      keys.sort((a, b) => map[a] - map[b]);
      for (const k of keys.slice(0, keys.length - BOARD_MAX)) delete map[k];
    }
  }
  function touch() {
    dirty = true;
    onChange();
  }
  const top = (map, n = 3) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);

  return {
    get readable() {
      return readable;
    },
    get today() {
      rollDay();
      return st.today;
    },
    get total() {
      return st.total;
    },
    get strokes() {
      return st.strokes;
    },
    cleaned(stain, helper) {
      rollDay();
      st.today++;
      st.total++;
      if (helper && realSource(helper.source)) bump(st.help, helper.name, 1);
      touch();
    },
    messed(owner, n = 1) {
      rollDay();
      if (owner && realSource(owner.source)) bump(st.mess, owner.name, n);
      touch();
    },
    helped(owner, n = 1) {
      rollDay();
      if (owner && realSource(owner.source)) bump(st.help, owner.name, n);
      touch();
    },
    stroke() {
      st.strokes++;
      dirty = true;
    },
    boards() {
      rollDay();
      return { mess: top(st.mess), help: top(st.help) };
    },
    resetToday() {
      st = fresh(st.total);
      touch();
    },
    resetAll() {
      st = fresh(0);
      touch();
    },
    tick(nowMs) {
      if (!dirty || nowMs - lastSave < SAVE_GAP) return;
      lastSave = nowMs;
      dirty = false;
      try {
        localStorage.setItem(key, JSON.stringify(st));
      } catch (e) {
        readable = false;
      }
    }
  };
}
