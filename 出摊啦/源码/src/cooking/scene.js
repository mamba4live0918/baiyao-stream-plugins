import meta from '../../assets/tool-meta.mjs';
import shopMeta from '../../assets/shops-meta.mjs';
import {kitchenDishCount,kitchenHasDish} from './kitchen.js';
import {createGesture,moveGesture,gestureResult} from './gestures.js';
import { rectIntersectsZone } from '../crowd/layout.js';
import {cookingToolGeometry,workingEndTouchesRect} from './tool-geometry.js';

const FONT='"Microsoft YaHei",sans-serif',INK='#49372d';
const inside=(p,r)=>r&&p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const number=n=>Number(Number(n).toFixed(2)).toLocaleString('zh-CN',{maximumFractionDigits:2});
const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
const ease=t=>1-(1-clamp(t,0,1))**3;

// Tools and short feedback have their own transparent layer. The crowd remains
// cached while somebody cooks. Quiet tools have no animation-frame loop.
export class CookingScene{
 constructor(canvas,options){
  Object.assign(this,options);this.canvas=canvas;this.g=canvas.getContext('2d',{alpha:true});
  this.frame=0;this.timer=null;this.renderCount=0;this.effects=[];this.drag=null;this.hover=null;this.hintsVisible=false;
  this.paused=document.hidden;this.inTick=false;this.dirty=false;this.buttons=new Map();
  this.hitLayer=document.createElement('div');this.hitLayer.id='kitchen-hits';document.body.append(this.hitLayer);
  for(const id of ['source','pot','strainer','knife','stock','griddle','egg','spatula','pearls','shaker','dish','trash']){
   const b=document.createElement('button');b.type='button';b.className='kitchen-hit';b.dataset.kitchenHit=id;
   b.addEventListener('pointerdown',e=>this.start(id,e));
   if(id==='source')b.addEventListener('click',()=>this.load());
   if(id==='trash')b.addEventListener('click',()=>this.discard());
   if(id==='egg')b.addEventListener('click',()=>this.clickIngredient('addEgg'));
   if(id==='pearls')b.addEventListener('click',()=>this.clickIngredient('addPearls'));
   this.hitLayer.append(b);this.buttons.set(id,b);
  }
  document.addEventListener('pointermove',e=>this.move(e),{passive:true});
  document.addEventListener('pointerup',e=>this.end(e));
  document.addEventListener('pointercancel',()=>this.cancelDrag());
  addEventListener('blur',()=>{this.cancelDrag();this.hideHints();});
  document.documentElement.addEventListener('pointerleave',()=>this.hideHints());
  this.resize();
 }
 now(){return this.clock();}
 resize(){
  this.cancelDrag();this.width=innerWidth;this.height=innerHeight;this.dpr=Math.min(devicePixelRatio||1,2);
  this.u=Math.min(this.width,this.height)/1080;this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
  this.regions=this.computeLayout();this.updateButtons();this.invalidate();
 }
 computeLayout(){
  const c=this.getCounter(),u=this.u,W=c.width;
  const box=(fraction,w,h,bottom=c.y+65*u)=>({x:c.x+W*fraction-w*u/2,y:bottom-h*u,width:w*u,height:h*u});
  const shop=this.getSettings().shop,sushi=shop==='sushi';
  const jar=box(.94,125,134,c.y+68*u);jar.x=clamp(jar.x,c.x+4*u,c.x+c.width-jar.width-4*u);
  const regions={unit:u,counter:c,
   source:box(sushi?.12:.15,100,sushi?90:100),
   pot:box(.40,220,140,c.y+62*u),
   stove:box(.40,240,90,c.y+77*u),
   strainer:box(.53,110,70,c.y+60*u),
   board:box(.42,330,60,c.y+62*u),
   block:box(.42,330,90,c.y+23*u),
   knife:box(.45,170,50,c.y-34*u),
   stock:box(.42,320,42,c.y+56*u),
   dish:box(.68,sushi?180:110,sushi?60:85,c.y+67*u),
   trash:box(.82,64,80,c.y+70*u),jar};
  if(shop==='pancake'){
   regions.source=box(.10,90,100);regions.egg=box(.24,90,90);
   // Keep the front customer's head above the complete tool hitbox in portrait.
   regions.griddle=box(.45,280,170,c.y+90*u);regions.pot=regions.griddle;
   regions.spatula=box(.58,160,65,c.y+80*u);regions.dish=box(.70,90,110,c.y+67*u);
  }else if(shop==='tea'){
   regions.pearls=box(.12,90,120);regions.source=regions.pearls;
   regions.pot=box(.33,140,90,c.y+60*u);regions.stove=box(.33,155,57,c.y+74*u);
   regions.shaker=box(.52,105,130);regions.dish=box(.70,110,170,c.y+67*u);regions.cup=regions.dish;
  }
  return regions;
 }
 layout(){return structuredClone(this.regions);}
 updateButtons(){
  const k=this.getKitchen(),shop=k?.shop,labels={source:shop==='sushi'?'鱼箱：上一块鱼':shop==='pancake'?'面糊桶：下一份面糊':'面饼箱：下一两面',pot:'汤锅：拖到碗里捞一两面',knife:'刺身刀：按住向下划一刀',stock:'鱼片：拖到盘里装一片',griddle:'鏊子：按住画圈摊开，冒烟时点一下倒掉',egg:'蛋筐：一下加一个蛋',spatula:'铲子：等绿圈，拖到饼或纸袋里',pearls:'珍珠罐：一下加一勺',shaker:'雪克杯：左右摇好，再拖到杯子里',dish:({noodle:'碗',sushi:'盘子',pancake:'煎饼袋',tea:'奶茶杯'})[shop]+'：拖给顾客',trash:'垃圾桶：倒掉成品，空容器时清工作台'};
  labels.strainer='漏勺：拖网兜碰到碗里，捞一两面';
  if(shop==='tea'){labels.pot='小锅：熟了拖到杯子里，一下捞一勺；冒烟时点一下倒掉';labels.pearls='珍珠罐：一下一勺下进小锅';}
  const visible={noodle:['source','pot','strainer','dish','trash'],sushi:['source','knife','stock','dish','trash'],pancake:['source','griddle','egg','spatula','dish','trash'],tea:['pearls','pot','shaker','dish','trash']}[shop]||[];
  for(const[id,b]of this.buttons){const r=this.regions[id],show=k&&visible.includes(id);if(!r){b.hidden=true;continue;}
   b.hidden=!show;b.setAttribute('aria-label',labels[id]);
   b.dataset.draggable=String(!['source','egg','pearls','trash'].includes(id));
   Object.assign(b.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
  }
 }
 invalidate(){
  this.dirty=true;if(this.paused)return;
  if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
  if(!this.frame&&!this.inTick)this.frame=requestAnimationFrame(()=>this.tick());
 }
 sync(){this.updateButtons();this.invalidate();}
 stop(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
 pause(){this.paused=true;this.stop();this.cancelDrag();this.hideHints();}
 resume(){this.paused=false;this.invalidate();}
 reset(){this.cancelDrag();this.effects=[];this.hover=null;this.regions=this.computeLayout();this.sync();}
 act(action){const changed=this.onAction(action);if(changed)this.invalidate();return changed;}
 load(){
  if(this.drag||!this.getKitchen())return;
  const shop=this.getKitchen().shop;
  if(this.act({type:shop==='pancake'?'loadBatter':shop==='tea'?'addPearls':'load'}))this.effects.push({kind:'load',shop,start:this.now(),until:this.now()+400});
  else if(this.getKitchen().pending)this.notify('这份菜正在端给顾客');
  else this.notify(this.getKitchen().stoveLocked||this.getKitchen().pot.status==='fire'?'先拖灭火器到着火处，再重新做':shop==='sushi'?'案板上还有鱼，先切完':shop==='pancake'?'先端走袋里的饼，或倒掉旧面糊再做':'锅里正在冒烟，点锅清空重做');
  this.invalidate();
 }
 clickIngredient(type){
  const k=this.getKitchen();if(!k||this.drag)return;
  if(this.act({type})){if(type==='addPearls')this.effects.push({kind:'load',shop:'tea',start:this.now(),until:this.now()+400});return;}
  this.notify(k.pending?'这份菜正在端给顾客':k.stoveLocked||k.pot.status==='fire'?'先灭火再继续':type==='addEgg'?'先下面糊并画圈摊开，袋里有饼时先端走':'小锅满了，先把熟珍珠捞出来');
 }
 dishCount(){const k=this.getKitchen();return k?kitchenDishCount(k):0;}
 hasDish(){const k=this.getKitchen();return k?kitchenHasDish(k):false;}
 discard(){
  const k=this.getKitchen();if(!k||this.drag)return;
  if(k.pending){this.notify('这份菜正在端给顾客');return;}
  const teaCup=k.shop==='tea'&&(k.tea.hadPearls||k.tea.pearls||k.tea.shaken);
  const type=this.hasDish()?'clearDish':k.shop==='noodle'||(k.shop==='tea'&&!teaCup)?'clearPot':k.shop==='sushi'?'clearBoard':'clearWork';
  if(this.act({type}))this.notify(type==='clearDish'?'已倒掉，重新装一份':'工作台已清空');
 }
 start(id,e){
  if(!this.getKitchen()||e.button!==0||this.drag||['source','egg','pearls','trash'].includes(id))return;
  const k=this.getKitchen();if(k.pending){this.notify('这份菜正在端给顾客');return;}
  if(id!=='dish'&&(k.stoveLocked||k.pot.status==='fire')){this.notify('先拖灭火器到火上');return;}
  if(id==='griddle'){
   if(k.pot.status==='smoking'){this.act({type:'clearWork'});return;}
   if(!k.pancake.loaded){this.notify('先点面糊桶下面糊');return;}
   if(k.pancake.spread){this.notify(k.pot.status==='ready'?'绿圈好了，用铲子装袋':'点蛋筐加蛋，等绿圈后用铲子装袋');return;}
  }
  if(id==='spatula'&&(!k.pancake.hadEgg||k.pot.status!=='ready')){this.notify('先摊开加蛋，等绿圈再铲');return;}
  if(id==='shaker'&&(!k.tea.hadPearls||k.tea.sealed)){this.notify(k.tea.sealed?'这杯封好了，先端给顾客':'先从小锅捞珍珠到杯里');return;}
  const food=k.shop==='tea'?'珍珠':'面';
  if(['pot','strainer'].includes(id)&&k.pot.status==='smoking'){this.act({type:'clearPot'});this.notify(`已倒掉冒烟的${food}，重新下锅`);return;}
  if(['pot','strainer'].includes(id)&&k.pot.status==='burnt'){this.act({type:'clearPot'});this.notify(`锅已清空，可以重新下${food}`);return;}
  if(['pot','strainer'].includes(id)&&k.pot.status!=='ready'){this.notify(k.pot.amount?`等绿圈再捞${food}`:k.shop==='tea'?'先点珍珠罐下珍珠':'先点面饼箱下面');return;}
  if(id==='knife'&&!k.block){this.notify('先点鱼箱上一块鱼');return;}
  if(id==='stock'&&!k.slices.length){this.notify('先按住刀向下划，切出鱼片');return;}
  if(id==='dish'&&!this.hasDish()){this.notify(({noodle:'先从锅拖到碗里捞面',sushi:'先把鱼片拖到盘里',pancake:'等绿圈，用铲子装袋',tea:'先左右摇茶，再拖到杯子里封口'})[k.shop]);return;}
  e.preventDefault();const p={x:e.clientX,y:e.clientY},r=this.regions[id];
  const kind={pot:k.shop==='tea'?'scoopTea':'scoop',strainer:'scoop',knife:'knife',stock:'slice',dish:'serve',griddle:'spread',spatula:'lift',shaker:k.tea?.shaken?'pour':'shake'}[id];
  this.drag={kind,pointerId:e.pointerId,start:p,p,offset:{x:p.x-r.x,y:p.y-r.y},broken:k.slices?.[0]?.broken||false,...(['spread','shake'].includes(kind)?{gesture:createGesture(kind,p,{unit:this.u,center:center(r)})}:{})};
  this.captureNode=e.currentTarget;try{this.captureNode.setPointerCapture(e.pointerId);}catch{}
  document.documentElement.dataset.cookingDrag='true';this.invalidate();
 }
 hasServingMotion(d,p){return Math.hypot(p.x-d.start.x,p.y-d.start.y)>=12*this.u;}
 servingTarget(d,p){return this.hasServingMotion(d,p)&&!inside(p,this.regions.trash)?this.findCustomer(p.x,p.y):null;}
 hideHints(){if(this.hintsVisible){this.hintsVisible=false;this.invalidate();}}
 pointerHints(e){
  const c=this.regions.counter,visible=inside({x:e.clientX,y:e.clientY},{...c,y:c.y-120*this.u,height:c.height+120*this.u});
  if(this.hintsVisible!==visible){this.hintsVisible=visible;this.invalidate();}
 }
 move(e){
  this.pointerHints(e);
  if(!this.drag||this.drag.pointerId!==e.pointerId)return;
  this.drag.p={x:e.clientX,y:e.clientY};
  if(this.drag.gesture)this.drag.gesture=moveGesture(this.drag.gesture,this.drag.p);
  this.hover=this.drag.kind==='serve'?this.servingTarget(this.drag,this.drag.p):null;
  this.invalidate();
 }
 end(e){
  const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;
  const p={x:e.clientX,y:e.clientY},tool=cookingToolGeometry(d.kind,p,this.regions,this.u),contact=r=>workingEndTouchesRect(tool?.workingEnd,r);this.cancelDrag();
  if(d.kind==='spread'||d.kind==='shake'){
   const result=gestureResult(moveGesture(d.gesture,p));if(result.accepted)this.act({type:d.kind});else this.notify(d.kind==='spread'?'按住画个大概的圈，把面糊摊开':'按住雪克杯，左右来回摇一下');
  }else if(d.kind==='lift'){
   if(contact(this.regions.griddle)||contact(this.regions.dish)){if(this.act({type:'liftPancake'}))this.effects.push({kind:'lift',start:this.now(),until:this.now()+350});else this.notify('等绿圈再铲饼');}
   else this.notify('铲子拖到饼或纸袋里');
  }else if(d.kind==='pour'){
   if(contact(this.regions.dish)){if(this.act({type:'pourTea'}))this.effects.push({kind:'pour',start:this.now(),until:this.now()+450});else this.notify('先舀珍珠并左右摇好茶');}
   else this.notify('把雪克杯拖到奶茶杯里');
  }else if(d.kind==='scoop'){
   if(contact(this.regions.dish)){if(!this.act({type:'scoop'}))this.notify('这锅已经煮过头了，点锅重做');}
   else this.notify('从锅拖到碗里，一下捞一两');
  }else if(d.kind==='scoopTea'){
   if(contact(this.regions.dish)){if(!this.act({type:'scoopPearls'}))this.notify(this.getKitchen()?.tea.sealed?'这杯封好了，先端给顾客':'等绿圈再捞珍珠');}
   else this.notify('把小锅拖到杯子里，一下捞一勺珍珠');
  }else if(d.kind==='slice'){
   if(inside(p,this.regions.dish))this.act({type:'plate'});
   else this.notify('把鱼片拖到盘里，一下装一片');
  }else if(d.kind==='knife'){
   const dx=p.x-d.start.x,dy=p.y-d.start.y;
   if(dy>=20*this.u&&dy>=Math.abs(dx)*.6)this.act({type:'slice',direction:'down',broken:Math.abs(dx)>dy*.45});
   else this.notify('按住刀向下划，一刀一片');
  }else if(d.kind==='serve'){
   if(this.hasServingMotion(d,p)){
    if(inside(p,this.regions.trash))this.act({type:'clearDish'});
    else {const actor=this.servingTarget(d,p);if(actor)this.onServe(actor);else this.notify('把成品拖到顾客身上');}
   }
  }
  this.invalidate();
 }
 cancelDrag(){
  const had=this.drag;this.drag=null;this.hover=null;document.documentElement.dataset.cookingDrag='false';
  if(had){try{this.captureNode?.releasePointerCapture(had.pointerId);}catch{}this.invalidate();}
  this.captureNode=null;
 }
 announce(result,actor){this.effects.push({kind:'settlement',result,start:this.now(),until:this.now()+1600,cx:(actor.x+actor.width/2)/this.width,cy:(actor.y+actor.height/2)/this.height});this.invalidate();}
 announceSpoilage(result){if(!result?.message)return;const r=this.regions.pot;this.effects.push({kind:'spoilage',result,start:this.now(),until:this.now()+1600,cx:(r.x+r.width/2)/this.width,cy:r.y/this.height});this.invalidate();}
 tick(){
  this.frame=0;if(this.paused)return;this.inTick=true;this.dirty=false;
  this.onTime(this.now());const now=this.now();
  const receipt=this.getReceipt();if(receipt&&now>=receipt.dueAt)this.onDue(receipt);
  this.effects=this.effects.filter(f=>f.until>now);
  const g=this.g;g.setTransform(this.dpr,0,0,this.dpr,0,0);g.clearRect(0,0,this.width,this.height);
  g.save();this.clipFace(g);this.paint(g,now);g.restore();this.renderCount++;
  this.inTick=false;this.dirty=false;
  const k=this.getKitchen(),pending=this.getReceipt();let active=this.effects.length>0,next=null;
  const wake=t=>{if(Number.isFinite(t)&&t>now&&(next===null||t<next))next=t;};
  if(k&&((['noodle','tea'].includes(k.shop)&&k.pot.amount)||(k.shop==='pancake'&&k.pancake.loaded&&k.pancake.hadEgg))&&k.pot.startedAt!==null){
   const cooked=k.pot.startedAt+k.options.cookMs,smoke=cooked+k.options.readyMs,fire=smoke+k.options.smokeMs,burn=fire+k.options.fireMs;
   if(k.pot.status==='raw'){
    if(k.options.cookMs<=10000)active=true;
    else {const step=Math.max(1000,k.options.cookMs/100);wake(k.pot.startedAt+(Math.floor((now-k.pot.startedAt)/step)+1)*step);}
    wake(cooked);
   }else if(k.pot.status==='ready')wake(smoke);
   else if(k.pot.status==='smoking')wake(fire);
   else if(k.pot.status==='fire')wake(burn);
  }
  if(pending)wake(pending.dueAt);
  if(active)this.frame=requestAnimationFrame(()=>this.tick());
  else if(next!==null)this.timer=setTimeout(()=>{this.timer=null;this.invalidate();},Math.min(2147483647,Math.max(1,next-this.now())));
 }
 clipFace(g){const z=this.getZone();if(!z?.enabled)return;g.beginPath();g.rect(0,0,this.width,this.height);z.pts.forEach(([x,y],i)=>i?g.lineTo(x*this.width/100,y*this.height/100):g.moveTo(x*this.width/100,y*this.height/100));g.closePath();g.clip('evenodd');}
 image(g,id,r){const a=this.bank.sprite(id,r.width,r.height,this.dpr);g.drawImage(a.image,r.x,r.y,r.width,r.height);}
 layer(g,id,r,reference){
  const a=shopMeta[id].layerRect,base=shopMeta[reference].sourceSize;
  this.image(g,id,{x:r.x+a.x/base.width*r.width,y:r.y+a.y/base.height*r.height,width:a.width/base.width*r.width,height:a.height/base.height*r.height});
 }
 statusLabel(g,text,x,y,size=14,color=INK){
  g.save();g.font=`800 ${Math.max(8,size*this.u)}px ${FONT}`;const width=Math.min(this.width-12*this.u,g.measureText(text).width+24*this.u),height=Math.max(24*this.u,Math.max(8,size*this.u)*1.5+10*this.u);
  const cx=clamp(x,width/2+6*this.u,this.width-width/2-6*this.u);g.fillStyle='#fff4d9';g.strokeStyle=INK;g.lineWidth=2*this.u;
  g.beginPath();g.roundRect(cx-width/2,y-height/2,width,height,8*this.u);g.fill();g.stroke();g.textAlign='center';g.textBaseline='middle';g.fillStyle=color;g.fillText(text,cx,y,width-14*this.u);g.restore();
 }
 label(g,text,x,y,size=15,color=INK){g.font=`800 ${Math.max(8,size*this.u)}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.lineWidth=4*this.u;g.strokeStyle='#fff7e7';g.strokeText(text,x,y);g.fillStyle=color;g.fillText(text,x,y);}
 portion(g,id,cx,cy,w=50,h=30){this.image(g,id,{x:cx-w*this.u/2,y:cy-h*this.u/2,width:w*this.u,height:h*this.u});}
 drawCup(g,rect,tea,now=this.now()){
  this.image(g,'cup_back',rect);const progress=this.effects.find(f=>f.kind==='pour'&&f.until>now),q=progress?ease((now-progress.start)/(progress.until-progress.start)):1;
  g.save();const base=shopMeta.cup_back,points=base.innerClip.points;g.beginPath();points.forEach(([x,y],i)=>{const px=rect.x+x/base.sourceSize.width*rect.width,py=rect.y+y/base.sourceSize.height*rect.height;i?g.lineTo(px,py):g.moveTo(px,py);});g.closePath();g.clip();
  if(tea.sealed){g.save();g.beginPath();g.rect(rect.x,rect.y+rect.height*(1-q),rect.width,rect.height*q);g.clip();this.layer(g,'cup_tea',rect,'cup_back');g.restore();}
  if(tea.pearls>0)this.layer(g,`cup_pearls_${Math.min(3,tea.pearls)}`,rect,'cup_back');g.restore();
  this.layer(g,'cup_front',rect,'cup_back');if(tea.sealed){g.save();g.globalAlpha=q;this.layer(g,'cup_lid',{...rect,y:rect.y-(1-q)*18*this.u},'cup_back');g.restore();}
 }
 drawShaker(g,rect){
  const d=this.drag,shake=d?.kind==='shake',pour=d?.kind==='pour',u=this.u;
  const geometry=pour?cookingToolGeometry('pour',d.p,this.regions,u):null;
  const r=shake?{...rect,x:rect.x+clamp(d.p.x-d.start.x,-60*u,60*u),y:rect.y+clamp(d.p.y-d.start.y,-25*u,25*u)}:geometry?.rect||rect;
  const angle=geometry?.angle??(shake?clamp((d.p.x-d.start.x)/(250*u),-.22,.22):0);
  g.save();g.translate(r.x+r.width/2,r.y+r.height/2);g.rotate(angle);const local={x:-r.width/2,y:-r.height/2,width:r.width,height:r.height};this.image(g,'shaker',local);this.layer(g,'shaker_lid',local,'shaker');g.restore();
 }
 drawDish(g,rect,given,shop,items=[]){
  if(shop==='noodle')this.image(g,given?`bowl_noodles_${Math.min(3,given)}`:'bowl_empty',rect);
  else if(shop==='sushi'){
   this.image(g,'plate',rect);const n=Math.min(given,9),step=rect.width*.72/Math.max(1,n);
   for(let i=0;i<n;i++)this.portion(g,items[i]?.broken?'salmon_slice_broken':'salmon_slice',rect.x+rect.width*.18+i*step,rect.y+rect.height*.40,48,29);
  }else if(shop==='pancake'){
   const bag=this.getKitchen().pancake.bag,pop=this.effects.find(f=>f.kind==='lift'&&f.until>this.now()),scale=pop?1+.1*Math.sin(Math.PI*clamp((this.now()-pop.start)/(pop.until-pop.start),0,1)):1;
   g.save();g.globalAlpha=bag?1:.23;this.image(g,'pancake_bag',{x:rect.x-rect.width*(scale-1)/2,y:rect.y-rect.height*(scale-1),width:rect.width*scale,height:rect.height*scale});g.restore();
  }else if(shop==='tea')this.drawCup(g,rect,this.getKitchen().tea);
 }
 paintPancake(g,k,r,now){
  const u=this.u,p=k.pancake;this.image(g,'batter_bucket',r.source);this.image(g,'egg_basket',r.egg);this.image(g,'griddle',r.griddle);
  const m=shopMeta.griddle,cp={x:r.griddle.x+m.anchor.x/m.sourceSize.width*r.griddle.width,y:r.griddle.y+m.anchor.y/m.sourceSize.height*r.griddle.height};
  if(p.loaded){
   const progress=this.drag?.kind==='spread'?gestureResult(this.drag.gesture).progress:0,frame=p.spread?3:Math.min(3,1+Math.floor(progress*3));this.layer(g,`batter_disk_${frame}`,r.griddle,'griddle');
   for(let i=0;i<Math.min(2,p.eggs);i++)this.image(g,'egg_on_pancake',{x:cp.x-30*u+(p.eggs===1?0:(i?30:-30))*u,y:cp.y-27.5*u,width:60*u,height:55*u});
   if(p.hadEgg){const q=k.pot.status==='raw'?clamp((now-k.pot.startedAt)/k.options.cookMs,0,1):1;g.beginPath();g.ellipse(cp.x,cp.y,m.opening.rx/m.sourceSize.width*r.griddle.width*.95,m.opening.ry/m.sourceSize.height*r.griddle.height*.95,0,-Math.PI/2,-Math.PI/2+Math.PI*2*q);g.strokeStyle=k.pot.status==='ready'?'#7eaa64':['smoking','fire','burnt'].includes(k.pot.status)?'#bc644b':'#edb360';g.lineWidth=5*u;g.stroke();}
  }
  if(this.drag?.kind!=='lift')this.image(g,'spatula',r.spatula);
  this.label(g,`鏊子 ${p.eggs} 个蛋`,cp.x,r.counter.y+63*u,16);
  if(this.hintsVisible||this.drag?.kind==='spread'){
   const status=k.pot.status==='smoking'?'冒烟了！点锅倒掉，不然要着火':['fire','burnt'].includes(k.pot.status)?'拖灭火器来清理':!p.loaded?'点面糊桶，开始摊饼':!p.spread?`按住画圈摊开${this.drag?.gesture?' '+Math.round(gestureResult(this.drag.gesture).progress*100)+'%':''}`:!p.hadEgg?'点蛋筐，一下一个蛋':k.pot.status==='ready'?'绿圈好了，铲子拖到饼或纸袋里':'等绿圈，再用铲子装袋';
   this.statusLabel(g,status,cp.x,r.counter.y+98*u,14,k.pot.status==='ready'?'#4c7b42':INK);
  }
 }
 paintTea(g,k,r,now){
  // 小锅是奶茶店的第①②步：珍珠下锅煮熟，再一勺勺捞进杯子。
  const u=this.u;this.image(g,'pearl_jar',r.pearls);this.image(g,'stove',r.stove);this.image(g,'pot',r.pot);
  const clip=meta.pot.opening,base=meta.pot.sourceSize,mouth={x:r.pot.x+clip.cx/base.width*r.pot.width,y:r.pot.y+clip.cy/base.height*r.pot.height};
  if(k.pot.amount){
   g.save();g.beginPath();g.ellipse(mouth.x,mouth.y,clip.rx/base.width*r.pot.width,clip.ry/base.height*r.pot.height,0,0,Math.PI*2);g.clip();this.image(g,'pot_water',r.pot);
   const n=Math.min(18,k.pot.amount*4);
   for(let i=0;i<n;i++)this.pearl(g,mouth.x-25*u+(i%6)*10*u+(Math.floor(i/6)%2)*5*u,mouth.y-5*u+Math.floor(i/6)*5*u,4.5*u);
   g.restore();
   const progress=k.pot.status==='raw'?clamp((now-k.pot.startedAt)/k.options.cookMs,0,1):1;
   g.beginPath();g.arc(mouth.x,mouth.y,r.pot.width*.27,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);
   g.strokeStyle=k.pot.status==='ready'?'#7eaa64':['smoking','fire','burnt'].includes(k.pot.status)?'#bb6249':'#edb360';g.lineWidth=5*u;g.stroke();
  }
  this.drawShaker(g,r.shaker);this.label(g,`小锅 ${k.pot.amount} 勺`,mouth.x,r.counter.y+80*u,13);
  if(this.hintsVisible||this.drag?.kind==='shake'){
   const pot=k.pot.status==='raw'?'煮珍珠中…':k.pot.status==='ready'?'绿圈好了，把小锅拖到杯里':k.pot.status==='smoking'?'冒烟了！点锅倒掉，不然要着火':['fire','burnt'].includes(k.pot.status)?'拖灭火器到火上':'点珍珠罐，一下一勺下锅';
   this.statusLabel(g,pot,mouth.x,r.counter.y+108*u,14,k.pot.status==='ready'?'#4c7b42':INK);
   if(k.tea.hadPearls||k.tea.sealed){
    const cup=k.tea.sealed?'封好了，拖杯子给顾客':k.tea.shaken?'雪克杯拖到杯子里，倒满封口':this.drag?.kind==='shake'?`左右来回摇 ${Math.round(gestureResult(this.drag.gesture).progress*100)}%`:'按住雪克杯左右摇，再拖到杯子里';
    this.statusLabel(g,cup,r.shaker.x+r.shaker.width/2,r.counter.y+140*u,14);
   }
  }
 }
 pearlsIn(g,c){const u=this.u;for(let i=0;i<5;i++)this.pearl(g,c.x-10*u+(i%3)*10*u+Math.floor(i/3)*5*u,c.y-4*u+Math.floor(i/3)*8*u,5.5*u);}
 pearl(g,x,y,r){g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle='#4a2c22';g.fill();g.beginPath();g.arc(x-r*.35,y-r*.35,r*.35,0,Math.PI*2);g.fillStyle='rgba(255,255,255,.6)';g.fill();}
 paint(g,now){
  const r=this.regions,u=this.u,k=this.getKitchen();
  if(k){
   if(k.shop==='noodle'||k.shop==='sushi')this.image(g,k.shop==='sushi'?'fish_box':'noodle_box',r.source);
   if(k.shop==='noodle'){
    this.image(g,'stove',r.stove);this.image(g,'pot',r.pot);
    const mouth={x:r.pot.x+meta.pot.anchor.x/meta.pot.sourceSize.width*r.pot.width,y:r.pot.y+meta.pot.anchor.y/meta.pot.sourceSize.height*r.pot.height};
    if(k.pot.amount){
     const clip=meta.pot.opening||{cx:220,cy:84,rx:120,ry:30};
     g.save();g.beginPath();g.ellipse(r.pot.x+clip.cx/meta.pot.sourceSize.width*r.pot.width,r.pot.y+clip.cy/meta.pot.sourceSize.height*r.pot.height,clip.rx/meta.pot.sourceSize.width*r.pot.width,clip.ry/meta.pot.sourceSize.height*r.pot.height,0,0,Math.PI*2);g.clip();
     this.image(g,'pot_water',r.pot);this.image(g,`pot_noodles_${k.pot.amount<3?1:k.pot.amount<7?2:3}`,r.pot);g.restore();
    }
    if(this.drag?.kind!=='scoop')this.image(g,'strainer',r.strainer);
    if(k.pot.amount){
     const progress=k.pot.status==='raw'?clamp((now-k.pot.startedAt)/k.options.cookMs,0,1):1;
     g.beginPath();g.arc(mouth.x,mouth.y,54*u,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);g.strokeStyle=k.pot.status==='ready'?'#7eaa64':k.pot.status==='burnt'?'#bb6249':'#edb360';g.lineWidth=5*u;g.stroke();
    }
    this.label(g,`锅里 ${k.pot.amount} 两`,mouth.x,r.pot.y+r.pot.height*.68);
    if(this.hintsVisible)this.statusLabel(g,k.pot.status==='raw'?'煮面中…':k.pot.status==='ready'?'绿圈好了，拖到碗里':k.pot.status==='smoking'?'冒烟了！点锅倒掉，不然要着火':['fire','burnt'].includes(k.pot.status)?'拖灭火器到火上':'点木箱，一下下一两',mouth.x,r.counter.y+96*u,15,k.pot.status==='ready'?'#4c7b42':INK);
   }else if(k.shop==='sushi'){
    this.image(g,'cutting_board',r.board);
    if(k.block){const fraction=k.block/k.options.fishPieces;this.image(g,`salmon_block_${fraction>2/3?1:fraction>1/3?2:3}`,r.block);}
    const pieces=Math.min(k.slices.length,8);
    for(let i=0;i<pieces;i++)this.portion(g,k.slices[i].broken?'salmon_slice_broken':'salmon_slice',r.stock.x+(i+.5)*r.stock.width/Math.max(1,pieces),r.stock.y+r.stock.height/2);
    if(this.drag?.kind!=='knife')this.image(g,'knife',r.knife);
    this.label(g,`鱼块剩 ${k.block} 片 · 已切 ${k.slices.length} 片`,r.board.x+r.board.width/2,r.counter.y+78*u);
    if(this.hintsVisible)this.statusLabel(g,'按刀向下划，再把鱼片拖到盘里',r.board.x+r.board.width/2,r.counter.y+96*u,14);
   }else if(k.shop==='pancake')this.paintPancake(g,k,r,now);
   else if(k.shop==='tea')this.paintTea(g,k,r,now);
   const given=this.dishCount();this.drawDish(g,r.dish,given,k.shop,k.plate);
   const shown=k.shop==='tea'?k.tea.pearls:given,unit={noodle:'两',sushi:'片',pancake:'个蛋',tea:'勺珍珠'}[k.shop];
   this.label(g,`现在 ${shown} ${unit}`,r.dish.x+r.dish.width/2,r.dish.y+r.dish.height*.78,16);
   this.image(g,'trash_can',r.trash);this.label(g,'倒掉',r.trash.x+r.trash.width/2,r.trash.y+r.trash.height+8*u,12);
   if(this.drag){
    const d=this.drag;
    if(d.kind==='knife')this.image(g,'knife',{...r.knife,x:d.p.x-d.offset.x,y:d.p.y-d.offset.y});
    else if(d.kind==='scoop'){
     const tool=cookingToolGeometry('scoop',d.p,r,u);this.image(g,tool.asset,tool.rect);
    }else if(d.kind==='slice')this.portion(g,d.broken?'salmon_slice_broken':'salmon_slice',d.p.x,d.p.y);
    else if(d.kind==='lift'){const tool=cookingToolGeometry('lift',d.p,r,u);this.image(g,tool.asset,tool.rect);}
    else if(d.kind==='scoopTea'){const tool=cookingToolGeometry('scoopTea',d.p,r,u);this.image(g,tool.asset,tool.rect);this.pearlsIn(g,tool.workingEnd);}
    else if(d.kind==='serve'&&this.hasServingMotion(d,d.p)){const dr={...r.dish,x:d.p.x-r.dish.width/2,y:d.p.y-r.dish.height/2};this.drawDish(g,dr,given,k.shop,k.plate);this.label(g,String(given),d.p.x,dr.y-10*u,18);}
    if(this.hover){const a=this.hover;g.strokeStyle='#74a45c';g.lineWidth=4*u;g.strokeRect(a.x-3*u,a.y-3*u,a.width+6*u,a.height+6*u);}
   }
  }
  this.image(g,'coin_jar',r.jar);this.image(g,'coin_jar_top',r.jar);
  this.label(g,number(this.getStats().coins),r.jar.x+r.jar.width*.5,r.jar.y+r.jar.height*.59,19);
  this.label(g,'铜板',r.jar.x+r.jar.width*.5,r.jar.y+r.jar.height+7*u,12);
  const receipt=this.getReceipt();if(receipt){const p=this.feedbackPosition(receipt.cx*this.width,receipt.cy*this.height,190,70);this.image(g,'bubble',p);this.label(g,`要 ${receipt.wanted} · 给 ${receipt.given}`,p.x+p.width/2,p.y+p.height*.43,25);}
  for(const f of this.effects)this.paintEffect(g,f,now);
 }
 feedbackPosition(cx,cy,w=220,h=145){
  const u=this.u,width=w*u,height=h*u;
  const positions=[[cx-width/2,cy-height-20*u],[cx-width/2,cy+20*u],[cx-width-35*u,cy-height/2],[cx+35*u,cy-height/2],[15*u,80*u],[this.width-width-15*u,80*u]];
  for(const[x,y]of positions){const r={x:clamp(x,2*u,this.width-width-2*u),y:clamp(y,2*u,this.height-height-2*u),width,height};if(!rectIntersectsZone(r,this.getZone(),this.width,this.height,4*u))return r;}
  return{x:2*u,y:2*u,width,height};
 }
 paintEffect(g,f,now){
  const u=this.u,t=clamp((now-f.start)/(f.until-f.start),0,1);
  if(f.kind==='spoilage'){
   const r=this.feedbackPosition(f.cx*this.width,f.cy*this.height,230,48);g.save();g.globalAlpha=t>.75?(1-t)/.25:1;this.statusLabel(g,f.result.message,r.x+r.width/2,r.y+r.height/2,22,f.result.coins<0?'#ad4f44':'#775b3b');g.restore();return;
  }
  if(f.kind==='lift'||f.kind==='pour')return;
  if(f.kind==='load'){
   if(f.shop==='noodle'){const a=center(this.regions.source),b=center(this.regions.pot),e=ease(t);g.save();g.globalAlpha=1-t*.6;this.portion(g,'pot_noodles_1',a.x+(b.x-a.x)*e,a.y+(b.y-a.y)*e-Math.sin(t*Math.PI)*45*u,60,40);g.restore();}
   if(f.shop==='tea'){const a=center(this.regions.pearls),b=center(this.regions.pot),e=ease(t);g.save();g.globalAlpha=1-t*.5;this.pearlsIn(g,{x:a.x+(b.x-a.x)*e,y:a.y+(b.y-a.y)*e-Math.sin(t*Math.PI)*45*u});g.restore();}
   return;
  }
  const result=f.result,p=this.feedbackPosition(f.cx*this.width,f.cy*this.height),cx=p.x+p.width/2,cy=p.y+45*u;
  const color=result.caught?'red':result.stamp==='dark'?'purple':'green';
  g.save();g.globalAlpha=t>.75?(1-t)/.25:1;g.translate(cx,cy);g.rotate(-.07);
  const pop=1+.22*(1-ease(Math.min(1,t*6)));g.scale(pop,pop);
  this.image(g,`stamp_frame_${color}`,{x:-100*u,y:-40*u,width:200*u,height:80*u});
  this.label(g,result.stamp==='dark'?'黑暗料理':result.caught?'差评':result.reaction==='凑合'?'凑合':'好吃！',0,0,30,result.caught?'#a74d48':'#567947');g.restore();
  const signed=(result.coins>0?'+':'')+number(result.coins)+' 铜板';
  this.label(g,signed,cx,p.y+97*u,24,result.coins<0?'#ad4f44':'#966c2d');
  this.label(g,result.detail||result.reaction,cx,p.y+125*u,15);
  if(result.coins>0){const target=center(this.regions.jar),travel=clamp(t*1.8,0,1);if(travel<1)for(let i=0;i<3;i++){const delay=i*.12,q=clamp((travel-delay)/(1-delay),0,1),e=ease(q);this.portion(g,'coin',cx+(target.x-cx)*e+(i-1)*14*u*Math.sin(q*Math.PI),cy+(target.y-cy)*e-Math.sin(q*Math.PI)*70*u,26,26);}}
 }
 snapshot(){const r=this.getReceipt(),tool=this.drag?cookingToolGeometry(this.drag.kind,this.drag.p,this.regions,this.u):null;return{renderCount:this.renderCount,hintsVisible:this.hintsVisible,drag:this.drag?{kind:this.drag.kind,p:this.drag.p,...(tool?{workingEnd:structuredClone(tool.workingEnd),toolRect:{...tool.rect},angle:tool.angle}:{}),...(this.drag.gesture?{gesture:gestureResult(this.drag.gesture)}:{})}:null,pendingReceipt:r?{orderKey:r.orderKey,wanted:r.wanted,given:r.given,dueAt:r.dueAt}:null,effects:this.effects.map(f=>({kind:f.kind,until:f.until,coins:f.result?.coins,text:f.result?.message||f.result?.reaction}))};}
 async settle(){const end=performance.now()+6500;do{await new Promise(r=>setTimeout(r,35));}while(this.frame&&performance.now()<end);return this.snapshot();}
}
