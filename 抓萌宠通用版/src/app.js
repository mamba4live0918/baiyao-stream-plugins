(()=>{'use strict';
const $=id=>document.getElementById(id),reduceQuery=matchMedia('(prefers-reduced-motion: reduce)'),C=CowCore,KEY='pet-catch-v1',CFG=KEY+'-settings';
const defaults={bg:'transparent',voice:true,chantAnimation:true,sound:true,motion:'on',miss:0,interval:8,size:85,gift:'小心心',connect:false,sceneLimitEnabled:false,sceneLimit:240};
let prefs={...defaults},state=C.fresh(),storageOkay=true,protectOld=false,cows=[],nextId=0,W=innerWidth,H=innerHeight,drag=null,auto=false,roundStart=0,nextAuto=0,raf=0,toastTimer,audioCtx,voicePlayer,beatPlayer,ws=null,sdk=false,reconnectTimer,resetArmed=false;
let windFlights=new Set(),ballQueue=[],ballVisuals=new Set(),activeBallThrows=0,lastBallPop=0,custom=null,effects=null,hud=null,roamArea=null,boxDisplay=null,population=null,ready=false,previewRound=null,previewVisual=false,previewStart=0,queueBlocked=false;
let residentCows=[],controls=null,runEpoch=0,sceneAudio=new Set(),synthVoices=new Set(),flightParticles=null,walkFrames=null,petCanvas=null,layout=null,resizeRequest=0;
let drainingLikes=false;
const Naming=PetNamedPets;
const Likes=typeof PetLikes==='undefined'?null:PetLikes;
function newSessionId(){return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():'s-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
function allActors(){return residentCows.length?cows.concat(residentCows):cows;}
function warnStorage(text){$('storage-alert').textContent=text;$('storage-alert').style.display='block';}
try{const raw=localStorage.getItem(KEY);if(raw){const restored=C.restore(raw);if(restored)state=restored;else{protectOld=true;warnStorage('旧进度无法读取，已保留原记录。本页可临时试玩。');}}const v=JSON.parse(localStorage.getItem(CFG)??'{}');for(const key of Object.keys(defaults))if(typeof v[key]===typeof defaults[key])prefs[key]=v[key];if(v.sceneLimitEnabled===true&&(!Number.isInteger(v.sceneLimit)||v.sceneLimit<1||v.sceneLimit>100000))prefs.sceneLimitEnabled=false;}catch{storageOkay=false;warnStorage('浏览器未允许保存，本页可正常试玩；关闭后进度不会保留。');}
for(const [k,min,max]of[['miss',0,100],['interval',1,120],['size',30,300]])if(!Number.isInteger(prefs[k])||prefs[k]<min||prefs[k]>max)prefs[k]=defaults[k];
if(!Number.isInteger(prefs.sceneLimit)||prefs.sceneLimit<1||prefs.sceneLimit>100000){prefs.sceneLimit=defaults.sceneLimit;prefs.sceneLimitEnabled=false;}
if(!['transparent','cream','checker','green'].includes(prefs.bg))prefs.bg='transparent';if(!['on','off','system'].includes(prefs.motion))prefs.motion='system';
state.naming??=Naming.fresh(newSessionId());
function cowSnapshot(c){return{x:Math.max(0,Math.min(1,c.x/W)),y:Math.max(0,Math.min(1,c.y/H)),kind:c.kind,windAttempt:c.windAttempt,...(C.validIndividualScale(c.individualScale)&&c.individualScale!==100?{individualScale:c.individualScale}:{})};}
function snapshot(){state.positions=population?population.snapshotPositions():cows.filter(c=>!c.dead).map(cowSnapshot);C.cleanHistory(state);if(state.naming){const byId=new Map();for(const c of residentCows)if(!byId.has(c.residentId))byId.set(c.residentId,c);for(const r of state.naming.residents){const c=byId.get(r.id);if(c&&!c.dead){const p=cowSnapshot(c);r.x=p.x;r.y=p.y;r.individualScale=c.individualScale;}}}}
function hasResidentMaterial(kind){return!custom?.deletingCowKinds?.has(kind)&&!!(avatarEntry(kind)||custom?.builtinCow(kind)||custom?.cowRecord(kind));}
function canEditPet(c=null){return ready&&(!c||allActors().includes(c)&&!c.dead&&!c.held&&!c.airborne&&!c.ballEmerging&&!c.boxFlight&&c.el.isConnected);}
function commitNaming(factory){
 if(!ready||protectOld||!storageOkay){toast('本场记录当前无法保存，取名操作未执行');return false;}
 try{snapshot();const candidate=structuredClone(state);factory(candidate);localStorage.setItem(KEY,JSON.stringify(candidate));state=candidate;return true;}
 catch(e){if(e.name==='QuotaExceededError'||/quota|storage/i.test(e.message)){storageOkay=false;warnStorage('取名记录未能保存，原存档与名字保留；本页可继续普通玩法。');}toast(e.message||'本场记录未保存，操作未执行');return false;}
}
function editResident(c,name,scale){if(!canEditPet(c)||!c.residentId)return false;const ok=commitNaming(s=>{s.naming=Naming.apply(s.naming,{type:'editResident',residentId:c.residentId,name,individualScale:scale}).next;});if(ok){const r=state.naming.residents.find(r=>r.id===c.residentId);c.petName=r.name;c.individualScale=r.individualScale;cowVisual(c);renderCow(c);controls?.refresh();}return ok;}
function deleteResident(id){
 const c=residentCows.find(c=>c.residentId===id);if(!c||!canEditPet(c)){toast('请先松开宠物并等待落定，再删除');return false;}
 if(!commitNaming(s=>{s.naming=Naming.apply(s.naming,{type:'deleteResident',residentId:id}).next;}))return false;
 c.dead=true;flightParticles?.remove(c);controls?.removeNameplate(c);c.el.remove();residentCows=residentCows.filter(a=>a!==c);updateHUD();return true;
}
function saveIndividualSize(c,scale){if(!canEditPet(c)||!Naming.validScale(scale))return false;if(c.residentId)return editResident(c,c.petName,scale);c.individualScale=scale;setCowSize(c);renderCow(c);save();return true;}
function promoteResident(c,name,scale){
 if(!canEditPet(c)||c.residentId||!hasResidentMaterial(c.kind))return false;
 const ok=commitNaming(s=>{const index=population.liveCows().filter(a=>!a.dead).indexOf(c);if(index<0||s.outside<1||index>=s.positions.length)throw Error('所选宠物已经离场，请重新选择');const p=cowSnapshot(c),result=Naming.apply(s.naming,{type:'directName',name,kind:c.kind,individualScale:scale,x:p.x,y:p.y});s.naming=result.next;s.outside--;s.positions.splice(index,1);});
 if(!ok)return false;const r=state.naming.residents.at(-1);cows=cows.filter(a=>a!==c);residentCows.push(c);c.residentId=r.id;c.petName=r.name;c.individualScale=r.individualScale;population.sync();cowVisual(c);renderCow(c);controls?.refresh();replenish();return true;
}
function endSession(){
 if(!ready||!storageOkay){toast('本场记录无法保存，清空未执行');return false;}
 const next=C.fresh();next.naming=Naming.fresh(newSessionId());next.receivedGiftIds=(state.receivedGiftIds||[]).filter(r=>r.at>=Date.now()-60000).slice(-1000);next.receivedLikeIds=C.cleanLikeReceipts(state.receivedLikeIds);
 try{localStorage.setItem(KEY,JSON.stringify(next));}catch(e){warnStorage('清空未能保存，原宠物、名字与存档保留。');toast('清空未完成，请检查浏览器存储');return false;}
 const previous=allActors();state=next;runEpoch++;stopSynthAudio();if(typeof flightParticles!=='undefined')flightParticles?.clear();protectOld=false;cancelAnimationFrame(raf);drag=null;controls?.close();
 for(const c of previous){c.dead=true;c.held=false;controls?.removeNameplate(c);c.el.remove();}
 cows=[];residentCows=[];cancelWindFlights();cancelBallSpawns();population?.clear();previewRound=null;previewVisual=false;queueBlocked=false;auto=false;
 for(const a of sceneAudio)a.pause();sceneAudio.clear();voicePlayer?.pause();beatPlayer?.pause();custom?.player?.pause();controls?.disarmEnd();controls?.refresh();
 for(const el of document.querySelectorAll('.calf.returning,.fx-clear-ghost,.fx-cue,.fx-wide-sweep,.fx-boom-star,.spark,.seal-ball-burst'))el.remove();
 if(effects){clearTimeout(effects.boomTimer);effects.preview=false;effects.resultUntil=0;effects.resultText='';effects.nextCollect=0;effects.gripRing.hidden=true;}
 $('boom-fx').hidden=true;$('tornado-fx').hidden=true;$('interaction-panel').hidden=true;$('pen').classList.remove('over','booming','pulse');
 $('auto').textContent='连续开盒';$('auto').setAttribute('aria-pressed','false');$('show').classList.remove('playing');$('call').textContent='萌宠盲盒';$('subtitle').textContent='';custom.applyLayout(false);$('show').hidden=true;tick.last=0;scheduleFrame();updateHUD();effects?.likeStatus?.();likeStatus('本场点赞已清空，等待新的点赞');toast('本场已结束，宠物与名字已清空');return true;
}
function save(){if(!ready)return;snapshot();if(protectOld||!storageOkay)return;try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageOkay=false;warnStorage('保存失败，旧存档未被覆盖。本页可继续使用；关闭后本次变化可能丢失。');}}
function savePrefs(){if(!storageOkay)return;try{localStorage.setItem(CFG,JSON.stringify(prefs));}catch{storageOkay=false;warnStorage('设置保存失败，本页仍可使用；关闭后设置可能丢失。');}}
function toast(t){$('toast').textContent=t;$('toast').classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('on'),2600);}
function syncSceneLimitControls(){$('sceneLimitEnabled').checked=prefs.sceneLimitEnabled;$('sceneLimit').value=prefs.sceneLimit;$('sceneLimit').disabled=!prefs.sceneLimitEnabled;$('sceneLimit').removeAttribute('aria-invalid');$('scene-limit-error').textContent='';}
function applyPrefs(resetSceneLimit=false){penShape.syncMotion();if(reduced()&&typeof flightParticles!=='undefined')flightParticles?.clear();if(custom)PetThemes.apply(custom.cfg.theme);document.body.dataset.bg=prefs.bg;document.body.dataset.motion=prefs.motion;for(const k of Object.keys(defaults)){if(k==='sceneLimitEnabled'||k==='sceneLimit')continue;const el=$(k);if(!el)continue;if(el.type==='checkbox')el.checked=prefs[k];else el.value=prefs[k];}if(resetSceneLimit)syncSceneLimitControls();if(!prefs.voice){voicePlayer?.pause();beatPlayer?.pause();}for(const c of allActors()){if(custom)cowVisual(c);else setCowSize(c);renderCow(c);}custom?.applyLayout(!!state.current||!!previewRound);}
function unlockAudio(){try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}catch{}}
function disposeSynthVoice(voice,stop=false){if(!synthVoices.delete(voice))return;voice.o.onended=null;if(stop)try{voice.o.stop();}catch{}try{voice.detach();}catch{}for(const node of[voice.o,voice.g,voice.volume])try{node.disconnect();}catch{}}
function stopSynthAudio(){for(const voice of synthVoices)disposeSynthVoice(voice,true);}
function sound(kind,enabled=prefs.sound){if(!enabled)return;const uploaded=custom?.audio('audio:'+kind);if(uploaded?.src){const a=new Audio(uploaded.src);sceneAudio.add(a);for(const event of ['ended','error'])a.addEventListener(event,()=>sceneAudio.delete(a),{once:true});if(kind==='boxopen'||kind==='boxreveal'){voicePlayer?.pause();voicePlayer=a;}audioMixer.attach(a,'audio:'+kind,.7);a.play().catch(()=>sceneAudio.delete(a));return;}unlockAudio();if(!audioCtx)return;const t=audioCtx.currentTime;for(let i=0;i<((kind==='home'||kind==='boxreveal')?3:1);i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain(),volume=audioCtx.createGain();const voice={o,g,volume,detach:audioMixer.attachGain(volume,'audio:'+kind)};synthVoices.add(voice);o.onended=()=>disposeSynthVoice(voice);o.type='sine';o.frequency.value=((kind==='home'||kind==='boxreveal')?[523.25,659.25,783.99][i]:kind==='boxopen'?740:kind==='grab'?420:300);g.gain.setValueAtTime(0,t+i*.07);g.gain.linearRampToValueAtTime(.045,t+i*.07+.01);g.gain.exponentialRampToValueAtTime(.0001,t+i*.07+.18);o.connect(g);g.connect(volume);volume.connect(audioCtx.destination);o.start(t+i*.07);o.stop(t+i*.07+.2);}}
function boxCue(kind){sound(kind,prefs.voice);}
function reduced(){return prefs.motion==='off'||(prefs.motion==='system'&&reduceQuery.matches);}
reduceQuery.addEventListener?.('change',()=>{if(prefs.motion==='system'&&custom){if(reduced()&&typeof flightParticles!=='undefined')flightParticles?.clear();penShape.syncMotion();for(const c of allActors()){cowVisual(c);renderCow(c);}}});
function updateHUD(){const pending=Math.max(0,state.outside-cows.length),limited=prefs.sceneLimitEnabled;hud?.update({outside:state.outside,home:state.home,pending,queue:state.queue,limited,residentCount:residentCows.length});const ordinary=limited?`场内 ${cows.length} / ${prefs.sceneLimit} 只 · 候场 ${pending} 只 · 在外总数 ${state.outside} 只`:`场内 ${cows.length} 只 · 正在入场 ${pending} 只 · 在外总数 ${state.outside} 只`;const text=ordinary+(residentCows.length?' · 专属 '+residentCows.length+' 只':'');$('manual-add-population').textContent=text;$('population-status').textContent=text;}
function size(){return Math.min(prefs.size*(typeof layout==='undefined'?1:layout?.metrics.stageScale||1),W*.5,H*.5);}
function roamRect(){return PetRoamGeometry.pixels(custom.cfg,W,H);}
function confineCow(c,bounds,motionReduced){if(c.boxFlight)return c;return PetRoamGeometry.constrain(c,bounds||roamRect(),{reduced:motionReduced??reduced()});}
function setCowSize(c){c.size=PetRoamGeometry.fitSize(Math.min(size()*custom.cowScale(c.visualKind??c.kind)*(C.validIndividualScale(c.individualScale)?c.individualScale:100)/100,W*.55,H*.6),roamRect());c.el.style.width=c.size+'px';c.el.style.height=c.size+'px';confineCow(c);if(c.walkKey!==undefined&&typeof applyWalkSource==='function'&&frameBucket(c)!==c.frameBucket)applyWalkSource(c);if(c.cvBox&&typeof canvasLook==='function'&&(canvasBox(c.size).px!==c.cvBox.px||exactBox(c.size).px!==c.cvOne?.px))canvasLook(c);}
function setAquaticMode(c){const next=c.motionMode==='swim',flying=c.motionMode==='fly';if((next||flying)&&!c.aquatic&&!c.flying&&!c.held&&!c.ballEmerging&&!c.boxFlight){c.airborne=false;c.vx=0;c.vy=0;C.resetHop(c);}c.aquatic=next;c.flying=flying;}
function avatarEntry(kind){return state.avatarKinds?.find(a=>a.kind===kind)||null;}
// Walk strips switch to shared per-frame images once PetWalkFrames has split them; until then the strip stays in use.
// Frames are split at the pixels pets are drawn (16px steps) so more of them stay decoded; 240px+ keeps full strips.
function frameBucketFor(px){const need=(px||0)*(globalThis.devicePixelRatio||1);return need>0&&need<240?Math.max(64,Math.ceil(need/16)*16):0;}
function frameBucket(c){return frameBucketFor(c.size);}
// Keys stay short: built-in strips by kind, uploaded sequences by record identity (their data: URL can be ~30 MB).
const uploadIds=new WeakMap();let nextUploadId=0;
function stripId(c){const record=custom.cowRecord?.(c.visualKind);if(!record||typeof record!=='object')return'b'+c.visualKind;if(!uploadIds.has(record))uploadIds.set(record,++nextUploadId);return'u'+uploadIds.get(record);}
function stripKey(c,bucket){return stripId(c)+'@'+c.walkFrames+'#'+bucket;}
function walkFramesFor(key,frames,source,bucket=0){return typeof walkFrames!=='undefined'&&walkFrames&&key?walkFrames.get(key,frames,source,bucket):null;}
function accessoryFrames(strip,frames,c){const asset=c?.accessoryAsset,bucket=c?.frameBucket||0;if(!asset)return null;c.accessoryKey='a'+(asset.kind??asset.name)+'@'+frames+'#'+bucket;return walkFramesFor(c.accessoryKey,frames,strip,bucket)?.classes||null;}
function setFrameClass(el,cls){if(typeof PetWalkFrames!=='undefined')PetWalkFrames.setFrameClass(el,cls);}
function applyWalkSource(c){
 // Reduced motion never changes walk frames, so the strip needs no split.
 const walk=c.walkSrc,bucket=walk?frameBucket(c):0,key=walk&&!reduced()?stripKey(c,bucket):null;
 // walkKey is set before asking: the provider drops queued keys that no pet holds.
 c.frameBucket=bucket;c.walkKey=key;
 const ready=key?walkFramesFor(key,c.walkFrames,custom.walkBlob?.(walk)||walk,bucket):null;
 // While a resized split is prepared, keep the frames this strip already shows instead of returning to the strip.
 const fresh=ready&&ready.classes.length===c.walkFrames,keep=!fresh&&key&&c.frameStrip===walk&&c.frameClasses?.length===c.walkFrames,classes=fresh?ready.classes:keep?c.frameClasses:null;
 c.frameClasses=classes;c.frameStrip=classes?walk:null;c.frameKey=fresh?key:keep?c.frameKey:null;
 // Frame mode: the shared class rule supplies the image, so the inline strip must be cleared.
 if(classes){c.sprite.style.backgroundImage='';c.sprite.style.backgroundSize='100% 100%';c.sprite.style.backgroundPosition='0% 0';setFrameClass(c.sprite,classes[Math.min(c.shownFrame||0,classes.length-1)]);return;}
 if(c.sprite._petFrameClass)setFrameClass(c.sprite,null);
 c.sprite.style.backgroundImage=walk?'url("'+walk+'")':'';
 c.sprite.style.backgroundSize=walk?c.walkFrames*100+'% 100%':'';
}
function refreshWalkFrames(key){if(!custom)return;for(const c of allActors()){if(c.dead)continue;if(c.walkKey===key){applyWalkSource(c);renderCow(c);}else if(c.accessoryKey===key)renderCow(c);else if(c.cvWalkKey===key||c.cvStillKey===key||c.cvAccKey===key||c.cvAccStillKey===key){canvasLook(c);renderCow(c);}}}
function walkFrameWanted(key){for(const c of allActors())if(!c.dead&&(c.walkKey===key||c.accessoryKey===key||c.cvWalkKey===key||c.cvStillKey===key||c.cvAccKey===key||c.cvAccStillKey===key))return true;return false;}
// Frames of strips no pet shows any more (old sizes, kinds that left, replaced uploads) are released.
function pruneWalkFrames(){if(!walkFrames)return;const used=new Set();for(const c of allActors()){if(c.dead)continue;used.add(c.walkKey);used.add(c.frameKey);used.add(c.accessoryKey);for(const e of [c.cvWalk,c.cvStill,c.cvAcc,c.cvAccStill])if(e)used.add(e.key);for(const k of [c.cvWalkKey,c.cvStillKey,c.cvAccKey,c.cvAccStillKey])used.add(k);if(c.cvAvatar)used.add(c.cvAvatar.key);}walkFrames.prune(key=>used.has(key));if(typeof petCanvas!=='undefined')petCanvas?.pruneAvatars(key=>used.has(key));if(typeof stillIds!=='undefined'){const sources=new Set();for(const c of allActors())if(!c.dead)sources.add(c.imSource);for(const src of stillIds.keys())if(!sources.has(src))stillIds.delete(src);}}
// Canvas renderer (pet-canvas.js). A pet is drawn on the shared canvas once every bitmap it needs is baked off-thread
// at its drawn size: walk atlas, still image (standing pose of articulated pets, image pets), accessory. Until then, and
// whenever it needs real DOM (held, flights, GIF art), it keeps its <button>. Canvas keys start with C/S/A/T.
// Short ids for still-image sources (data: URLs can be MBs); entries no pet shows are dropped with the 20 s prune.
const stillIds=new Map();let nextStillId=0;
function canvasBox(px){const r=globalThis.devicePixelRatio||1,need=(px||0)*r;if(need<240){const b=Math.max(64,Math.ceil(need/16)*16);return{px:b,ref:(b-8)/r};}const b=Math.min(1024,Math.ceil(need/64)*64);return{px:b,ref:(b-32)/r};}
// Single images (standing art, static props, avatar photos) were one <img>/background scaled once by the browser; baking
// them at the exact drawn size keeps them as sharp. Walk frames keep the buckets their DOM frames used.
function exactBox(px){const r=globalThis.devicePixelRatio||1;return{px:Math.max(8,Math.min(1024,Math.round((px||0)*r))),ref:px||1};}
function sourceId(src){let id=stillIds.get(src);if(id===undefined){id=++nextStillId;stillIds.set(src,id);}return id;}
// While a pet's bitmaps are re-baked for a new size, it keeps drawing the ones it has for the same art.
function canvasBitmap(key,source,opts,current){if(!key)return null;const ready=walkFrames.bitmap(key,source,opts);if(ready)return ready;const base=k=>k.slice(0,k.lastIndexOf('#'));return current?.atlas&&!current.atlas.broken&&base(current.key)===base(key)?current:null;}
function canvasLook(c){
 if(typeof petCanvas==='undefined'||!petCanvas||!walkFrames)return;
 const box=canvasBox(c.size),one=exactBox(c.size),animate=!reduced(),mode=c.el.classList?.contains('viewer-avatar')?'avatar':c.walkSrc?'walk':PetCanvas.animatedData(c.imSource)?null:'image';
 const shadowed={size:box.px,ref:box.ref,shadow:PetCanvas.SHADOW,pad:PetCanvas.PAD},asset=mode==='walk'||mode==='image'?c.accessoryAsset:null,prop=asset?(asset.kind??asset.name):null;
 c.cvMode=mode;c.cvBox=box;c.cvOne=one;if(c.cvAvatar&&c.cvAvatar.key!==c.imSource+'#'+one.px)c.cvAvatar=null;
 c.cvWalkKey=mode==='walk'&&(animate||!c.articulated)?'C'+stripId(c)+'@'+c.walkFrames+'#'+box.px:null;
 c.cvStillKey=mode==='image'||mode==='walk'&&c.articulated?'S'+sourceId(c.imSource)+'#'+one.px:null;
 c.cvAccStillKey=asset?'T'+prop+'#'+one.px:null;
 c.cvAccKey=asset&&animate&&c.articulated&&c.walkMode==='default'&&asset.walk&&asset.frames===c.walkFrames?'A'+prop+'@'+asset.frames+'#'+box.px:null;
 c.cvWalk=canvasBitmap(c.cvWalkKey,custom.walkBlob?.(c.walkSrc)||c.walkSrc,{...shadowed,frames:c.walkFrames},c.cvWalk);
 c.cvStill=canvasBitmap(c.cvStillKey,c.imSource,{...shadowed,size:one.px,ref:one.ref,fit:'contain'},c.cvStill);
 c.cvAccStill=canvasBitmap(c.cvAccStillKey,asset?.src,{size:one.px,ref:one.ref},c.cvAccStill);
 c.cvAcc=canvasBitmap(c.cvAccKey,asset?.walk,{size:box.px,ref:box.ref,frames:asset?.frames},c.cvAcc);
}
const usableBitmap=e=>!!e?.atlas&&!e.atlas.broken;
function canvasReady(c){
 if(c.held||c.windActive||c.domOnly||!c.cvMode||!petCanvas.active)return false;
 if(c.cvMode==='avatar')return!!(c.cvAvatar||(c.cvAvatar=petCanvas.avatar(c.imSource,c.im,c.cvOne)));
 return!(c.cvWalkKey&&!usableBitmap(c.cvWalk)||c.cvStillKey&&!usableBitmap(c.cvStill)||c.cvAccStillKey&&!usableBitmap(c.cvAccStill)||c.cvAccKey&&!usableBitmap(c.cvAcc));
}
// The same body/accessory choice the DOM makes: standing art when articulated pets rest, else the walk frame.
function canvasPose(c,tx,ty,rot,sx,sy,frame,standing){
 const s=c.cvState??(c.cvState={});s.tx=tx;s.ty=ty;s.rot=rot;s.sx=sx;s.sy=sy;
 s.originX=c.spriteMotion?.pivot?c.spriteMotion.pivot[0]/c.spriteMotion.frameWidth:undefined;
 s.originY=c.spriteMotion?.pivot?c.spriteMotion.pivot[1]/c.spriteMotion.frameWidth:undefined;
 if(c.cvMode==='avatar'){s.body=c.cvAvatar;s.bodyIndex=0;}
 else if(c.cvMode==='image'||c.articulated&&standing||!c.cvWalk){s.body=c.cvStill.atlas;s.bodyIndex=0;}
 else{s.body=c.cvWalk.atlas;s.bodyIndex=Math.min(frame,s.body.frames-1);}
 const asset=c.cvAccStillKey?c.accessoryAsset:null,animated=!!asset&&!standing&&!!c.cvAcc&&c.articulated&&c.walkMode==='default'&&asset.frames===c.walkFrames;
 s.acc=asset?(animated?c.cvAcc.atlas:c.cvAccStill.atlas):null;s.accIndex=animated?Math.max(0,Math.min(asset.frames-1,frame)):0;
 c.onCanvas=true;
}
// A button shown again would restart its CSS effect from 0%; mid-effect, the effect is dropped instead.
function leaveCanvas(c){c.onCanvas=false;if(c.domHidden){c.el.classList.remove('pet-canvas');c.domHidden=false;if(c.fx)c.el.classList.remove(c.fx.name);}}
// Flights, ghosts and returns animate the real button: show it with the pose the canvas last drew.
function petToDom(c){c.domOnly=true;if(c.onCanvas)renderCow(c);}
// CSS effect classes keep working for DOM pets; the canvas layer replays the same keyframes from c.fx.
function petEffect(c,name,ms){c.el.classList.add(name);const fx=c.fx={name,start:performance.now()};setTimeout(()=>{c.el.classList.remove(name);if(c.fx===fx)c.fx=null;},ms);}
function cowVisual(c){
 const avatar=avatarEntry(c.kind);
 const fallback=avatar&&custom.hasCowKind(avatar.fallbackKind)?avatar.fallbackKind:0;
 const showAvatar=!!avatar&&custom.cfg.theme!=='yajiji'&&custom.cfg.avatarMode&&!c.avatarFailed;
 c.visualKind=showAvatar?c.kind:avatar?fallback:c.kind;
 if(!showAvatar&&!c.residentId)c.visualKind=custom.resolveDisplayKind?.(c.visualKind,c.id)??c.visualKind;
 if(showAvatar){
  c.particleStyle=null;c.flyBankDeg=0;c.motionTilt=0;if(typeof flightParticles!=='undefined')flightParticles?.remove(c);
  c.walkSrc=null;c.walkMode='image';c.walkFrames=1;c.walkFps=0;c.walkDurations=null;c.articulated=false;c.sourceFacing=1;c.spriteMotion=null;
  c.motionMode=custom.cfg.avatarMotion||'float';setAquaticMode(c);c.swimCycleMs=1200;
  c.im.referrerPolicy='no-referrer';
  c.im.onerror=()=>{c.im.onerror=null;c.avatarFailed=true;cowVisual(c);};
  if(c.im.src!==avatar.url)c.im.src=avatar.url;
  c.im.hidden=false;c.sprite.hidden=true;c.sprite.style.backgroundImage='';c.frameClasses=null;if(c.sprite._petFrameClass)setFrameClass(c.sprite,null);
  c.el.classList?.toggle('viewer-avatar',true);
  c.el.setAttribute('aria-label',c.petName?c.petName+'，本场专属宠物':avatar.name+'的头像，拖到小窝送回');
  if(typeof PetAccessories!=='undefined')PetAccessories.sync(c,custom,typeof ASSETS==='undefined'?null:ASSETS,true);
  setCowSize(c);c.imSource=avatar.url;canvasLook(c);return;
 }
 const kind=c.visualKind,walk=custom.cowWalk(kind),meta=custom.cowFrameMeta(kind);
 if(c.walkSrc!==undefined&&c.walkSrc!==walk){c.userAnimTime=0;c.spriteDistance=0;c.spriteFinish=null;c.spriteSettle=false;c.spriteHopState='rest';c.spriteHopElapsed=0;c.spriteHopWait=0;}
 c.walkSrc=walk;c.walkMode=meta.kind;c.walkFrames=meta.frames||4;c.walkFps=meta.fps||0;c.articulated=meta.articulated===true;c.sourceFacing=meta.sourceFacing===-1?-1:1;
 c.walkDurations=Array.isArray(meta.durations)?meta.durations:null;c.spriteMotion=meta.spriteMotion||null;
 c.strideScale=meta.strideScale;
 c.motionMode=custom.cowMotion(kind);setAquaticMode(c);c.swimCycleMs=meta.swimCycleMs||custom.builtinCow?.(kind)?.swimCycleMs||1200;
 c.flyCycleMs=meta.flyCycleMs||1200;c.flyBankDeg=c.flying&&c.visualKind===c.kind?meta.flyBankDeg||0:0;if(c.flying&&(!c.flyBankDeg||reduced()||c.held||c.airborne))c.motionTilt=0;const particleStyle=c.flying&&c.visualKind===c.kind?meta.particleStyle:null;if(particleStyle!==c.particleStyle&&typeof flightParticles!=='undefined')flightParticles?.remove(c);c.particleStyle=particleStyle||null;
 const imageSource=reduced()?custom.cowStaticSource(kind):custom.cowSource(kind);
 c.im.onerror=null;if(c.im.src!==imageSource)c.im.src=imageSource;c.imSource=imageSource;
 c.im.hidden=!!walk;c.sprite.hidden=!walk;
 c.el.classList?.toggle('viewer-avatar',false);
 c.el.setAttribute('aria-label',c.petName?c.petName+'，本场专属宠物':custom.cowName(kind)+'，拖到小窝送回');
 setCowSize(c);applyWalkSource(c);
 if(typeof PetAccessories!=='undefined')PetAccessories.sync(c,custom,typeof ASSETS==='undefined'?null:ASSETS);
 canvasLook(c);
}
function ballBurst(x,y,box=false){if(reduced())return;const burst=document.createElement('div');burst.className='seal-ball-burst';burst.style.left=x+'px';burst.style.top=y+'px';for(let i=0;i<8;i++){const star=document.createElement('span');star.textContent=i%2?'✦':'✧';star.style.setProperty('--angle',i*45+'deg');burst.append(star);}$('field').append(burst);setTimeout(()=>burst.remove(),750);if(box)for(let i=0;i<14;i++){const shard=document.createElement('span');shard.className='box-fragment';shard.style.left=x+'px';shard.style.top=y+'px';shard.style.background=['#d8eddf','#f2d594','#f4cdd8'][i%3];$('field').append(shard);const angle=i*Math.PI*2/14,target={x:x+Math.cos(angle)*130,y:y+130+Math.sin(angle)*35},flight=PetBoxMotion.petFlight({x,y},target,i*63),frames=[];for(let k=0;k<=24;k++){const p=PetBoxMotion.stepPet(flight,k?flight.duration/24:0);frames.push({offset:k/24,transform:`translate(${p.x-x}px,${p.y-y}px) rotate(${k*15*(i%2?1:-1)}deg)`,opacity:1-k/24});}if(typeof shard.animate==='function')shard.animate(frames,{duration:flight.duration*1000,fill:'forwards',easing:'linear'});setTimeout(()=>shard.remove(),flight.duration*1000+50);}}
function finishBallSpawn(record){if(record.done)return;record.done=true;clearTimeout(record.timer);record.ball?.remove();record.shadow?.remove();ballVisuals.delete(record);if(record.started)activeBallThrows=Math.max(0,activeBallThrows-1);const c=record.c;if(!c.dead&&cows.includes(c)&&c.el.isConnected){c.ballEmerging=false;c.held=false;c.airborne=false;c.vy=0;c.y=c.targetY;c.el.style.opacity='1';c.el.style.visibility='visible';c.el.style.pointerEvents='auto';c.el.tabIndex=0;confineCow(c);renderCow(c);petEffect(c,'seal-ball-reveal',650);ballBurst(c.x,c.y);if(Date.now()-lastBallPop>340){lastBallPop=Date.now();sound('ballpop');}}pumpBallSpawns();}
function updateBallFlight(record,dt){if(record.done||!record.physics)return;const p=C.stepBall(record.physics,dt,record.c.targetY),dimension=record.dimension,sx=1+(p.squash||0),sy=1-(p.squash||0);record.elapsed+=Math.max(0,dt);record.ball.style.transform=`translate(${p.x-dimension/2}px,${p.y-dimension/2}px) rotate(${p.angle}deg) scale(${sx},${sy})`;record.ball.dataset.bounces=String(p.bounces);record.ball.dataset.phase=p.done?'settled':p.bounces?'bouncing':'throwing';if(record.shadow){const altitude=Math.max(0,record.c.targetY-p.y),spread=Math.max(.55,1-altitude/500);record.shadow.style.transform=`translate(${p.x-dimension*.42}px,${record.c.targetY+dimension*.34}px) scale(${spread})`;record.shadow.style.opacity=String(Math.max(.08,.34-altitude/900));}if(p.done||record.elapsed>3.5)finishBallSpawn(record);}
function pumpBallSpawns(){while(activeBallThrows<24&&ballQueue.length){const record=ballQueue.shift(),c=record.c;if(record.done||c.dead||!cows.includes(c)||!c.el.isConnected)continue;record.started=true;activeBallThrows++;const asset=custom.randomBall(),dimension=custom.cfg.ballSize*(typeof layout==='undefined'?1:layout?.metrics.stageScale||1),flight=document.createElement('div');flight.className='seal-ball-flight';flight.style.width=dimension+'px';flight.style.height=dimension+'px';flight.setAttribute('aria-label',asset.name+'投向场内');const image=document.createElement('img');image.src=asset.src;image.alt='';image.draggable=false;flight.append(image);$('field').append(flight);record.ball=flight;record.dimension=dimension;ballVisuals.add(record);const path=C.ballPath(c.id%4,c.x,c.targetY,W,H,Math.random());if(reduced()){flight.style.transform=`translate(${path.endX-dimension/2}px,${path.endY-dimension/2}px)`;record.timer=setTimeout(()=>finishBallSpawn(record),180);continue;}const duration=.9+Math.random()*.18,gravity=1300,dx=path.endX-path.startX,dy=path.endY-path.startY;record.physics={x:path.startX,y:path.startY,vx:dx/duration,vy:(dy-gravity*duration*duration/2)/duration,angle:-70,angularVelocity:(dx>=0?1:-1)*(720+Math.random()*320),bounces:0,done:false,squash:0};record.elapsed=0;const shadow=document.createElement('div');shadow.className='seal-ball-shadow';shadow.style.width=dimension*.84+'px';shadow.style.height=dimension*.17+'px';$('field').append(shadow);record.shadow=shadow;updateBallFlight(record,0);}}
function queueBallSpawn(c){c.ballEmerging=true;c.held=false;c.airborne=false;c.vy=0;c.y=c.targetY;c.el.style.opacity='0';c.el.style.visibility='hidden';c.el.style.pointerEvents='none';c.el.tabIndex=-1;renderCow(c);ballQueue.push({c,done:false,started:false,ball:null,shadow:null,physics:null,timer:null});pumpBallSpawns();}
function cancelBallSpawns(){for(const r of ballQueue){r.done=true;clearTimeout(r.timer);}ballQueue=[];for(const r of ballVisuals){r.done=true;clearTimeout(r.timer);r.ball?.remove();r.shadow?.remove();}ballVisuals.clear();activeBallThrows=0;}
function cancelBallActor(c){const cancel=r=>{r.done=true;clearTimeout(r.timer);r.ball?.remove();r.shadow?.remove();if(r.started)activeBallThrows=Math.max(0,activeBallThrows-1);};ballQueue=ballQueue.filter(r=>{if(r.c!==c)return true;cancel(r);return false;});for(const r of [...ballVisuals])if(r.c===c){cancel(r);ballVisuals.delete(r);}c.ballEmerging=false;}
function rebalanceScene(sync=true){if(!population)return;const plan=population.rebalance(sync);for(const c of plan.parked){if(typeof flightParticles!=='undefined')flightParticles?.remove(c);cancelBallActor(c);windFlights.delete(c);c.windAnimation?.cancel();c.dead=true;c.held=false;c.el.remove();}cows=plan.kept;if(plan.parked.length)pumpBallSpawns();}
function makeCow(saved,grounded=false,kindOverride,resident=null){const requested=saved?.kind??kindOverride,known=custom.hasCowKind(requested)||Number.isInteger(requested)&&requested>=100&&requested<=1999999,kind=known?requested:saved?0:custom.randomCow(),el=document.createElement('button');el.className='calf';el.setAttribute('aria-label',custom.cowName(kind)+'，拖到小窝送回');const im=document.createElement('img');im.alt='';im.draggable=false;const sprite=document.createElement('span');sprite.className='walk-sprite';el.append(im,sprite);$('field').append(el);const c={id:++nextId,el,im,sprite,kind,x:saved?saved.x*W:W*(.065+Math.random()*.55),y:saved?saved.y*H:-100-Math.random()*350,vx:(Math.random()-.5)*35,vy:0,targetY:H*(.66+Math.random()*.15),angle:(Math.random()-.5)*18,held:false,dead:false,airborne:!grounded&&!saved,facing:1,animClock:Math.random()*4,swimClock:Math.random(),flyClock:Math.random(),userAnimTime:Math.random()*2,windAttempt:saved?.windAttempt,individualScale:C.validIndividualScale(saved?.individualScale)?saved.individualScale:100,residentId:resident?.id,petName:resident?.name};(resident?residentCows:cows).push(c);cowVisual(c);const landing=PetRoamGeometry.point(roamRect(),c.size,Math.random);if(!saved)c.x=landing.x;c.targetY=landing.y;if(grounded||(c.aquatic||c.flying)&&!saved)c.y=c.targetY;if(c.aquatic||c.flying){c.airborne=false;c.vx=0;c.vy=0;if(c.aquatic&&!saved&&!grounded){if(typeof petEffect==='function')petEffect(c,'aquatic-arrival',750);else{el.classList.add('aquatic-arrival');setTimeout(()=>el.classList.remove('aquatic-arrival'),750);}}}confineCow(c);el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();controls?.open(c);});el.dataset.id=c.id;renderCow(c);if(!saved&&!grounded&&custom.cfg.ballMode)queueBallSpawn(c);return c;}
function replenish(grounded=false){let created;try{rebalanceScene(false);created=population?.drain(grounded)||[];}catch(error){population?.sync();throw error;}updateHUD();return created;}
function sequenceFrame(c){const frames=Math.max(2,c.walkFrames||2),durations=c.walkDurations;if(Array.isArray(durations)&&durations.length===frames){const total=durations.reduce((sum,n)=>sum+n,0);if(total>0){let t=(c.userAnimTime||0)*1000%total;for(let i=0;i<frames;i++){if(t<durations[i])return i;t-=durations[i];}}}return Math.floor((c.userAnimTime||0)*(c.walkFps||8))%frames;}
// 整像素定位：萌宠层带投影滤镜，停在半像素上会被合成器二次采样而发糊；抓起放大改在内层绘制
function snapPx(v){const r=globalThis.devicePixelRatio||1;return Math.round(v*r)/r;}
function setVisualStyle(el,key,value){const cache=el._petVisualStyles??(el._petVisualStyles=Object.create(null)),entry=cache[key]??(cache[key]={});if(entry.input===value&&el.style[key]===entry.actual)return;el.style[key]=value;entry.input=value;entry.actual=el.style[key];}
// Data attributes are only written here, so the last written value is kept in JS instead of read back per frame.
function setVisualData(el,key,value){const cache=el._petVisualData??(el._petVisualData=Object.create(null)),text=String(value);if(cache[key]===text)return;el.dataset[key]=value;cache[key]=text;}
function renderCow(c,motionReduced=reduced()){
 if(c.dead||c.el.isConnected===false){if(c.residentId)controls?.removeNameplate(c);return;}
 const hop=!c.held&&!c.airborne&&!motionReduced,lift=hop?(c.hopLift||0):0;
 const scaleX=hop&&!c.articulated?(c.hopScaleX||1):1,scaleY=hop&&!c.articulated?(c.hopScaleY||1):1;
 const tilt=c.held||c.articulated&&!c.flying||c.flying&&!hop?0:c.motionTilt||0;
 // With the canvas layer active, pets whose bitmaps are baked are drawn there (pet-canvas.js) and their button hides.
 const layer=typeof petCanvas!=='undefined'?petCanvas:null,onCanvas=!!layer&&canvasReady(c);
 const frames=Math.max(2,c.walkFrames||4),sequence=c.walkMode==='sequence'||c.walkMode==='default'&&c.walkFps>0;
 const rawFrame=c.spriteMotion?(hop?(c.hopFrame||0):0):sequence&&!c.held&&!motionReduced?sequenceFrame(c):sequence?0:hop?(c.hopFrame||0):0;
 let frame=Math.max(0,Math.min(frames-1,rawFrame));
 // tick installs renderCow.gate: a per-animation-frame budget of sprite frame changes (see FRAME_CHANGE_BUDGET).
 // Canvas pets change frames without DOM work, so they never spend or wait for it.
 const gate=renderCow.gate;if(gate&&!onCanvas&&c.walkSrc&&frame!==c.shownFrame&&c.shownFrame!==undefined&&!c.held){if(gate.budget>0)gate.budget--;else{frame=Math.min(frames-1,c.shownFrame);gate.starved=true;}}
 c.shownFrame=frame;
 const offset=hop&&c.motionStage!=='rest'&&c.spriteMotion?c.spriteMotion.offsetY[frame]*c.size/c.spriteMotion.frameWidth:0;
 const tx=snapPx(c.x-c.size/2),ty=snapPx(c.y+lift+offset-c.size/2),rot=(c.held||!c.airborne?0:c.angle)+tilt;
 if(!onCanvas){if(c.onCanvas)leaveCanvas(c);setVisualStyle(c.el,'transform',`translate(${tx}px,${ty}px) rotate(${rot}deg)`);}
 const grip=c.held?1.12:1,poseX=(c.facing||1)*(c.sourceFacing||1)*scaleX*grip,poseY=scaleY*grip;
 if(onCanvas){canvasPose(c,tx,ty,rot,poseX,poseY,frame,!hop||c.motionStage==='rest');if(c.residentId)controls?.syncNameplate(c,{w:W,h:H,lift});return;}
 const pivot=c.spriteMotion?.pivot,origin=pivot?`${pivot[0]/c.spriteMotion.frameWidth*100}% ${pivot[1]/c.spriteMotion.frameWidth*100}%`:'';
 setVisualStyle(c.sprite,'transformOrigin',origin);setVisualStyle(c.im,'transformOrigin',origin);
 if(c.articulated){const standing=!hop||c.motionStage==='rest';if(c.im.hidden!==!standing)c.im.hidden=!standing;if(c.sprite.hidden!==standing)c.sprite.hidden=standing;}
 if(c.frameClasses)setFrameClass(c.sprite,c.frameClasses[Math.min(frame,c.frameClasses.length-1)]);
 else setVisualStyle(c.sprite,'backgroundPosition',(frame/(frames-1)*100)+'% 0');
 const pose=`scale(${poseX},${poseY})`;
 setVisualStyle(c.sprite,'transform',pose);setVisualStyle(c.im,'transform',pose);setVisualData(c.el,'frame',frame);setVisualData(c.el,'walking',String(!!c.walking));setVisualData(c.el,'hop',c.hopStage||'rest');setVisualData(c.el,'motion',c.motionMode||'squish');setVisualData(c.el,'lift',lift.toFixed(1));
 if(c.accessory&&typeof PetAccessories!=='undefined')PetAccessories.render(c,{frame,standing:!hop||c.motionStage==='rest',pose,framesFor:c.frameClasses?accessoryFrames:null});
 if(c.accessory)setVisualStyle(c.accessory,'transformOrigin',origin||'50% 91%');
 if(c.residentId)controls?.syncNameplate(c,{w:W,h:H,lift});
}

function penRect(){const b=$('pen').getBoundingClientRect();return{x:b.left+b.width*.16,y:b.top+b.height*.40,w:b.width*.72,h:b.height*.55};}
function inPen(x,y){return penShape.contains(x,y);}
function particles(x,y,n){if(reduced())return;for(let i=0;i<Math.min(n+3,10);i++){const p=document.createElement('span');p.className='spark';p.textContent=i===0?'+'+n:custom?.cfg.theme==='aquarium'?'○':i%2?'✦':'♡';p.style.left=x+'px';p.style.top=y+'px';p.style.setProperty('--dx',(Math.random()-.5)*140+'px');document.body.append(p);setTimeout(()=>p.remove(),700);}}
function collectCows(list,silent=false){list=list.filter(c=>!c.dead&&!c.residentId&&cows.includes(c));if(!list.length)return 0;const n=C.collect(state,list.length,Date.now(),list.map(c=>c.kind)),b=penRect();queueBlocked=false;const homing=list.slice(0,n);if(homing.some(c=>c.onCanvas)){for(const c of homing)petToDom(c);void $('field').offsetWidth;}for(const c of homing){if(typeof flightParticles!=='undefined')flightParticles?.remove(c);c.dead=true;c.held=false;c.el.disabled=true;c.el.tabIndex=-1;c.el.classList.add('returning');c.el.style.transform=`translate(${b.x+b.w/2-c.size/2}px,${b.y+b.h*.65-c.size/2}px) scale(.15)`;setTimeout(()=>c.el.remove(),450);}cows=cows.filter(c=>!c.dead);replenish();save();if(!silent)sound('home');particles(b.x+b.w/2,b.y+b.h*.4,n);$('pen').classList.remove('pulse');void $('pen').offsetWidth;$('pen').classList.add('pulse');updateHUD();return n;}
function cancelWindFlights(){for(const c of windFlights){c.windActive=false;c.windAnimation?.cancel();c.el.remove();}windFlights.clear();}
function refreshThemeEffects(){if(document.body.dataset.theme===custom.cfg.theme)return;if(typeof flightParticles!=='undefined')flightParticles?.clear();cancelWindFlights();for(const el of document.querySelectorAll('.calf.returning,.fx-clear-ghost'))el.remove();}
function windCollect(c,x,y){if(!c||c.residentId||!cows.includes(c)||c.dead||c.held||c.windActive||state.outside<=0)return 0;const sy=c.y+(c.hopLift||0),n=C.collect(state,1,Date.now(),[c.kind]);if(!n)return 0;queueBlocked=false;if(c.onCanvas)petToDom(c);if(typeof flightParticles!=='undefined')flightParticles?.remove(c);c.dead=true;c.windActive=true;c.held=true;C.resetHop(c);c.el.disabled=true;c.el.tabIndex=-1;c.el.style.pointerEvents='none';c.el.classList.add('wind-swept');cows=cows.filter(other=>other!==c);windFlights.add(c);replenish();save();updateHUD();const b=penRect(),px=b.x+b.w/2,py=b.y+b.h*.65;const finish=()=>{if(!windFlights.has(c))return;windFlights.delete(c);c.windActive=false;c.el.remove();particles(px,py,1);$('pen').classList.remove('pulse');void $('pen').offsetWidth;$('pen').classList.add('pulse');};if(reduced()||typeof c.el.animate!=='function'){finish();return 1;}const frames=PetTornado.captureFrames({x:c.x,y:sy},{x,y},{x:px,y:py},c.size);c.windAnimation=c.el.animate(frames,{duration:1600,easing:'linear',fill:'forwards'});c.windAnimation.onfinish=finish;return 1;}
function sweepCollect(list){list=list.filter(c=>!c.residentId&&cows.includes(c)&&!c.dead&&!c.held&&!c.windActive&&!c.ballEmerging);if(!list.length)return 0;const n=C.collect(state,list.length,Date.now(),list.map(c=>c.kind));if(!n)return 0;queueBlocked=false;const selected=list.slice(0,n),chosen=new Set(selected),b=penRect(),px=b.x+b.w/2,py=b.y+b.h*.65;cows=cows.filter(c=>!chosen.has(c));for(let i=0;i<selected.length;i++){const c=selected[i],sy=c.y+(c.hopLift||0);if(c.onCanvas&&i<36&&!reduced())petToDom(c);if(typeof flightParticles!=='undefined')flightParticles?.remove(c);c.dead=true;c.held=true;c.windActive=true;C.resetHop(c);c.el.disabled=true;c.el.tabIndex=-1;c.el.style.pointerEvents='none';c.el.classList.add('sweep-swept');if(i>=36||reduced()||typeof c.el.animate!=='function'){c.el.remove();continue;}windFlights.add(c);const at=(x,y,scale,deg)=>`translate(${x-c.size/2}px,${y-c.size/2}px) scale(${scale}) rotate(${deg}deg)`;const frames=[{offset:0,transform:at(c.x,sy,1,0),opacity:1},{offset:.35,transform:at(c.x+(px-c.x)*.42,Math.min(sy,py)-55,.92,-18),opacity:1},{offset:.7,transform:at(c.x+(px-c.x)*.8,py-35,.6,16),opacity:1},{offset:1,transform:at(px,py,.12,0),opacity:.7}];c.windAnimation=c.el.animate(frames,{duration:850,delay:Math.min(i,20)*20,easing:'ease-in',fill:'forwards'});c.windAnimation.onfinish=()=>{if(!windFlights.has(c))return;windFlights.delete(c);c.windActive=false;c.el.remove();if(i===0){particles(px,py,Math.min(n,10));$('pen').classList.remove('pulse');void $('pen').offsetWidth;$('pen').classList.add('pulse');}};}replenish();save();updateHUD();return n;}
function launchFromPen(before,kinds){const created=Array.isArray(kinds)?population.admitNew(kinds.length,i=>makeCow(null,true,kinds[i])):replenish(true);if(Array.isArray(kinds))state.pendingKinds.splice(Math.max(0,state.pendingKinds.length-kinds.length),created.length);population.sync();const b=penRect();for(const c of created){if(before.has(c.id))continue;c.x=b.x+b.w/2+(Math.random()-.5)*40;c.y=b.y+b.h*.6;c.vx=(Math.random()-.5)*450;c.vy=-450-Math.random()*160;c.airborne=!(c.aquatic||c.flying);c.walking=false;c.angle=(Math.random()-.5)*60;if(c.aquatic||c.flying){c.y=c.targetY;c.vx=0;c.vy=0;confineCow(c);}renderCow(c);}updateHUD();}
function releaseDrag(cancel=false){if(!drag)return;const d=drag;drag=null;for(const c of d.list){c.held=false;c.airborne=!(c.aquatic||c.flying);c.el.classList.remove('held');c.vy=0;if(c.flying){c.vx=0;c.targetY=c.y;}else c.targetY=H*(.67+Math.random()*.15);confineCow(c);renderCow(c);}if(!cancel&&inPen(d.x,d.y)&&d.list.some(c=>!c.residentId))collectCows(d.list);else{replenish();save();}$('pen').classList.remove('over');try{$('field').releasePointerCapture(d.id);}catch{}}
$('field').addEventListener('pointerdown',e=>{
 const btn=e.target.closest('.calf');if(drag||hud?.dragging||e.button!==0||e.isPrimary===false)return;
 const primary=btn?allActors().find(c=>c.id===Number(btn.dataset.id)):typeof petCanvas!=='undefined'&&petCanvas&&e.target===e.currentTarget?petCanvas.hitTest(e.clientX,e.clientY):null;if(btn&&!primary)return;if(primary&&!btn)e.petHit=primary;
 const nearby=primary?.residentId?[primary]:effects?effects.pickForDrag(primary,e.clientX,e.clientY):primary?C.pickOne(cows,primary.id):[];
 if(!nearby.length)return;e.preventDefault();unlockAudio();
 drag={id:e.pointerId,list:nearby,x:e.clientX,y:e.clientY};
 for(const o of nearby){if(typeof flightParticles!=='undefined')flightParticles?.remove(o);o.boxFlight=null;o.y+=o.hopLift||0;C.resetHop(o);if(o.flying)o.motionTilt=0;o.dx=o.x-e.clientX;o.dy=o.y-e.clientY;o.held=true;o.el.classList.add('held');renderCow(o);}
 try{$('field').setPointerCapture(e.pointerId);}catch{}sound('grab');
});
$('field').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.x=e.clientX;drag.y=e.clientY;for(const c of drag.list){c.x=e.clientX+c.dx;c.y=e.clientY+c.dy;renderCow(c);}$('pen').classList.toggle('over',inPen(drag.x,drag.y));});
$('field').addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)releaseDrag();});$('field').addEventListener('pointercancel',()=>releaseDrag(true));window.addEventListener('blur',()=>releaseDrag(true));
function showPhase(phase,play=true){const r=state.current||previewRound;if(!r)return;const revealed=phase>=2;$('show').dataset.boxPhase=String(phase);$('box-art').src=ASSETS.blindBox?.[revealed?'open':'closed']||'';$('call').textContent=revealed?(r.boxName||'萌宠盲盒'):phase===1?'开启中':'萌宠盲盒';$('subtitle').textContent=previewRound&&!state.current?(revealed?'预览 · '+r.count+' 只':'预览'):revealed?(r.success?r.count+' 只萌宠':'本轮没有出宠'):'';$('show').classList.toggle('playing',true);custom.applyLayout(true);if(r.boxFall)boxDisplay?.render(r);for(const[id,maxFont]of [['call',22],['subtitle',17]]){const label=$(id);label.style.fontSize=maxFont+'px';if(label.clientHeight)for(let font=maxFont;font>8&&(label.scrollHeight>label.clientHeight||label.clientWidth>0&&label.scrollWidth>label.clientWidth);font--)label.style.fontSize=(font-1)+'px';}if(play&&(phase===0||revealed&&!r.revealCuePlayed))boxCue(revealed?'boxreveal':'boxopen');if(revealed)r.revealCuePlayed=true;}
function chooseCast(){return['castA','castB'].map(k=>custom.hasCowKind(custom.cfg[k])?custom.cfg[k]:custom.randomCow());}
function setCast(cast){for(const [i,id]of ['mascot-a','mascot-b'].entries()){const logical=cast[i]??0,kind=custom.resolveDisplayKind?.(logical,i)??logical;$(id).src=custom.cowSource(kind);$(id).alt=custom.cowName(kind);}}
function boxSize(){return Math.max(1,Math.min(custom.cfg.showWidth*(typeof layout==='undefined'?1:layout?.metrics.stageScale||1),W*.72,H*.5,Math.max(1,(H-102)*1.15)));}
function boxCenter(){return custom?.showDestination?.(boxSize(),boxSize()/1.15+86)||{x:W/2,y:H/2};}
function initBoxFlight(r){boxDisplay.prepare(r);}
function stepBoxPet(c,dt){const p=PetBoxMotion.stepPet(c.boxFlight,dt,reduced());c.x=p.x;c.y=p.y;if(p.done){c.boxFlight=null;c.airborne=false;c.vx=0;c.vy=0;c.y=c.targetY;confineCow(c);}}
function burstBoxPets(r,preview){const origin=typeof boxCenter==='function'?boxCenter():{x:W/2,y:H/2};if(preview){if(!reduced()&&prefs.chantAnimation)ballBurst(origin.x,origin.y,true);return;}if(state.current!==r||r.applied)return;const pendingStart=state.pendingKinds.length,added=C.resolve(state),tagged=added>0&&state.pendingKinds.length-pendingStart>=added,created=population.admitNew(added,i=>makeCow(null,true,tagged?state.pendingKinds[pendingStart+i]:undefined));if(tagged)state.pendingKinds.splice(pendingStart,created.length);population.sync();for(const c of created){C.resetHop(c);const target=PetRoamGeometry.point(roamRect(),c.size,Math.random);c.targetY=target.y;if(reduced()||!prefs.chantAnimation){c.x=target.x;c.y=target.y;continue;}c.boxFlight=PetBoxMotion.petFlight({x:origin.x,y:origin.y},target,c.id);c.x=origin.x;c.y=origin.y;c.airborne=true;c.vx=0;c.vy=0;renderCow(c);}if(added&&!reduced()&&prefs.chantAnimation)ballBurst(origin.x,origin.y,true);save();updateHUD();}
function requestBoundBox(n,avatarKind,tier){if(!ready)return 0;unlockAudio();previewRound=null;queueBlocked=false;const actual=C.enqueueBox(state,n,avatarKind,tier,PetBlindBox);if(actual<n)toast('待开盒队列已满，本次未全部加入');save();if(!state.current)begin();updateHUD();return actual;}
function begin(forcedId){if(!ready||state.current)return;previewRound=null;if(!C.startBox(state,Math.random,custom.cfg.boxTiers,forcedId,PetBlindBox)){auto=false;queueBlocked=true;$('show').classList.remove('playing');custom.applyLayout(false);$('auto').textContent='连续开盒';$('auto').setAttribute('aria-pressed','false');toast('剩余容量不足或没有可用档位，先送一些萌宠回家');return;}initBoxFlight(state.current);state.current.cast=chooseCast();setCast(state.current.cast);roundStart=performance.now();save();showPhase(0);updateHUD();}
function preview(tierId){if(!ready)return;if(state.current||state.queue){toast('先等当前盒和队列结束，再预览');return;}unlockAudio();custom.stopPlacing();if(tierId){begin(tierId);closeSettings();return;}const tier=PetBlindBox.choose(custom.cfg.boxTiers,100000,null,Math.random);if(!tier){toast('请先应用有效的盲盒档位');return;}previewVisual=true;previewRound={count:tier.count,tierId:tier.id,boxName:tier.name,presentation:'blindbox',success:true,phase:0,times:[...C.BOX_TIMES],cast:chooseCast()};initBoxFlight(previewRound);previewStart=performance.now();setCast(previewRound.cast);closeSettings();showPhase(0); }
function requestRound(n=1,avatarKind=0){if(!ready){toast('素材正在加载，请稍后');return 0;}unlockAudio();previewRound=null;queueBlocked=false;const actual=C.enqueue(state,n,avatarKind);if(actual<n)toast('待开盒队列已满，本次未全部加入');save();if(!state.current)begin();updateHUD();return actual;}
function toggleAuto(){unlockAudio();auto=!auto;$('auto').textContent=auto?'暂停开盒':'连续开盒';$('auto').setAttribute('aria-pressed',String(auto));if(auto&&!state.current)requestRound();}
function tick(now){const dt=Math.min(.035,(now-(tick.last||now))/1000);tick.last=now;population?.beginFrame();const cfg=custom.cfg,pr=$('pen').getBoundingClientRect(),motionReduced=reduced(),actors=allActors(),bounds=roamRect();const roaming={enabled:cfg.wander&&!motionReduced,animate:!motionReduced,speed:cfg.runSpeed,bounds,obstacle:{x:pr.left+pr.width*.08,y:pr.top+pr.height*.25,w:pr.width*.84,h:pr.height*.73}};
 // Resume next frame from the first pet whose sprite frame had to wait, so no pet stalls under the budget.
 const len=actors.length,start=len?(tick.cursor||0)%len:0,gate=renderCow.gate={budget:FRAME_CHANGE_BUDGET,starved:false};let resume=-1;
 try{for(let n=0;n<len;n++){const i=(start+n)%len;gate.starved=false;stepActor(actors[i],dt,roaming,bounds,motionReduced);if(gate.starved&&resume<0)resume=i;}}finally{renderCow.gate=null;}
 tick.cursor=resume<0?start:resume;
 for(const record of [...ballVisuals])updateBallFlight(record,dt);if(typeof flightParticles!=='undefined')flightParticles?.step(actors.filter(c=>c.particleStyle),dt,!motionReduced);
 effects?.update(Date.now());drainLikes();const r=state.current||previewRound;if(r?.boxFall){if(boxDisplay.step(r,dt,!state.current)){if(state.current){C.resolve(state);C.finish(state);save();}previewRound=null;voicePlayer?.pause();$('show').classList.remove('playing');custom.applyLayout(false);nextAuto=now+prefs.interval*1000;updateHUD();}}else if(r){const phase=C.phaseAt(now-(state.current?roundStart:previewStart),r.times);if(phase>r.phase&&phase<4){r.phase=phase;showPhase(phase);if(state.current&&phase>=2){C.resolve(state);replenish();}if(state.current)save();}if(phase>=4){if(state.current){C.resolve(state);replenish();C.finish(state);save();}previewRound=null;voicePlayer?.pause();beatPlayer?.pause();$('show').classList.remove('playing');custom.applyLayout(false);nextAuto=now+prefs.interval*1000;updateHUD();}}else if(state.queue>0&&!queueBlocked)begin();else if(auto&&now>=nextAuto)requestRound();if(population&&cows.length<state.outside&&(!prefs.sceneLimitEnabled||cows.length<prefs.sceneLimit))replenish();if(typeof petCanvas!=='undefined'&&petCanvas)petCanvas.draw(allActors(),now,motionReduced);scheduleFrame();}
// Hundreds of walking pets would otherwise submit hundreds of sprite frame changes (repaint + image work) per frame.
const FRAME_CHANGE_BUDGET=120;
function stepActor(c,dt,roaming,bounds,motionReduced){if(c.windActive||c.ballEmerging)return;if(c.boxFlight&&!c.held){stepBoxPet(c,dt);renderCow(c,motionReduced);return;}if((c.walkMode==='sequence'||c.walkMode==='default'&&c.walkFps>0)&&!c.held&&!motionReduced)c.userAnimTime=(c.userAnimTime||0)+dt;if(c.held){if(c.spriteMotion){c.spriteDistance=0;c.spriteFinish=null;c.spriteSettle=false;c.spriteHopState='rest';c.spriteHopElapsed=0;c.spriteHopWait=0;}c.walking=false;renderCow(c,motionReduced);return;}if(c.airborne){C.resetHop(c);c.vy+=760*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;if(c.y>=c.targetY&&c.vy>=0){c.y=c.targetY;c.vy=-c.vy*.28;c.vx*=.5;if(Math.abs(c.vy)<28){c.vy=0;c.airborne=false;}}c.x=Math.max(c.size/2,Math.min(W-c.size/2,c.x));}else PetMotion.step(c,dt,{...roaming,radius:c.size*.7+1,size:c.size},c.motionMode||'squish',C);confineCow(c,bounds,motionReduced);renderCow(c,motionReduced);}
function scheduleFrame(){const epoch=runEpoch;raf=requestAnimationFrame(now=>{if(epoch===runEpoch)tick(now);});}
function openSettings(){controls?.close();releaseDrag(true);applyPrefs(true);$('shade').classList.add('open');testToolbar.setMenuOpen(true);$('close').focus();}
function closeSettings(){$('shade').classList.remove('open');testToolbar.setMenuOpen(false);hud?.stopPreview();custom?.stopPlacing();custom?.player?.pause();effects?.closePreview();$('settings-btn').focus();}
$('settings-btn').onclick=openSettings;$('close').onclick=closeSettings;$('shade').addEventListener('pointerdown',e=>{if(e.target===$('shade'))closeSettings();});
document.addEventListener('dblclick',e=>{if(!e.target.closest('button,input,select,#settings,#pen,.float-hud,#roam-area,#roam-select')&&!(petCanvas&&e.target===$('field')&&petCanvas.hitTest(e.clientX,e.clientY)))openSettings();});
const SCENE_BUTTON_SELECTOR=['.calf','#start','#auto','#add-cows','[data-add-count]','.species-add-button','#collect-test','#reset','#end-session','#test-gift','#avatarTestGift','[data-box-action="test"]','[data-box-action="gift"]','[data-game-action]','#add-now','#recall-now','#grip-now','#tornado-now','#ban-now','#boom-now','#challenge-now','#double-now','#clear-now','#like-test','#stop-tornado','#preview-show','#preview-interactions','#preview-waiting','#reset-hud','#reset-layout','#reset-interactions-position','#pen-lock','#reset-roam-area','#draw-roam-area','#apply-scene-limit','#pet-size-save','#pet-name-save'].join(',');
function blockSceneButtonActivation(e){const button=e.target?.closest?.('button'),activation=['Enter',' ','Spacebar'].includes(e.key)||['Enter','NumpadEnter','Space'].includes(e.code),petMenu=button?.matches('.calf')&&(e.key==='ContextMenu'||e.code==='ContextMenu'||(e.key==='F10'||e.code==='F10')&&e.shiftKey);if(!button||(!activation&&!petMenu)||!button.matches(SCENE_BUTTON_SELECTOR))return;e.preventDefault();e.stopImmediatePropagation();}
document.addEventListener('keydown',blockSceneButtonActivation,true);document.addEventListener('keyup',blockSceneButtonActivation,true);
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.defaultPrevented||e.repeat||e.isComposing||e.ctrlKey||e.altKey||e.metaKey)return;roamArea?.cancel();releaseDrag(true);if($('shade').classList.contains('open'))closeSettings();});
document.addEventListener('keydown',e=>{if(e.key!=='Tab'||!$('shade').classList.contains('open'))return;const focus=[...$('settings').querySelectorAll('button,input,select'),...$('toolbar').querySelectorAll('button')].filter(el=>!el.disabled&&!el.closest('[hidden]')&&el.getClientRects().length);if(!focus.length)return;const current=focus.indexOf(document.activeElement),next=current<0?(e.shiftKey?focus.length-1:0):(current+(e.shiftKey?-1:1)+focus.length)%focus.length;e.preventDefault();focus[next].focus();});
for(const k of Object.keys(defaults)){if(k==='sceneLimitEnabled'||k==='sceneLimit')continue;const el=$(k);if(!el)continue;el.addEventListener('change',()=>{if(['miss','interval','size'].includes(k)){const n=Number(el.value),bounds={miss:[0,100],interval:[1,120],size:[30,300]}[k];if(el.value.trim()===''||!Number.isInteger(n)||n<bounds[0]||n>bounds[1]){$('form-error').textContent=`请输入 ${bounds[0]}–${bounds[1]} 的整数；未应用此值。`;el.value=prefs[k];return;}prefs[k]=n;}else prefs[k]=el.type==='checkbox'?el.checked:el.value.trim();$('form-error').textContent='';applyPrefs();savePrefs();if(k==='connect')updateChannel();if(k==='chantAnimation'&&!prefs.chantAnimation){previewVisual=false;custom?.stopPlacing();}if(k==='sound'&&!prefs.sound)beatPlayer?.pause();});}
$('sceneLimitEnabled').addEventListener('change',()=>{$('sceneLimit').disabled=!$('sceneLimitEnabled').checked;});
function applySceneLimit(){if(!ready){toast('素材正在加载，请稍后');return false;}const input=$('sceneLimit'),enabled=$('sceneLimitEnabled').checked,n=Number(input.value);if(enabled&&(!input.value.trim()||!Number.isInteger(n)||n<1||n>100000)){input.setAttribute('aria-invalid','true');$('scene-limit-error').textContent='请输入1–100000的整数；场内设置未改变。';return false;}prefs.sceneLimitEnabled=enabled;if(enabled)prefs.sceneLimit=n;input.removeAttribute('aria-invalid');$('scene-limit-error').textContent='';syncSceneLimitControls();replenish();savePrefs();save();toast(enabled?`场内最高数量已设为 ${n} 只，多余成员保留在候场`:'已取消场内数量限制，候场成员继续分批入场');return true;}
$('apply-scene-limit').onclick=applySceneLimit;
// Save valid typed values immediately; some embedded browser hosts do not emit change on blur.
for(const [k,min,max]of[['miss',0,100],['interval',1,120],['size',30,300]]){const input=$(k);if(!input)continue;input.addEventListener('input',()=>{const el=$(k),n=Number(el.value);if(!el.value.trim()||!Number.isInteger(n)||n<min||n>max){$('form-error').textContent=`请输入 ${min}–${max} 的整数；未应用此值。`;return;}prefs[k]=n;$('form-error').textContent='';if(k==='size')for(const c of allActors()){setCowSize(c);renderCow(c);}savePrefs();});}
$('gift').addEventListener('input',()=>{prefs.gift=$('gift').value.trim();savePrefs();});
function retireCowKind(kind){if(state.naming.residents.some(r=>r.kind===kind))return;for(const c of cows)if(c.kind===kind){c.kind=0;cowVisual(c);renderCow(c);}for(const p of state.positions||[])if(p.kind===kind)p.kind=0;state.pendingKinds=(state.pendingKinds||[]).map(k=>k===kind?0:k);population?.retireKind(kind);for(const p of state.recentHomes||[])if(p.kind===kind)p.kind=0;if(state.current?.cast)state.current.cast=state.current.cast.map(k=>k===kind?0:k);if(previewRound?.cast)previewRound.cast=previewRound.cast.map(k=>k===kind?0:k);save();}
function clearOutside(){if(typeof flightParticles!=='undefined')flightParticles?.clear();releaseDrag(true);cancelWindFlights();cancelBallSpawns();for(const c of cows)c.el.remove();cows=[];state.outside=0;state.positions=[];state.pendingKinds=[];population?.clear();state.current=null;state.queue=0;state.roundSources=[];previewRound=null;queueBlocked=false;auto=false;voicePlayer?.pause();beatPlayer?.pause();$('auto').textContent='连续开盒';$('auto').setAttribute('aria-pressed','false');$('show').classList.remove('playing');custom.applyLayout(false);save();updateHUD();}
function manualAddSpecies(kind,n){
 if(!ready){toast('素材正在加载，请稍后加萌宠');return 0;}
 if(!Number.isInteger(n)||n<1||n>10000){toast('请输入1–10000的整数，本次未添加');return 0;}
 if(!C.validAnimalKind(kind)||!custom.hasCowKind(kind)){toast('此品种已删除或不可用，未加入萌宠');return 0;}
 if(custom.cfg.theme==='yajiji'&&custom.cowCategory(kind)!=='yajiji'){toast('鸭吉吉主题只显示鸭吉吉，请先切换主题再添加此品种');return 0;}
 if(!custom.isBuiltin(kind)&&!custom.cowRecord(kind)){toast('此品种素材不可用，请先重新上传');return 0;}
 const actual=C.add(state,n);if(actual){state.pendingKinds??=[];for(let i=0;i<actual;i++)state.pendingKinds.push(kind);replenish();save();}
 const name=custom.cowName(kind,custom.galleryCategory),pending=Math.max(0,state.outside-cows.length);
 toast(actual===0?'在外总量已达安全容量，或当前盲盒已预留剩余空间，请先收回一些萌宠':`已加入 ${actual} 只${name}${actual<n?'（按剩余容量添加）':''}${pending?'，正在分批入场':''}`);return actual;
}
function manualAddCows(){const result=$('manual-add-result');if(!ready){result.textContent='素材正在加载，请稍后加萌宠';return;}const el=$('manual-add-count'),n=Number(el.value);if(!Number.isInteger(n)||n<1||n>10000){el.setAttribute('aria-invalid','true');result.textContent='请输入1–10000的整数，本次未添加。';return;}el.removeAttribute('aria-invalid');const actual=C.add(state,n);replenish();save();const message=actual===0?'在外总量已达上限，请先收回一些萌宠。':actual<n?`已添加 ${actual} 只萌宠（已按剩余容量添加）。`:`已添加 ${actual} 只萌宠。`;result.textContent=message;toast(message);}
$('open-add-menu').onclick=()=>{openSettings();custom.selectTab('add');$('manual-add-count').focus();};
for(const b of document.querySelectorAll('[data-add-count]'))b.onclick=()=>{$('manual-add-count').value=b.dataset.addCount;manualAddCows();};
$('toolbar-hide').onclick=()=>testToolbar.hide();$('start').onclick=()=>requestRound();$('auto').onclick=toggleAuto;$('add-cows').onclick=()=>manualAddCows();$('collect-test').onclick=()=>{if(!ready){toast('素材正在加载，请稍后');return;}if(cows[0])collectCows([cows[0]]);else toast('现在没有待回家的萌宠');};
$('reset').onclick=()=>{if(!ready){toast('素材正在加载，请稍后');return;}openSettings();custom.selectTab('named');$('end-session').click();$('end-session').focus();};
function saveGiftReceipt(){if(ready){save();return;}if(protectOld||!storageOkay)return;try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageOkay=false;warnStorage('礼物接收记录无法保存，本页会继续处理；刷新可能丢失未处理礼物。');}}
function drainGifts(){if(!ready)return;while(state.pendingGifts.length){const g=state.pendingGifts.shift(),wantsAvatar=custom.cfg.theme!=='yajiji'&&custom.cfg.avatarMode&&!!g.avatarUrl;const avatarKind=wantsAvatar&&['box','round','add','double'].includes(g.kind)?C.registerAvatar(state,g.avatarUrl,g.nickName,custom.randomCow()):0;if(g.kind==='box'||g.kind==='round'){const added=g.kind==='box'?requestBoundBox(g.count,avatarKind,g.box):requestRound(g.count,avatarKind);toast(`${g.name} · 已加入 ${added} 盒${added<g.count?'，超额未加入':''}${avatarKind?' · '+g.nickName+'头像出场':''}${wantsAvatar&&!avatarKind?' · 头像名额已满，改用动物':''}`);}else{effects.trigger(g.kind,g.value,g.count,avatarKind?{...g,avatarKind}:g);if(wantsAvatar&&!avatarKind&&['add','double'].includes(g.kind))toast('头像名额已满，本次改用所选动物');}save();}}
function avatarFromGift(data){const g=data?.gift||data?.data?.gift||data?.data||data||{},user=data?.user||data?.data?.user||g.user||{};const raw=data?.avatarUrl??data?.avatar??g.avatarUrl??g.avatar??user.avatarUrl??user.avatar??'';const name=String(data?.nickName??g.nickName??user.nickName??'观众').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40)||'观众';return{url:C.safeAvatarUrl(raw),name};}
function giftEvent(data){if(!data||typeof data!=='object')return;const g=data.gift||data.data?.gift||data.data||data,name=String(data.giftName||g.giftName||g.name||data.name||'').normalize('NFKC').trim(),tier=custom?.boxTierForGift?.(name),rule=tier?null:effects?.ruleFor(name);if(!tier&&!rule)return;const count=Number(data.count??data.giftCount??g.count??g.giftCount??1);if(!Number.isSafeInteger(count)||count<1||count>10000){toast('礼物数量无效，未加入队列');return;}const rawId=data.eventId??data.event_id??data.msgId,eid=rawId==null?null:String(rawId).slice(0,200),avatar=custom?.cfg.theme!=='yajiji'&&custom?.cfg.avatarMode?avatarFromGift(data):{url:'',name:''};let box;try{if(tier)box=PetBlindBox.snapshot(tier);}catch{toast('盲盒档位无效，请重新应用');return;}const accepted=C.receiveGift(state,{name,count,eid,kind:tier?'box':rule.kind,value:tier?1:effects.ruleValue(rule),...(box?{box}:{}),...(rule?.kind==='challenge'?{target:rule.target,penalty:rule.penalty}:{}),...(avatar.url?{avatarUrl:avatar.url,nickName:avatar.name}:{})});if(accepted==='full'){toast('初始化礼物队列已满，本次未接收');return;}if(accepted!=='accepted')return;saveGiftReceipt();drainGifts();}
function likeStatus(text){const el=$('like-source-status');if(el&&el.textContent!==text)el.textContent=text;}
function likeEvent(data,sourceHint='sdk'){
 if(!effects?.cfg.likeEnabled){likeStatus('已收到点赞消息，点赞加萌宠未启用');return;}
 if(!Likes){likeStatus('当前构建缺少点赞接收模块，次数未记入');return;}
 const result=Likes.receive(state,data,{sourceHint});
 if(!result.accepted){const messages={'missing-count':'收到点赞消息，但缺少真实次数／增量，未记入','invalid-count':'点赞增量无效或为 0，未记入','count-mode':'收到的是累计总赞，不作为新增次数记入',timestamp:'过期或时间异常的点赞未记入',duplicate:'重复点赞消息已过滤',capacity:'点赞累计已达到数据保护上限'};likeStatus(messages[result.reason]||'点赞数据格式异常，未记入');effects.likeStatus?.();return;}
 const source=data?.source??data?.data?.source??sourceHint,label=source==='baiyao'?'白曜':source==='songlan'?'菘蓝':source==='manual'?'手动测试':'宿主';
 likeStatus(`${label} · 新增 ${result.increment} 赞`);saveGiftReceipt();drainLikes();effects.likeStatus?.();
}
function drainLikes(){
 if(drainingLikes||!ready||!effects?.cfg.likeEnabled)return;
 const step=effects.cfg.likeStep,per=effects.cfg.likeAdd;
 if(!Number.isSafeInteger(step)||step<1||!Number.isSafeInteger(per)||per<1||C.cleanLikes(state.likes).carry<step)return;
 drainingLikes=true;
 try{if(effects.awardLikes(step,per)>0)save();}
 catch{saveGiftReceipt();likeStatus('点赞已记录，奖励显示异常，请检查素材');}
 finally{drainingLikes=false;}
}
function attachSDK(){if(sdk)return true;const host=typeof window.SonglanPlugin?.onGift==='function'?window.SonglanPlugin:window.BaiyaoPlugin;if(typeof host?.onGift!=='function')return false;try{host.onGift(giftEvent);if(typeof host.onLike==='function'){host.onLike(data=>likeEvent(data,'sdk'));likeStatus('SDK 已接入，等待真实点赞增量');}else likeStatus('当前 SDK 未提供点赞接口');sdk=true;clearTimeout(reconnectTimer);if(ws){const old=ws;ws=null;old.onclose=null;old.close();}$('connection').textContent='宿主 SDK 已接入';return true;}catch{return false;}}
function updateChannel(){
 if(attachSDK())return;clearTimeout(reconnectTimer);
 if(!prefs.connect){if(ws){const old=ws;ws=null;old.onclose=null;old.close();}$('connection').textContent='独立使用中';likeStatus('未接入点赞来源');return;}
 if(ws&&ws.readyState<2)return;
 try{
  const socket=new WebSocket('ws://localhost:9910');ws=socket;
  const current=()=>ws===socket&&prefs.connect&&!sdk;
  $('connection').textContent='正在连接菘蓝本地礼物转发…';
  socket.onopen=()=>{if(!current())return;try{socket.send(JSON.stringify({action:'identify',module:'抓萌宠通用版'}));}catch{}$('connection').textContent='菘蓝本地礼物转发已连接';likeStatus('本地转发已连接，等待真实点赞增量');};
  socket.onmessage=e=>{if(!current())return;try{const m=JSON.parse(e.data);if(String(m.type??m.msgType??m.method??'').toLowerCase().includes('like')){likeEvent(m,'ws');return;}if(String(m.type??m.msgType??m.method??'').toLowerCase().includes('gift')||String(m.type)==='2')giftEvent(m);}catch{}};
  socket.onclose=()=>{if(ws!==socket)return;ws=null;if(prefs.connect&&!sdk){$('connection').textContent='本地转发未连接，3 秒后重试';likeStatus('本地转发已断开，暂未收到点赞');reconnectTimer=setTimeout(updateChannel,3000);}};
  socket.onerror=()=>{if(current())socket.close();};
 }catch{$('connection').textContent='当前浏览器不允许此本地连接';likeStatus('点赞转发未连接');}
}
if($('test-gift'))$('test-gift').onclick=()=>{const tier=custom.cfg.boxTiers.find(t=>t.enabled&&t.gift);if(!tier){toast('先为盲盒档位绑定礼物');return;}giftEvent({giftName:tier.gift,count:1,eventId:'test-'+Date.now()});};
$('avatarTestGift').onclick=()=>{if(custom.cfg.theme==='yajiji'){toast('鸭吉吉主题只展示鸭吉吉');return;}if(!custom.cfg.avatarMode){toast('请先开启观众头像模式');return;}const tier=custom.cfg.boxTiers.find(t=>t.enabled&&t.gift);if(!tier){toast('请先为盲盒档位绑定礼物');return;}const entered=$('avatarTestUrl').value.trim(),avatarUrl=C.safeAvatarUrl(entered)||(!entered?ASSETS.demoAvatar:'');if(!avatarUrl){toast('测试头像链接须为 HTTP(S) 或合规图片数据');return;}giftEvent({giftName:tier.gift,count:1,eventId:'avatar-test-'+Date.now(),nickName:$('avatarTestName').value.trim()||'测试观众',avatarUrl});};
function syncLayoutStatus(){
 if(!layout)return;const m=layout.metrics,root=document.documentElement;root.style.setProperty('--stage-scale',m.stageScale);root.style.setProperty('--text-scale',m.textScale);document.body.dataset.stageSmall=String(m.stageScale<1);const label=m.orientation==='portrait'?'竖屏':'横屏',status=$('layout-status');if(status)status.textContent=`当前画面 ${W}×${H} · ${label}布局（横屏、竖屏的位置分别保存）`;
 for(const[id,text]of [['reset-layout','恢复默认位置'],['reset-interactions-position','恢复默认位置'],['reset-roam-area','恢复默认范围'],['reset-hud','重置统计与入场布局']])if($(id))$(id).textContent=text+'（当前：'+label+'）';
}
function applyViewportResize(){
 resizeRequest=0;releaseDrag(true);const oldW=W,oldH=H,oldBounds=custom?roamRect():null,changed=layout?.switchTo(innerWidth,innerHeight)||false;W=innerWidth;H=innerHeight;
 if(changed){layout.applyCustom(custom.cfg);layout.applyHud(hud.cfg);layout.applyPanel(effects.cfg);custom.syncControls();hud.sync();effects.syncInputs();}
 syncLayoutStatus();const nextBounds=custom?roamRect():null;
 for(const r of [...ballVisuals])finishBallSpawn(r);
 for(const c of allActors()){
  if(changed&&oldBounds&&nextBounds){const map=c.boxFlight?PetLayout.mapAirPoint:PetLayout.mapPoint,p=map(c,oldBounds,nextBounds),target=map({x:c.x,y:c.targetY},oldBounds,nextBounds);c.x=p.x;c.y=p.y;c.targetY=target.y;if(c.boxFlight)c.boxFlight=PetLayout.mapFlight(c.boxFlight,oldBounds,nextBounds);}
  else{c.x=c.x/oldW*W;c.y=c.y/oldH*H;c.targetY=c.targetY/oldH*H;if(c.boxFlight){for(const k of ['x0','targetX','vx'])c.boxFlight[k]*=W/oldW;for(const k of ['y0','targetY','vy','gravity'])c.boxFlight[k]*=H/oldH;}}
  setCowSize(c);renderCow(c);
 }
 custom?.applyLayout(!!state.current||!!previewRound);hud?.applyAll();roamArea?.render();if(controls){controls.measureRevision++;if(controls.actor){controls.positionPanel();controls.previewSize?.();}}effects?.placePanel();boxDisplay?.resize(state.current||previewRound);if(state.current||previewRound)showPhase((state.current||previewRound).phase,false);
}
window.addEventListener('resize',()=>{if(!layout){applyViewportResize();return;}if(!resizeRequest)resizeRequest=requestAnimationFrame(applyViewportResize);});
window.addEventListener('pagehide',save);setInterval(save,2500);setInterval(()=>{if(!sdk)attachSDK();},1500);
for(const el of document.querySelectorAll('#start,#auto,#add-cows,#collect-test,#reset,[data-add-count]'))el.disabled=true;
if(typeof PetLayout!=='undefined'){let storage;try{storage=localStorage;}catch{const memory=new Map();storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};}layout=new PetLayout.Store(storage,W,H,{toast});syncLayoutStatus();}
hud=new CowHud({layout,core:C,toast,theme:()=>custom?.cfg.theme||'cream',canDrag:()=>!drag});
const testToolbar=new PetTestToolbar({toolbar:$('toolbar'),body:document.body});
const audioMixer=new PetAudioMixer({onWarning:toast});audioMixer.mountMaster($('master-audio-controls'));
const penShape=new PetPenShape.HitRegion($('pen-img'),$('pen'),toast,reduced);
if(typeof PetFlightParticles!=='undefined'&&ASSETS.petParticles)try{flightParticles=new PetFlightParticles.Renderer({host:$('field'),sprites:ASSETS.petParticles,viewport:()=>({w:W,h:H})});}catch{}
if(typeof PetWalkFrames!=='undefined')try{walkFrames=new PetWalkFrames.Provider({onReady:refreshWalkFrames,wanted:walkFrameWanted});setInterval(pruneWalkFrames,20000);}catch{walkFrames=null;}
// Without the frame provider's workers there is nothing to bake, and without a GPU (software rendering) DOM pets are
// fastest; either way pets stay plain DOM, as in V1.0.35.
if(typeof PetCanvas!=='undefined'&&walkFrames?.enabled)try{petCanvas=PetCanvas.create({host:$('field'),document,viewport:()=>({w:W,h:H}),onRestored:restoreCanvas,onBroken:canvasBroken});if(!petCanvas?.active)petCanvas=null;}catch{petCanvas=null;}
// A GPU reset loses the baked bitmaps: pets show as DOM until they are baked again.
function restoreCanvas(){walkFrames?.drop(key=>/^[CSAT]/.test(key));for(const c of allActors()){c.cvAvatar=null;c.cvWalk=c.cvStill=c.cvAcc=c.cvAccStill=null;if(!c.dead)canvasLook(c);}}
function canvasBroken(atlas){atlas.broken=true;if(atlas.key){walkFrames?.drop(key=>key===atlas.key);petCanvas?.avatars.delete(atlas.key);}for(const c of allActors())if(!c.dead&&[c.cvWalk?.atlas,c.cvStill?.atlas,c.cvAcc?.atlas,c.cvAccStill?.atlas,c.cvAvatar].includes(atlas)){if(c.cvAvatar===atlas)c.cvAvatar=null;canvasLook(c);}}
if(petCanvas){
 $('field').addEventListener('contextmenu',e=>{if(e.target!==e.currentTarget)return;const c=petCanvas.hitTest(e.clientX,e.clientY);if(!c)return;e.preventDefault();e.stopPropagation();controls?.open(c);});
 document.addEventListener('pointermove',e=>{if(e.isPrimary===false)return;if(drag||e.target!==$('field'))petCanvas.setPointer(NaN,NaN);else petCanvas.setPointer(e.clientX,e.clientY);},true);
 document.addEventListener('pointerout',e=>{if(!e.relatedTarget)petCanvas.setPointer(NaN,NaN);});window.addEventListener('blur',()=>petCanvas.setPointer(NaN,NaN));
}
custom=new CowCustomizer({layout,themes:PetThemes,roster:PetRoster,blindBox:PetBlindBox,boxSettings:PetBoxSettings,onSoundPreview:key=>sound(key.replace('audio:',''),true),onGiftTest:data=>giftEvent({...data,eventId:'box-test-'+Date.now()}),onManualAdd:manualAddSpecies,audioMixer,penShape,assets:ASSETS,core:C,toast,onPreview:preview,onCowDeleted:retireCowKind,canDeleteCow:kind=>!state.naming.residents.some(r=>r.kind===kind)&&!(Array.isArray(state.naming.quarantine?.original?.residents)&&state.naming.quarantine.original.residents.some(r=>r?.kind===kind)),canManipulatePen:()=>!drag,canShowChant:()=>prefs.chantAnimation||!!previewRound&&previewVisual,onChange:()=>{if(!custom)return;refreshThemeEffects();PetThemes.apply(custom.cfg.theme);queueBlocked=false;for(const c of allActors()){cowVisual(c);renderCow(c);}roamArea?.render();setCast((state.current||previewRound)?.cast||[Math.max(0,custom.cfg.castA),custom.cfg.castB<0?1:custom.cfg.castB]);custom.applyLayout(!!state.current||!!previewRound);updateHUD();controls?.refresh();}});
controls=new PetControls({layout,isPet:e=>!!e.petHit||!!petCanvas&&e.target===$('field')&&!!petCanvas.hitTest(e.clientX,e.clientY),getNaming:()=>state.naming,getSessionId:()=>state.naming.sessionId,onSaveSize:saveIndividualSize,onPromote:promoteResident,onOpenResident:id=>{const c=residentCows.find(c=>c.residentId===id);if(!c)return false;if(!canEditPet(c)){toast('宠物尚未落定或正在抓持，请稍后修改');return false;}closeSettings();return controls.open(c);},onEditResident:editResident,onDeleteResident:deleteResident,onEndSession:endSession,toast,canEdit:canEditPet});
roamArea=new PetRoamArea({getDefault:()=>{const r=layout?.defaults.roam;return r?{roamLeft:r.left,roamRight:r.right,roamTop:r.top,roamBottom:r.bottom}:{roamLeft:3,roamRight:97,roamTop:35,roamBottom:84};},getBounds:()=>custom.cfg,onChange:bounds=>{Object.assign(custom.cfg,bounds);custom.syncControls();for(const c of allActors()){setCowSize(c);renderCow(c);}},onCommit:()=>custom.save(),onEditStart:closeSettings,canEdit:()=>!drag});
boxDisplay=new PetBoxDisplay({placement:(w,h)=>custom.showDestination(w,h),motion:PetBoxMotion,core:C,viewport:()=>({w:W,h:H}),size:boxSize,show:$('show'),art:$('box-art'),animate:()=>!reduced()&&prefs.chantAnimation,onPhase:(r,phase,play)=>showPhase(phase,play),onBurst:burstBoxPets});
population=new PetPopulationView({core:C,getState:()=>state,getCows:()=>cows,getLimit:()=>prefs.sceneLimitEnabled?prefs.sceneLimit:null,makeCow,snapshotCow: cowSnapshot,batchSize:64,reserve:()=>state.current&&!state.current.applied?16:0});
effects=new CowEffects({layout,petEffect,beforeGhost:petToDom,theme:()=>custom.cfg.theme,onLikeTest:n=>likeEvent({type:'like',count:n,countMode:'delta',source:'manual'},'manual'),core:C,getState:()=>state,getCows:()=>cows,collectWaiting:(n,visible,now)=>population.collectWaiting(n,visible,now),collect:collectCows,launch:launchFromPen,save,toast,sound,reduced,canRun:()=>ready,windCollect,sweepCollect,onTest:closeSettings,refresh:()=>{queueBlocked=false;replenish();save();updateHUD();},clearOutside});
applyPrefs(true);custom.ready.then(()=>{ready=true;const checked=Naming.validateKinds(state.naming,hasResidentMaterial);state.naming=checked.value;if(checked.issues.length)toast(checked.issues.join('；'));for(const r of state.naming.residents)makeCow(r,false,r.kind,r);controls.refresh();population.restore(state.positions);replenish(true);if(state.current){C.upgradeCurrentBox(state,custom.cfg.boxTiers);initBoxFlight(state.current);state.current.cast??=chooseCast();setCast(state.current.cast);roundStart=performance.now()-state.current.times[state.current.phase];showPhase(state.current.phase,false);}else custom.applyLayout(false);for(const el of document.querySelectorAll('#start,#auto,#add-cows,#collect-test,#reset,[data-add-count]'))el.disabled=false;updateChannel();drainGifts();drainLikes();updateHUD();scheduleFrame();});
})();
