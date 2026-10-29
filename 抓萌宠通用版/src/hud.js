/* Independently movable, scalable counters and waiting information. */
class CowHud {
 constructor({core,toast,canDrag=()=>true,theme=()=> 'cream',layout=null}){
  Object.assign(this,{core,toast,canDrag,theme,layout});this.preview=false;this.dragging=false;this.last={outside:0,home:0,pending:0,queue:0};
  this.defaults={stats:{x:78,y:8,scale:100},waiting:{x:14,y:80,scale:100}};this.cfg=structuredClone(this.defaults);
  if(!this.layout)try{const saved=JSON.parse(localStorage.getItem('pet-catch-hud-v1')||'null');for(const key of ['stats','waiting'])for(const[name,min,max]of[['x',0,100],['y',0,100],['scale',50,250]])if(Number.isFinite(saved?.[key]?.[name])&&saved[key][name]>=min&&saved[key][name]<=max)this.cfg[key][name]=saved[key][name];}catch{this.toast('统计布局读取失败，先使用默认位置');}
  this.layout?.applyHud(this.cfg);this.nodes={stats:document.getElementById('stats-hud'),waiting:document.getElementById('status')};
  for(const key of ['stats','waiting']){this.bindDrag(key);for(const prop of ['x','y','scale']){const el=document.getElementById(key+'Hud'+prop);el.addEventListener('input',()=>{const n=Number(el.value),min=prop==='scale'?50:0,max=prop==='scale'?250:100;if(!el.value.trim()||!Number.isFinite(n)||n<min||n>max){document.getElementById('hud-error').textContent=`请输入 ${min}–${max} 的数值；未应用。`;return;}this.cfg[key][prop]=n;document.getElementById('hud-error').textContent='';this.apply(key);this.save();});}}
  document.getElementById('preview-waiting').onclick=()=>{this.preview=!this.preview;this.update(this.last);this.sync();};
  document.getElementById('reset-hud').onclick=()=>{this.cfg=structuredClone(this.layout?this.layout.defaults.hud:this.defaults);this.applyAll();this.sync();this.save();};
  if(!this.layout)window.addEventListener('resize',()=>this.applyAll());this.sync();this.update(this.last);
 }
 save(){if(this.layout){this.layout.captureHud(this.cfg);return;}try{localStorage.setItem('pet-catch-hud-v1',JSON.stringify(this.cfg));}catch{this.toast('统计布局本页已应用，浏览器未能保存');}}
 sync(){for(const key of ['stats','waiting'])for(const prop of ['x','y','scale'])document.getElementById(key+'Hud'+prop).value=Math.round(this.cfg[key][prop]*10)/10;document.getElementById('preview-waiting').textContent=this.preview?'结束入场预览':'预览入场提示';}
 stopPreview(){this.preview=false;this.update(this.last);this.sync();}
 text(id,value){const el=document.getElementById(id),s=String(value);if(el.textContent!==s)el.textContent=s;}
 update(data){this.last={...data};this.text('outside',data.outside);this.text('home',data.home);const waiting=data.pending>0,queued=data.queue>0,preview=!waiting&&!queued;
  const resident=document.getElementById('resident-summary');if(resident){resident.hidden=!(data.residentCount>0);this.text('resident-count',data.residentCount||0);this.nodes.stats.classList.toggle('has-residents',data.residentCount>0);}
  this.nodes.waiting.hidden=preview&&!this.preview&&this.dragging!=='waiting';this.nodes.waiting.classList.toggle('preview-hud',preview);
  this.text('waiting-label',waiting&&data.limited?'候场':waiting||preview?'入场中':'待开盒');this.text('waiting-count',waiting?data.pending:queued?data.queue:0);this.text('waiting-unit',waiting||preview?'只':'盒');this.text('waiting-help',waiting?(data.limited?'空出位置后自动补入':'正在分批入场'):queued?'按顺序逐盒开启':'位置预览 · 当前没有待入场成员');
  const extra=document.getElementById('waiting-queue');extra.hidden=!(waiting&&queued);this.text('waiting-queue',`另有 ${data.queue} 盒待开`);this.applyAll();
 }
 apply(key){const el=this.nodes[key],cfg={...this.cfg[key]},w=key==='stats'?348:264,h=el.offsetHeight||(key==='stats'?78:86),g=this.core.hudGeometry(cfg,w,h,innerWidth,innerHeight,this.layout?.metrics.textScale||1);if(this.layout){const box=id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height};},p=PetLayout.avoidHud({x:g.x,y:g.y,w:g.width,h:g.height},box('settings-btn'),key==='stats'?box('pen'):null,innerWidth,innerHeight);g.x=p.x;g.y=p.y;}el.style.left=g.x+'px';el.style.top=g.y+'px';el.style.setProperty('--hud-scale',g.scale/100);el.style.transform=`translate(-50%,-50%) scale(${g.scale/100})`;}
 applyAll(){this.apply('stats');this.apply('waiting');}
 bindDrag(key){const el=this.nodes[key];let drag=null;
  const apply=()=>{this.apply(key);this.sync();};
  const finish=()=>{if(!drag)return;const id=drag.id;drag=null;this.dragging=false;el.classList.remove('hud-dragging');try{if(el.hasPointerCapture(id))el.releasePointerCapture(id);}catch{}this.save();this.update(this.last);};
  el.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false||this.dragging||!this.canDrag())return;e.preventDefault();e.stopPropagation();const r=el.getBoundingClientRect(),resize=!!e.target.closest('.hud-resize');drag={id:e.pointerId,resize,px:e.clientX,py:e.clientY,x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,baseWidth:el.offsetWidth,baseHeight:el.offsetHeight};this.dragging=key;el.classList.add('hud-dragging');(resize?el.querySelector('.hud-resize'):el).focus({preventScroll:true});try{el.setPointerCapture(e.pointerId);}catch{finish();}});
  el.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();const dx=e.clientX-drag.px,dy=e.clientY-drag.py;if(drag.resize){const scale=this.layout?.metrics.textScale||1;this.cfg[key].scale=this.core.resizeHud(drag.baseWidth,drag.baseHeight,drag.width,dx,dy,innerWidth,innerHeight,scale);const g=this.core.hudGeometry(this.cfg[key],drag.baseWidth,drag.baseHeight,innerWidth,innerHeight,scale);Object.assign(this.cfg[key],this.core.moveHud(drag.x,drag.y,g.width,g.height,innerWidth,innerHeight));}else Object.assign(this.cfg[key],this.core.moveHud(drag.x+dx,drag.y+dy,drag.width,drag.height,innerWidth,innerHeight));apply();});
  el.addEventListener('pointerup',e=>{if(e.pointerId===drag?.id)finish();});el.addEventListener('pointercancel',e=>{if(e.pointerId===drag?.id)finish();});el.addEventListener('lostpointercapture',finish);window.addEventListener('blur',finish);window.addEventListener('pagehide',finish);window.addEventListener('resize',finish);
  el.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing)finish();});
 }
}
