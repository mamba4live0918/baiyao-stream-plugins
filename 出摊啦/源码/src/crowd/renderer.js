import { layoutCrowd, rectIntersectsZone } from './layout.js';
import { evaluateCrowd, moodAt } from './behavior.js';
import { createAssetBank } from './assets.js';
import { applyCrowdVariation } from './variation.js';
import { nextAbandonmentAt } from './departures.js';

const FONT='"Microsoft YaHei",sans-serif';
const INK='#49372d';
const ease=t=>1-(1-t)**3;
const clamp=t=>Math.min(1,Math.max(0,t));
const DEPARTURE_MS=1200,DEPARTURE_STOMP_MS=320;
const roundRect=(g,x,y,w,h,r,fill)=>{g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();};
export function counterRect(width,height){const unit=Math.min(width,height)/1080,w=Math.min(width,Math.min(width,height)*2.2);return{x:(width-w)/2,y:height-210*unit,width:w,height:210*unit};}

// One finite RAF chain and one next-event timer. A quiet scene has neither RAF
// polling nor repeated canvas painting; future mood/footstep events wake it up.
export class CrowdScene {
 constructor(canvas,{getOrders,getSettings,getZone,onChange=()=>{},onTime=()=>{}}){
  this.canvas=canvas;this.g=canvas.getContext('2d',{alpha:true});
  this.getOrders=getOrders;this.getSettings=getSettings;this.getZone=getZone;this.onChange=onChange;this.onTime=onTime;
  this.clockOffset=0;this.pausedAt=null;this.frame=0;this.timer=null;this.destroyed=false;
  this.width=0;this.height=0;this.dpr=1;this.renderCount=0;this.layoutDirty=true;
  this.views=[];this.byKey=new Map();this.departures=[];this.inTick=false;this.layoutResult={slots:[],capacity:0,outside:0,compressed:false};
  this.backStamp='';this.backLayer=null;this.backBuilds=0;this.lastBehavior=null;
  this.phase='startup';this.samples=[];this.frameTimes=[];this.collect=false;this.summaryStamp='';
  this.ready=createAssetBank().then(bank=>{this.bank=bank;this.resize();return this;});
 }
 now(){return this.pausedAt??Date.now()+this.clockOffset;}
 advance(ms){if(!Number.isFinite(ms)||ms<0)return;this.clockOffset+=ms;if(this.pausedAt!==null)this.pausedAt+=ms;this.invalidate();}
 resize(){
  if(!this.bank)return;
  const W=innerWidth,H=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(this.width!==W||this.height!==H||this.dpr!==dpr){
   this.width=W;this.height=H;this.dpr=dpr;this.canvas.width=Math.round(W*dpr);this.canvas.height=Math.round(H*dpr);
   this.bank.clearRasterCache();this.backLayer=null;this.backStamp='';
  }
  document.documentElement.style.setProperty('--u',Math.min(W,H)/1080);
  this.sync();
 }
 sync(){this.layoutDirty=true;this.invalidate();}
 invalidate(){
  if(this.destroyed||!this.bank||this.pausedAt!==null)return;
  if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
  if(!this.frame&&!this.inTick)this.frame=requestAnimationFrame(()=>this.tick());
 }
 pause(){if(this.pausedAt!==null)return;this.pausedAt=this.now();this.realPauseAt=Date.now();this.stopScheduling();}
 resume(){if(this.pausedAt===null)return;this.clockOffset-=Date.now()-this.realPauseAt;this.pausedAt=null;this.invalidate();}
 stopScheduling(){cancelAnimationFrame(this.frame);this.frame=0;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
 destroy(){this.destroyed=true;this.stopScheduling();}
 clearDepartures(){this.departures=[];this.invalidate();}
 // Capture before relayout so a batch can remove every order without losing the
 // visible customers' last safe positions. Outside orders have no actor to draw.
 announceDepartures(orders,message='哼！不吃了'){
  const now=this.now(),seen=new Set(this.departures.map(effect=>effect.view.key));let added=0;
  for(const order of orders){
   const old=this.byKey.get(order.key);if(!old||seen.has(order.key))continue;
   const p=this.position(old,now),target={...old.target,x:p.x,y:p.y};
   this.departures.push({since:now,until:now+DEPARTURE_MS,message,view:{...old,order,target,from:{x:p.x,y:p.y},since:now,duration:DEPARTURE_MS,entering:false,teleport:false,opacity:p.opacity??(old.entering?p.t:1)}});
   seen.add(order.key);added++;
  }
  this.sync();return added;
 }
 updateLayout(now){
  const previous=this.byKey,orders=this.getOrders(),rect=counterRect(this.width,this.height);
  this.layoutResult=layoutCrowd({width:this.width,height:this.height,zone:this.getZone(),count:orders.length,counterTop:rect.y,compress:this.getSettings().crowd?.compress!==false});
  this.views=this.layoutResult.slots.map((baseSlot,index)=>{
   const slot=applyCrowdVariation(baseSlot,orders[index].crowdOffset,{width:this.width,height:this.height,zone:this.getZone(),counterTop:rect.y});
   const order=orders[index],old=previous.get(order.key);
   const same=old&&Math.abs(old.target.x-slot.x)<.1&&Math.abs(old.target.y-slot.y)<.1&&Math.abs(old.target.scale-slot.scale)<.001;
   if(same)return{...old,order,target:{...slot,key:order.key}};
   const from=old?this.position(old,now):{x:slot.x,y:slot.y-18*Math.min(this.width,this.height)/1080*slot.scale};
   const teleport=Boolean(old&&(old.target.row!==slot.row||Array.from({length:9},(_,i)=>i/8).some(t=>rectIntersectsZone({x:from.x+(slot.x-from.x)*t,y:from.y+(slot.y-from.y)*t,width:slot.width,height:slot.height},this.getZone(),this.width,this.height))));
   return {key:order.key,order,target:{...slot,key:order.key},from,since:now,duration:old?430:520,entering:!old,teleport};
  });
  this.byKey=new Map(this.views.map(view=>[view.key,view]));this.layoutDirty=false;this.backStamp='';
 }
 position(view,now){const t=clamp((now-view.since)/view.duration),e=ease(t);if(view.teleport)return{x:t<.5?view.from.x:view.target.x,y:t<.5?view.from.y:view.target.y,t,opacity:Math.abs(t*2-1)};return{x:view.from.x+(view.target.x-view.from.x)*e,y:view.from.y+(view.target.y-view.from.y)*e,t};}
 tick(){
  this.frame=0;if(this.destroyed||this.pausedAt!==null||!this.bank)return;
  this.inTick=true;
  const start=performance.now();
  // The owner may rewind this clock after a sleeping host, then remove all due
  // orders. Re-read time before evaluating either layout or another deadline.
  this.onTime(this.now());const now=this.now();
  if(this.destroyed||this.pausedAt!==null){this.inTick=false;return;}
  this.departures=this.departures.filter(effect=>effect.until>now);
  if(this.layoutDirty)this.updateLayout(now);
  const slots=this.views.map(v=>v.target),behavior=evaluateCrowd(this.getOrders(),slots,now,{names:this.getSettings().display.names,thresholds:this.getSettings().crowd?.moodSeconds});
  this.lastBehavior=behavior;
  const byBehavior=new Map(behavior.actors.map(a=>[a.key,a]));
  const dynamic=[],staticBack=[];
  let moving=false,animationEnd=null;
  for(const v of this.views){const a=byBehavior.get(v.key),p=this.position(v,now);v.current=p;v.behavior=a;
   if(p.t<1){moving=true;animationEnd=Math.max(animationEnd||0,v.since+v.duration);}
   const animate=p.t<1||a.jump>0||a.callout;
   if(v.target.row>=2&&!animate&&this.views.length>=100)staticBack.push(v);else dynamic.push(v);
  }
  if(moving||behavior.active){staticBack.length=0;dynamic.length=0;dynamic.push(...this.views);}
  const g=this.g,dpr=this.dpr,W=this.width,H=this.height;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  g.save();this.clipFace(g);
  if(staticBack.length){
   const stamp=staticBack.map(v=>`${v.key}:${v.behavior.mood}:${+v.behavior.showName}:${v.order.urgeSerial}`).join('|');
   if(this.backStamp!==stamp||!this.backLayer){
    if(!this.backLayer){this.backLayer=document.createElement('canvas');this.backLayer.width=this.canvas.width;this.backLayer.height=this.canvas.height;}
    const bg=this.backLayer.getContext('2d');bg.setTransform(dpr,0,0,dpr,0,0);bg.clearRect(0,0,W,H);
    for(let i=staticBack.length-1;i>=0;i--)this.paintActor(bg,staticBack[i],now);
    this.backStamp=stamp;this.backBuilds++;
   }
   g.drawImage(this.backLayer,0,0,W,H);
  }
  // Queue order is front-first. Reverse drawing keeps front rows over rear rows.
  for(let i=dynamic.length-1;i>=0;i--)this.paintActor(g,dynamic[i],now);
  for(let i=this.departures.length-1;i>=0;i--)this.paintDeparture(g,this.departures[i],now);
  if(behavior.chant)this.paintChant(g,behavior.chant);
  g.restore();
  const layer=this.bank.counterLayer({width:W,height:H,shop:this.getSettings().shop,dpr,rect:counterRect(W,H)});
  if(this.proofRequested&&!moving&&!behavior.active&&!this.departures.length){this.captureCounterProof(layer);this.proofRequested=false;}
  g.drawImage(layer.image,0,0,W,H); // Always the final canvas layer.
  this.counterLayer=layer;
  this.renderCount++;
  const summaryStamp=`${this.getOrders().length}:${this.views.length}:${behavior.summary.angryCount}:${behavior.chant}:${this.layoutResult.compressed}`;
  if(this.summaryStamp!==summaryStamp){this.summaryStamp=summaryStamp;this.onChange(this.snapshot());}
  if(moving||behavior.active||this.departures.length||this.layoutDirty)this.frame=requestAnimationFrame(()=>this.tick());
  else {
   const abandonment=nextAbandonmentAt(this.getOrders(),this.getSettings(),now),next=behavior.nextWake===null?abandonment:abandonment===null?behavior.nextWake:Math.min(behavior.nextWake,abandonment);
   if(next!==null)this.timer=setTimeout(()=>{this.timer=null;this.invalidate();},Math.min(2147483647,Math.max(1,next-this.now())));
  }
  this.inTick=false;
  this.animationEnd=animationEnd;
  if(this.collect){this.samples.push(performance.now()-start);this.frameTimes.push(performance.now());if(this.samples.length>2000){this.samples.shift();this.frameTimes.shift();}}
 }
 captureCounterProof(layer){
  const candidates=layer.proofCandidates.filter(p=>this.views.some(v=>v.target.front&&p.x>=v.target.x&&p.x<=v.target.x+v.target.width&&p.y>=v.target.y&&p.y<=v.target.y+v.target.height));
  if(!candidates.length){this.counterProbes=[];return;}
  const pixels=candidates.map(p=>({p,x:Math.round(p.x*this.dpr),y:Math.round(p.y*this.dpr)}));
  const left=Math.min(...pixels.map(p=>p.x)),top=Math.min(...pixels.map(p=>p.y)),right=Math.max(...pixels.map(p=>p.x)),bottom=Math.max(...pixels.map(p=>p.y));
  const width=right-left+1,under=this.g.getImageData(left,top,width,bottom-top+1).data;
  this.counterProbes=pixels.map(({p,x,y})=>{
   const i=((y-top)*width+x-left)*4,dst=[...under.subarray(i,i+4)],src=p.expected,sa=src[3]/255,da=dst[3]/255,alpha=sa+da*(1-sa);
   const expected=src.slice(0,3).map((c,k)=>Math.round((c*sa+dst[k]*da*(1-sa))/alpha));expected.push(Math.round(alpha*255));
   return{x:p.x,y:p.y,expected,counter:src,under:dst};
  }).sort((a,b)=>b.under[3]-a.under[3]).slice(0,8);
 }
 async requestCounterProof(){this.proofRequested=true;this.invalidate();await this.settle();return this.rendererState().counterProof;}
 clipFace(g){const zone=this.getZone();if(!zone?.enabled)return;g.beginPath();g.rect(0,0,this.width,this.height);zone.pts.forEach(([x,y],i)=>{const px=x*this.width/100,py=y*this.height/100;i?g.lineTo(px,py):g.moveTo(px,py);});g.closePath();g.clip('evenodd');}
 paintDeparture(g,effect,now){
  const age=Math.max(0,now-effect.since),view=effect.view;
  const opacity=clamp(1-(age-DEPARTURE_STOMP_MS)/(DEPARTURE_MS-DEPARTURE_STOMP_MS));
  const jump=age<DEPARTURE_STOMP_MS?Math.sin(Math.PI*age/DEPARTURE_STOMP_MS):0;
  view.behavior={mood:'angry',showName:this.getSettings().display.names,showBubble:true,jump,steam:false,callout:effect.message};
  view.current={x:view.target.x,y:view.target.y,t:1,opacity:opacity*view.opacity};
  this.paintActor(g,view,now);
 }
 paintActor(g,view,now){
  const slot=view.target,a=view.behavior;if(!a)return;
  const u=Math.min(this.width,this.height)/1080,s=slot.scale,p=view.current||this.position(view,now);
  let x=p.x,y=p.y-a.jump*18*u*s;
  // If a refill's straight path crosses the face, fade at the safe target instead.
  const unsafe=rectIntersectsZone({x,y,width:slot.width,height:slot.height},this.getZone(),this.width,this.height);
  let alpha=p.opacity??(view.entering?p.t:1);
  if(unsafe){x=slot.x;y=slot.y-a.jump*18*u*s;alpha*=p.t;}
  g.save();g.globalAlpha=alpha;
  const variant=view.order.appearance||1+(Number(view.key.split(':').at(-1))-1)%16;
  const sprite=this.bank.sprite(`customer_${String(variant).padStart(2,'0')}_${a.mood}`,slot.width,slot.height,this.dpr);
  g.drawImage(sprite.image,x,y,sprite.width,sprite.height);
  if(a.showName)this.paintName(g,view.order.nick,x+slot.width/2,y+slot.height*.76,s);
  if(a.showBubble)this.paintBubble(g,view.order,x+slot.width/2,y-35*u*s,s,a.callout);
  if(a.steam){const steam=this.bank.sprite('customer_steam',50*u*s,40*u*s,this.dpr);g.drawImage(steam.image,x+(slot.width-steam.width)/2,y-steam.height*.66-(a.showBubble?40*u*s:0),steam.width,steam.height);}
  if(a.callout&&!a.showBubble){g.font=`900 ${Math.max(7,18*u*s)}px ${FONT}`;g.textAlign='center';g.textBaseline='bottom';g.lineWidth=4*u*s;g.strokeStyle='#fff8e8';g.strokeText(a.callout,x+slot.width/2,y-3*u*s);g.fillStyle=INK;g.fillText(a.callout,x+slot.width/2,y-3*u*s);}
  g.restore();
 }
 paintName(g,name,cx,y,s){const u=Math.min(this.width,this.height)/1080,w=70*u*s,h=24*u*s;
  const tag=this.bank.sprite('badge',w,h,this.dpr);g.drawImage(tag.image,cx-tag.width/2,y,tag.width,tag.height);
  g.font=`700 ${Math.max(5,11*u*s)}px ${FONT}`;g.fillStyle=INK;g.textAlign='center';g.textBaseline='middle';
  let text=name;while(text.length>1&&g.measureText(text).width>w*.82)text=text.slice(0,-1);if(text!==name)text=text.slice(0,-1)+'…';g.fillText(text,cx,y+h*.52);
 }
 paintBubble(g,order,cx,y,s,callout=null){const u=Math.min(this.width,this.height)/1080,w=90*u*s,h=50*u*s;
  const bubble=this.bank.sprite('bubble',w,h,this.dpr);g.drawImage(bubble.image,cx-w/2,y,w,h);
  const units={noodle:['🍜','两',1,3],pancake:['🥚','个',1,2],tea:['⚫','勺',1,3],sushi:['🍣','片',3,5]};
  const [icon,unit,min,max]=units[this.getSettings().shop],n=order.quantities?.[this.getSettings().shop]??min;
  g.font=`900 ${Math.max(7,(callout?Math.min(16,74/Array.from(callout).length):16)*u*s)}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillStyle=INK;g.fillText(callout||`${icon} ${n}${unit}`,cx,y+h*.43);
 }
 paintChant(g,text){const u=Math.min(this.width,this.height)/1080,x=this.width/2,y=55*u,font=Math.max(18,44*u);
  g.font=`900 ${font}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.lineWidth=8*u;g.strokeStyle='#fff4d8';g.strokeText(text,x,y);g.fillStyle='#b34b37';g.fillText(text,x,y);
 }
 snapshot(){
  const now=this.now(),orders=this.getOrders(),thresholds=this.getSettings().crowd?.moodSeconds,behavior=this.lastBehavior||evaluateCrowd(orders,this.views.map(v=>v.target),now,{names:this.getSettings().display.names,thresholds});
  const byBehavior=new Map(behavior.actors.map(a=>[a.key,a])),moodCounts={happy:0,neutral:0,impatient:0,angry:0};for(const order of orders)moodCounts[moodAt(Math.max(0,now-order.receivedAt),thresholds)]++;
  const currentKeys=new Set(orders.map(order=>order.key)),currentViews=this.views.filter(view=>currentKeys.has(view.key));
  const actors=currentViews.map(v=>{const a=byBehavior.get(v.key)||{};return{...v.target,uid:v.order.uid,key:v.key,nick:v.order.nick,appearance:v.order.appearance,quantities:v.order.quantities,crowdOffset:v.order.crowdOffset,mood:a.mood,urges:v.order.urges,nameVisible:a.showName,bubbleVisible:a.showBubble,jump:a.jump||0,steam:a.steam,callout:a.callout,position:this.position(v,now)};});
  return {visibleCount:actors.length,outsideCount:Math.max(0,orders.length-actors.length),compressed:this.layoutResult.compressed,capacity:this.layoutResult.capacity,moodCounts,chant:behavior.chant,actors,cache:this.bank?.stats(),backLayerBuilds:this.backBuilds,backLayerActors:currentViews.filter(v=>v.target.row>=2).length};
 }
 hitCustomer(x,y){
  const now=this.now(),u=Math.min(this.width,this.height)/1080;
  if(y>=counterRect(this.width,this.height).y+4*u||rectIntersectsZone({x,y,width:.1,height:.1},this.getZone(),this.width,this.height))return null;
  const keys=new Set(this.getOrders().map(o=>o.key));
  for(const v of this.views){if(!keys.has(v.key))continue;const p=this.position(v,now);if((p.opacity??(v.entering?p.t:1))<.2)continue;
   const top=p.y-(v.behavior?.jump||0)*18*u*v.target.scale;
   if(x>=p.x&&x<=p.x+v.target.width&&y>=top&&y<=top+v.target.height)return{key:v.key,order:v.order,x:p.x,y:top,width:v.target.width,height:v.target.height};
  }
  return null;
 }
 layout(){const zone=this.getZone();return{...this.layoutResult,slots:this.views.map(v=>v.target),facePointsPx:zone?.enabled?zone.pts.map(([x,y])=>[x*this.width/100,y*this.height/100]):[],counter:counterRect(this.width,this.height)};}
 rendererState(){return{dpr:this.dpr,counterLayerLast:true,drawOrder:['background','actors','counter'],counterProof:{drawOrder:['background','actors','counter'],composition:'source-over',probes:this.counterProbes||[]},cache:this.bank?.stats(),backLayerBuilds:this.backBuilds};}
 perf(options={}){if(options.reset){this.samples=[];this.frameTimes=[];this.phase=options.phase||'render';this.collect=true;}
  const values=[...this.samples].sort((a,b)=>a-b),n=values.length;return{phase:this.phase,clock:'performance.now',source:'requestAnimationFrame',scheduling:'requestAnimationFrame while active; next-event timeout while still',samplesMs:[...this.samples],rafTimestamps:[...this.frameTimes],frames:n,frameCount:n,mean:n?values.reduce((a,b)=>a+b,0)/n:0,p50:n?values[Math.floor((n-1)*.5)]:0,p95:n?values[Math.floor((n-1)*.95)]:0,max:n?values[n-1]:0,renderCount:this.renderCount,cache:this.bank?.stats(),backLayerBuilds:this.backBuilds};
 }
 async settle(){await this.ready;const end=performance.now()+2500;do{await new Promise(r=>setTimeout(r,35));}while(this.frame&&performance.now()<end);return this.snapshot();}
}
