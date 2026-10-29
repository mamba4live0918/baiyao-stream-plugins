import meta from '../../assets/rent-meta.mjs';
import {onFace} from '../ui/movable.js';

export function formatDuration(seconds){
 const value=Math.max(0,Math.ceil(Number(seconds)||0)),h=Math.floor(value/3600),m=Math.floor(value/60)%60,s=value%60;
 return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
/* V1.5 交租牌：加班时间改看白曜加班机，画面上只留交租牌；按 1080 短边的尺寸乘主播自己调的大小。
 * V1.6 记到插件自带的加班机时，交租牌下面挂一条「距离下播」倒计时（跟着牌子拖、跟着牌子缩放）。 */
export const PANEL=Object.freeze({width:240,height:100,minScale:.4,maxScale:3});
export function panelLayout(w,h,panel={}){
 const u=Math.min(w,h)/1080,scale=clamp(finite(panel.scale)?panel.scale:1,PANEL.minScale,PANEL.maxScale),k=u*scale;
 const width=PANEL.width*k,height=PANEL.height*k;
 // 默认放右上角（设置按钮下面），不压柜台、钱罐和脸。
 const x=finite(panel.x)?panel.x*w:w-width-20*u,y=finite(panel.y)?panel.y*h:70*u;
 const px=clamp(x,0,Math.max(0,w-width)),py=clamp(y,0,Math.max(0,h-height));
 return{unit:u,scale,k,panel:{x:px,y:py,width,height}};
}
export function rentLayout(w,h,c,panel={}){
 const u=Math.min(w,h)/1080,p=panelLayout(w,h,panel);
 return{unit:u,scale:p.scale,panel:p.panel,
  person:{x:c.x+8*u,y:h-260*u,width:200*u,height:260*u},
  message:{x:c.x+c.width/2-270*u,y:h-98*u,width:540*u,height:76*u}};
}
export function rentClipPath(w,h,zone){
 if(!zone?.enabled||!zone.pts?.length)return'none';
 return`path(evenodd, "M0 0H${w}V${h}H0Z M${zone.pts.map(([x,y])=>`${x*w/100} ${y*h/100}`).join('L')}Z")`;
}
const box=(node,r)=>Object.assign(node.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const CSS=`
#rent-layer{position:fixed;inset:0;z-index:14;pointer-events:none;color:#49372d;font-family:"Microsoft YaHei",sans-serif;font-weight:900}
#rent-layer *{pointer-events:none}#rent-layer .rent-part{position:absolute}#rent-layer img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
#rent-layer #rent-panel{pointer-events:auto;cursor:grab;touch-action:none;user-select:none}#rent-layer #rent-panel *{pointer-events:auto}
#rent-layer #rent-panel[data-dragging="move"]{cursor:grabbing}
#rent-panel-grip{position:absolute;right:-7px;bottom:-7px;width:24px;height:24px;border-radius:50%;background:#fff4d9;border:2px solid #49372d;box-shadow:0 2px 0 #49372d;cursor:nwse-resize;opacity:0;transition:opacity .15s}
#rent-panel-grip::after{content:"";position:absolute;inset:6px;border-right:2px solid #49372d;border-bottom:2px solid #49372d}
#rent-layer #rent-panel:hover #rent-panel-grip,#rent-layer #rent-panel[data-dragging] #rent-panel-grip{opacity:1}
#rent-layer .rent-text{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.45;white-space:nowrap;text-align:center}
#rent-layer .rent-text small{font-size:.76em}#rent-layer .rent-text[data-urgent="true"]{color:#a94137}
#rent-sign[data-urgent="true"]{animation:ct-rent-urgent .42s ease-in-out infinite;transform-origin:50% 0}#rent-layer[data-paused="true"] *{animation-play-state:paused!important}
@keyframes ct-rent-urgent{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg)}}
#rent-book-stamp{position:absolute;color:#a3453c;border:1px solid currentColor;transform:rotate(-8deg);display:flex;align-items:center;justify-content:center}
#rent-message{display:flex;align-items:center;justify-content:center;flex-direction:column;background:#fff4d9;border:2px solid #49372d;border-radius:12px;box-shadow:0 3px 0 #49372d;text-shadow:0 1px #fff8ea;text-align:center;white-space:nowrap}
#rent-message small{font-size:.72em}
#rent-clock{position:absolute;left:0;right:0;top:calc(100% + .35em);display:flex;flex-wrap:wrap;align-items:baseline;column-gap:.45em;row-gap:0;padding:.28em .7em;border-radius:.6em;background:#fff4d9;border:2px solid #49372d;box-shadow:0 2px 0 #49372d;color:#49372d;font-family:"Microsoft YaHei",sans-serif;white-space:nowrap;box-sizing:border-box}
#rent-clock[hidden]{display:none}#rent-clock small{font-size:.68em;font-weight:600;opacity:.85}#rent-clock b{font-size:1.12em;font-weight:800;font-variant-numeric:tabular-nums}
#rent-clock .net{margin-left:auto;font-size:.7em;font-weight:700;color:#9a5b2e}#rent-clock .net.flash{padding:.08em .5em;border-radius:.5em;background:#2f7a5f;color:#fff}#rent-clock .net.flash.sub{background:#b5603f}
#rent-clock[data-done="true"] b,#rent-clock[data-done="true"] small{color:#b5603f}@media(prefers-reduced-motion:reduce){#rent-sign{animation:none!important}}
`;

// Cached sprites are DOM layers; a changing second never invalidates a Canvas.
// The only RAF here belongs to a bounded landlady visit, including pause/resume.
export class RentScene{
 constructor({bank,clock,getCounter,getZone,getPanel=()=>({}),onPanelChange=()=>{},onBlocked=()=>{}}){
  Object.assign(this,{bank,clock,getCounter,getZone,getPanel,onPanelChange,onBlocked});this.frame=0;this.active=null;this.queue=[];this.paused=document.hidden;this.animationFrames=0;this.textUpdates=0;this.dragging=null;
  const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
  this.root=document.createElement('div');this.root.id='rent-layer';this.root.setAttribute('aria-label','交租');document.body.append(this.root);
  this.panelNode=document.createElement('div');this.panelNode.id='rent-panel';this.panelNode.className='rent-part';this.panelNode.title='拖动换位置，拖右下角改大小';this.root.append(this.panelNode);
  this.sign=this.part('rent-sign','rent_sign',this.panelNode);this.signText=this.panel(this.sign,'rent_sign','textRect');
  this.grip=document.createElement('div');this.grip.id='rent-panel-grip';this.grip.title='拖这里改大小';this.panelNode.append(this.grip);
  this.clockNode=document.createElement('div');this.clockNode.id='rent-clock';this.clockNode.hidden=true;
  this.clockLabel=document.createElement('small');this.clockTime=document.createElement('b');this.clockNet=document.createElement('span');this.clockNet.className='net';
  this.clockNode.append(this.clockLabel,this.clockTime,this.clockNet);this.panelNode.append(this.clockNode);this.flashUntil=0;this.flashTimer=null;
  this.panelNode.addEventListener('pointerdown',e=>this.startDrag(e));
  this.panelNode.addEventListener('pointermove',e=>this.moveDrag(e));
  this.panelNode.addEventListener('pointerup',e=>this.endDrag(e));
  this.panelNode.addEventListener('pointercancel',e=>this.endDrag(e,true));
  this.panelNode.addEventListener('lostpointercapture',e=>this.endDrag(e,true));
  this.person=this.part('rent-landlady','landlady_stand');this.person.hidden=true;
  this.book=this.part('rent-book','landlady_book',this.person);
  this.stamp=document.createElement('span');this.stamp.id='rent-book-stamp';this.stamp.textContent='租';this.book.append(this.stamp);
  this.message=document.createElement('div');this.message.id='rent-message';this.message.className='rent-part';this.message.hidden=true;
  this.message.append(document.createElement('span'),document.createElement('small'));this.root.append(this.message);
  this.resize();
 }
 part(id,asset,parent=this.root){const node=document.createElement('div');node.id=id;node.className='rent-part';const img=document.createElement('img');img.alt='';img.draggable=false;img.src=this.bank.images.get(asset).src;node.append(img);parent.append(node);return node;}
 panel(parent,id,key){const node=document.createElement('div');node.className='rent-text';const a=meta[id],r=a[key];Object.assign(node.style,{left:100*r.x/a.sourceSize.width+'%',top:100*r.y/a.sourceSize.height+'%',width:100*r.width/a.sourceSize.width+'%',height:100*r.height/a.sourceSize.height+'%'});node.append(document.createElement('span'),document.createElement('small'));parent.append(node);return node;}
 currentPanel(){return this.dragging?.panel||this.getPanel()||{};}
 resize(){
  this.regions=rentLayout(innerWidth,innerHeight,this.getCounter(),this.currentPanel());const r=this.regions,u=r.unit,k=u*r.scale,p=r.panel;
  box(this.panelNode,p);box(this.sign,{x:0,y:0,width:p.width,height:p.height});
  for(const [node,key]of [[this.person,'person'],[this.message,'message']])box(node,r[key]);
  const body=meta.landlady_stand,grip=body.anchors.find(a=>a.name==='book-grip'),book=meta.landlady_book;
  box(this.book,{x:(grip.x/2-book.anchor.x/2)*u,y:(grip.y/2-book.anchor.y/2)*u,width:70*u,height:65*u});
  const sr=book.stampRect;box(this.stamp,{x:sr.x/2*u,y:sr.y/2*u,width:sr.width/2*u,height:sr.height/2*u});this.stamp.style.fontSize=15*u+'px';
  this.signText.style.fontSize=18*k+'px';this.message.style.fontSize=25*u+'px';this.clockNode.style.fontSize=17*k+'px';
  this.root.style.clipPath=rentClipPath(innerWidth,innerHeight,this.getZone());
 }
 startDrag(e){
  if(e.button!==0||this.dragging)return;e.preventDefault();e.stopPropagation();
  const p=this.regions.panel,base=this.getPanel()||{};
  this.dragging={mode:e.target.closest('#rent-panel-grip')?'resize':'move',pointerId:e.pointerId,start:{x:e.clientX,y:e.clientY},rect:{...p},scale:this.regions.scale,panel:{x:p.x/innerWidth,y:p.y/innerHeight,scale:finite(base.scale)?base.scale:this.regions.scale}};
  this.panelNode.dataset.dragging=this.dragging.mode;try{this.panelNode.setPointerCapture(e.pointerId);}catch{}
 }
 moveDrag(e){
  const d=this.dragging;if(!d||d.pointerId!==e.pointerId)return;e.stopPropagation();
  const dx=e.clientX-d.start.x,dy=e.clientY-d.start.y;
  if(d.mode==='move'){
   const x=clamp(d.rect.x+dx,0,Math.max(0,innerWidth-d.rect.width)),y=clamp(d.rect.y+dy,0,Math.max(0,innerHeight-d.rect.height));
   d.panel={...d.panel,x:x/innerWidth,y:y/innerHeight};
  }else{
   // 按右下角拖：左上角不动，宽度跟着鼠标走，按比例放大缩小。
   const ry=dy*d.rect.width/d.rect.height,width=Math.max(1,d.rect.width+(Math.abs(dx)>=Math.abs(ry)?dx:ry));
   d.panel={...d.panel,scale:clamp(d.scale*width/d.rect.width,PANEL.minScale,PANEL.maxScale)};
  }
  this.resize();
 }
 endDrag(e,cancel=false){
  const d=this.dragging;if(!d||d.pointerId!==e.pointerId)return;e.stopPropagation();
  this.dragging=null;delete this.panelNode.dataset.dragging;try{this.panelNode.releasePointerCapture(e.pointerId);}catch{}
  const moved=Math.hypot(e.clientX-d.start.x,e.clientY-d.start.y)>=3;
  // 中心压在脸上的话，露脸区会把交租牌裁掉（看不见也点不到），弹回原处
  const blocked=!cancel&&moved&&onFace(panelLayout(innerWidth,innerHeight,d.panel).panel,this.getZone(),{width:innerWidth,height:innerHeight});
  if(blocked)this.onBlocked();else if(!cancel&&moved)this.onPanelChange({x:d.panel.x,y:d.panel.y,scale:d.panel.scale});
  this.resize();
 }
 sync(view,settings,{open=false}={}){
  this.view=view;this.root.dataset.paused=String(this.paused);
  // 不交租就没有牌子可挂
  this.panelNode.hidden=settings.enabled===false;
  this.resize();
  const urgent=settings.enabled&&view.remainingSeconds<=30&&view.started&&open;
  this.sign.dataset.urgent=String(urgent);this.signText.dataset.urgent=String(urgent);
  const title=!view.started?'等首位顾客':!open?'打烊 · 暂停':`下次交租 ${formatDuration(view.remainingSeconds)}`;
  const surcharge=view.abandonSurcharge||0;
  text(this.signText.children[0],title);text(this.signText.children[1],`要交 ${view.chargeCoins??settings.coins} 铜板${surcharge?`（跑单 +${surcharge}）`:''}`);this.textUpdates++;
 }
 /** note：第二行补一句加班去哪了（「加到加班机」或「先记下，连上加班机再加」）。上屏的字不带「白曜」。 */
 announce(charges,{kind='rent',note=''}={}){
  if(!charges.length)return;
  this.queue.push({kind,note,paid:charges.reduce((s,c)=>s+c.paid,0),shortfall:charges.reduce((s,c)=>s+c.shortfall,0),seconds:charges.reduce((s,c)=>s+c.seconds,0),count:charges.length});
  this.beginNext();
 }
 beginNext(){
  if(this.active||!this.queue.length)return;this.active={...this.queue.shift(),start:this.clock(),until:this.clock()+4200};
  this.person.hidden=false;this.message.hidden=false;
  const a=this.active,paid=`交了 ${Number(a.paid.toFixed(2))} 铜板${a.count>1?' · '+a.count+' 次合并展示':''}`;
  text(this.message.children[0],a.kind==='overtime'?`加班 +${formatDuration(a.seconds)}`:a.shortfall?`差 ${Number(a.shortfall.toFixed(2))} → 加班 ${formatDuration(a.seconds)}`:'交租成功');
  text(this.message.children[1],a.kind==='overtime'?a.note||'加到加班机':a.shortfall&&a.note?`${paid} · ${a.note}`:paid);this.invalidate();
 }
 announceOvertime(seconds,{note=''}={}){this.announce([{paid:0,shortfall:0,seconds}],{kind:'overtime',note});}
 invalidate(){if(!this.frame&&!this.paused&&this.active)this.frame=requestAnimationFrame(()=>this.tick());}
 tick(){
  this.frame=0;if(this.paused||!this.active)return;this.animationFrames++;
  const a=this.active,t=Math.max(0,Math.min(1,(this.clock()-a.start)/4200));
  if(t>=1){this.active=null;this.person.hidden=true;this.message.hidden=true;this.beginNext();return;}
  const u=this.regions.unit,entry=Math.min(1,t/.2),exit=Math.max(0,(t-.76)/.24),x=(-1+entry)*240*u-exit*240*u;
  this.person.style.transform=`translateX(${x}px) rotate(${!a.shortfall&&t>.3&&t<.45?Math.sin((t-.3)/.15*Math.PI)*3:0}deg)`;
  const stamping=a.shortfall>0&&t>.25&&t<.75;
  const asset=stamping?'landlady_stamp':'landlady_stand',img=this.person.firstElementChild,source=this.bank.images.get(asset).src;
  if(img.src!==source)img.src=source;this.stamp.hidden=!stamping||t<.34;
  this.message.style.opacity=String(Math.min(1,t/.22,(1-t)/.15));this.invalidate();
 }
 pause(){this.paused=true;this.root.dataset.paused='true';if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}
 reset(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.active=null;this.queue=[];this.person.hidden=true;this.message.hidden=true;}
 /* 自带加班机的倒计时条：visible 时显示；文字没变就不碰 DOM */
 setClock({visible=false,label='',time='',net='',done=false}={}){
  if(this.clockNode.hidden===visible)this.clockNode.hidden=!visible;if(!visible)return;
  const set=(n,v)=>{if(n.textContent!==v)n.textContent=v;};set(this.clockLabel,label);set(this.clockTime,time);
  this.clockNode.dataset.done=String(done);if(Date.now()>=this.flashUntil)set(this.clockNet,net);
 }
 /* 加减时间时右边那段临时换成高亮的「+5 分钟」，2 秒后恢复 */
 flashClock(seconds,text){
  this.flashUntil=Date.now()+2000;this.clockNet.classList.add('flash');this.clockNet.classList.toggle('sub',seconds<0);this.clockNet.textContent=(seconds<0?'−':'+')+text;
  clearTimeout(this.flashTimer);this.flashTimer=setTimeout(()=>{this.flashUntil=0;this.clockNet.classList.remove('flash','sub');},2050);
 }
 resume(){this.paused=false;this.root.dataset.paused='false';this.invalidate();}
 snapshot(){return{active:this.active?{...this.active}:null,queued:this.queue.length,animationFrames:this.animationFrames,scheduled:Boolean(this.frame),regions:structuredClone(this.regions),textUpdates:this.textUpdates,panelHidden:this.panelNode.hidden};}
 async settle(){const end=performance.now()+4600;while((this.frame||this.active)&&performance.now()<end)await new Promise(r=>setTimeout(r,30));return this.snapshot();}
}
