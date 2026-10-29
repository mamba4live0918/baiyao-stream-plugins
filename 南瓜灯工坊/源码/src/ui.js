// 页面上的 DOM：一条提示（一次只显示一条）、鼠标动了才出现的「设置 / 试做一个」按钮、设置面板。
import { MOLDS } from './molds.js';
import { MESS_IDS, MESS_NAMES, DEFAULT_KEYWORDS } from './rules.js';
import { defaultSettings } from './settings.js';

const MESS_TIPS = {
  wind: '一阵风贴着塔往上卷，上面四成的灯飞出去',
  cat: '跳上塔顶，一下拍掉一盏',
  witch: '停在那一层的高度讨糖，不给就撞倒那一层往上的灯',
  ghost: '叼走塔顶那盏飘走；主播点它几下能抢回来'
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI({ getSettings, apply, reset, trial, live, edit, resetLayout }) {
  const $ = id => document.getElementById(id);
  const toast = $('toast'), bar = $('topbar');

  // ---------- 提示：排队，一次一条 ----------
  const pending = [];
  let showing = false;
  function next() {
    const item = pending.shift();
    if (!item) { showing = false; return; }
    showing = true;
    toast.textContent = item.text;
    toast.className = 'show ' + (item.kind || '');
    setTimeout(() => { toast.className = item.kind || ''; setTimeout(next, 180); }, item.ms);
  }
  function push(text, kind, ms) {
    if (pending.length > 4) pending.splice(0, pending.length - 4);
    pending.push({ text, kind, ms });
    if (!showing) next();
  }
  const say = text => push(text, '', 2200);
  const banner = (text, kind) => push(text, 'mess ' + (kind || ''), 2400);

  // ---------- 按钮：鼠标动一下出现，2.5 秒不动藏起来 ----------
  let hideTimer = 0;
  addEventListener('pointermove', () => {
    bar.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!bar.matches(':hover')) bar.classList.remove('visible'); }, 2500);
  });
  $('btn-settings').onclick = () => openSettings();
  $('btn-try').onclick = () => trial();
  $('btn-layout').onclick = () => edit(true);
  $('edit-done').onclick = () => edit(false);
  $('edit-reset').onclick = () => resetLayout();
  function editing(on) { document.body.classList.toggle('editing', on); if (on) say('拖框里挪位置，拖右下角的圆点改大小'); }

  // ---------- 设置面板 ----------
  const panel = $('settings');
  let draft = null;

  function rowsHtml(table, unit) {
    return (draft.rules[table] || []).map((r, i) => `<div class="row" data-table="${table}" data-i="${i}">
      <input class="gift" value="${esc(r.name)}" placeholder="礼物名，比如 小心心">
      <span>送 1 个 =</span><input class="num" type="number" min="0" value="${r.min}"><span>～</span><input class="num" type="number" min="0" value="${r.max}"><span>${unit}</span>
      <button class="del" title="删掉这一行">✕</button></div>`).join('') || `<p class="empty">还没有，点下面「添加礼物」。表里没有的礼物什么都不做。</p>`;
  }

  function render() {
    const s = draft;
    panel.innerHTML = `<div class="sheet" role="dialog" aria-label="南瓜灯工坊设置">
      <h2>南瓜灯工坊 · 设置</h2>
      <section><h3>🎃 订南瓜</h3>
        <label class="line">弹幕口令 <input id="s-keywords" value="${esc(s.order.keywords.join('，'))}" placeholder="${esc(DEFAULT_KEYWORDS.join('，'))}"></label>
        <p class="tip">观众发这些字就订一个南瓜；「南瓜灯猫猫」「南瓜灯笑脸」这种还能点名要脸型。每人同时最多 <input id="s-per" class="num" type="number" min="0" value="${s.order.perPerson}"> 个（0 = 不限）。</p>
        <h4>订南瓜礼物</h4>${rowsHtml('order', '个南瓜')}
        <button class="add" data-table="order">＋ 添加礼物</button>
      </section>
      <section><h3>😈 捣乱</h3>
        <h4>捣乱池（送捣乱礼物时，从勾上的里面随机来；来了都先讨糖，见下面「不给糖就捣蛋」）</h4>
        <div class="pool">${MESS_IDS.map(id => `<label class="chip"><input type="checkbox" data-pool="${id}" ${s.rules.pool.includes(id) ? 'checked' : ''}><b>${MESS_NAMES[id]}</b><small>${MESS_TIPS[id]}</small></label>`).join('')}</div>
        <h4>捣乱礼物</h4>${rowsHtml('mess', '下')}
        <button class="add" data-table="mess">＋ 添加礼物</button>
      </section>
      <section><h3>🛒 南瓜塔</h3>
        <label class="line">塔叠到 <input id="s-ship" class="num" type="number" min="0" value="${s.tower.shipAt}"> 盏，小车就来拉走（拉走的灯安全了；0 = 不拉走，一直叠）</label>
      </section>
      <section><h3>🧚 南瓜精灵（观众帮主播做灯）</h3>
        <p class="tip">排队太多做不完时，观众送「帮做礼物」派南瓜精灵来：它把排在最前面的南瓜直接变成灯、送上塔（主播手上那个不动）。</p>
        <h4>帮做礼物</h4>${rowsHtml('help', '盏')}
        <button class="add" data-table="help">＋ 添加礼物</button>
      </section>
      <section><h3>🏮 灯展和贡献榜</h3>
        <label class="line"><input id="s-garland" type="checkbox" ${s.show.garland ? 'checked' : ''}> 灯展：小车送达的灯挂到一串灯上，每盏写着名字</label>
        <label class="line"><input id="s-board" type="checkbox" ${s.show.board ? 'checked' : ''}> 贡献榜：今晚谁的灯送达最多、谁送糖、谁派精灵帮做（前 5 名）</label>
        <button id="s-layout">在画面上摆位置、改大小（灯展、贡献榜、糖罐）</button>
      </section>
      <section><h3>🍬 不给糖就捣蛋</h3>
        <p class="tip">小车送达一盏灯得 <input id="c-per" class="num" type="number" min="0" value="${s.candy.perLantern}"> 颗糖，装满一车再多给 <input id="c-bonus" class="num" type="number" min="0" value="${s.candy.fullBonus}"> 颗。捣蛋鬼来了先讨糖 <input id="c-ask" class="num" type="number" min="0.5" step="0.5" value="${s.mess.askSeconds}"> 秒，主播点它就给糖，它就走了。</p>
        <p class="tip">每个要几颗：${MESS_IDS.map(id => `${MESS_NAMES[id]} <input class="num" data-price="${id}" type="number" min="0" value="${s.candy.price[id]}">`).join('　')}（黑猫按拍几下算）</p>
        <h4>送糖礼物（粉丝帮主播攒糖，可以不填）</h4>${rowsHtml('candy', '颗糖')}
        <button class="add" data-table="candy">＋ 添加礼物</button>
      </section>
      <details><summary>高级设置</summary>
        <label class="line">塔放在 <select id="s-side"><option value="right" ${s.tower.side === 'right' ? 'selected' : ''}>右边（工作台在左）</option><option value="left" ${s.tower.side === 'left' ? 'selected' : ''}>左边（工作台在右）</option></select></label>
        <label class="line">工作台大小 <input id="s-bench" type="range" min="0.6" max="1.5" step="0.05" value="${s.bench.size}"></label>
        <label class="line">塔上灯的大小 <input id="s-tsize" type="range" min="0.5" max="1.6" step="0.05" value="${s.tower.size}"></label>
        <label class="line">最下面 <input id="s-safe" class="num" type="number" min="0" value="${s.tower.safeLayers}"> 层摔下来不会碎，再往上每层多 <input id="s-step" class="num" type="number" min="0" max="100" value="${Math.round(s.tower.breakStep * 100)}">% 会碎</label>
        <label class="line">每个南瓜给 <input id="s-tray" class="num" type="number" min="1" max="6" value="${s.making.trayCount}"> 个模具（随机挑）</label>
        <div class="molds">${MOLDS.map(m => `<label class="chip small"><input type="checkbox" data-mold="${m.id}" ${s.making.molds.includes(m.id) ? 'checked' : ''}>${m.name}</label>`).join('')}</div>
        <label class="line">小鬼要点 <input id="s-ghost" class="num" type="number" min="1" value="${s.mess.ghostHits}"> 下才放手，<input id="s-ghost-s" class="num" type="number" min="1" value="${s.mess.ghostSeconds}"> 秒内飘走</label>
        <label class="line">女巫撞之前预警 <input id="s-witch" class="num" type="number" min="0" step="0.5" value="${s.mess.witchWarning}"> 秒</label>
        <label class="line"><input id="s-faces" type="checkbox" ${s.order.faces ? 'checked' : ''}> 弹幕可以点名要脸型</label>
        <label class="line"><input id="s-hints" type="checkbox" ${s.making.hints ? 'checked' : ''}> 手停下来时示范下一步怎么做</label>
        <label class="line"><input id="s-audio" type="checkbox" ${s.audio.enabled ? 'checked' : ''}> 音效　音量 <input id="s-vol" type="range" min="0" max="1" step="0.05" value="${s.audio.volume}"></label>
        <label class="line"><input id="s-receive" type="checkbox" ${s.live.receive ? 'checked' : ''}> 接收直播礼物和弹幕</label>
        <p class="tip" id="s-live">${esc(live.status())}</p>
        <button id="s-reset" class="danger">清空队伍和塔</button>
      </details>
      <div class="actions"><button id="s-cancel">取消</button><button id="s-save" class="primary">保存</button></div>
    </div>`;
  }

  function read() {
    const s = draft, v = id => panel.querySelector('#' + id);
    s.order.keywords = v('s-keywords').value.split(/[,，、\s]+/u).map(x => x.trim()).filter(Boolean);
    if (!s.order.keywords.length) s.order.keywords = [...DEFAULT_KEYWORDS];
    // 数字框原样交给 sanitizeSettings：清空的框会变回默认值，而不是 0
    s.order.perPerson = v('s-per').value;
    for (const table of ['order', 'mess', 'candy', 'help']) s.rules[table] = [...panel.querySelectorAll(`.row[data-table="${table}"]`)].map(r => { const n = r.querySelectorAll('.num'); return { name: r.querySelector('.gift').value, min: n[0].value, max: n[1].value }; });
    s.rules.pool = [...panel.querySelectorAll('[data-pool]')].filter(x => x.checked).map(x => x.dataset.pool);
    s.tower.side = v('s-side').value;
    s.bench.size = Number(v('s-bench').value);
    s.tower.size = Number(v('s-tsize').value);
    s.tower.safeLayers = v('s-safe').value;
    s.tower.shipAt = v('s-ship').value;
    s.show = { garland: v('s-garland').checked, board: v('s-board').checked };
    s.candy.perLantern = v('c-per').value;
    s.candy.fullBonus = v('c-bonus').value;
    s.mess.askSeconds = v('c-ask').value;
    s.candy.price = Object.fromEntries([...panel.querySelectorAll('[data-price]')].map(x => [x.dataset.price, x.value]));
    const step = v('s-step').value.trim();
    s.tower.breakStep = step === '' ? '' : Number(step) / 100;
    s.making.trayCount = v('s-tray').value;
    s.making.molds = [...panel.querySelectorAll('[data-mold]')].filter(x => x.checked).map(x => x.dataset.mold);
    s.mess.ghostHits = v('s-ghost').value;
    s.mess.ghostSeconds = v('s-ghost-s').value;
    s.mess.witchWarning = v('s-witch').value;
    s.order.faces = v('s-faces').checked;
    s.making.hints = v('s-hints').checked;
    s.audio.enabled = v('s-audio').checked;
    s.audio.volume = Number(v('s-vol').value);
    s.live.receive = v('s-receive').checked;
  }

  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) { if (e.target === panel) close(); return; }
    if (b.classList.contains('add')) { read(); (draft.rules[b.dataset.table] ||= []).push({ name: '', min: 1, max: b.dataset.table === 'mess' ? 3 : b.dataset.table === 'candy' ? 5 : 1 }); render(); return; }
    if (b.classList.contains('del')) { read(); const r = b.closest('.row'); draft.rules[r.dataset.table].splice(Number(r.dataset.i), 1); render(); return; }
    if (b.id === 's-cancel') { close(); return; }
    if (b.id === 's-layout') { read(); apply(draft); close(); edit(true); return; }
    if (b.id === 's-save') { read(); apply(draft); close(); say('设置已保存'); return; }
    if (b.id === 's-reset') {   // OBS 里弹不出确认框：点两下才清空
      if (b.dataset.armed) { reset(); say('已清空'); b.textContent = '清空队伍和塔'; delete b.dataset.armed; return; }
      b.dataset.armed = '1'; b.textContent = '再点一次确认清空';
      setTimeout(() => { if (b.isConnected) { b.textContent = '清空队伍和塔'; delete b.dataset.armed; } }, 3000);
    }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });

  function openSettings() {
    draft = JSON.parse(JSON.stringify(getSettings() || defaultSettings()));
    render();
    panel.classList.add('open');
  }
  function close() { panel.classList.remove('open'); panel.innerHTML = ''; draft = null; }

  return {
    say, banner, openSettings, editing,
    liveChanged: l => { const el = panel.querySelector('#s-live'); if (el) el.textContent = l.status(); }
  };
}
