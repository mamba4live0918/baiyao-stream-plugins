const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../src/core.js');
const {bootstrap,dispatch,flushSave}=require('./helpers/app-harness.cjs');
const {createCanvas,Image}=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const fixtureBitmap=createCanvas(8,8),bitmapContext=fixtureBitmap.getContext('2d');bitmapContext.fillStyle='#96dfff';bitmapContext.fillRect(2,2,4,4);const bitmap=fixtureBitmap.toDataURL('image/png');
function assets(){const a=JSON.parse(fs.readFileSync(path.join(__dirname,'../素材/manifest-latest.json'),'utf8'));const dragon=a.cows.find(c=>c.kind===2000022);Object.assign(dragon,{motion:'fly',flyCycleMs:1500,particleStyle:'dragon'});if(!a.cows.some(c=>c.kind===2000023)){a.cows.push({...dragon,id:'friend-blue-purple-butterfly',kind:2000023,name:'蓝紫蝴蝶',flyCycleMs:1200,particleStyle:'butterfly',flyBankDeg:16});a.categories.find(c=>c.id==='xiaoyao').members.push('friend-blue-purple-butterfly');}a.petParticles={butterfly:bitmap,dragon:bitmap};return a;}
async function scene({prefs=null,state=C.fresh(),customSaved=null,query=null}={}){
 const surfaces=[];const f=await bootstrap(state,prefs,{assets:assets(),realEffects:true,flightParticles:true,customSaved,motionQuery:query,Image,canvasFactory:n=>{const canvas=createCanvas(1,1);surfaces.push(canvas);for(const key of ['width','height'])Object.defineProperty(n,key,{get:()=>canvas[key],set:v=>canvas[key]=v});return{getContext:()=>canvas.getContext('2d')};}});
 await new Promise(r=>setTimeout(r,30));f.surfaces=surfaces;f.ctx.customInstance.galleryCategory='xiaoyao';f.ctx.customInstance.renderCows();f.ctx.customInstance.cfg.wander=false;return f;
}
function add(f,kind){const card=f.document.getElementById('cow-gallery').children.find(n=>Number(n.dataset.cow)===kind),control=card.querySelector('.species-add-controls');control.querySelector('input').value='1';control.querySelector('button').click();const actor=f.ctx.effectInstance.getCows().at(-1);actor.flyClock=0;return actor;}
function draw(f,from=0,to=400){for(let t=from;t<to;t+=20)f.ctx.frame(t);}
function pixels(f){const data=f.surfaces[0].getContext('2d').getImageData(0,0,1200,700).data;let n=0;for(let i=3;i<data.length;i+=4)if(data[i])n++;return n;}
function change(f,id,value){const el=f.document.getElementById(id);el.value=value;dispatch(el,'change');}
test('latest native flight metadata enters the real gallery, hover renderer and transparent single bitmap canvas',async()=>{
 const f=await scene(),butterfly=add(f,2000023),dragon=add(f,2000022);assert.equal(f.ctx.customInstance.assets.cows.length,119);assert.equal(butterfly.flying,true);assert.equal(dragon.flying,true);assert.equal(butterfly.walkFrames,30);assert.equal(dragon.walkFrames,30);assert.equal(butterfly.flyCycleMs,1200);assert.equal(dragon.flyCycleMs,1500);assert.equal(f.document.querySelectorAll('.pet-flight-particles').length,1);draw(f);assert(pixels(f)>0);assert.equal(butterfly.airborne,false);assert.equal(dragon.airborne,false);assert.equal(dragon.sprite.hidden,false);
 const saved=flushSave(f.ctx,f.store);assert.deepEqual(saved.positions.map(c=>c.kind),[2000023,2000022]);const restored=await scene({state:saved});assert(restored.ctx.effectInstance.getCows().every(c=>c.flying&&c.particleStyle));
});
test('recall removes flight bitmap pixels immediately and cannot leave a tail after the owner disappears',async()=>{
 const f=await scene();add(f,2000023);draw(f);assert(pixels(f)>0);f.document.getElementById('collect-test').click();assert.equal(pixels(f),0);assert.equal(flushSave(f.ctx,f.store).outside,0);draw(f,400,800);assert.equal(pixels(f),0);
});
test('sweep recall and tornado capture immediately stop the captured native flyer tail',async()=>{
 for(const action of ['recall','tornado']){const f=await scene(),actor=add(f,2000023);draw(f);assert(pixels(f)>0);if(action==='recall')f.ctx.effectInstance.trigger('recall',1);else f.ctx.effectInstance.windCollect(actor,actor.x,actor.y);assert.equal(pixels(f),0,action);assert.equal(flushSave(f.ctx,f.store).outside,0);}
});
test('a blind box retains its burst trajectories and resumes native flight without gravity after landing',async()=>{
 const f=await scene(),custom=f.ctx.customInstance;custom.cfg.cowSettings.forEach((s,i)=>s.enabled=custom.kindForIndex(i)===2000022);custom.cfg.activeCategory='xiaoyao';f.document.getElementById('start').click();let burst=false;
 for(let time=0;time<4000;time+=20){f.ctx.frame(time);for(const c of f.ctx.effectInstance.getCows())if(c.boxFlight)burst=true;}
 const actors=f.ctx.effectInstance.getCows();assert(burst);assert.equal(actors.length,5);assert(actors.every(c=>c.kind===2000022&&c.flying&&!c.airborne&&!c.boxFlight));assert(pixels(f)>0);assert.equal(flushSave(f.ctx,f.store).outside,5);
});
test('motion off and a system reduce change clear particle pixels immediately, while explicit on overrides system reduce',async()=>{
 let onChange;const query={matches:false,addEventListener:(event,fn)=>onChange=fn},f=await scene({prefs:{motion:'system'},query});add(f,2000022);draw(f);assert(pixels(f)>0);query.matches=true;onChange();assert.equal(pixels(f),0);draw(f,400,800);assert.equal(pixels(f),0);
 change(f,'motion','on');draw(f,800,1200);assert(pixels(f)>0);change(f,'motion','off');assert.equal(pixels(f),0);draw(f,1200,1500);assert.equal(pixels(f),0);
});
test('uploads, alternate duck displays and avatars never inherit native flight particle decorations',async()=>{
 const f=await scene(),dragon=add(f,2000022);draw(f);assert(pixels(f)>0);f.ctx.customInstance.records.set('cow:2000022',{type:'image',data:bitmap});f.ctx.customInstance.onChange();assert.equal(dragon.particleStyle,null);assert.equal(pixels(f),0);draw(f,400,800);assert.equal(pixels(f),0);
 f.ctx.customInstance.records.delete('cow:2000022');f.ctx.customInstance.onChange();draw(f,800,1200);assert(pixels(f)>0);change(f,'theme','yajiji');assert.equal(dragon.particleStyle,null);assert.equal(dragon.flying,false);assert.equal(pixels(f),0);
 change(f,'theme','cream');const state=f.ctx.effectInstance.getState();const kind=C.registerAvatar(state,bitmap,'Avatar',2000022);f.ctx.customInstance.cfg.avatarMode=true;f.ctx.effectInstance.trigger('add',1,1,{avatarKind:kind});const avatar=f.ctx.effectInstance.getCows().find(c=>c.kind===kind);assert(avatar);assert.equal(avatar.particleStyle,null);assert.equal(avatar.motionMode,'float');
});
test('named flyers retain identity and visible nameplate, session ending and clear-scene erase old tails',async()=>{
 const f=await scene(),dragon=add(f,2000022);draw(f);dispatch(dragon.el,'contextmenu');f.document.getElementById('pet-name').value='Blue Dragon';dispatch(f.document.getElementById('pet-name'),'input');f.document.getElementById('pet-name-save').click();assert.equal(dragon.petName,'Blue Dragon');assert.equal(dragon.particleStyle,'dragon');assert(f.document.querySelector('.pet-nameplate'));draw(f,400,800);assert(pixels(f)>0);const before=flushSave(f.ctx,f.store);f.document.getElementById('end-session').click();assert(pixels(f)>0);f.document.getElementById('end-session').click();assert.equal(pixels(f),0);assert.equal(flushSave(f.ctx,f.store).naming.residents.length,0);assert.notEqual(flushSave(f.ctx,f.store).naming.sessionId,before.naming.sessionId);
 const g=await scene();add(g,2000023);draw(g);assert(pixels(g)>0);g.ctx.effectInstance.clearOutside();assert.equal(pixels(g),0);draw(g,400,800);assert.equal(pixels(g),0);
});
test('explicit saved dragon walking, custom kind100 media, per-pet names and size settings survive the new flight defaults',async()=>{
 const a=assets(),settings=a.cows.map(()=>({enabled:true,scale:200,fps:8,motion:'default'})),index=a.cows.findIndex(c=>c.kind===2000022);settings[index]={enabled:true,scale:145,fps:8,motion:'walk'};
 const f=await scene({customSaved:{defaultsV116:true,tiers:C.defaultTiers(),cowSettings:settings,customCows:[{kind:100,name:'Mine',category:'xiaoyao',scale:155,motion:'fly',fps:9}],castA:2000022}});const dragon=add(f,2000022);assert.equal(dragon.motionMode,'walk');assert.equal(dragon.particleStyle,null);assert.equal(f.ctx.customInstance.cowScale(2000022),1.45);assert.equal(f.ctx.customInstance.cfg.customCows[0].name,'Mine');assert.equal(f.ctx.customInstance.cowMotion(100),'fly');assert.equal(f.ctx.customInstance.cfg.castA,2000022);
});
test('butterfly banking rotates only the whole native flying art; dragon, uploads, avatars and nameplate stay upright',async()=>{
 const f=await scene(),butterfly=add(f,2000023),dragon=add(f,2000022);f.ctx.customInstance.cfg.wander=true;butterfly.roamVX=.9;butterfly.roamVY=.1;butterfly.turnIn=100;dragon.roamVX=.9;dragon.roamVY=.1;dragon.turnIn=100;butterfly.x=300;butterfly.y=350;dragon.x=300;dragon.y=350;draw(f);
 assert.equal(butterfly.flyBankDeg,16);assert(butterfly.motionTilt>10);assert.match(butterfly.el.style.transform,/rotate\((?:1[0-6])(?:\.[0-9]+)?deg\)/);assert.match(butterfly.sprite.style.transform,/scale\(1,1\)/);assert.equal(dragon.flyBankDeg,0);assert.match(dragon.el.style.transform,/rotate\(0deg\)/);
 dispatch(butterfly.el,'contextmenu');f.document.getElementById('pet-name').value='Violet';dispatch(f.document.getElementById('pet-name'),'input');f.document.getElementById('pet-name-save').click();const nameplate=f.document.querySelector('.pet-nameplate');assert(nameplate);assert.doesNotMatch(nameplate.style.transform||'',/rotate/);
 dispatch(butterfly.el,'pointerdown',{clientX:butterfly.x,clientY:butterfly.y});assert.match(butterfly.el.style.transform,/rotate\(0deg\)/);f.ctx.frame(420);assert.equal(butterfly.motionTilt,0);dispatch(f.document.getElementById('field'),'pointerup',{clientX:butterfly.x,clientY:butterfly.y});
 f.ctx.customInstance.records.set('cow:2000023',{type:'image',data:bitmap});f.ctx.customInstance.onChange();assert.equal(butterfly.flyBankDeg,0);draw(f,440,700);assert.match(butterfly.el.style.transform,/rotate\(0deg\)/);
 const state=f.ctx.effectInstance.getState(),kind=C.registerAvatar(state,bitmap,'Avatar',2000023);f.ctx.customInstance.cfg.avatarMode=true;f.ctx.effectInstance.trigger('add',1,1,{avatarKind:kind});const avatar=f.ctx.effectInstance.getCows().find(c=>c.kind===kind);assert.equal(avatar.flyBankDeg,0);
});
