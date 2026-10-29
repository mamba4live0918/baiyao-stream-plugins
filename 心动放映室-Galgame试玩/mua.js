/* 手动日漫小剧场：主播自己演，透明特效按命名定位点跟随。 */
(()=>{'use strict';
 const query=new URLSearchParams(location.search),preview=query.get('preview')==='1',debug=query.get('debug')==='1';
 document.body.classList.toggle('preview',preview);
 const $=id=>document.getElementById(id),stage=$('stage'),canvas=$('fx'),ctx=canvas.getContext('2d',{alpha:true});
 const W=1280,H=720,storeKey='baiyao.anime-preview.v2',clamp=n=>Math.max(0,Math.min(1,n));
 const NAMES={mouth:'嘴巴',headTop:'头顶',cheekL:'左脸',cheekR:'右脸',chest:'胸口'};
 const PRESETS={mua:{name:'Mua 小飞吻',key:'m',aim:'mouth',cue:'配合一声 Mua，送出小小心意。'},blush:{name:'害羞脸红',key:'b',aim:'cheekL',cue:'轻轻躲开视线，脸颊慢慢泛红。'},sparkle:{name:'眼边星光',key:'s',aim:'cheekL',cue:'看向镜头，让眼边亮起一点星光。'},question:{name:'歪头疑惑',key:'q',aim:'headTop',cue:'歪一下头，好像有个小小问号。'},heartbeat:{name:'怦然心动',key:'h',aim:'chest',cue:'捂住胸口，怦怦两下刚刚好。'},headpat:{name:'摸摸头',key:'p',aim:'headTop',cue:'把头凑近一点，轻轻摸两下。'}};
 const points={mouth:{x:.670,y:.358},headTop:{x:.664,y:.045},cheekL:{x:.622,y:.355},cheekR:{x:.713,y:.319},chest:{x:.708,y:.604}};
 let anchor='mouth',paused=document.hidden,ready=false,dead=false,clock=0,last=0,raf=0,drag=null,wasActive=false,queue=[],sequence=false;
 try{
   const saved=JSON.parse(localStorage.getItem(storeKey));
   if(saved?.version===2){for(const name of Object.keys(points)){const p=saved.points?.[name];if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))points[name]={x:clamp(p.x),y:clamp(p.y)};}if(NAMES[saved.anchor])anchor=saved.anchor;}
   else{const old=JSON.parse(localStorage.getItem('baiyao.mua-preview.v1'));if(old?.version===1&&Number.isFinite(old.x)&&Number.isFinite(old.y))points.mouth={x:clamp(old.x),y:clamp(old.y)};}
 }catch{}
 for(const key of ['x','y']){const raw=query.get(key);if(raw!==null&&Number.isFinite(Number(raw)))points.mouth[key]=clamp(Number(raw)/100);}
 const art={},loads=[];
 for(const [key,file] of Object.entries({heartMua:'mua-heart.png',momentBlush:'moment-blush.png',momentQuestion:'moment-question.png',momentHand:'moment-hand.png'})){
   const image=new Image();art[key]=image;
   loads.push(new Promise((resolve,reject)=>{image.onload=async()=>{try{if(image.decode)await image.decode();resolve();}catch(error){reject(error);}};image.onerror=()=>reject(Error(file));image.src=file;}));
 }
 const fx=globalThis.BaiyaoHeartProjectile.create({viewport:()=>({width:W,height:H}),art:key=>art[key],spriteMeta:{heartMua:globalThis.MuaSpriteMeta,styles:{glass:{key:'heartMua',hero:0,aura:0,burst:0,sparkle:0}}},resolvePoint:()=>points.mouth});
 const moments=globalThis.BaiyaoAnimeMoments.create({viewport:()=>({width:W,height:H}),art:key=>art[key],resolvePoint:(job,name)=>points[name]||points.mouth});
 const buttons=Array.from(document.querySelectorAll('[data-moment]'));
 function status(text){$('status').textContent=text;}
 function save(){try{localStorage.setItem(storeKey,JSON.stringify({version:2,points,anchor}));}catch{}}
 function syncPoint(syncInputs=true){
   const point=points[anchor];$('anchor').value=anchor;
   $('aim').style.left=(point.x*100)+'%';$('aim').style.top=(point.y*100)+'%';
   if(syncInputs){$('x').value=(point.x*100).toFixed(1);$('y').value=(point.y*100).toFixed(1);}
   $('aim').querySelector('.aim-label').textContent=NAMES[anchor]+'准心';
   $('aim').title='拖动到'+NAMES[anchor]+'的位置';
   $('aim').setAttribute('aria-label',NAMES[anchor]+'准心，X '+(point.x*100).toFixed(1)+'%，Y '+(point.y*100).toFixed(1)+'%');
 }
 const active=()=>fx.active()||moments.active()||queue.length>0;
 function diagnostics(){
   const s=fx.snapshot(),m=moments.snapshot(),heart=s.hearts[0];
   canvas.dataset.phase=heart?.motionPhase||m.moments?.[0]?.moment||'idle';canvas.dataset.hearts=String(s.hearts.length);
   canvas.dataset.moments=String(m.moments?.length||0);canvas.dataset.kinds=(m.moments||[]).map(e=>e.moment).join(',');
   canvas.dataset.origin=heart?heart.origin.x.toFixed(4)+','+heart.origin.y.toFixed(4):'';
   canvas.dataset.position=heart?heart.x.toFixed(2)+','+heart.y.toFixed(2):'';
   canvas.dataset.gameTime=clock.toFixed(1);canvas.dataset.paused=String(paused);canvas.dataset.pending=String(queue.length);
   canvas.dataset.shards=String(s.shards);canvas.dataset.bursts=String(s.bursts.length);
   if(debug){const pixels=ctx.getImageData(0,0,W,H).data;let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])count++;canvas.dataset.paintedPixels=String(count);}
   else if(!active())canvas.dataset.paintedPixels='0';else delete canvas.dataset.paintedPixels;
 }
 function render(){
   ctx.clearRect(0,0,W,H);moments.draw(ctx,clock);fx.draw(ctx,clock);
   const running=active();stage.classList.toggle('performing',running);
   if(wasActive&&!running){status('这一幕刚刚好，随时可以再演一次。');$('state').textContent=paused?'已暂停':'准备好了';sequence=false;}
   wasActive=running;
 }
 let diagnosticAt=-Infinity;
 function tick(now){
   if(dead)return;
   if(last&&!paused)clock+=Math.min(1000,Math.max(0,now-last));last=now;
   if(!paused)while(queue.length&&queue[0].at<=clock){const item=queue.shift();trigger(item.kind,false);}
   render();if(now-diagnosticAt>120){diagnosticAt=now;diagnostics();}
   raf=requestAnimationFrame(tick);
 }
 function updateControls(){for(const b of buttons)b.disabled=!ready||paused;$('scene-sweet').disabled=!ready||paused;}
 function setPause(value,hidden=false){
   paused=value;last=0;drag=null;$('pause').textContent=paused?'继续':'暂停';$('pause').setAttribute('aria-pressed',String(paused));updateControls();
   $('state').textContent=paused?'已暂停':'准备好了';
   status(hidden?'画面已离开，演出暂停；回来后点继续。':paused?'停在这一刻，点继续接着演。':'准备好了，选一个动作开始演。');diagnostics();
 }
 function trigger(kind,cancelSequence=true){
   const preset=PRESETS[kind];if(!preset||!ready||paused||document.hidden)return false;
   if(cancelSequence){queue=[];sequence=false;anchor=preset.aim;syncPoint();save();}
   if(kind==='mua'){fx.clear();fx.enqueue({mua:true,heartVariant:'kiss',quantity:1,size:1,intensity:1,point:{...points.mouth},durationMs:1500},clock);}
   else moments.enqueue({moment:kind,point:{...points[preset.aim]},pointFallbacks:points},clock);
   wasActive=true;$('state').textContent=(sequence?'小剧场 / ':'')+preset.name;status(preset.cue);
   for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.moment===kind));
   render();diagnostics();return true;
 }
 function clear(silent=false){
   queue=[];sequence=false;fx.clear();moments.clear();wasActive=false;stage.classList.remove('performing');ctx.clearRect(0,0,W,H);
   for(const b of buttons)b.setAttribute('aria-pressed','false');
   if(!silent){status('画面已清空，等你下一段小演出。');$('state').textContent=paused?'已暂停':'准备好了';}diagnostics();
 }
 function sweet(){
   if(!ready||paused||document.hidden)return;clear(true);sequence=true;
   queue=[{kind:'sparkle',at:clock},{kind:'blush',at:clock+550},{kind:'mua',at:clock+1400}];
   wasActive=true;$('state').textContent='小剧场 / 怦然心动';status('看向镜头，害羞一下，再送出一声 Mua。');
 }
 function setPoint(x,y,syncInputs=true){points[anchor]={x:clamp(x),y:clamp(y)};syncPoint(syncInputs);save();}
 function pointerPoint(event){const r=stage.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};}
 for(const b of buttons)b.addEventListener('click',()=>trigger(b.dataset.moment));
 $('scene-sweet').addEventListener('click',sweet);$('pause').addEventListener('click',()=>setPause(!paused));$('clear').addEventListener('click',()=>clear());
 $('anchor').addEventListener('change',()=>{if(NAMES[$('anchor').value]){anchor=$('anchor').value;syncPoint();save();}});
 $('show-aim').addEventListener('change',()=>stage.classList.toggle('aim-hidden',!$('show-aim').checked));
 for(const key of ['x','y']){
   $(key).addEventListener('input',()=>{const n=$(key).valueAsNumber;if(Number.isFinite(n))setPoint(key==='x'?n/100:points[anchor].x,key==='y'?n/100:points[anchor].y,false);});
   $(key).addEventListener('change',()=>{const n=$(key).valueAsNumber;if(Number.isFinite(n))setPoint(key==='x'?n/100:points[anchor].x,key==='y'?n/100:points[anchor].y);else syncPoint();});
 }
 $('aim').addEventListener('pointerdown',event=>{if(!preview||event.button!==0)return;event.preventDefault();drag=event.pointerId;$('aim').setPointerCapture(drag);});
 $('aim').addEventListener('pointermove',event=>{if(drag!==event.pointerId)return;const p=pointerPoint(event);setPoint(p.x,p.y);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])$('aim').addEventListener(name,()=>{drag=null;});
 $('aim').addEventListener('keydown',event=>{
   const delta=(event.shiftKey ? .01 : .001),step={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]}[event.key];
   if(step){event.preventDefault();setPoint(points[anchor].x+step[0],points[anchor].y+step[1]);}
 });
 document.addEventListener('keydown',event=>{
   if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(event.key===' '){event.preventDefault();setPause(!paused);return;}
   const key=event.key.toLowerCase(),kind=Object.keys(PRESETS).find(id=>PRESETS[id].key===key);
   if(kind||key==='g'){event.preventDefault();if(document.hidden)return;if(!preview&&paused)setPause(false);if(kind)trigger(kind);else sweet();}
   else if(event.key==='Escape')clear();
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)setPause(true,true);});
 window.addEventListener('blur',()=>{drag=null;});
 window.addEventListener('pagehide',()=>{dead=true;cancelAnimationFrame(raf);clear(true);},{once:true});
 syncPoint();setPause(paused);raf=requestAnimationFrame(tick);
 Promise.all(loads).then(()=>{ready=true;fx.prepareTextures();moments.prepareTextures();updateControls();$('state').textContent=paused?'已暂停':'准备好了';status('六种小互动都准备好了，点卡片或按快捷键。');diagnostics();}).catch(()=>{ready=false;updateControls();$('state').textContent='素材未加载';status('部分小剧场素材未加载，请完整保留同目录的 PNG 文件。');});
})();
