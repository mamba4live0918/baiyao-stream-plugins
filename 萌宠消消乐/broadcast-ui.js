(function(root){
 'use strict';
 root.setupBroadcastUI=function(api){
  const $=s=>document.querySelector(s),kind=api.kind,isMatch=kind==='match3',key=kind+'-broadcast-layout-v1';
  const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fresh=()=>({x:.04,y:.08,scale:1});let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
  const clean=v=>({x:Number.isFinite(v?.x)?clamp(v.x,0,1):.04,y:Number.isFinite(v?.y)?clamp(v.y,0,1):.08,scale:Number.isFinite(v?.scale)?clamp(v.scale,.5,1.8):1});
  const config={landscape:clean(saved.landscape),portrait:clean(saved.portrait),showHud:saved.showHud!==false,showTouch:typeof saved.showTouch==='boolean'?saved.showTouch:matchMedia('(pointer:coarse)').matches,showNext:saved.showNext!==false};
  const orientation=()=>innerWidth>=innerHeight?'landscape':'portrait';let open=false,editing=false,previousPause=false,drag=null,scale=1,fadeTimer=null;
  const source=$('.app');source.classList.add('broadcast-source');document.body.classList.add('broadcast-mode',isMatch?'broadcast-match':'broadcast-blocks');
  const stage=make('section','broadcast-stage');stage.id='broadcast-stage';stage.setAttribute('aria-label',isMatch?'消消乐直播棋盘':'俄罗斯方块直播棋盘');document.body.append(stage);
  const hud=make('div','broadcast-hud');stage.append(hud);
  const metric=(name)=>{const e=make('span','broadcast-metric');e.append(make('small','',name));const b=make('b','','0');e.append(b);hud.append(e);return b;};
  const score=metric(isMatch?'积分':'得分'),secondary=metric(isMatch?'收分':'消行');
  let nextPreview=null;if(!isMatch){const next=make('span','broadcast-next');next.append(make('small','','下一块'));nextPreview=make('canvas');nextPreview.width=88;nextPreview.height=72;next.append(nextPreview);hud.append(next);}
  const effects=make('div','broadcast-effect');effects.hidden=true;stage.append(effects);
  const board=$('.board-frame');stage.append(board);
  const hidden=make('div','broadcast-store');hidden.hidden=true;document.body.append(hidden);
  if(isMatch){for(const q of['.billing-hud','.hud','#prank-status']){const e=$(q);if(e)hidden.append(e);}}
  else{for(const q of['.board-top','.board-bottom'])hidden.append($(q));}
  const touch=!isMatch?$('.touch-controls'):null;if(touch)stage.append(touch);
  const dragHandle=make('button','broadcast-drag','拖动棋盘');dragHandle.type='button';dragHandle.setAttribute('aria-label','拖动棋盘位置');stage.append(dragHandle);
  const resizeHandle=make('button','broadcast-resize','↘');resizeHandle.type='button';resizeHandle.setAttribute('aria-label','拖动缩放棋盘');stage.append(resizeHandle);
  const gear=make('button','broadcast-gear');gear.id='broadcast-gear';gear.type='button';gear.title='设置（S / F2）';gear.setAttribute('aria-label','打开设置');gear.setAttribute('aria-expanded','false');gear.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m9 3-.7 2.2-2 .9L4 5.6 2.4 8.4 4 10.1v2.3l-1.6 1.8L4 17l2.3-.5 2 .9L9 20h3l.8-2.6 2-.9 2.3.5 1.6-2.8-1.6-1.8v-2.3l1.6-1.7-1.6-2.8-2.3.5-2-.9L12 3Z"/><circle cx="10.5" cy="11.5" r="3"/></svg>';document.body.append(gear);
  const panel=make('aside','broadcast-settings');panel.id='broadcast-settings';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',(isMatch?'消消乐':'俄罗斯方块')+'设置');document.body.append(panel);
  const close=make('button','broadcast-close','×');close.type='button';close.setAttribute('aria-label','关闭设置');panel.append(close,make('h2','',`${isMatch?'消消乐':'俄罗斯方块'} · 设置`),make('p','broadcast-lead','直播画面只留棋盘。设置修改即时生效。'));
  function group(title){const s=make('section','broadcast-section');s.append(make('h3','',title));panel.append(s);return s;}
  function move(selector,to){const e=$(selector);if(e)to.append(e);return e;}
  function row(parent,label,control,hint){const r=make('label','broadcast-field');r.append(make('span','',label),control);parent.append(r);if(hint)parent.append(make('p','broadcast-note',hint));return control;}
  function button(text,fn,parent,main=false){const b=make('button',main?'broadcast-primary':'',text);b.type='button';b.onclick=fn;parent.append(b);return b;}
  const layout=group('① 主播位置与棋盘布局');
  layout.append(make('p','broadcast-note','把棋盘放到主播身旁。横屏、竖屏分别保存，平时锁定，调整时暂停游戏。'));
  const orient=make('p','broadcast-orientation');layout.append(orient);
  const presets=make('div','broadcast-row');layout.append(presets);
  for(const[name,pos]of[['主播在右',{x:.03,y:.08}],['主播在左',{x:.97,y:.08}],['主播在下',{x:.04,y:.02}]])button(name,()=>{Object.assign(config[orientation()],pos);apply();persist();},presets);
  const map=make('div','broadcast-map');map.setAttribute('aria-label','棋盘位置预览');const free=make('span','broadcast-map-free','留给主播');const mapBoard=make('i','broadcast-map-board');map.append(free,mapBoard);layout.append(map);
  const layoutButtons=make('div','broadcast-row');layout.append(layoutButtons);button('在画面上拖动 / 缩放',startEditing,layoutButtons,true);button('恢复当前方向布局',()=>{config[orientation()]=fresh();apply();persist();},layoutButtons);
  const sliders={};for(const[id,label,min,max,step]of[['x','水平位置',0,100,1],['y','垂直位置',0,100,1],['scale','棋盘大小',50,180,1]]){
    const wrap=make('span','broadcast-slider');const input=make('input');input.type='range';input.min=min;input.max=max;input.step=step;input.id='layout-'+id;input.setAttribute('aria-label',label);const output=make('output');wrap.append(input,output);row(layout,label,wrap);sliders[id]={input,output};input.oninput=()=>{config[orientation()][id]=Number(input.value)/100;apply(false);persist();};
  }
  const layoutNote=make('p','broadcast-note','布局自动保存。移动或缩放窗口时，棋盘会保持在画面内。');layout.append(layoutNote);
  const gameplay=group(isMatch?'② 游戏、收分与加班':'② 游戏与失败加班');
  if(isMatch)move('.billing-settings',gameplay);else move('.overtime-card',gameplay);
  const controls=make('div','broadcast-row broadcast-game-controls');gameplay.append(controls);
  if(!isMatch)button('开始 / 继续',()=>{api.start();setOpen(false);},controls,true);
  const pause=move('#pause',controls);pause.setAttribute('aria-label','暂停或继续游戏');pause.title='暂停 / 继续';
  if(isMatch){pause.replaceChildren(document.createTextNode('暂停 / 继续'));move('#hint',controls);move('#shuffle',controls);}
  move('#restart',controls);
  gameplay.append(make('p','broadcast-note',isMatch?'暂停会冻结收分倒计时；重置棋盘保留积分和收分周期。':'方向键移动，↑ 旋转，空格落地，C 暂存，P 暂停。'));
  const interactions=group('③ 礼物与互动');
  interactions.append(make('p','broadcast-note','菘蓝 / 白曜礼物接入与绑定。单独试玩和真实消息共用执行队列。'));
  if(api.live)root.mountLiveSettings(interactions,api.live);
  if(isMatch)move('#auto-prank',interactions);else move('.storm-card',interactions);
  const manual=make('details','live-manual-effects');manual.append(make('summary','','单独测试效果'));interactions.append(manual);
  const gifts=move(isMatch?'.gift-grid':'#effect-buttons',manual);gifts.classList.add('broadcast-effect-list');
  for(const b of gifts.querySelectorAll('[data-effect]')){const title=b.querySelector('strong')?.textContent||'',description=b.querySelector('small')?.textContent||'';b.replaceChildren(make('strong','',title),make('small','',description),make('span','broadcast-play','▶'));b.setAttribute('aria-label','测试'+title);}
  const display=group('④ 声音与画面');
  const soundWrap=make('div','broadcast-field');soundWrap.append(make('span','','游戏音效'));const sound=move('#sound',soundWrap);soundWrap.append(make('small','','点击切换'));display.append(soundWrap);
  const previewWrap=make('div','broadcast-field');previewWrap.append(make('span','','预览底色'));const preview=move(isMatch?'#transparent':'#preview',previewWrap);preview.classList.remove('icon-button','icon-btn');preview.classList.add('broadcast-toggle');preview.setAttribute('role','switch');preview.setAttribute('aria-label','预览底色');preview.title='只用于预览，默认透明';
  function setPreview(active){document.body.classList.toggle('broadcast-preview',active);preview.textContent=active?'已开启':'已关闭';preview.setAttribute('aria-pressed',String(active));preview.setAttribute('aria-checked',String(active));}
  preview.onclick=()=>setPreview(!document.body.classList.contains('broadcast-preview'));display.append(previewWrap);
  function check(label,keyName){const input=make('input');input.type='checkbox';input.checked=config[keyName];input.id='display-'+keyName;row(display,label,input);input.onchange=()=>{config[keyName]=input.checked;apply();persist();};}
  check('显示精简状态栏','showHud');if(!isMatch){check('显示下一块预告','showNext');check('显示触屏操作按键','showTouch');}
  display.append(make('p','broadcast-note','页面默认透明。预览底色只在本次打开时使用，不保存到直播布局。'));
  const advanced=make('details','broadcast-advanced');advanced.append(make('summary','','高级设置 · 统计与记录'));panel.append(advanced);
  if(isMatch){move('.hud',advanced);move('.billing-hud',advanced);move('#prank-status',advanced);move('.goals',advanced);move('.activity',advanced);}
  else{move('.stats',advanced);move('.piece-rail',advanced);move('.status-section',advanced);move('#activity',advanced);move('.board-top',advanced);move('.board-bottom',advanced);}
  panel.append(make('p','broadcast-footer','S / F2 打开设置 · Esc 或点击外面关闭'));
  const guide=make('div','broadcast-layout-guide');guide.hidden=true;guide.innerHTML='<div class="broadcast-safe-area"><span>留给主播的位置<br><small>仅布局编辑时显示</small></span></div><div class="broadcast-edit-bar"><span>拖动棋盘调整位置 · 拖右下角缩放</span><button type="button" id="layout-done">完成布局</button></div>';document.body.append(guide);const safe=guide.querySelector('.broadcast-safe-area');guide.querySelector('button').onclick=finishEditing;
  function persist(){try{localStorage.setItem(key,JSON.stringify(config));layoutNote.textContent='布局已保存，横屏和竖屏互不影响。';}catch{layoutNote.textContent='本次布局已应用；当前浏览器未允许保存。';}}
  function apply(sync=true){
    const o=orientation(),c=config[o],w=innerWidth,h=innerHeight,base=isMatch?560:300;
    stage.style.width=base+'px';stage.dataset.hud=String(config.showHud);stage.dataset.touch=String(!isMatch&&config.showTouch);stage.dataset.next=String(config.showNext);
    const naturalHeight=stage.offsetHeight||base;const fit=Math.min(1,(w*(o==='portrait'?.73:.44))/base,h*(o==='portrait'?.48:.86)/naturalHeight);
    scale=Math.max(.1,Math.min(fit*c.scale,(w-20)/base,(h-20)/naturalHeight));
    stage.style.setProperty('--stage-scale',String(scale));stage.dataset.compact=String(base*scale<330);
    for(let n=0;n<3&&stage.offsetHeight*scale>h-20;n++){scale=Math.max(.1,(h-22)/stage.offsetHeight);stage.style.setProperty('--stage-scale',String(scale));}
    stage.dataset.tiny=String(base*scale<220);
    const width=base*scale,height=stage.offsetHeight*scale,availableX=Math.max(0,w-width-20),availableY=Math.max(0,h-height-20);
    stage.style.transform=`scale(${scale})`;stage.style.left=(10+availableX*c.x)+'px';stage.style.top=(10+availableY*c.y)+'px';
    orient.textContent=`当前：${o==='portrait'?'竖屏':'横屏'}布局 · 棋盘 ${Math.round(width)} × ${Math.round(height)}`;
    mapBoard.style.cssText=`left:${(10+availableX*c.x)/w*100}%;top:${(10+availableY*c.y)/h*100}%;width:${width/w*100}%;height:${height/h*100}%`;
    map.style.aspectRatio=String(w/h);map.style.width=Math.min(480,132*w/h)+'px';map.style.maxHeight='132px';
    if(sync)for(const id of['x','y','scale'])sliders[id].input.value=Math.round(c[id]*100);
    for(const id of['x','y','scale'])sliders[id].output.textContent=Math.round(c[id]*100)+'%';
    if(editing){const left=10+availableX*c.x,top=10+availableY*c.y;const regions=[{x:left+width+24,y:24,w:w-left-width-48,h:h-48},{x:24,y:24,w:left-48,h:h-48},{x:24,y:top+height+24,w:w-48,h:h-top-height-48}].filter(r=>r.w>70&&r.h>70).sort((a,b)=>b.w*b.h-a.w*a.h);const r=regions[0];safe.hidden=!r;if(r)safe.style.cssText=`left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;}
  }
  function setOpen(value){
    if(editing)return;open=value;panel.hidden=!value;gear.setAttribute('aria-expanded',String(value));document.body.classList.toggle('broadcast-menu-open',value);revealGear();
    if(value){panel.scrollTop=0;close.focus({preventScroll:true});}else gear.focus({preventScroll:true});
  }
  function revealGear(){gear.classList.add('is-visible');clearTimeout(fadeTimer);fadeTimer=setTimeout(()=>{if(!open&&!editing&&document.activeElement!==gear&&!matchMedia('(pointer:coarse)').matches)gear.classList.remove('is-visible');},2400);}
  function startEditing(){previousPause=api.isPaused();api.setPaused(true);setOpen(false);editing=true;guide.hidden=false;document.body.classList.add('broadcast-editing');apply();dragHandle.focus({preventScroll:true});}
  function finishEditing(){if(!editing)return;editing=false;drag=null;guide.hidden=true;document.body.classList.remove('broadcast-editing');persist();if(!previousPause)api.setPaused(false);revealGear();}
  function startDrag(e,type){if(!editing)return;e.preventDefault();const rect=stage.getBoundingClientRect();drag={type,id:e.pointerId,startX:e.clientX,startY:e.clientY,x:rect.x,y:rect.y,width:rect.width,scale:config[orientation()].scale,orientation:orientation()};e.currentTarget.setPointerCapture(e.pointerId);}
  function dragMove(e){if(!drag||drag.id!==e.pointerId||drag.orientation!==orientation())return;const c=config[orientation()],rect=stage.getBoundingClientRect();if(drag.type==='move'){c.x=clamp((drag.x+e.clientX-drag.startX-10)/Math.max(1,innerWidth-rect.width-20),0,1);c.y=clamp((drag.y+e.clientY-drag.startY-10)/Math.max(1,innerHeight-rect.height-20),0,1);}else c.scale=clamp(drag.scale*(drag.width+e.clientX-drag.startX)/drag.width,.5,1.8);apply();}
  dragHandle.onpointerdown=e=>startDrag(e,'move');resizeHandle.onpointerdown=e=>startDrag(e,'resize');for(const el of[dragHandle,resizeHandle]){el.onpointermove=dragMove;el.onpointerup=()=>{drag=null;persist();};el.onpointercancel=()=>{drag=null;};}
  gear.onclick=()=>setOpen(!open);close.onclick=()=>setOpen(false);
  document.addEventListener('pointermove',revealGear,{passive:true});gear.onfocus=revealGear;
  document.addEventListener('pointerdown',revealGear,{passive:true});
  document.addEventListener('pointerdown',e=>{if(open&&!panel.contains(e.target)&&!gear.contains(e.target))setOpen(false);});
  document.addEventListener('keydown',e=>{
    const input=e.target.closest('input,textarea,select');
    if(editing){if(['Escape','Enter'].includes(e.key)){e.preventDefault();finishEditing();}e.stopImmediatePropagation();return;}
    if((e.code==='KeyS'&&!input)||e.key==='F2'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)setOpen(!open);return;}
    if(open){if(e.key==='Escape'){e.preventDefault();setOpen(false);}if(e.key==='Tab'){const list=[...panel.querySelectorAll('button,input,select,summary')].filter(n=>!n.disabled&&n.getClientRects().length);if(list.length){const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}e.stopImmediatePropagation();}
  },true);
  let lastNextType='';
  function update(){
    const set=(el,text)=>{if(el.textContent!==text)el.textContent=text;};set(score,$('#score').textContent);
    set(secondary,isMatch?`${$('#fee-countdown').textContent} / ${$('#fee-target').textContent}`:$('#lines').textContent);
    const warning=isMatch?$('#prank-status').textContent.split(' · ').filter(s=>!s.includes('观众暂时')&&!s.startsWith('下次整活')).join(' · '):[...$('#active-effects').querySelectorAll('.effect-status')].map(n=>n.textContent).join(' · ');
    const effectLayoutChanged=effects.hidden===Boolean(warning);effects.hidden=!warning;set(effects,warning);if(effectLayoutChanged)apply();
    if(nextPreview&&api.nextType){const type=api.nextType();if(type!==lastNextType){lastNextType=type;const c=nextPreview.getContext('2d');c.clearRect(0,0,88,72);const cells=[];(root.BlockShapes[type]||[]).forEach((row,y)=>row.forEach((v,x)=>{if(v)cells.push([x,y]);}));if(cells.length){const xs=cells.map(p=>p[0]),ys=cells.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0+1,h=Math.max(...ys)-y0+1,s=Math.min(80/w,64/h);for(const[x,y]of cells){c.fillStyle={I:'#86cdc7',O:'#efc968',T:'#b9a1d8',S:'#a9c77f',Z:'#eba19a',J:'#90b9d9',L:'#ecb17c'}[type];c.beginPath();c.roundRect((88-w*s)/2+(x-x0)*s+1,(72-h*s)/2+(y-y0)*s+1,s-2,s-2,3);c.fill();}}}}
  }
  const observer=new MutationObserver(update);for(const q of isMatch?['#score','#fee-countdown','#fee-target','#prank-status']:['#score','#lines','#active-effects','#next']){const n=$(q);observer.observe(n,{childList:true,subtree:true,characterData:true,attributes:q==='#next',attributeFilter:q==='#next'?['width','height']:undefined});}
  window.addEventListener('resize',()=>{drag=null;apply();});window.addEventListener('pagehide',()=>{clearTimeout(fadeTimer);});
  setPreview(new URLSearchParams(location.search).get('preview')==='1');
  update();apply();revealGear();
  return{open:()=>setOpen(true),close:()=>setOpen(false),isOpen:()=>open};
 };
})(window);
