(function(){
'use strict';
const {Camera}=window.LeafCamera,{Pile}=window.LeafPile,{PullTracker}=window.LeafDuel,{SpriteRenderer,SpriteBatch}=window.LeafRender,L=window.LeafLayout;
const E=window.LeafEffects,G=window.LeafGifts,{Fx,shadowTexture}=window.LeafFx,{FaceGuard}=window.LeafFace,{createLive}=window.LeafLive;
const ATLAS='__LEAF_ATLAS__';
const STORE='autumn-needle-duel-v12:proto',GIFT_STORE='autumn-needle-duel-v12:gifts';
const FACE={enabled:false,x:720,y:200,r:150},FACE_R=[40,320];
const DEFAULTS={elevation:60,thickness:4,count:1200,glint:8,threshold:60,hold:1.5,xray:false,face:FACE};
const SLOT=256,MASK=64,BUCKET=[600,-20,0],BUCKET_H=170,PICK_MS=300,SPARK_MS=450,GLINT_R=120,TARGET_MS=20000,TARGET_N=8;
// 叶堆跟着动：塌落参数（悬空三成、低两层就顺坡滑），轻晃时长与幅度
const SETTLE={maxMoves:8,slide:2,overhang:0.3},RUSTLE_MS=360,RUSTLE_AMP=6,SINK_MS=220,SLIDE_MS=280;
const WHITE=[1,1,1,1],$=id=>document.getElementById(id),clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const FIELDS=[['elevation',v=>v+'°'],['thickness',v=>String(v)],['count',v=>v+' 片'],['glint',v=>v+' 层'],['threshold',v=>v+'%'],['hold',v=>Number(v).toFixed(1)+' 秒']];
const NOUI={openSettings(){},closeSettings(){},isSettingsOpen:()=>false,refresh(){},renderLegend(){},pushBanner(){},renderKings(){},addSimulateButtons(){}};
let storageOK=true,giftBroken=false;
const cfg=loadCfg();let giftCfg=loadGifts();
const cam=new Camera({elevation:cfg.elevation});
const pull=new PullTracker({threshold:cfg.threshold/100,hold:cfg.hold});
const face=new FaceGuard({cam,get:()=>cfg.face});
const leafBatch=new SpriteBatch(2048),topBatch=new SpriteBatch(2048),fxBatch=new SpriteBatch(16),needleBatch=new SpriteBatch(4),starBatch=new SpriteBatch(64);
let renderer=null,sprites=null,pile=null,engine=null,fx=null,live=null,ui=NOUI,ctx2d=null,scale2d=1,stageScale=0,seed=(Date.now()%2147483647)>>>0;
let bucket=[],pickLog=[],sparkles=[],pointer=null,busyUntil=0,held=false,startAt=0,winAt=0,picks=0,won=false,nextGlint=0,batchVersion=-1,tagFlashUntil=0,statsAt=0,last=performance.now();
let faceEditing=false,faceDrag=null;
const anims=new Map();

function cleanFace(f){
  const o=f&&typeof f==='object'?f:{},num=(v,lo,hi,d)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,lo,hi):d;
  return{enabled:o.enabled===true,x:num(o.x,0,1440,FACE.x),y:num(o.y,0,810,FACE.y),r:num(o.r,FACE_R[0],FACE_R[1],FACE.r)};
}
function loadCfg(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}');}catch{}
  if(!saved||typeof saved!=='object')saved={};
  return{...DEFAULTS,...saved,face:cleanFace(saved.face)};
}
function warnStorage(){if(storageOK){storageOK=false;showMessage('浏览器无法保存设置，本次修改仅本页生效',3000);}}
function saveCfg(){try{localStorage.setItem(STORE,JSON.stringify(cfg));}catch{warnStorage();}}
// 全新配置首次打开时写入直播间档位预设；读不出来的旧存档不覆盖，先用默认值，等主播在设置里保存
function loadGifts(){
  let raw=null;try{raw=localStorage.getItem(GIFT_STORE);}catch{}
  if(raw){try{const r=E.validateConfig(JSON.parse(raw));if(r.ok)return r.config;}catch{}giftBroken=true;return E.defaultConfig();}
  const d=E.defaultConfig();saveGifts(d);return d;
}
function saveGifts(c){try{localStorage.setItem(GIFT_STORE,JSON.stringify(c));}catch{warnStorage();}}
function setGiftConfig(c){
  const r=E.validateConfig(c);if(!r.ok)return{ok:false,errors:r.errors};
  giftCfg=r.config;giftBroken=false;saveGifts(giftCfg);if(engine)engine.setConfig(giftCfg);ui.renderLegend(giftCfg);
  return{ok:true,errors:[]};
}
function showMessage(text,ms=0){const el=$('message');el.textContent=text;el.hidden=false;if(ms)setTimeout(()=>{el.hidden=true;},ms);}
function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function loadImage(src){return new Promise((ok,fail)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=()=>fail(new Error('图集加载失败'));img.src=src;});}

// 图集：0–5 叶片、6 木桶、7 扫帚（扫一扫用，缺了就不画）
function buildSprites(img){
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
  const parts=L.spriteComponents(g.getImageData(0,0,c.width,c.height).data,c.width,c.height);
  if(parts.slice(0,7).some(p=>!p))throw new Error('图集缺少叶片或木桶');
  const sheet=document.createElement('canvas');sheet.width=SLOT*4;sheet.height=SLOT*2;
  const sg=sheet.getContext('2d',{willReadFrequently:true}),uvs=[],masks=[],aspect=[];
  for(let k=0;k<8;k++){
    const p=parts[k];if(!p)continue;
    const tile=document.createElement('canvas');tile.width=p.w;tile.height=p.h;
    const data=g.getImageData(p.x,p.y,p.w,p.h);for(let i=0;i<p.w*p.h;i++)if(!p.mask[i]&&data.data[i*4+3]>=L.ALPHA_MIN)data.data[i*4+3]=0;
    tile.getContext('2d').putImageData(data,0,0);
    const sx=(k%4)*SLOT,sy=Math.floor(k/4)*SLOT,pad=10,scale=(SLOT-2*pad)/Math.max(p.w,p.h),dw=p.w*scale,dh=p.h*scale;
    sg.drawImage(tile,sx+(SLOT-dw)/2,sy+(SLOT-dh)/2,dw,dh);
    if(k<6)uvs[k]=[sx/sheet.width,(sy+SLOT)/sheet.height,(sx+SLOT)/sheet.width,sy/sheet.height];
    else{aspect[k]=p.w/p.h;uvs[k]=[(sx+(SLOT-dw)/2)/sheet.width,(sy+(SLOT+dh)/2)/sheet.height,(sx+(SLOT+dw)/2)/sheet.width,(sy+(SLOT-dh)/2)/sheet.height];}
  }
  for(let k=0;k<6;k++){
    const sx=(k%4)*SLOT,sy=Math.floor(k/4)*SLOT,a=sg.getImageData(sx,sy,SLOT,SLOT).data,m=new Uint8Array(MASK*MASK);
    for(let r=0;r<MASK;r++)for(let q=0;q<MASK;q++){const px=Math.floor((q+0.5)*SLOT/MASK),py=Math.floor((r+0.5)*SLOT/MASK);m[r*MASK+q]=a[(py*SLOT+px)*4+3]>=128?1:0;}
    masks.push({size:MASK,data:m});
  }
  return{sheet,uvs,masks,bucketAspect:aspect[6],broomAspect:aspect[7]||0.4};
}
function needleTexture(){
  const c=document.createElement('canvas');c.width=512;c.height=48;const g=c.getContext('2d'),y=24;
  const grad=g.createLinearGradient(0,y-7,0,y+7);grad.addColorStop(0,'#fdfdfd');grad.addColorStop(0.45,'#c9ced6');grad.addColorStop(0.7,'#8a919c');grad.addColorStop(1,'#5c626b');
  g.fillStyle=grad;g.beginPath();g.moveTo(8,y);g.lineTo(60,y-5);g.lineTo(470,y-6);g.quadraticCurveTo(504,y-6,504,y);g.quadraticCurveTo(504,y+6,470,y+6);g.lineTo(60,y+5);g.closePath();g.fill();
  g.globalCompositeOperation='destination-out';g.beginPath();g.ellipse(478,y,12,2.6,0,0,Math.PI*2);g.fill();g.globalCompositeOperation='source-over';
  g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=1.6;g.beginPath();g.moveTo(40,y-2.5);g.lineTo(460,y-3.2);g.stroke();
  return c;
}
function starTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,30);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(0.25,'rgba(255,244,200,.9)');r.addColorStop(1,'rgba(255,220,140,0)');
  g.fillStyle=r;g.beginPath();g.arc(32,32,30,0,Math.PI*2);g.fill();
  g.fillStyle='#fff';g.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?5:30;g.lineTo(32+Math.cos(a)*rr,32+Math.sin(a)*rr);}g.closePath();g.fill();
  return c;
}

function newPile(){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  pile=new Pile({masks:sprites.masks,seed,count:cfg.count,thickness:cfg.thickness});
  pile.landing=face.landingFor(pile);
  pile.generate(face.active()?(o,z)=>face.hits(o.x,o.y,z,o.size):null);
  face.relocate(pile); // 压实后叶子下沉、投影下移，按实际位置再清一次圈
  placeNeedle();pile.shadeLeaves();anims.clear();
  bucket=[];pickLog=[];sparkles=[];busyUntil=0;held=false;pull.reset();startAt=0;winAt=0;picks=0;won=false;nextGlint=0;batchVersion=-1;
  fx=new Fx({cam,uvs:sprites.uvs,sheet:sprites.sheet,SpriteBatch,bucket:BUCKET,bucketH:BUCKET_H,broomUV:sprites.uvs[7]||null,broomAspect:sprites.broomAspect});
  fx.solid=faceSolid();fx.pointer=pointer;
  engine=new E.EffectEngine({pile,config:giftCfg,random:Math.random,getTarget,adjustLanding:p=>face.adjust(pile,p),bucket,bucketPos:fx.mouth(),cameraPos:()=>cam.position,glintThreshold:()=>cfg.glint,afterRemove:list=>settleAround(list,performance.now(),false)});
  live.resetRound();
  $('win').hidden=true;
}
// 针不能藏在护脸圈后面（圈里不许有叶子，针会直接露出来）
function placeNeedle(){
  for(let i=0;i<8;i++){if(!pile.placeNeedle({minCover:cfg.glint+1,cameraPos:cam.position}))break;if(!face.needleHits(pile))return true;}
  pile.needle=null;showMessage('这堆叶子太薄（或被护脸圈占掉太多），藏不住针。请加大叶量或调整护脸圈后点「重新铺叶」',4000);return false;
}
// 捣乱冲着主播正在挖的地方：最近 20 秒内最后 8 次拾取位置的重心；还没捡过就取叶堆上随机一点
function getTarget(){
  const now=performance.now(),r=pickLog.filter(p=>now-p.at<TARGET_MS).slice(-TARGET_N);
  if(r.length)return{x:r.reduce((s,p)=>s+p.x,0)/r.length,y:r.reduce((s,p)=>s+p.y,0)/r.length};
  const a=Math.random()*Math.PI*2,k=Math.sqrt(Math.random())*0.6;return{x:pile.a*k*Math.cos(a),y:pile.b*k*Math.sin(a)};
}
function faceSolid(){const f=cfg.face;return f.enabled?{x:f.x,y:f.y,r:f.r}:null;}
function needleHidden(now){return!!engine&&now<engine.state.needleHiddenUntil;}
function applyEffect(id,tier,portions,who){
  if(!engine)return false;
  const now=performance.now(),r=engine.trigger(id,tier,portions,now);
  if(!r||!r.ok)return false;
  handleEvents(r.visual,now);
  if(who)ui.pushBanner({user:who.name,avatar:who.avatar,effect:id,tier,portions});
  return true;
}
function handleEvents(evs,now){
  if(!evs||!evs.length)return;
  for(const e of evs)if(e.type==='needleToss'){pull.reset();held=false;}
  fx.add(evs,now);
}
function resize(){
  const f=L.fit(innerWidth,innerHeight);stageScale=f.scale;const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,Math.round(1440*f.scale*dpr)),h=Math.max(1,Math.round(810*f.scale*dpr));
  $('stage').style.transform=`translate(${f.x}px,${f.y}px) scale(${f.scale})`;
  if(renderer)renderer.resize(w,h);
  const c=$('fx2d');if(c.width!==w||c.height!==h){c.width=w;c.height=h;if(fx)fx.drawn2d=true;}scale2d=w/1440;
}
function stagePoint(e){return L.point(e.clientX,e.clientY,$('scene').getBoundingClientRect());}
function flashTag(text){tagFlashUntil=performance.now()+900;$('needle-text').textContent=text;}
function onDown(e){
  if(e.button!==0||!pile||won||faceEditing)return;
  e.preventDefault();try{$('scene').setPointerCapture(e.pointerId);}catch{}
  const p=stagePoint(e),ray=cam.ray(p.x,p.y),now=performance.now();pointer=p;fx.pointer=p;
  if(!engine.canPick()){fx.frostHit(p.x,p.y);handleEvents(engine.frostClick(now),now);return;}
  if(!needleHidden(now)&&pile.needleHit(ray)>=0){
    if(pull.start(pile.exposure(cam.position).ratio)){held=true;if(!startAt)startAt=now;}else flashTag('还拔不动，再清开一点');
    return;
  }
  if(now<busyUntil)return;
  // 快手：先捡点中的那片，再沿同一视线继续往下捡，一次动作仍是 0.3 秒
  const layers=engine.pickLayers(),taken=[];
  for(let i=0;i<layers;i++){
    const leaf=pile.pick(ray);if(!leaf)break;
    pile.remove(leaf);anims.delete(leaf);bucket.push({x:leaf.x,y:leaf.y,yaw:leaf.yaw,size:leaf.size,type:leaf.type,at:now});fx.pick(leaf,now,i);taken.push(leaf);
  }
  if(!taken.length)return;
  const first=taken[0],got=taken.length;settleAround(taken,now,true);
  busyUntil=now+PICK_MS;picks+=got;if(!startAt)startAt=now;
  pickLog.push({x:first.x,y:first.y,at:now});if(pickLog.length>TARGET_N)pickLog.shift();
}
function onUp(){held=false;faceDrag=null;}
function onMove(e){
  pointer=stagePoint(e);if(fx)fx.pointer=pointer;
  if(!faceDrag)return;
  const f=cfg.face;
  if(faceDrag.mode==='move'){f.x=Math.round(clamp(pointer.x-faceDrag.dx,0,1440));f.y=Math.round(clamp(pointer.y-faceDrag.dy,0,810));}
  else f.r=Math.round(clamp(Math.hypot(pointer.x-f.x,pointer.y-f.y),FACE_R[0],FACE_R[1]));
  renderFace();
}
// 双击空白处（没点到叶子和针）打开礼物设置
function onDblClick(e){
  if(faceEditing||!pile)return;
  const p=stagePoint(e),ray=cam.ray(p.x,p.y);
  if(pile.pick(ray)||(!needleHidden(performance.now())&&pile.needleHit(ray)>=0))return;
  ui.openSettings();
}
function onKey(e){if(e.repeat||(e.target&&e.target.closest&&e.target.closest('input,textarea')))return;if(e.code==='KeyH'){e.preventDefault();togglePanel();}}
function showWin(now){won=true;winAt=now;$('win-detail').textContent=`用时 ${fmt(now-startAt)} · 捡了 ${picks} 片`;$('win').hidden=false;}
// 叶堆跟着动：逻辑位置已由 pile.settle 改好，这里只做画面补间（下沉、顺坡滑）；被捡处附近没动的表层叶片轻晃一下
function settleAround(removed,now,shake){
  for(const {leaf,from}of pile.settle(removed,SETTLE)){
    const slide=Math.hypot(leaf.x-from[0],leaf.y-from[1])>1;
    anims.set(leaf,{from,t0:now,t1:now+(slide?SLIDE_MS+Math.random()*120:SINK_MS),slide,spin:(Math.random()-0.5)*0.6});
  }
  if(shake)for(const r of removed)rustle(r,now);
}
function rustle(r,now){
  const R=r.size*0.9+40,t=pile.thickness,seen=new Set();
  pile.eachCell({x:r.x,y:r.y,size:R/0.71},cell=>{for(const l of cell){
    if(seen.has(l)||anims.has(l)||l.z<r.z-2*t)continue;seen.add(l);
    const dx=l.x-r.x,dy=l.y-r.y,d=Math.hypot(dx,dy);if(d>=R)continue;
    anims.set(l,{rustle:true,t0:now,t1:now+RUSTLE_MS,amp:RUSTLE_AMP*(1-d/R),ux:d>1e-3?dx/d:0,uy:d>1e-3?dy/d:0,ph:Math.random()*6.28});
  }});
}
// 正在动的叶片此刻画在哪；动完返回 null 并移出动画表
function poseOf(l,now){
  const a=anims.get(l);if(!a)return null;
  const k=(now-a.t0)/(a.t1-a.t0);if(k>=1||k<0){if(k>=1)anims.delete(l);return null;}
  if(a.rustle){const w=Math.sin(k*Math.PI*2.5)*(1-k)*(1-k)*a.amp;return{x:l.x+a.ux*w,y:l.y+a.uy*w,z:l.z,yaw:l.yaw+Math.sin(k*Math.PI*3+a.ph)*0.07*(1-k)};}
  const e=a.slide?k*k*(3-2*k):k*k;
  return{x:a.from[0]+(l.x-a.from[0])*e,y:a.from[1]+(l.y-a.from[1])*e,z:a.from[2]+(l.z-a.from[2])*e,yaw:l.yaw+(a.slide?Math.sin(k*Math.PI)*a.spin:0)};
}
function spawnSparkle(g){const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*g.radius,x=g.center.x+r*Math.cos(a),y=g.center.y+r*Math.sin(a);sparkles.push({x,y,z:pile.heightAt(x,y)+3,t0:performance.now(),size:16+Math.random()*14});}

// —— 护脸圈：设置里点「拖动调整」进入，按住圈内移动、拖右边圆点缩放，「完成」后隐藏边框并把圈里的叶子搬出去 ——
function startFaceAdjust(){faceEditing=true;cfg.face.enabled=true;ui.closeSettings();$('face-edit').hidden=false;renderFace();}
function renderFace(){
  const f=cfg.face,ring=$('face-ring'),tip=$('face-tip');
  ring.style.left=f.x+'px';ring.style.top=f.y+'px';ring.style.width=ring.style.height=f.r*2+'px';
  tip.style.left=clamp(f.x,170,1270)+'px';tip.style.top=(f.y+f.r+70<810?f.y+f.r+14:Math.max(8,f.y-f.r-60))+'px';
}
function onFaceDown(e){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();
  const p=stagePoint(e);faceDrag={mode:e.target.id==='face-handle'?'resize':'move',dx:p.x-cfg.face.x,dy:p.y-cfg.face.y};
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}
}
function finishFace(){faceEditing=false;faceDrag=null;$('face-edit').hidden=true;saveCfg();applyFace();}
function applyFace(){
  if(fx)fx.solid=faceSolid();if(!pile)return;
  face.relocate(pile);if(face.needleHits(pile))placeNeedle();
}

function update(dt,now){
  handleEvents(engine.update(now),now);fx.update(now,pile);
  const n=pile.needle,hidden=needleHidden(now),ex=n&&!n.pulled&&!hidden?pile.exposure(cam.position).ratio:0;
  const wasHeld=held,st=pull.update(dt,{held:held&&!hidden&&engine.canPick(),exposure:ex});
  if(st==='done'){n.pulled=true;pile.version++;showWin(now);}
  else if(st==='reset'&&wasHeld)flashTag('被挡住了，清开再拔');
  const g=n&&!won&&!hidden?pile.glint({threshold:cfg.glint,radius:GLINT_R}):{active:false};
  if(g.active){if(now>=nextGlint){spawnSparkle(g);nextGlint=now+g.interval*1000;}}else nextGlint=0;
  sparkles=sparkles.filter(s=>now-s.t0<SPARK_MS);
}
function rebuildLeafBatches(now){
  leafBatch.clear();topBatch.clear();
  const n=pile.needle,split=n&&!n.pulled?n.z:Infinity;
  const list=pile.leaves.map(l=>{const p=anims.size?poseOf(l,now):null;return p?{l,x:p.x,y:p.y,z:p.z,yaw:p.yaw}:{l,x:l.x,y:l.y,z:l.z,yaw:l.yaw};});
  list.sort((a,b)=>a.z-b.z||a.l.id-b.l.id);
  for(const p of list){
    const l=p.l,s=l.shade*(0.94+((Math.imul(l.id,2654435761)>>>0)%1000)/10000);
    (p.z<split?leafBatch:topBatch).flat(p.x,p.y,p.z,p.yaw,l.size,sprites.uvs[l.type],[s,s,s,1]);
  }
}
function pushNeedle(b,n,z,a){b.push([n.x,n.y,z],[n.cos*n.length,n.sin*n.length,0],[-n.sin*14,n.cos*14,0],[0,1,1,0],[1,1,1,a]);}
function draw(now){
  if(!renderer||!pile||!sprites)return;
  if(batchVersion!==pile.version||anims.size){rebuildLeafBatches(now);batchVersion=pile.version;}
  renderer.begin(cam.viewProj());
  const n=pile.needle,flying=fx.tossing(now),buried=n&&!n.pulled&&!pull.active&&!flying;
  renderer.draw('atlas',leafBatch);
  if(buried){needleBatch.clear();pushNeedle(needleBatch,n,n.z,1);renderer.draw('needle',needleBatch);}
  renderer.draw('atlas',topBatch);
  const bp=fx.bucketPose(now),R=cam.right;
  fxBatch.clear();fxBatch.billboard([BUCKET[0]+R[0]*bp.dx,BUCKET[1]+R[1]*bp.dx,BUCKET[2]+R[2]*bp.dx],BUCKET_H*sprites.bucketAspect*bp.sx,BUCKET_H*bp.sy,cam,sprites.uvs[6],WHITE);
  renderer.draw('atlas',fxBatch);
  fx.drawGL(renderer,now,pile);
  if(n&&!flying&&(n.pulled||pull.active||cfg.xray)){
    let z=n.z,a=0.55;
    if(pull.active){z=n.z+pull.progress*30;a=1;}
    if(n.pulled){const t=Math.min(1,(now-winAt)/900);z=n.z+30+t*110;a=1-Math.min(1,Math.max(0,(now-winAt-1400)/600));}
    if(a>0){needleBatch.clear();pushNeedle(needleBatch,n,z,a);renderer.draw('needle',needleBatch);}
  }
  starBatch.clear();
  for(const s of sparkles){const k=Math.min(1,(now-s.t0)/SPARK_MS),a=Math.sin(Math.PI*k),size=s.size*(0.4+0.6*a);starBatch.billboard([s.x,s.y,s.z],size,size,cam,[0,1,1,0],[1,1,1,a]);}
  renderer.draw('star',starBatch);
  if(ctx2d){ctx2d.setTransform(scale2d,0,0,scale2d,0,0);fx.draw2d(ctx2d,now,pile,engine);}
}
function updateDom(now){
  const n=pile.needle,tag=$('needle-tag'),ex=n&&!n.pulled&&!needleHidden(now)?pile.exposure(cam.position).ratio:0;
  if(n&&!n.pulled&&!won&&ex>0){
    const p=cam.project([n.x,n.y,n.z]),ready=pull.canStart(ex);
    tag.hidden=false;tag.style.left=p.x+'px';tag.style.top=p.y+'px';
    tag.classList.toggle('ready',ready&&!pull.active);tag.classList.toggle('pulling',pull.active);tag.style.setProperty('--p',pull.progress.toFixed(3));
    if(now>tagFlashUntil)$('needle-text').textContent=pull.active?'拔针中…':ready?`露出 ${Math.round(ex*100)}% · 按住拔出`:`露出 ${Math.round(ex*100)}%`;
  }else tag.hidden=true;
  updateStats(now);
}
function updateStats(now){
  if(now-statsAt<250||$('panel').hidden)return;statsAt=now;
  const n=pile.needle,alive=n&&!n.pulled,st=engine.state;
  const rows=[['场上叶子',pile.leaves.length+' 片'],['已捡',picks+' 片'],['木桶里',bucket.length+' 片'],['针上方最薄',alive?pile.minCover()+' 层':'—'],['露出',alive?Math.round(pile.exposure(cam.position).ratio*100)+'%':'—'],
    ['结霜',st.frost.layers?`${st.frost.layers} 层 · ${st.frost.progress}/${st.frost.need}`:'—'],['快手',st.quick.until>now?`${Math.ceil((st.quick.until-now)/1000)} 秒 · 连捡 ${st.quick.layers}`:'—'],['加时',st.timeBonus?'+'+st.timeBonus+' 秒':'—'],['用时',startAt?fmt((won?winAt:now)-startAt):'—']];
  const dl=$('stats');dl.textContent='';
  for(const [k,v]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd);}
}
function bindPanel(){
  for(const [k,show]of FIELDS){
    const el=$(k),out=$(k+'-out');el.value=cfg[k];out.textContent=show(cfg[k]);
    el.oninput=()=>{cfg[k]=Number(el.value);out.textContent=show(cfg[k]);applyLive(k);saveCfg();};
  }
  // 仰角变了投影就变：松手后把碰到护脸圈的叶子搬出去
  $('elevation').onchange=applyFace;
  $('xray').checked=!!cfg.xray;$('xray').onchange=()=>{cfg.xray=$('xray').checked;saveCfg();};
  $('regen').onclick=newPile;
  $('expose').onclick=()=>{if(pile&&pile.needle&&!pile.needle.pulled){pile.debugExpose(cam.position);pile.shadeLeaves();}};
  $('gift-settings').onclick=()=>ui.openSettings();
  $('panel-close').onclick=togglePanel;$('panel-open').onclick=togglePanel;
  $('face-ring').addEventListener('pointerdown',onFaceDown);$('face-done').onclick=finishFace;
}
function applyLive(k){
  if(k==='elevation')cam.set({elevation:cfg.elevation});
  if(k==='threshold'||k==='hold')pull.configure({threshold:cfg.threshold/100,hold:cfg.hold});
}
function togglePanel(){const hide=!$('panel').hidden;$('panel').hidden=hide;$('panel-open').hidden=!hide;}
// 页面若在 0×0 的视口里启动（宿主先藏着再显示），之后又没收到 resize，就在出帧时补一次适配
function frame(now){const dt=Math.min(0.05,(now-last)/1000);last=now;if(!stageScale&&innerWidth>0&&innerHeight>0)resize();if(pile){update(dt,now);draw(now);updateDom(now);}requestAnimationFrame(frame);}
function createUI(){
  if(!window.LeafGiftUI)return NOUI;
  try{
    return window.LeafGiftUI.create({
      overlay:$('overlay'),effects:E,getConfig:()=>giftCfg,setConfig:setGiftConfig,
      onTest:(id,tier,portions)=>applyEffect(id,tier,portions,{name:'测试',avatar:null}),
      onLikeTest:()=>live.receiveLike({type:'like',count:giftCfg.likes.step,nickname:'测试'}),
      getLikeStatus:()=>({enabled:giftCfg.likes.enabled,step:giftCfg.likes.step,...live.likeStatus()}),
      getConnection:()=>live.connection(),onConnectWS:()=>live.connectWS(),
      face:{get:()=>({...cfg.face}),setEnabled:on=>{cfg.face.enabled=!!on;saveCfg();applyFace();},startAdjust:startFaceAdjust}
    });
  }catch(e){showMessage('礼物界面启动失败：'+e.message);return NOUI;}
}
function getState(){
  const n=pile&&pile.needle,st=engine&&engine.state,now=performance.now();
  return{
    ready:!!pile,leaves:pile?pile.leaves.length:0,bucket:bucket.length,picks,won,
    needle:n?{pulled:!!n.pulled,hidden:needleHidden(now),exposure:n.pulled?1:pile.exposure(cam.position).ratio,minCover:pile.minCover()}:null,
    effects:st?{frost:st.frost.layers,frostProgress:st.frost.progress,frostNeed:st.frost.need,quickLeft:Math.max(0,st.quick.until-now),quickLayers:st.quick.layers,sun:!!(st.sun&&st.sun.until>now),timeBonus:st.timeBonus}:null,
    likes:live.likeStatus(),kings:live.kings(),connection:live.connection(),face:{...cfg.face},animating:anims.size
  };
}
async function init(){
  const canvas=$('scene');
  try{renderer=new SpriteRenderer(canvas);}catch(e){showMessage('此环境无法使用 WebGL2（'+e.message+'）。简化显示会在第 4 步加入。');return;}
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showMessage('显卡上下文丢失，恢复后会自动重新加载小样');});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  sprites=buildSprites(await loadImage(ATLAS));
  renderer.texture('atlas',sprites.sheet);renderer.texture('needle',needleTexture());renderer.texture('star',starTexture());renderer.texture('shadow',shadowTexture());
  ctx2d=$('fx2d').getContext('2d');
  live=createLive({G,E,getConfig:()=>giftCfg,apply:applyEffect,host:window,onChange:()=>{if(live){ui.renderKings(live.kings());ui.refresh();}}});
  ui=createUI();ui.renderLegend(giftCfg);ui.addSimulateButtons($('sim'));
  bindPanel();newPile();resize();
  addEventListener('resize',resize);canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('dblclick',onDblClick);
  addEventListener('pointerup',onUp);addEventListener('pointercancel',onUp);addEventListener('pointermove',onMove);addEventListener('keydown',onKey);
  $('again').onclick=newPile;
  if(giftBroken)showMessage('礼物设置存档读不出来，本页先用默认设置；在设置里保存后会覆盖旧存档',4500);
  live.start();
  requestAnimationFrame(frame);
}
window.AutumnNeedle={receiveGift:m=>!!live&&live.receiveGift(m),receiveLike:m=>!!live&&live.receiveLike(m),getState};
window.__leafDebug={
  get pile(){return pile;},get engine(){return engine;},get fx(){return fx;},get ui(){return ui;},cam,cfg:()=>({...cfg,face:{...cfg.face}}),gifts:()=>giftCfg,
  needleScreen(){const n=pile&&pile.needle;return n?cam.project([n.x,n.y,n.z]):null;},
  expose(){if(pile&&pile.needle&&!pile.needle.pulled){pile.debugExpose(cam.position);pile.shadeLeaves();}},
  trigger:(id,tier='medium',portions=1)=>applyEffect(id,tier,portions,{name:'调试',avatar:null}),
  // 浏览器面板在后台时 rAF 不出帧，测试时用定时器手动推一帧
  step(){const now=performance.now(),dt=Math.min(0.05,(now-last)/1000);last=now;if(pile){update(dt,now);draw(now);updateDom(now);}return now;},
  setFace(f){cfg.face=cleanFace({...cfg.face,...f});saveCfg();applyFace();return{...cfg.face};},
  readPixel(sx,sy){if(!renderer)return null;draw(performance.now());const gl=renderer.gl,c=renderer.canvas,px=new Uint8Array(4);gl.readPixels(Math.floor(sx/1440*c.width),Math.floor((1-sy/810)*c.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);return Array.from(px);}
};
init().catch(e=>showMessage('小样启动失败：'+e.message));
})();
