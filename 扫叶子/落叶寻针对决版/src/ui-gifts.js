(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./gifts.js'));else root.LeafGiftUI=factory(root.LeafGifts);})(typeof globalThis!=='undefined'?globalThis:this,function(Gifts){
'use strict';
const W=1440,H=810,MERGE_MS=3000,QUEUE_MAX=20,STAY_MS=2000,STAY_LARGE_MS=3000,LEAVE_MS=280,NICK_MAX=24,PORTION_CAP=99999,TEST_MAX=100,REFRESH_MS=1000,MENU_MAX=320;
const DEFAULT_NICK='观众',SIDES=['troll','help'],SIDE_NAMES={troll:'捣乱',help:'帮忙'},TIER_FALLBACK={small:'小',medium:'中',large:'大'},LEGEND_FALLBACK={x:24,y:560};
const TABS=[['rules','礼物规则'],['params','效果参数'],['likes','点赞'],['face','护脸圈与连接']],TAB_ALIAS={connect:'face',connection:'face',ws:'face',like:'likes',gifts:'rules',effects:'params'};
const WS_VIEW={off:{tone:'off',text:'未连接'},connecting:{tone:'wait',text:'连接中…'},open:{tone:'ok',text:'已连接'},closed:{tone:'bad',text:'已断开，稍后自动重连'}};
const AVATAR=/^(?:https?:\/\/|data:image\/)/i,SYMBOLS=/[\s·•・,，.。!！?？:：;；'"“”‘’()（）\[\]【】\-_~～]/g;
const KEYCODES={9:'Tab',13:'Enter',27:'Escape',32:' ',33:'PageUp',34:'PageDown',35:'End',36:'Home',38:'ArrowUp',40:'ArrowDown'};
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),own=(o,k)=>o!=null&&typeof k==='string'&&Object.prototype.hasOwnProperty.call(o,k)?o[k]:undefined;
const text=v=>typeof v==='string'?v.trim():typeof v==='number'&&Number.isFinite(v)?String(v):'';
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v)),finite=v=>Number.isFinite(v)?v:0,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const portionsOf=v=>{const n=typeof v==='string'&&v.trim()?Number(v):v;return Number.isInteger(n)&&n>=1?Math.min(n,PORTION_CAP):1;};
const groupDigits=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');

// 与 gifts.js 的 normalizeName 相同；只在页面没装 LeafGifts 时兜底，保证判重口径和礼物匹配一致
function localNormalize(s){return(s==null?'':String(s)).trim().replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).toLowerCase().replace(SYMBOLS,'');}
function normalize(s){const g=Gifts||(typeof globalThis!=='undefined'?globalThis.LeafGifts:null);return g&&typeof g.normalizeName==='function'?g.normalizeName(s):localNormalize(s);}

// ---------- 纯逻辑（Node 可测） ----------
const tiersOf=fx=>fx&&Array.isArray(fx.TIERS)&&fx.TIERS.length?fx.TIERS:['small','medium','large'];
const tierName=(fx,t)=>own(fx&&fx.TIER_NAMES,t)||own(TIER_FALLBACK,t)||'';
const effectOf=(fx,id)=>{const e=own(fx&&fx.EFFECT_BY_ID,id);return isObj(e)?e:null;};
const sideOf=e=>e&&e.side==='help'?'help':'troll';
const effectName=(fx,e,tier)=>{const t=tierName(fx,tier);return`${e.icon||''} ${e.name||e.id}`.trim()+(t?'·'+t:'');};
function effectLabel(fx,id,tier,portions){const e=effectOf(fx,id);if(!e)return'';const n=portionsOf(portions);return effectName(fx,e,tier)+(n>1?' ×'+n:'');}
function effectOptions(fx){
  const list=fx&&Array.isArray(fx.EFFECTS)?fx.EFFECTS.filter(isObj):[];
  return SIDES.flatMap(s=>list.filter(e=>sideOf(e)===s).map(e=>({value:e.id,label:`${e.icon||''} ${e.name||e.id}`.trim(),group:SIDE_NAMES[s],tone:s})));
}
const tierOptions=fx=>tiersOf(fx).map(t=>({value:t,label:tierName(fx,t)||t}));
function legendGroups(config,fx){
  const groups={troll:[],help:[]},rules=isObj(config)&&Array.isArray(config.rules)?config.rules:[];
  for(const r of rules){
    const gift=isObj(r)?text(r.gift):'',e=gift?effectOf(fx,r.effect):null;
    if(e)groups[sideOf(e)].push({gift,effect:e.id,side:sideOf(e),text:effectLabel(fx,e.id,r.tier,r.portions)});
  }
  return groups;
}

const cleanNick=v=>{const s=text(v);return s?Array.from(s).slice(0,NICK_MAX).join(''):DEFAULT_NICK;};
const SEG=typeof Intl==='object'&&typeof Intl.Segmenter==='function'?new Intl.Segmenter('zh',{granularity:'grapheme'}):null;
function initialOf(name){
  const s=cleanNick(name);let first='';
  if(SEG){for(const g of SEG.segment(s)){first=g.segment;break;}}else first=Array.from(s)[0]||'';
  return first.toUpperCase();
}
function safeAvatar(v){const s=typeof v==='string'?v.trim():'';return AVATAR.test(s)?s:'';}
let bannerSeq=0;
// 队列里可能有一条正在显示（shown），其余按到达顺序排队。同一人同一效果同一档位、距上次 3 秒内的并成一条
function mergeBanner(queue,item,now,max){
  const list=Array.isArray(queue)?queue:[];
  if(!isObj(item)||typeof item.effect!=='string'||!item.effect)return list;
  const t=Number.isFinite(now)?now:Date.now(),user=cleanNick(item.user),tier=typeof item.tier==='string'?item.tier:'';
  const key=[user,item.effect,tier].join('\n'),add=portionsOf(item.portions),avatar=safeAvatar(item.avatar);
  let i=list.length-1;while(i>=0&&!(isObj(list[i])&&list[i].key===key))i--;
  if(i>=0&&t-list[i].last<MERGE_MS)return list.map((e,j)=>j===i?{...e,portions:Math.min(PORTION_CAP,e.portions+add),last:t,rev:e.rev+1,avatar:e.avatar||avatar}:e);
  return trimBanners([...list,{id:++bannerSeq,key,user,avatar,effect:item.effect,tier,portions:add,last:t,rev:0,shown:false}],Number.isInteger(max)&&max>=1?max:QUEUE_MAX);
}
// 积压时先把排队中同一人同一效果的条目并到最早那条，还超就丢最旧的排队条目；正在显示的那条不动
function trimBanners(list,cap){
  if(list.length<=cap)return list;
  const out=[],first=new Map();
  for(const e of list){
    const j=e.shown?undefined:first.get(e.key);
    if(j===undefined){if(!e.shown)first.set(e.key,out.length);out.push(e);continue;}
    const m=out[j];out[j]={...m,portions:Math.min(PORTION_CAP,m.portions+e.portions),last:Math.max(m.last,e.last),rev:m.rev+1,avatar:m.avatar||e.avatar};
  }
  while(out.length>cap){const k=out.findIndex(e=>!e.shown);if(k<0)break;out.splice(k,1);}
  return out;
}
const bannerStay=e=>e&&e.tier==='large'?STAY_LARGE_MS:STAY_MS;
function bannerParts(entry,fx){
  const en=isObj(entry)?entry:{},e=effectOf(fx,en.effect),n=portionsOf(en.portions),user=cleanNick(en.user);
  return{side:sideOf(e),nick:'@'+user,initial:initialOf(user),verb:'召来了',effect:e?effectName(fx,e,en.tier):'',count:n>1?'×'+n:''};
}
function clampLegend(x,y,w,h){
  const cw=Math.max(0,finite(w)),ch=Math.max(0,finite(h));
  return{x:Math.round(clamp(finite(x),0,Math.max(0,W-cw))),y:Math.round(clamp(finite(y),0,Math.max(0,H-ch)))};
}
// 「套用直播间档位」：同名（归一化后）规则原位替换，多出的同名条目去掉，缺的追加到末尾，其他规则不动
function applyPreset(rules,presets){
  const out=Array.isArray(rules)?rules.slice():[];let replaced=0,added=0;
  for(const p of Array.isArray(presets)?presets:[]){
    const key=isObj(p)?normalize(text(p.gift)):'';if(!key)continue;
    const hits=out.reduce((a,r,i)=>isObj(r)&&normalize(text(r.gift))===key?[...a,i]:a,[]);
    if(!hits.length){out.push({...p});added++;continue;}
    out[hits[0]]={...p};replaced++;
    for(let k=hits.length-1;k>0;k--)out.splice(hits[k],1);
  }
  return{rules:out,replaced,added};
}
function duplicateRows(rules){
  const keys=(Array.isArray(rules)?rules:[]).map(r=>isObj(r)?normalize(text(r.gift)):''),n=new Map();
  for(const k of keys)if(k)n.set(k,(n.get(k)||0)+1);
  return keys.reduce((a,k,i)=>k&&n.get(k)>1?[...a,i]:a,[]);
}
function setIn(obj,path,value){
  if(!path.length)return value;
  const[k,...rest]=path,src=obj!==null&&typeof obj==='object'?obj:typeof k==='number'?[]:{},copy=Array.isArray(src)?src.slice():{...src};
  copy[k]=setIn(src[k],rest,value);return copy;
}
const valueAt=(obj,path)=>path.reduce((o,k)=>o!==null&&typeof o==='object'?o[k]:undefined,obj);
function pathKey(path){const s=Array.isArray(path)?path.join('.'):typeof path==='string'?path:'';return s.replace(/\[["']?([^\]"']+)["']?\]/g,'.$1').replace(/^\.+/,'');}
function tabOfPath(path){const head=pathKey(path).split('.')[0];return head==='rules'||head==='legend'?'rules':head==='params'||head==='likes'?head:'';}
// 输入框里的数先按数字存，转不了就原样留着，交给 validateConfig 报错
function numOrRaw(raw){const s=typeof raw==='string'?raw.trim():raw;if(s===''||s==null)return'';const n=Number(s);return Number.isFinite(n)?n:s;}
const fitsRange=(v,o)=>typeof v==='number'&&Number.isFinite(v)&&!(o.min!=null&&v<o.min)&&!(o.max!=null&&v>o.max)&&(!o.integer||Number.isInteger(v));
function likeView(s){
  const o=isObj(s)?s:{},n=v=>Number.isSafeInteger(v)&&v>=0?v:0,step=n(o.step),carry=n(o.carry);
  return{enabled:!!o.enabled,total:n(o.total),carry,step,remain:step?Math.max(0,step-carry):0,ratio:step?Math.min(1,carry/step):0};
}
function connectionView(c){const o=isObj(c)?c:{};return{sdk:o.sdk?{tone:'ok',text:'已接入'}:{tone:'off',text:'未检测到'},ws:own(WS_VIEW,o.ws)||WS_VIEW.off,url:typeof o.url==='string'?o.url:''};}
const draftOf=cfg=>{const c=isObj(cfg)?cfg:{};return{params:isObj(c.params)?clone(c.params):{},rules:Array.isArray(c.rules)?clone(c.rules):[],likes:isObj(c.likes)?clone(c.likes):{}};};
const draftKey=d=>JSON.stringify([d.params,d.rules,d.likes]);

// ---------- DOM 小工具（只在浏览器里调用） ----------
// 字符串子节点由 append 作为文本节点插入，礼物名、昵称等外来文字不会被当成 HTML
function h(tag,props,...kids){
  const el=document.createElement(tag);
  if(props)for(const[k,v]of Object.entries(props)){if(v==null||v===false)continue;if(k==='class')el.className=v;else el.setAttribute(k,v===true?'':String(v));}
  for(const c of kids.flat(Infinity))if(c!=null&&c!==false)el.append(c);
  return el;
}
const keyOf=e=>{const k=e.key;if(k&&k!=='Unidentified')return k==='Spacebar'?' ':k==='Esc'?'Escape':k;return KEYCODES[e.keyCode||e.which||0]||'';};
const restart=(el,cls)=>{el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);};
function avatarEl(name,url,cls){
  const box=h('span',{class:'lg-ava'+(cls?' '+cls:''),'aria-hidden':'true'},h('b',{class:'lg-ava-ini'},initialOf(name))),src=safeAvatar(url);
  if(src){
    const img=document.createElement('img');img.alt='';img.decoding='async';img.referrerPolicy='no-referrer';img.draggable=false;
    img.addEventListener('load',()=>box.classList.add('lg-ava-ok'));
    img.addEventListener('error',()=>{box.classList.remove('lg-ava-ok');img.remove();});
    img.src=src;box.append(img);
  }
  return box;
}
function switchEl(checked,label,onChange){
  const el=h('button',{type:'button',class:'lg-switch',role:'switch','aria-checked':String(!!checked),'aria-label':label});
  const api={el,get checked(){return el.getAttribute('aria-checked')==='true';},set checked(v){el.setAttribute('aria-checked',String(!!v));}};
  el.addEventListener('click',()=>{api.checked=!api.checked;onChange(api.checked);});
  return api;
}

// ---------- 页面内下拉（OBS 浏览器源弹不出原生 <select>） ----------
let openSelect=null;
const closeSelects=()=>{if(openSelect)openSelect.close();};
const normOptions=list=>(Array.isArray(list)?list:[]).filter(isObj).map(o=>({value:o.value,label:o.label==null?String(o.value):String(o.label),group:o.group?String(o.group):'',tone:SIDES.includes(o.tone)?o.tone:''}));
function makeSelect(options,value,onChange){
  let opts=normOptions(options),cur=value,pop=null,items=[],active=-1;
  const label=h('span',{class:'lg-select-label'});
  const btn=h('button',{type:'button',class:'lg-select','aria-haspopup':'listbox','aria-expanded':'false'},label,h('i',{class:'lg-select-caret','aria-hidden':'true'}));
  const paint=()=>{const o=opts.find(x=>x.value===cur);label.textContent=o?o.label:'请选择';if(o&&o.tone)btn.setAttribute('data-lg-side',o.tone);else btn.removeAttribute('data-lg-side');};
  const api={el:btn,get value(){return cur;},set value(v){cur=v;paint();close(false);},setOptions(list){opts=normOptions(list);paint();close(false);},close:()=>close(false),get isOpen(){return!!pop;}};
  function open(){
    closeSelects();
    pop=h('div',{class:'lg-select-pop',role:'listbox',tabindex:'-1'});items=[];let group=null;
    for(const o of opts){
      if(o.group&&o.group!==group){group=o.group;pop.append(h('div',{class:'lg-opt-group','data-lg-side':o.tone||null},o.group));}
      const el=h('div',{class:'lg-opt',role:'option','aria-selected':String(o.value===cur),'data-lg-side':o.tone||null,'data-index':items.length},o.label);
      items.push({el,o});pop.append(el);
    }
    pop.addEventListener('mousedown',e=>e.preventDefault());// 不抢触发按钮的焦点，键盘还能接着用
    pop.addEventListener('mousemove',e=>{const el=e.target.closest('.lg-opt');if(el)setActive(+el.dataset.index);});
    pop.addEventListener('click',e=>{const el=e.target.closest('.lg-opt');if(el)commit(+el.dataset.index);});
    document.body.append(pop);btn.setAttribute('aria-expanded','true');openSelect=api;
    place();setActive(Math.max(0,items.findIndex(it=>it.o.value===cur)));
    document.addEventListener('pointerdown',onDocDown,true);addEventListener('keydown',onKey,true);document.addEventListener('scroll',onScroll,true);addEventListener('resize',onLose);addEventListener('blur',onLose);
  }
  function close(refocus){
    if(!pop)return;
    pop.remove();pop=null;items=[];active=-1;btn.setAttribute('aria-expanded','false');if(openSelect===api)openSelect=null;
    document.removeEventListener('pointerdown',onDocDown,true);removeEventListener('keydown',onKey,true);document.removeEventListener('scroll',onScroll,true);removeEventListener('resize',onLose);removeEventListener('blur',onLose);
    if(refocus&&btn.isConnected)btn.focus({preventScroll:true});
  }
  const onLose=()=>close(false);
  function onDocDown(e){if(pop&&!pop.contains(e.target)&&!btn.contains(e.target))close(false);}
  function onScroll(e){const t=e.target;if(pop&&t!==pop&&!(t&&t.nodeType===1&&pop.contains(t)))close(false);}
  // 弹层打开时按键在捕获阶段先处理并截住，免得 Esc 顺带关掉设置面板、空格传给游戏
  function onKey(e){
    if(!pop)return;if(!btn.isConnected){close(false);return;}
    const k=keyOf(e),last=items.length-1;let handled=true;
    if(k==='ArrowDown')setActive(Math.min(last,active+1));else if(k==='ArrowUp')setActive(Math.max(0,active-1));
    else if(k==='Home')setActive(0);else if(k==='End')setActive(last);
    else if(k==='PageDown')setActive(Math.min(last,active+6));else if(k==='PageUp')setActive(Math.max(0,active-6));
    else if(k==='Enter'||k===' ')commit(active);else if(k==='Escape')close(true);
    else{handled=false;if(k==='Tab')close(false);}
    if(handled){e.preventDefault();e.stopImmediatePropagation();}
  }
  function setActive(i){
    if(!items[i])return;if(items[active])items[active].el.removeAttribute('data-active');
    active=i;const el=items[i].el;el.setAttribute('data-active','');
    // 手动滚弹层：scrollIntoView 会连带滚动被缩放的舞台
    const top=el.offsetTop,bottom=top+el.offsetHeight;
    if(top<pop.scrollTop)pop.scrollTop=top-4;else if(bottom>pop.scrollTop+pop.clientHeight)pop.scrollTop=bottom-pop.clientHeight+4;
  }
  function commit(i){const it=items[i];if(!it)return;const changed=it.o.value!==cur;cur=it.o.value;paint();close(true);if(changed&&typeof onChange==='function')onChange(cur);}
  function place(){
    const r=btn.getBoundingClientRect(),vw=innerWidth,vh=innerHeight,gap=4,edge=8;
    pop.style.minWidth=Math.max(120,Math.round(r.width))+'px';pop.style.maxHeight='none';
    const want=pop.scrollHeight+2,below=vh-r.bottom-gap-edge,above=r.top-gap-edge,up=want>below&&above>below,room=Math.max(80,Math.min(MENU_MAX,up?above:below)),hgt=Math.min(want,room);
    pop.style.maxHeight=room+'px';pop.style.top=Math.round(up?Math.max(edge,r.top-gap-hgt):Math.min(r.bottom+gap,vh-edge-hgt))+'px';
    pop.style.left=Math.round(Math.max(edge,Math.min(r.left,vw-edge-pop.offsetWidth)))+'px';
  }
  btn.addEventListener('click',()=>{if(pop)close(true);else open();});
  btn.addEventListener('keydown',e=>{const k=keyOf(e);if(!pop&&(k==='ArrowDown'||k==='ArrowUp')){e.preventDefault();open();}});
  paint();
  return api;
}

function create(opts){
  const o=isObj(opts)?opts:{},fx=o.effects;
  if(!fx||!Array.isArray(fx.EFFECTS)||!isObj(fx.EFFECT_BY_ID))throw new Error('LeafGiftUI.create 需要 effects（LeafEffects 效果目录）');
  const overlay=o.overlay||document.getElementById('overlay');
  if(!overlay)throw new Error('LeafGiftUI.create 需要 overlay 元素');
  const call=f=>typeof f==='function'?f:()=>undefined,face=isObj(o.face)?o.face:null;
  const getConfig=()=>{const c=call(o.getConfig)();return isObj(c)?c:{};};
  const setConfig=call(o.setConfig),onTest=call(o.onTest),onLikeTest=call(o.onLikeTest),getLikeStatus=call(o.getLikeStatus),getConnection=call(o.getConnection),onConnectWS=call(o.onConnectWS);
  const defaults=()=>typeof fx.defaultConfig==='function'?fx.defaultConfig():null;
  const HOME=(()=>{const d=defaults(),l=d&&d.legend;return isObj(l)&&Number.isFinite(l.x)&&Number.isFinite(l.y)?{x:l.x,y:l.y}:LEGEND_FALLBACK;})();

  // ---------- 说明牌 ----------
  const legendToggle=h('button',{type:'button',class:'lg-legend-toggle','aria-expanded':'true','aria-label':'收起说明牌'});
  const legendHead=h('div',{class:'lg-legend-head',title:'拖动可移动'},h('span',{class:'lg-legend-mark','aria-hidden':'true'},'🍂'),h('span',{class:'lg-legend-title'},'礼物说明'),legendToggle);
  const legendBody=h('div',{class:'lg-legend-body'}),legendEl=h('section',{class:'lg-legend','aria-label':'礼物说明',hidden:true},legendHead,legendBody);
  let legendPos={x:HOME.x,y:HOME.y},legendKey='',drag=null,legendPending=null;
  function renderLegend(config){
    if(drag){legendPending=isObj(config)?config:null;return;}
    const cfg=isObj(config)?config:getConfig(),lg=isObj(cfg.legend)?cfg.legend:{},groups=legendGroups(cfg,fx);
    legendEl.hidden=lg.visible===false||!(groups.troll.length+groups.help.length);
    if(legendEl.hidden)return;
    const key=JSON.stringify(groups);
    if(key!==legendKey){legendKey=key;legendBody.replaceChildren(...SIDES.filter(s=>groups[s].length).map(s=>legendGroup(s,groups[s])));}
    legendEl.classList.toggle('lg-collapsed',!!lg.collapsed);
    legendToggle.setAttribute('aria-expanded',String(!lg.collapsed));legendToggle.setAttribute('aria-label',lg.collapsed?'展开说明牌':'收起说明牌');
    placeLegend(Number.isFinite(lg.x)?lg.x:HOME.x,Number.isFinite(lg.y)?lg.y:HOME.y);
  }
  function legendGroup(side,rows){
    const list=h('div',{class:'lg-legend-list'});
    for(const r of rows)list.append(h('span',{class:'lg-legend-gift',title:r.gift},r.gift),h('span',{class:'lg-legend-arrow','aria-hidden':'true'},'→'),h('span',{class:'lg-legend-eff'},r.text));
    return h('div',{class:'lg-legend-group','data-lg-side':side},h('span',{class:'lg-legend-tag'},SIDE_NAMES[side]),list);
  }
  function placeLegend(x,y){legendPos=clampLegend(x,y,legendEl.offsetWidth,legendEl.offsetHeight);legendEl.style.transform=`translate(${legendPos.x}px,${legendPos.y}px)`;}
  function writeLegend(patch){const cfg=getConfig();setConfig({...cfg,legend:{...(isObj(cfg.legend)?cfg.legend:{}),...patch}});renderLegend(getConfig());}
  legendHead.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('.lg-legend-toggle'))return;
    e.preventDefault();
    // 舞台整体被等比缩放，屏幕位移要除以缩放比才是舞台坐标
    const r=overlay.getBoundingClientRect();
    drag={id:e.pointerId,sx:e.clientX,sy:e.clientY,x0:legendPos.x,y0:legendPos.y,scale:r.width>0?r.width/W:1,moved:false};
    // 抓不到指针时照样能拖，只是移出标题条后跟不上，不必报错
    try{legendHead.setPointerCapture(e.pointerId);}catch{}
    legendEl.classList.add('lg-dragging');
  });
  legendHead.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const dx=(e.clientX-drag.sx)/drag.scale,dy=(e.clientY-drag.sy)/drag.scale;
    if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<3)return;
    drag.moved=true;placeLegend(drag.x0+dx,drag.y0+dy);
  });
  function endDrag(e){
    if(!drag||e.pointerId!==drag.id)return;
    const moved=drag.moved,pending=legendPending;drag=null;legendPending=null;legendEl.classList.remove('lg-dragging');
    if(moved)writeLegend({x:legendPos.x,y:legendPos.y});else if(pending)renderLegend(pending);
  }
  legendHead.addEventListener('pointerup',endDrag);legendHead.addEventListener('pointercancel',endDrag);legendHead.addEventListener('lostpointercapture',endDrag);
  legendToggle.addEventListener('click',()=>{const lg=getConfig().legend;writeLegend({collapsed:!(isObj(lg)&&lg.collapsed)});});

  // ---------- 横幅 ----------
  const bannerLayer=h('div',{class:'lg-banners','aria-live':'polite'});
  let banners=[],showing=null,leaving=false,stayTimer=0;
  function pushBanner(item){
    if(!isObj(item)||!effectOf(fx,item.effect))return false;
    const next=mergeBanner(banners,{...item,tier:tiersOf(fx).includes(item.tier)?item.tier:''},Date.now());
    if(next===banners)return false;
    banners=next;pumpBanner();return true;
  }
  function pumpBanner(){
    if(showing){
      const cur=banners.find(e=>e.id===showing.id);
      if(cur&&cur.rev!==showing.rev){const p=bannerParts(cur,fx);showing.rev=cur.rev;showing.count.textContent=p.count;showing.count.hidden=!p.count;restart(showing.count,'lg-bump');armBanner(cur);}
      return;
    }
    const head=banners[0];if(leaving||!head)return;
    banners=[{...head,shown:true},...banners.slice(1)];
    const p=bannerParts(head,fx),count=h('b',{class:'lg-banner-count'},p.count);count.hidden=!p.count;
    const el=h('div',{class:'lg-banner','data-lg-side':p.side},avatarEl(head.user,head.avatar,'lg-banner-ava'),h('span',{class:'lg-banner-nick'},p.nick),h('span',{class:'lg-banner-verb'},p.verb),h('span',{class:'lg-banner-eff'},p.effect),count);
    bannerLayer.append(el);showing={id:head.id,rev:head.rev,el,count};
    void el.offsetWidth;el.classList.add('lg-shown');armBanner(head);
  }
  function armBanner(entry){clearTimeout(stayTimer);stayTimer=setTimeout(endBanner,bannerStay(entry));}
  function endBanner(){
    const s=showing;if(!s)return;
    showing=null;leaving=true;banners=banners.filter(e=>e.id!==s.id);
    s.el.classList.remove('lg-shown');s.el.classList.add('lg-leaving');
    setTimeout(()=>{s.el.remove();leaving=false;pumpBanner();},LEAVE_MS);
  }

  // ---------- 护驾王 / 捣乱王 ----------
  const kingLayer=h('div',{class:'lg-kings'}),kings={};
  for(const[side,title]of[['help','护驾王'],['troll','捣乱王']]){const el=h('div',{class:'lg-king','data-lg-side':side,hidden:true});kingLayer.append(el);kings[side]={el,title,who:'',score:null,scoreEl:null};}
  function renderKings(v){const k=isObj(v)?v:{};paintKing('help',k.help);paintKing('troll',k.troll);}
  function paintKing(side,data){
    const slot=kings[side];
    if(!isObj(data)){slot.el.hidden=true;slot.who='';return;}
    const name=cleanNick(data.name),ava=safeAvatar(data.avatar),score=Number.isFinite(data.score)?Math.round(data.score):null,who=name+'\n'+ava;
    slot.el.hidden=false;
    if(who!==slot.who){
      slot.who=who;slot.score=null;slot.scoreEl=h('b',{class:'lg-king-score'});
      slot.el.replaceChildren(avatarEl(name,ava,'lg-king-ava'),h('span',{class:'lg-king-text'},h('span',{class:'lg-king-title'},'👑 '+slot.title),h('span',{class:'lg-king-name',title:name},name)),slot.scoreEl);
      restart(slot.el,'lg-king-new');
    }
    if(score!==slot.score){
      const up=slot.score!==null&&score!==null&&score>slot.score;slot.score=score;
      slot.scoreEl.textContent=score===null?'':groupDigits(score)+' 分';slot.scoreEl.hidden=score===null;if(up)restart(slot.scoreEl,'lg-bump');
    }
  }

  // ---------- 模拟礼物区 ----------
  const simLikes=[];
  function addSimulateButtons(container){
    const host=container||document.getElementById('panel');if(!host)return null;
    const box=h('section',{class:'lg-sim','aria-label':'模拟礼物'},h('div',{class:'lg-sim-title'},h('b',null,'模拟礼物'),h('small',null,'每下 1 份')));
    for(const e of fx.EFFECTS){
      if(!isObj(e))continue;
      const row=h('div',{class:'lg-sim-row','data-lg-side':sideOf(e)},h('span',{class:'lg-sim-name',title:e.name},`${e.icon||''} ${e.name}`.trim()));
      for(const t of tiersOf(fx)){const b=h('button',{type:'button',class:'lg-sim-btn',title:`模拟送出 1 份 ${effectName(fx,e,t)}`},tierName(fx,t)||t);b.addEventListener('click',()=>onTest(e.id,t,1));row.append(b);}
      box.append(row);
    }
    const like=h('button',{type:'button',class:'lg-sim-btn lg-sim-like'},'👍 模拟点赞');
    like.addEventListener('click',()=>{onLikeTest();setTimeout(refresh,30);});
    simLikes.push(like);box.append(like);host.append(box);paintSimLikes();
    return box;
  }
  function paintSimLikes(){if(!simLikes.length)return;const v=likeView(getLikeStatus());for(const b of simLikes)b.textContent=v.step?`👍 模拟点赞 +${groupDigits(v.step)}`:'👍 模拟点赞';}

  // ---------- 设置面板 ----------
  let panel=null,body=null,tabBtns=[],errBox=null,statusEl=null,discardBtn=null;
  let isOpen=false,tab='rules',draft=draftOf({}),base='',kept=null,errors=[],notice='',fields=new Map(),live={},timer=0;
  function buildPanel(){
    const close=h('button',{type:'button',class:'lg-icon-btn lg-close',title:'关闭（Esc）','aria-label':'关闭设置'},'✕');
    close.addEventListener('click',closeSettings);
    tabBtns=TABS.map(([id,label])=>{const b=h('button',{type:'button',class:'lg-tab',role:'tab','data-tab':id,'aria-selected':'false'},label);b.addEventListener('click',()=>setTab(id));return b;});
    body=h('div',{class:'lg-set-body',role:'tabpanel'});errBox=h('ul',{class:'lg-errors',role:'alert',hidden:true});statusEl=h('span',{class:'lg-status'});
    discardBtn=h('button',{type:'button',class:'lg-btn lg-btn-ghost'},'放弃修改');discardBtn.addEventListener('click',discard);
    const save=h('button',{type:'button',class:'lg-btn lg-btn-primary'},'保存');save.addEventListener('click',saveDraft);
    panel=h('section',{class:'lg-settings',role:'dialog','aria-label':'礼物与效果设置',tabindex:'-1',hidden:true},
      h('header',{class:'lg-set-head'},h('div',{class:'lg-set-title'},h('span',{class:'lg-set-mark','aria-hidden':'true'},'🍁'),h('div',null,h('h2',null,'礼物与效果'),h('p',null,'规则、参数、点赞改完点「保存」统一生效；护脸圈、说明牌和连接的操作立即生效'))),close),
      h('nav',{class:'lg-tabs',role:'tablist','aria-label':'设置分页'},tabBtns),body,
      h('footer',{class:'lg-set-foot'},errBox,h('div',{class:'lg-foot-row'},statusEl,discardBtn,save)));
    // 面板里的按键（空格、H 等）不往外传，免得触发游戏快捷键；Esc 在这里关面板
    panel.addEventListener('keydown',e=>{e.stopPropagation();if(keyOf(e)==='Escape'&&!e.isComposing){e.preventDefault();closeSettings();}});
    for(const t of['keyup','keypress'])panel.addEventListener(t,e=>e.stopPropagation());
    document.body.append(panel);
    document.addEventListener('pointerdown',e=>{
      const t=e.target&&e.target.nodeType===1?e.target:e.target&&e.target.parentElement;
      if(isOpen&&t&&!panel.contains(t)&&!t.closest('.lg-select-pop,[data-lg-keep-open]'))closeSettings();
    },true);
    addEventListener('keydown',e=>{if(isOpen&&keyOf(e)==='Escape'&&!e.isComposing)closeSettings();});
  }
  function openSettings(which){
    if(!panel)buildPanel();
    const id=TABS.some(t=>t[0]===which)?which:own(TAB_ALIAS,which)||tab;
    if(!isOpen){
      const fresh=draftOf(getConfig());base=draftKey(fresh);
      // 上次没保存就关掉的修改，配置没被别处改过时原样恢复
      if(kept&&kept.base===base){draft=kept.draft;notice='已恢复上次没保存的修改';}else{draft=fresh;notice='';}
      kept=null;errors=[];isOpen=true;panel.hidden=false;clearInterval(timer);timer=setInterval(refresh,REFRESH_MS);
    }
    setTab(id);panel.focus({preventScroll:true});
  }
  function closeSettings(){
    if(!isOpen)return;
    isOpen=false;panel.hidden=true;clearInterval(timer);closeSelects();
    kept=isDirty()?{draft,base}:null;body.replaceChildren();fields=new Map();live={};
  }
  const isDirty=()=>draftKey(draft)!==base;
  function setTab(id){
    tab=id;for(const b of tabBtns)b.setAttribute('aria-selected',String(b.dataset.tab===id));
    renderTab(true);
  }
  function renderTab(toTop){
    const top=body.scrollTop;closeSelects();fields=new Map();live={};
    body.replaceChildren(tab==='params'?paramsTab():tab==='likes'?likesTab():tab==='face'?faceTab():rulesTab());
    body.scrollTop=toTop?0:top;paintErrors();paintStatus();
  }
  const reg=(path,el)=>fields.set(pathKey(path),el);
  function change(path,value){draft=setIn(draft,path,value);notice='';dropError(pathKey(path));paintStatus();}
  // 增删行、套用预设这类结构变化：旧的出错位置已对不上，清掉后整页重画
  function update(fn,msg){draft=fn(draft);errors=[];notice=msg||'';renderTab(false);}
  function paintStatus(){const dirty=isDirty();statusEl.textContent=notice||(dirty?'有未保存的修改':'');statusEl.classList.toggle('lg-status-dirty',dirty&&!notice);discardBtn.disabled=!dirty;}
  function discard(){draft=draftOf(getConfig());base=draftKey(draft);kept=null;errors=[];notice='已放弃未保存的修改';renderTab(false);}
  function saveDraft(){
    closeSelects();
    let res;
    try{res=setConfig({...getConfig(),params:draft.params,rules:draft.rules,likes:draft.likes});}
    catch(err){res={ok:false,errors:[{path:'',message:'保存失败：'+(err&&err.message?err.message:String(err))}]};}
    if(!res||res.ok!==false){base=draftKey(draft);kept=null;errors=[];closeSettings();return true;}
    const list=Array.isArray(res.errors)&&res.errors.length?res.errors:[{path:'',message:'保存失败，请检查设置'}];
    errors=list.map(e=>({key:pathKey(isObj(e)?e.path:''),message:text(isObj(e)?e.message:'')||'设置有误'}));
    notice='没有保存：请按下面的提示修改';
    const goto=errors.map(e=>tabOfPath(e.key)).find(Boolean);
    if(goto&&goto!==tab)setTab(goto);else{paintErrors();paintStatus();}
    return false;
  }
  function paintErrors(){
    // validateConfig 的提示已写明位置（第几条规则、哪个效果哪一档），重复名会按每一行各报一次，列表里只留一条
    errBox.replaceChildren(...[...new Set(errors.map(e=>e.message))].map(m=>h('li',null,m)));
    errBox.hidden=!errors.length;
    for(const b of tabBtns)b.classList.toggle('lg-tab-err',errors.some(e=>tabOfPath(e.key)===b.dataset.tab));
    for(const[k,el]of fields){
      const hit=errors.find(e=>e.key&&(k===e.key||k.startsWith(e.key+'.')));
      el.classList.toggle('lg-error',!!hit);if(hit)el.setAttribute('title',hit.message);else el.removeAttribute('title');
    }
  }
  function dropError(key){const n=errors.length;errors=errors.filter(e=>e.key!==key);if(errors.length!==n)paintErrors();}
  function numberField(value,opt,onValue){
    const el=h('input',{type:'number',class:'lg-in lg-num',min:opt.min,max:opt.max,step:opt.step||'any',inputmode:'decimal','aria-label':opt.label});
    el.value=value==null?'':String(value);
    const check=()=>el.classList.toggle('lg-invalid',!fitsRange(numOrRaw(el.value),opt));
    el.addEventListener('input',()=>{onValue(numOrRaw(el.value));check();});check();
    return el;
  }
  const field=(label,ctl,suffix)=>h('div',{class:'lg-field'},h('span',{class:'lg-field-label'},label),h('div',{class:'lg-field-ctl'},ctl,suffix?h('span',{class:'lg-note'},suffix):null));
  function reveal(el){const b=body.getBoundingClientRect(),r=el.getBoundingClientRect();if(r.bottom>b.bottom)body.scrollTop+=r.bottom-b.bottom+12;else if(r.top<b.top)body.scrollTop-=b.top-r.top+12;}

  function rulesTab(){
    const rows=[],list=h('div',{class:'lg-rules'}),dupNote=h('p',{class:'lg-note lg-note-bad',hidden:true});
    list.append(h('div',{class:'lg-rule lg-rule-head','aria-hidden':'true'},h('span',null,'礼物名'),h('span',null,'效果'),h('span',null,'档位'),h('span',null,'份数'),h('span'),h('span')));
    draft.rules.forEach((r,i)=>{const row=ruleRow(isObj(r)?r:{},i,markDup);rows.push(row);list.append(row.el);});
    if(!draft.rules.length)list.append(h('p',{class:'lg-empty'},'还没有规则。点「新增规则」，或「套用直播间档位」一键写入常用礼物。'));
    function markDup(){
      const dup=duplicateRows(draft.rules),names=[],seen=new Set();
      rows.forEach((row,i)=>row.gift.classList.toggle('lg-dup',dup.includes(i)));
      for(const i of dup){const k=normalize(text(draft.rules[i].gift));if(!seen.has(k)){seen.add(k);names.push('「'+text(draft.rules[i].gift)+'」');}}
      dupNote.hidden=!dup.length;dupNote.textContent=dup.length?`礼物名重复：${names.join('')}。同一个礼物只能绑一条规则，改掉重复的才能保存。`:'';
    }
    markDup();
    const add=h('button',{type:'button',class:'lg-btn'},'＋ 新增规则'),preset=h('button',{type:'button',class:'lg-btn'},'套用直播间档位');
    add.addEventListener('click',()=>{
      const first=fx.EFFECTS.find(isObj);
      update(d=>({...d,rules:[...d.rules,{gift:'',effect:first?first.id:'',tier:tiersOf(fx)[0],portions:1}]}));
      const inputs=body.querySelectorAll('.lg-gift'),last=inputs[inputs.length-1];if(last){reveal(last);last.focus({preventScroll:true});}
    });
    preset.addEventListener('click',()=>{
      const res=applyPreset(draft.rules,typeof fx.presetRules==='function'?fx.presetRules():[]);
      update(d=>({...d,rules:res.rules}),`已套用直播间档位：覆盖 ${res.replaced} 条，新增 ${res.added} 条，其他规则保留。记得点「保存」。`);
    });
    return h('div',{class:'lg-pane'},list,dupNote,h('div',{class:'lg-row'},add,preset),
      h('p',{class:'lg-note'},'礼物名忽略首尾空格、大小写、全角半角和常见符号；礼物个数 × 每个礼物的份数 = 本次份数。「测试」按已保存的效果参数播放。'),legendControls());
  }
  function ruleRow(r,i,onGift){
    const eff=effectOf(fx,r.effect),el=h('div',{class:'lg-rule','data-lg-side':eff?sideOf(eff):null});
    const gift=h('input',{type:'text',class:'lg-in lg-gift',maxlength:'40',placeholder:'礼物名（留空 = 不绑定）',autocomplete:'off',spellcheck:'false','aria-label':`第 ${i+1} 条规则的礼物名`});
    gift.value=r.gift==null?'':String(r.gift);
    gift.addEventListener('input',()=>{change(['rules',i,'gift'],gift.value);onGift();});
    const effSel=makeSelect(effectOptions(fx),r.effect,v=>{change(['rules',i,'effect'],v);const e=effectOf(fx,v);if(e)el.setAttribute('data-lg-side',sideOf(e));});
    effSel.el.classList.add('lg-rule-eff');effSel.el.setAttribute('aria-label',`第 ${i+1} 条规则的效果`);
    const tierSel=makeSelect(tierOptions(fx),r.tier,v=>change(['rules',i,'tier'],v));tierSel.el.setAttribute('aria-label',`第 ${i+1} 条规则的档位`);
    const por=numberField(r.portions,{min:1,max:100,step:1,integer:true,label:`第 ${i+1} 条规则每个礼物算几份`},v=>change(['rules',i,'portions'],v));
    const test=h('button',{type:'button',class:'lg-btn lg-btn-sm',title:'按这一行的效果、档位和份数播放一次'},'测试');
    test.addEventListener('click',()=>{const cur=draft.rules[i];if(isObj(cur)&&effectOf(fx,cur.effect))onTest(cur.effect,cur.tier,Math.min(TEST_MAX,portionsOf(cur.portions)));});
    const del=h('button',{type:'button',class:'lg-icon-btn lg-del',title:'删除这条规则','aria-label':`删除第 ${i+1} 条规则`},'✕');
    del.addEventListener('click',()=>update(d=>({...d,rules:d.rules.filter((_,j)=>j!==i)})));
    reg(['rules',i,'gift'],gift);reg(['rules',i,'effect'],effSel.el);reg(['rules',i,'tier'],tierSel.el);reg(['rules',i,'portions'],por);
    el.append(gift,effSel.el,tierSel.el,por,test,del);
    return{el,gift};
  }
  function legendControls(){
    const lg=getConfig().legend,sw=switchEl(!(isObj(lg)&&lg.visible===false),'在画面上显示说明牌',v=>writeLegend({visible:v}));
    const home=h('button',{type:'button',class:'lg-btn lg-btn-sm'},'位置复位');
    home.addEventListener('click',()=>writeLegend({x:HOME.x,y:HOME.y,collapsed:false}));
    reg(['legend','visible'],sw.el);
    return h('div',{class:'lg-legend-ctl'},h('span',{class:'lg-field-label'},'画面说明牌'),sw.el,h('span',{class:'lg-note lg-grow'},'显示在画面上；可直接在画面上拖动、收起'),home);
  }

  function paramsTab(){
    const all=h('button',{type:'button',class:'lg-btn lg-btn-sm'},'全部恢复默认');
    all.addEventListener('click',()=>{const d=defaults();if(d&&isObj(d.params))update(x=>({...x,params:clone(d.params)}),'全部效果参数已恢复默认，记得点「保存」。');});
    const grid=h('div',{class:'lg-cards'});
    for(const e of fx.EFFECTS)if(isObj(e))grid.append(effectCard(e));
    return h('div',{class:'lg-pane'},h('div',{class:'lg-row lg-pane-top'},h('p',{class:'lg-note'},'每个效果分小、中、大三档，各自独立。送多个只乘份数，不会自动升档。'),all),grid);
  }
  function effectCard(e){
    const side=sideOf(e),tiers=tiersOf(fx),reset=h('button',{type:'button',class:'lg-link',title:`把${e.name}三档参数恢复默认`},'恢复默认');
    reset.addEventListener('click',()=>{const d=defaults(),p=d&&isObj(d.params)?d.params[e.id]:null;if(isObj(p))update(x=>setIn(x,['params',e.id],clone(p)),`${e.name}的参数已恢复默认，记得点「保存」。`);});
    const table=h('div',{class:'lg-ptable'},h('span'),tiers.map(t=>h('span',{class:'lg-ptable-tier'},tierName(fx,t)||t)));
    for(const p of Array.isArray(e.params)?e.params:[]){
      if(!isObj(p))continue;
      table.append(h('span',{class:'lg-plabel'},p.label||p.key,p.min!=null&&p.max!=null?h('small',null,`${p.min}–${p.max}`):null));
      tiers.forEach((t,ti)=>{
        const path=['params',e.id,t,p.key],cur=valueAt(draft,path),v=cur===undefined&&Array.isArray(p.tiers)?p.tiers[ti]:cur;
        const input=numberField(v,{min:p.min,max:p.max,step:p.step,integer:Number.isInteger(p.step)&&p.step>=1,label:`${effectName(fx,e,t)} ${p.label||p.key}`},val=>change(path,val));
        reg(path,input);table.append(input);
      });
    }
    return h('div',{class:'lg-card','data-lg-side':side},h('div',{class:'lg-card-head'},h('span',{class:'lg-card-icon','aria-hidden':'true'},e.icon||''),h('b',null,e.name||e.id),h('span',{class:'lg-side-tag'},SIDE_NAMES[side]),reset),table);
  }

  function likesTab(){
    const L=isObj(draft.likes)?draft.likes:{},sw=switchEl(L.enabled!==false,'点赞触发效果',v=>change(['likes','enabled'],v));
    const step=numberField(L.step,{min:1,step:1,integer:true,label:'每累计多少个赞触发一次'},v=>change(['likes','step'],v));
    const eff=makeSelect(effectOptions(fx),L.effect,v=>change(['likes','effect'],v)),tier=makeSelect(tierOptions(fx),L.tier,v=>change(['likes','tier'],v));
    const por=numberField(L.portions,{min:1,max:100,step:1,integer:true,label:'每次触发几份'},v=>change(['likes','portions'],v));
    reg(['likes','enabled'],sw.el);reg(['likes','step'],step);reg(['likes','effect'],eff.el);reg(['likes','tier'],tier.el);reg(['likes','portions'],por);
    const test=h('button',{type:'button',class:'lg-btn lg-btn-sm'},'试一下这个效果'),sim=h('button',{type:'button',class:'lg-btn lg-btn-sm'},'模拟点赞');
    test.addEventListener('click',()=>{const l=isObj(draft.likes)?draft.likes:{};if(effectOf(fx,l.effect))onTest(l.effect,l.tier,Math.min(TEST_MAX,portionsOf(l.portions)));});
    sim.addEventListener('click',()=>{onLikeTest();setTimeout(refresh,30);});
    Object.assign(live,{likeTotal:h('b'),likeBar:h('i'),likeInfo:h('span',{class:'lg-note'}),likeSim:sim});
    paintLikes();
    return h('div',{class:'lg-pane'},
      h('div',{class:'lg-like-stat'},h('div',{class:'lg-like-total'},h('small',null,'本场累计'),live.likeTotal,h('small',null,'赞')),h('div',{class:'lg-like-progress'},h('div',{class:'lg-bar'},live.likeBar),live.likeInfo)),
      h('section',{class:'lg-section'},field('点赞触发效果',sw.el),field('累计步长',step,'个赞触发一次'),field('效果',eff.el),field('档位',tier.el),field('份数',por,'份'),h('div',{class:'lg-row'},test,sim)),
      h('p',{class:'lg-note'},'点赞触发的效果不计入捣乱王、护驾王分数。累计数和零头随存档保存，比分清零时一起清零。'));
  }
  function paintLikes(){
    if(!live.likeTotal)return;
    const v=likeView(getLikeStatus());
    live.likeTotal.textContent=groupDigits(v.total);live.likeBar.style.transform=`scaleX(${v.ratio})`;
    live.likeInfo.textContent=v.step?`零头 ${groupDigits(v.carry)} / ${groupDigits(v.step)}，再 ${groupDigits(v.remain)} 个赞触发一次${v.enabled?'':'（效果已关闭，只计数）'}`:'还没有点赞数据';
    live.likeSim.textContent=v.step?`模拟点赞 +${groupDigits(v.step)}`:'模拟点赞';
  }

  function faceTab(){
    const can=k=>face&&typeof face[k]==='function';
    const sw=switchEl(false,'护脸圈开关',v=>{if(can('setEnabled'))face.setEnabled(v);paintFace();}),adjust=h('button',{type:'button',class:'lg-btn'},'拖动调整');
    adjust.addEventListener('click',()=>{closeSettings();if(can('startAdjust'))face.startAdjust();});
    if(!can('setEnabled'))sw.el.disabled=true;if(!can('startAdjust'))adjust.disabled=true;
    const connect=h('button',{type:'button',class:'lg-btn'},'连接本机 WebSocket');
    connect.addEventListener('click',()=>{onConnectWS();setTimeout(refresh,60);});
    Object.assign(live,{faceSwitch:sw,faceInfo:h('span',{class:'lg-note lg-grow'}),sdkDot:h('i',{class:'lg-dot'}),sdkText:h('span'),wsDot:h('i',{class:'lg-dot'}),wsText:h('span'),wsUrl:h('code',{class:'lg-code'})});
    paintFace();paintConn();
    return h('div',{class:'lg-pane'},
      h('section',{class:'lg-section'},h('h3',{class:'lg-section-title'},'🛡 护脸圈'),h('div',{class:'lg-row'},sw.el,h('span',{class:'lg-field-label'},'开启'),live.faceInfo,adjust),
        h('p',{class:'lg-note'},'护脸圈是一块透明的实体：叶子落不进圈里，飞行中的叶子碰到会沿圈边滑开。点「拖动调整」后到画面上调整位置和大小。')),
      h('section',{class:'lg-section'},h('h3',{class:'lg-section-title'},'🔌 连接'),
        h('div',{class:'lg-conn'},h('span',{class:'lg-field-label'},'菘蓝 SDK'),h('span',null,live.sdkDot,live.sdkText),h('span',{class:'lg-field-label'},'本机 WebSocket'),h('span',null,live.wsDot,live.wsText),h('span',{class:'lg-field-label'},'地址'),h('span',null,live.wsUrl)),
        h('div',{class:'lg-row'},connect),h('p',{class:'lg-note'},'在菘蓝里打开时自动接入；不在菘蓝里时可手动连接本机 WebSocket。')));
  }
  function paintFace(){
    if(!live.faceSwitch)return;
    const s=face&&typeof face.get==='function'?face.get():null,v=isObj(s)?s:{};
    live.faceSwitch.checked=!!v.enabled;
    live.faceInfo.textContent=!face?'护脸圈暂不可用':[v.x,v.y,v.r].every(Number.isFinite)?`圈心 (${Math.round(v.x)}, ${Math.round(v.y)}) · 半径 ${Math.round(v.r)}`:'';
  }
  function paintConn(){
    if(!live.sdkText)return;
    const v=connectionView(getConnection());
    live.sdkDot.setAttribute('data-lg-tone',v.sdk.tone);live.sdkText.textContent=v.sdk.text;
    live.wsDot.setAttribute('data-lg-tone',v.ws.tone);live.wsText.textContent=v.ws.text;live.wsUrl.textContent=v.url||'—';
  }
  function refresh(){paintSimLikes();if(!isOpen)return;if(tab==='likes')paintLikes();else if(tab==='face'){paintFace();paintConn();}}

  overlay.append(legendEl,bannerLayer,kingLayer);
  renderLegend(getConfig());
  return{openSettings,closeSettings,isSettingsOpen:()=>isOpen,refresh,renderLegend,pushBanner,renderKings,addSimulateButtons};
}

return{create,makeSelect,legendGroups,effectLabel,effectOptions,tierOptions,mergeBanner,bannerStay,bannerParts,initialOf,safeAvatar,clampLegend,applyPreset,duplicateRows,setIn,pathKey,tabOfPath,numOrRaw,fitsRange,likeView,connectionView,groupDigits,MERGE_MS,QUEUE_MAX};
});
