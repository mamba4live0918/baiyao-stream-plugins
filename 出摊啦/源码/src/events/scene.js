import meta from '../../assets/events-meta.mjs';
import {makeMovable,boardRect,onFace} from '../ui/movable.js';
import {rectIntersectsZone} from '../crowd/layout.js';
import {extinguisherGeometry,workingEndTouchesRect} from '../cooking/tool-geometry.js';

const FONT='"Microsoft YaHei",sans-serif',INK='#49372d';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const inside=(p,r)=>r&&p.x>=r.x&&p.y>=r.y&&p.x<=r.x+r.width&&p.y<=r.y+r.height;
const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
const lerp=(a,b,t)=>a+(b-a)*t;
const hash=text=>[...String(text||'')].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
const num=n=>Number(Number(n||0).toFixed(2)).toLocaleString('zh-CN',{maximumFractionDigits:2});

export function eventPointInFace(p,zone,w,h){
 const poly=zone?.pts;if(!Array.isArray(poly)||poly.length<3)return false;let hit=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j],ax=a[0]*w/100,ay=a[1]*h/100,bx=b[0]*w/100,by=b[1]*h/100;
  if((ay>p.y)!==(by>p.y)&&p.x<(bx-ax)*(p.y-ay)/(by-ay)+ax)hit=!hit;
 }
 return hit;
}
export function eventLayout({width:w,height:h,counter:c,tools={},zone,actors=[],state={},now=0,shop='noodle',boards={}}){
 const u=Math.min(w,h)/1080,fit=r=>({...r,x:clamp(r.x,0,Math.max(0,w-r.width)),y:clamp(r.y,0,Math.max(0,h-r.height))});
 const pot=(shop==='sushi'?tools.board:tools.pot)||{x:c.x+c.width*.4-110*u,y:c.y-80*u,width:220*u,height:140*u};
 const jar=tools.jar||{x:c.x+c.width*.93-60*u,y:c.y-65*u,width:120*u,height:130*u};
 const dish=tools.dish||{x:c.x+c.width*.68-55*u,y:c.y-18*u,width:110*u,height:85*u};
 const facePoints=(zone?.pts||[[42,18],[58,18],[58,48],[42,48]]).map(([x,y])=>[x*w/100,y*h/100]);
 const xs=facePoints.map(p=>p[0]),ys=facePoints.map(p=>p[1]),face={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 const thief=state.active?.thief,actor=actors.length?actors[hash(thief?.id)%Math.min(40,actors.length)]:null;
 const pos=actor?.position||actor,start=actor?{x:pos.x,y:pos.y,width:actor.width,height:actor.height}:{x:c.x+c.width*.22,y:c.y-132*u,width:110*u,height:130*u};
 const travel=thief?clamp(((now-thief.startAt)/Math.max(1,thief.dueAt-thief.startAt)-.55)/.45,0,1):0;
 const thiefRect=fit({x:lerp(start.x,jar.x-150*u,travel),y:lerp(start.y,c.y-150*u,travel),width:lerp(start.width,150*u,travel),height:lerp(start.height,192*u,travel)});
 const target=center(pot),fire=fit({x:target.x-95*u,y:pot.y+pot.height-190*u,width:190*u,height:200*u});
 return{unit:u,counter:c,pot,jar,dish,face,facePoints,
  fire,extinguisher:fit({x:c.x+20*u,y:c.y-145*u,width:50*u,height:140*u}),
  fuse:fit({x:c.x+c.width-115*u,y:c.y-300*u,width:90*u,height:130*u}),
  cat:fit({x:pot.x+pot.width*.5-83*u,y:pot.y-(shop==='tea'?145:115)*u,width:166*u,height:175*u}),
  thief:thiefRect,thiefWalking:travel>0,
  tour:fit({x:c.x+c.width*.67-165*u,y:c.y-177*u,width:330*u,height:190*u}),
  hand:fit({x:dish.x+dish.width*.5-110*u,y:dish.y-400*u,width:220*u,height:420*u}),
  helper:fit({x:c.x+160*u,y:c.y-180*u,width:180*u,height:230*u}),
  guard:fit({x:c.x+c.width-230*u,y:c.y-205*u,width:190*u,height:260*u}),
  wanted:wantedRect(w,h,c,u,boards.wanted,fit),
  workingArea:{x:c.x-20*u,y:c.y-240*u,width:c.width+40*u,height:c.height+240*u}};
}
/* 通缉令默认在柜台左上方；主播拖过就用存的位置（画面比例）和大小。 */
export function wantedRect(w,h,c,u,board,fit=r=>r){
 const r=boardRect(board,{width:150*u,height:200*u},{width:w,height:h});
 return fit({x:r.x??c.x+10*u,y:r.y??80*u,width:r.width,height:r.height});
}
export function eventDropAction(kind,start,end,regions){
 const u=regions.unit;
 if(kind==='extinguisher')return workingEndTouchesRect(extinguisherGeometry(end,regions).workingEnd,regions.fire)?{type:'extinguish'}:null;
 if(kind==='fuse')return start.y-end.y>=20*u?{type:'restorePower'}:null;
 if(kind==='cat')return Math.hypot(end.x-start.x,end.y-start.y)>=60*u&&!inside(end,regions.workingArea)?{type:'removeCat'}:null;
 return null;
}
export function eventNeedsAnimation(state,kitchen,now,localEffects=[]){
 const a=state?.active||{};
 return Boolean((a.fire&&!a.fire.burnt&&a.fire.burnAt>now)||(a.thief&&a.thief.dueAt>now)||(a.tour&&a.tour.until>now)||
  (a.spice&&a.spice.until>now)||(a.cat&&Number.isFinite(a.cat.lastEatAt)&&a.cat.lastEatAt+450>now)||kitchen?.pot?.status==='smoking'||(state?.effects||[]).some(e=>e.until>now)||localEffects.some(e=>e.until>now));
}

const CSS=`#event-stage{position:fixed;inset:0;width:100%;height:100%;z-index:12;pointer-events:none}
#event-hits{position:fixed;inset:0;z-index:19;pointer-events:none}.event-board{position:fixed;background:transparent;border:0;padding:0}.event-hit{position:fixed;pointer-events:auto;opacity:0;background:transparent;border:0;padding:0;touch-action:none;cursor:grab}.event-hit[data-event-hit="thief"]{cursor:pointer}.event-hit[data-event-hit="wipe"]{cursor:crosshair}.event-hit:focus-visible{opacity:1;background:transparent;outline:3px dashed #f79a77}:root[data-event-drag="true"] .event-hit{cursor:grabbing}`;

// All images are cached bank sprites. Persistent trouble has no idle RAF loop;
// only an approaching deadline, an input move or a bounded effect wakes it up.
export class EventScene{
 constructor(options){
  Object.assign(this,options);this.canvas=document.createElement('canvas');this.canvas.id='event-stage';this.canvas.setAttribute('aria-label','捣乱和帮忙效果');document.body.append(this.canvas);
  this.g=this.canvas.getContext('2d',{alpha:true});const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
  this.hitLayer=document.createElement('div');this.hitLayer.id='event-hits';document.body.append(this.hitLayer);this.buttons=new Map();
  const labels={extinguisher:'灭火器：拖到火上喷灭',thief:'小偷：连续点三下抓住',fuse:'电闸：往上拖恢复供电',cat:'野猫：拖离柜台扔出去',wipe:'脸上污渍：按住来回擦掉'};
  this.wantedBoard=document.createElement('div');this.wantedBoard.className='event-board';this.wantedBoard.dataset.board='wanted';this.wantedBoard.hidden=true;this.hitLayer.append(this.wantedBoard);
  makeMovable(this.wantedBoard,{getRect:()=>{const r=this.regions.wanted;return{rect:{...r},scale:r.width/(150*this.u)};},
   preview:next=>{this.wantedPreview=next;this.sync();},commit:next=>{this.wantedPreview=null;this.saveBoard?.('wanted',next);this.sync();},
   blocked:next=>onFace(wantedRect(this.width,this.height,this.getCounter(),this.u,next),this.getZone(),{width:this.width,height:this.height}),
   onBlocked:()=>this.notify?.('牌子不能放在脸上，已放回原处')});
  for(const kind of Object.keys(labels)){const b=document.createElement('button');b.type='button';b.className='event-hit';b.dataset.eventHit=kind;b.setAttribute('aria-label',labels[kind]);b.addEventListener('pointerdown',e=>this.start(kind,e));this.hitLayer.append(b);this.buttons.set(kind,b);}
  this.frame=0;this.timer=null;this.renderCount=0;this.inTick=false;this.paused=document.hidden;this.drag=null;this.pointer=null;this.localEffects=[];this.samples=[];this.collect=false;
  document.addEventListener('pointermove',e=>this.move(e),{passive:true});document.addEventListener('pointerup',e=>this.end(e));document.addEventListener('pointercancel',()=>this.cancelDrag());addEventListener('blur',()=>this.cancelDrag());
  this.resize();
 }
 now(){return this.clock();}
 resize(){
  this.cancelDrag();this.width=innerWidth;this.height=innerHeight;this.u=Math.min(this.width,this.height)/1080;this.dpr=Math.min(devicePixelRatio||1,2);
  this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.blackoutMask=null;this.computeLayout();this.updateHits();this.invalidate();
 }
 computeLayout(){const state=this.getState();this.regions=eventLayout({width:this.width,height:this.height,counter:this.getCounter(),tools:this.getKitchenLayout?.()||{},zone:this.getZone(),actors:state.active?.thief?(this.getCrowdActors?.()||[]):[],state,now:this.now(),shop:this.getSettings().shop,boards:{...(this.getBoards?.()||{}),...(this.wantedPreview?{wanted:this.wantedPreview}:{})}});return this.regions;}
 layout(){return structuredClone(this.regions);}
 traceFace(g){const pts=this.getZone()?.pts||[];g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x*this.width/100,y*this.height/100):g.moveTo(x*this.width/100,y*this.height/100));g.closePath();}
 clipOutsideFace(g){const z=this.getZone();if(!z?.enabled)return;g.beginPath();g.rect(0,0,this.width,this.height);z.pts.forEach(([x,y],i)=>i?g.lineTo(x*this.width/100,y*this.height/100):g.moveTo(x*this.width/100,y*this.height/100));g.closePath();g.clip('evenodd');}
 hitClip(r,onlyFace=false){const z=this.getZone();if(!z?.pts?.length||(!z.enabled&&!onlyFace))return'none';const hole=z.pts.map(([x,y])=>`${x*this.width/100-r.x} ${y*this.height/100-r.y}`).join('L');return`path(evenodd, "${onlyFace?'':`M0 0H${r.width}V${r.height}H0Z `}M${hole}Z")`;}
 updateHits(){
  const a=this.getState().active||{},r=this.regions;
  const active={extinguisher:a.fire,thief:a.thief,fuse:a.blackout,cat:a.cat,wipe:a.boom};
  const s=this.getState(),poster=Boolean(s.wanted?.length&&this.getSettings().sabotage?.wanted!==false);
  if(this.wantedBoard){this.wantedBoard.hidden=!poster;Object.assign(this.wantedBoard.style,{left:r.wanted.x+'px',top:r.wanted.y+'px',width:r.wanted.width+'px',height:r.wanted.height+'px'});}
  for(const[kind,b]of this.buttons){const rect=kind==='wipe'?r.face:r[kind];b.hidden=!active[kind];Object.assign(b.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px',clipPath:this.hitClip(rect,kind==='wipe')});}
 }
 invalidate(){if(this.paused||this.inTick)return;if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}if(!this.frame)this.frame=requestAnimationFrame(()=>this.tick());}
 sync(){this.computeLayout();this.updateHits();this.invalidate();}
 stop(){if(this.frame)cancelAnimationFrame(this.frame);if(this.timer!==null)clearTimeout(this.timer);this.frame=0;this.timer=null;}
 pause(){this.paused=true;this.stop();this.cancelDrag();}
 resume(){this.paused=false;this.invalidate();}
 reset(){this.stop();this.cancelDrag();this.localEffects=[];this.pointer=null;this.sync();}
 start(kind,e){
  if(this.paused||this.drag||e.button!==0)return;
  const s=this.getState(),key={extinguisher:'fire',thief:'thief',fuse:'blackout',cat:'cat',wipe:'boom'}[kind],active=s.active?.[key];if(!active)return;
  const p={x:e.clientX,y:e.clientY};if(kind!=='wipe'&&this.getZone()?.enabled&&eventPointInFace(p,this.getZone(),this.width,this.height))return;
  e.preventDefault();e.stopPropagation();
  if(kind==='thief'){this.onAction({type:'bonk',id:active.id});this.localEffects.push({kind:'bonk',p,startAt:this.now(),until:this.now()+450});this.sync();return;}
  if(kind==='wipe'&&!eventPointInFace(p,this.getZone(),this.width,this.height))return;
  this.drag={kind,id:active.id,p,start:p,last:p,distance:0,pointerId:e.pointerId};this.capture=e.currentTarget;
  try{this.capture.setPointerCapture(e.pointerId);}catch{}
  document.documentElement.dataset.eventDrag='true';this.invalidate();
 }
 move(e){
  if(this.paused)return;const p={x:e.clientX,y:e.clientY};
  if(this.getState().active?.blackout){this.pointer=p;this.invalidate();}
  const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;d.p=p;
  if(d.kind==='wipe'){
   if(eventPointInFace(p,this.getZone(),this.width,this.height)&&eventPointInFace(d.last,this.getZone(),this.width,this.height))d.distance+=Math.hypot(p.x-d.last.x,p.y-d.last.y);
   const amount=Math.floor(d.distance/(30*this.u));if(amount>0){d.distance-=amount*30*this.u;this.onAction({type:'wipe',amount,id:d.id});}
  }
  d.last=p;this.computeLayout();this.updateHits();this.invalidate();
 }
 end(e){
  const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;const p={x:e.clientX,y:e.clientY},action=eventDropAction(d.kind,d.start,p,this.regions);
  this.cancelDrag();if(action){this.onAction({...action,id:d.id});if(action.type==='extinguish')this.localEffects.push({kind:'foam',p:center(this.regions.fire),startAt:this.now(),until:this.now()+650});}
  this.sync();
 }
 cancelDrag(){const d=this.drag;this.drag=null;document.documentElement.dataset.eventDrag='false';if(d){try{this.capture?.releasePointerCapture(d.pointerId);}catch{}this.invalidate();}this.capture=null;}
 image(g,id,r){const sprite=this.bank.sprite(id,Math.max(1,r.width),Math.max(1,r.height),this.dpr);g.drawImage(sprite.image,r.x,r.y,r.width,r.height);}
 label(g,value,x,y,size=18,color=INK,maxWidth){g.font=`900 ${Math.max(7,size*this.u)}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.lineWidth=4*this.u;g.strokeStyle='#fff6e3';const args=[String(value),x,y];if(Number.isFinite(maxWidth)&&maxWidth>0)args.push(maxWidth);g.strokeText(...args);g.fillStyle=color;g.fillText(...args);}
 panel(g,r){const u=this.u;g.fillStyle='rgba(73,55,45,.22)';g.beginPath();g.roundRect(r.x+2*u,r.y+3*u,r.width,r.height,10*u);g.fill();g.fillStyle='#fff4d9';g.strokeStyle=INK;g.lineWidth=2*u;g.beginPath();g.roundRect(r.x,r.y,r.width,r.height,10*u);g.fill();g.stroke();}
 statusLabel(g,value,x,y,size=16,color=INK){const u=this.u,font=Math.max(7,size*u);g.save();g.font=`900 ${font}px ${FONT}`;const width=Math.min(this.width-16*u,g.measureText(value).width+28*u),height=Math.max(34*u,font*1.8),r={x:clamp(x-width/2,8*u,this.width-width-8*u),y:clamp(y-height/2,4*u,this.height-height-4*u),width,height};this.panel(g,r);this.label(g,value,r.x+width/2,r.y+height/2,size,color,width-18*u);g.restore();}
 named(nick,text){return(this.getSettings().display.names&&nick?nick+' · ':'')+text;}
 attachment(g,id,parent,asset,key='anchor',name){
  const m=meta[asset],a=name?m.anchors.find(p=>p.name===name):m[key],sprite=meta[id],anchor=sprite.anchor;
  if(!a)return;const scale=parent.width/m.sourceSize.width,w=sprite.sourceSize.width*scale,h=sprite.sourceSize.height*scale;
  this.image(g,id,{x:parent.x+a.x*scale-anchor.x*scale,y:parent.y+a.y*scale-anchor.y*scale,width:w,height:h});
 }
 textOnSprite(g,id,r,value,size=16){const m=meta[id],a=m?.textRect;if(!a)return;const x=r.x+(a.x+a.width/2)/m.sourceSize.width*r.width,y=r.y+(a.y+a.height/2)/m.sourceSize.height*r.height;this.label(g,value,x,y,size,INK,a.width/m.sourceSize.width*r.width*.96);}
 bannerPosition(){
  const u=this.u,w=Math.min(this.width-20*u,630*u),h=70*u,z=this.getZone();
  for(const [x,y]of [[(this.width-w)/2,30*u],[12*u,16*u],[this.width-w-12*u,16*u],[12*u,this.getCounter().y+110*u]]){const r={x,y,width:w,height:h};if(!rectIntersectsZone(r,z,this.width,this.height,4*u))return r;}
  return{x:10*u,y:10*u,width:w,height:h};
 }
 paintOrdinary(g,s,k,now){
  const a=s.active||{},r=this.regions,u=this.u,frame2=Math.floor(now/180)%2+1;
  const shaking=this.getSettings().sabotage?.shake&&(s.effects||[]).some(e=>['boom','fire','block'].includes(e.kind)&&now-e.startAt<180);
  if(shaking)g.translate(Math.sin(now*.11)*3*u,Math.cos(now*.13)*2*u);
  this.image(g,'extinguisher',this.drag?.kind==='extinguisher'?extinguisherGeometry(this.drag.p,r).rect:r.extinguisher);
  if(['noodle','pancake','tea'].includes(k?.shop)&&k?.pot?.status==='smoking'){
   for(let i=0;i<2;i++)this.image(g,`smoke_${frame2}`,{x:r.pot.x+r.pot.width*.35+i*37*u,y:r.pot.y-45*u-i*19*u,width:60*u,height:60*u});
   this.statusLabel(g,'冒烟了！点锅倒掉，不然要着火',r.pot.x+r.pot.width/2,r.pot.y-62*u,16,'#a25c41');
  }
  if(a.fire){const t=clamp((now-a.fire.startAt)/Math.max(1,a.fire.burnAt-a.fire.startAt),0,1),size=.58+.42*t,rect={x:r.fire.x+r.fire.width*(1-size)/2,y:r.fire.y+r.fire.height*(1-size),width:r.fire.width*size,height:r.fire.height*size};
   this.image(g,`flame_${a.fire.burnt?3:Math.floor(now/130)%3+1}`,rect);if(a.fire.burnt)this.statusLabel(g,'烧坏了，拖灭火器来清理',center(r.fire).x,r.fire.y-8*u,16,'#a64d36');
  }
  if(a.thief){this.image(g,r.thiefWalking?`thief_walk_${frame2}`:a.thief.hits?'thief_crowd_stunned':'thief_crowd_normal',r.thief);
   if(r.thiefWalking){const bag={x:r.thief.x+r.thief.width*.55,y:r.thief.y+r.thief.height*.58,width:70*u,height:84*u};this.image(g,'thief_sack',bag);if(this.getSettings().display.names)this.textOnSprite(g,'thief_sack',bag,a.thief.nick,11);}
   if(a.thief.hits)this.label(g,`${a.thief.hits}/3`,center(r.thief).x,r.thief.y-10*u,18,'#a54e3b');
  }
  if(a.cat){const held=this.drag?.kind==='cat',eating=Number.isFinite(a.cat.lastEatAt)&&now-a.cat.lastEatAt<450;const rect=held?{...r.cat,x:this.drag.p.x-r.cat.width*.5,y:this.drag.p.y-r.cat.height*.18}:r.cat;this.image(g,held?'cat_held':eating?'cat_eat':'cat_sit',rect);}
  if(a.blackout){this.image(g,'fuse_box',r.fuse);const boxMeta=meta.fuse_box,pivot=boxMeta.anchors.find(p=>p.name==='lever-pivot'),lever=meta.fuse_lever,scale=r.fuse.width/boxMeta.sourceSize.width;
   const w=lever.sourceSize.width*scale,h=lever.sourceSize.height*scale,x=r.fuse.x+pivot.x*scale,y=r.fuse.y+pivot.y*scale;
   g.save();g.translate(x,y);g.rotate(this.drag?.kind==='fuse'?clamp((this.drag.start.y-this.drag.p.y)/(70*u),0,1)*Math.PI:Math.PI);this.image(g,'fuse_lever',{x:-lever.anchor.x*scale,y:-lever.anchor.y*scale,width:w,height:h});g.restore();this.label(g,'往上推闸',center(r.fuse).x,r.fuse.y+r.fuse.height+12*u,16);
  }
  if(a.tour){const t=clamp((now-a.tour.startAt)/Math.max(1,a.tour.until-a.tour.startAt),0,1),shift=t<.25?(1-t/.25)*this.width*.6:t>.75?-(t-.75)/.25*this.width*.6:0,rect={...r.tour,x:r.tour.x+shift};
   this.image(g,a.tour.unloaded?'bus_door_open':'bus',rect);for(const name of ['wheel-left','wheel-right'])this.attachment(g,'bus_wheel',rect,'bus','anchor',name);
   this.textOnSprite(g,'bus',rect,this.getSettings().display.names?String(a.tour.nick).replace(/团$/,'')+'团':'旅行团',18);
  }
  if(a.spice){
   const id=this.getSettings().shop==='sushi'?'wasabi_pile':'chili_pile';this.image(g,id,{x:r.dish.x+r.dish.width*.55-30*u,y:r.dish.y-10*u,width:60*u,height:60*u});
   if(now<a.spice.until){const t=clamp((now-a.spice.startAt)/Math.max(1,a.spice.until-a.spice.startAt),0,1),rect={...r.hand,y:r.hand.y-Math.sin((1-t)*Math.PI/2)*220*u};this.image(g,'big_hand',rect);if(this.getSettings().display.names)this.textOnSprite(g,'big_hand',rect,a.spice.nick,15);}
  }
  const serving=(s.effects||[]).some(e=>e.kind==='serve'&&e.until>now),block=(s.effects||[]).some(e=>e.kind==='block'&&e.until>now);
  if(s.helper?.credits>0||serving){this.image(g,serving?'helper_serve':'helper_run_1',r.helper);this.label(g,this.named(s.helper.nick,`帮手还做 ${s.helper.credits} 件`),center(r.helper).x,r.helper.y-12*u,17);}
  if(s.guard?.credits>0||block){this.image(g,block?'guard_block':'guard_stand',r.guard);const shield={x:r.guard.x+28*u,y:r.guard.y+105*u,width:112*u,height:136*u};this.image(g,'guard_shield',shield);this.textOnSprite(g,'guard_shield',shield,`🛡×${s.guard.credits}`,22);if(this.getSettings().display.names)this.label(g,s.guard.nick,center(r.guard).x,r.guard.y-12*u,16);}
  if(s.wanted?.length&&this.getSettings().sabotage?.wanted!==false){const wanted=s.wanted[0],k=r.wanted.width/(150*u);this.image(g,'wanted_poster',r.wanted);this.image(g,'thief_crowd_normal',{x:r.wanted.x+27*u*k,y:r.wanted.y+40*u*k,width:96*u*k,height:100*u*k});this.label(g,'通缉',center(r.wanted).x,r.wanted.y+25*u*k,23*k,'#9d4d36');this.textOnSprite(g,'wanted_poster',r.wanted,this.named(wanted.nick,`卷走 ${num(wanted.amount)}`),14*k);if(s.wanted.length>1)this.label(g,`另有 ${s.wanted.length-1} 人`,center(r.wanted).x,r.wanted.y+r.wanted.height-12*u*k,13*k);}
  for(const e of this.localEffects){if(e.kind==='foam'){const frame=Math.floor((now-e.startAt)/100)%3+1;for(let i=0;i<3;i++)this.image(g,`foam_${frame}`,{x:e.p.x-80*u+i*45*u,y:e.p.y-45*u+(i%2)*20*u,width:80*u,height:70*u});}else this.image(g,'bonk_star',{x:e.p.x-45*u,y:e.p.y-45*u,width:90*u,height:90*u});}
 }
 paintBoom(g,boom){
  if(!boom)return;const r=this.regions.face,u=this.u;g.save();this.traceFace(g);g.clip();
  if(boom.shop==='sushi'){g.globalAlpha=Math.min(1,boom.remaining/5);this.image(g,'fish_slap',{x:r.x-r.width*.15,y:r.y+r.height*.2,width:r.width*1.3,height:r.height*.55});}
  else{const kind=boom.shop==='noodle'?'noodle':boom.shop==='pancake'?'batter':'tea';for(let i=0;i<boom.remaining;i++){const x=r.x+r.width*(.18+(i%3)*.3),y=r.y+r.height*(.15+Math.floor(i/3)*.29),w=Math.max(60*u,r.width*.62),h=Math.max(60*u,r.height*.4);this.image(g,i<2?`gunk_soot_${i%3+1}`:`gunk_${kind}_${i%3+1}`,{x:x-w/2,y:y-h/2,width:w,height:h});}}
  g.restore();
 }
 paintBlackout(g,blackout){
  if(!blackout)return;
  if(!this.blackoutMask){this.blackoutMask=document.createElement('canvas');this.blackoutMask.width=this.canvas.width;this.blackoutMask.height=this.canvas.height;this.blackoutContext=this.blackoutMask.getContext('2d',{alpha:true});}
  const mask=this.blackoutContext;mask.setTransform(this.dpr,0,0,this.dpr,0,0);mask.clearRect(0,0,this.width,this.height);mask.save();mask.fillStyle='rgba(8,13,21,.86)';mask.fillRect(0,0,this.width,this.height);
  mask.globalCompositeOperation='destination-out';mask.globalAlpha=.5;this.traceFace(mask);mask.fill();mask.globalAlpha=1;
  const p=this.pointer||center(this.regions.pot),radius=175*this.u,gradient=mask.createRadialGradient(p.x,p.y,35*this.u,p.x,p.y,radius);gradient.addColorStop(0,'rgba(0,0,0,1)');gradient.addColorStop(.68,'rgba(0,0,0,.95)');gradient.addColorStop(1,'rgba(0,0,0,0)');mask.fillStyle=gradient;mask.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);mask.restore();
  g.drawImage(this.blackoutMask,0,0,this.width,this.height);
 }
 paintFeedback(g,s,now){
  const e=(s.effects||[]).filter(f=>f.until>now).at(-1);if(!e)return;const p=this.bannerPosition(),u=this.u,t=clamp((now-e.startAt)/Math.max(1,e.until-e.startAt),0,1);
  g.save();this.clipOutsideFace(g);g.globalAlpha=t>.78?(1-t)/.22:1;
  if(e.kind==='boom')this.image(g,`explosion_${Math.floor(now/130)%2+1}`,{x:p.x+p.width/2-140*u,y:p.y-60*u,width:280*u,height:230*u});
  if(e.kind==='bonk')this.image(g,'bonk_star',{x:p.x+p.width/2-55*u,y:p.y-15*u,width:110*u,height:110*u});
  this.panel(g,p);this.label(g,this.named(e.nick,e.text),p.x+p.width/2,p.y+p.height/2,30,['burnt','stolen'].includes(e.kind)?'#a54d3c':'#775b3b',p.width-28*u);g.restore();
 }
 tick(){
  this.frame=0;if(this.paused)return;this.inTick=true;const started=performance.now();let now=this.now();this.onTick(now);now=this.now();
  const state=this.getState(),kitchen=this.getKitchen();this.localEffects=this.localEffects.filter(e=>e.until>now);this.computeLayout();this.updateHits();
  this.canvas.style.zIndex=state.active?.blackout?'18':'12';const g=this.g;g.setTransform(this.dpr,0,0,this.dpr,0,0);g.clearRect(0,0,this.width,this.height);
  g.save();this.clipOutsideFace(g);this.paintOrdinary(g,state,kitchen,now);g.restore();this.paintBoom(g,state.active?.boom);this.paintBlackout(g,state.active?.blackout);this.paintFeedback(g,state,now);
  this.renderCount++;if(this.collect){this.samples.push(performance.now()-started);if(this.samples.length>1200)this.samples.shift();}this.inTick=false;
  if(eventNeedsAnimation(state,kitchen,now,this.localEffects)||this.hasPendingWork?.()){this.frame=requestAnimationFrame(()=>this.tick());return;}
  let next=null;const wake=value=>{if(Number.isFinite(value)&&value>now&&(next===null||value<next))next=value;};
  if(this.drag?.kind!=='cat')wake(state.active?.cat?.nextEatAt);wake(state.active?.blackout?.until);if(state.helper?.credits>0)wake(state.helper.nextAt);
  if(next!==null)this.timer=setTimeout(()=>{this.timer=null;this.invalidate();},Math.min(2147483647,Math.max(1,next-this.now())));
 }
 snapshot(){const tool=this.drag?.kind==='extinguisher'?extinguisherGeometry(this.drag.p,this.regions):null;return{renderCount:this.renderCount,scheduled:Boolean(this.frame),timerScheduled:this.timer!==null,drag:this.drag?{kind:this.drag.kind,id:this.drag.id,p:{...this.drag.p},...(tool?{workingEnd:{...tool.workingEnd},toolRect:{...tool.rect},angle:tool.angle}:{})}:null,regions:structuredClone(this.regions)};}
 perf({reset=false,collect}={}){if(reset)this.samples=[];if(collect!==undefined)this.collect=Boolean(collect);else if(reset)this.collect=true;const values=[...this.samples].sort((a,b)=>a-b),n=values.length;return{frames:n,mean:n?values.reduce((a,b)=>a+b,0)/n:0,p95:n?values[Math.floor((n-1)*.95)]:0,max:n?values.at(-1):0,samplesMs:[...this.samples],renderCount:this.renderCount};}
 async settle(){const end=performance.now()+2800;while(this.frame&&performance.now()<end)await new Promise(r=>setTimeout(r,30));return this.snapshot();}
}
