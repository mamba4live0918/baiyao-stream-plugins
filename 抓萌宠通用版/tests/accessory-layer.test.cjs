const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),app=read('src/app.js');
const Core=require('../src/core.js'),Roster=require('../src/roster.js'),Geometry=require('../src/roam-geometry.js');
const accessoryPath=path.join(root,'src/accessories.js');
const Accessories=fs.existsSync(accessoryPath)?require(accessoryPath):null;
const png='data:image/png;base64,aA==',gif='data:image/gif;base64,aA==';

class Element{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.attributes={};this.style={};this.dataset={};this.hidden=false;this.src='';this.classList={toggle(){}};}
 append(...children){this.children.push(...children);children.forEach(child=>{child.parentElement=this;});}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
}

async function fixture(frames=12){
 const assets=JSON.parse(read('素材/manifest.json'));
 if(frames!==12)assets.cows.forEach(asset=>{asset.frames=frames;});
 assets.accessories={};
 for(const kind of [72,74,79,92,93,94])assets.accessories[kind]={src:'prop-'+kind+'.png',walk:'prop-'+kind+'-walk.png',frames,name:'Personal prop '+kind};
 const document={createElement(tag){return new Element(tag,this);},getElementById:()=>null};
 const typeContext={structuredClone,PetRoamGeometry:Geometry,localStorage:{getItem:()=>null,setItem(){}},document};
 vm.runInNewContext(read('src/customize.js')+';globalThis.Type=CowCustomizer;',typeContext);
 for(const key of ['bind','bindPenManipulation','render','renderCows','renderBarns','syncControls'])typeContext.Type.prototype[key]=()=>{};
 typeContext.Type.prototype.loadMedia=async()=>{};
 const custom=new typeContext.Type({assets,roster:Roster,themes:require('../src/themes.js'),core:Core,toast(){},onChange(){}});
 await custom.ready;
 const state=Core.fresh();state.avatarKinds=[{kind:1000000,url:'https://example.com/viewer.png',name:'Viewer',fallbackKind:72}];custom.cfg.avatarMode=true;
 let disabled=false;
 const context={document,ASSETS:assets,PetAccessories:Accessories,PetRoamGeometry:Geometry,C:Core,W:1280,H:720,prefs:{size:90},state,custom,reduced:()=>disabled};
 vm.runInNewContext(app.slice(app.indexOf('function size()'),app.indexOf('function ballBurst('))+';globalThis.cowVisual=cowVisual;',context);
 vm.runInNewContext(app.slice(app.indexOf('function sequenceFrame('),app.indexOf('function penRect('))+';globalThis.renderCow=renderCow;',context);
 function pet(kind=72){const el=document.createElement('button'),im=document.createElement('img'),sprite=document.createElement('span');el.append(im,sprite);return{id:kind+1,kind,x:500,y:350,size:90,el,im,sprite,held:false,airborne:false,facing:1,sourceFacing:-1,motionStage:'hop',hopFrame:8,hopLift:-12,hopScaleX:1.4,hopScaleY:.7,angle:9};}
 function refresh(p){context.cowVisual(p);context.renderCow(p);return p;}
 return{assets,custom,state,context,pet,refresh,disable:value=>{disabled=value;}};
}

// Catches absent integration or accidentally replacing the original body with decorated art.
test('eligible legacy pets render a separate transparent accessory above unchanged body art',async()=>{
 const f=await fixture(),p=f.refresh(f.pet());
 assert(p.accessory,'an eligible pet needs its accessory layer');
 assert.equal(p.im.src,f.custom.cowSource(72));
 assert.equal(p.sprite.style.backgroundImage,'url("'+f.custom.cowWalk(72)+'")');
 assert.equal(p.el.children.length,3);
 assert.equal(p.el.children[2],p.accessory);
 assert.equal(p.accessory.tagName,'SPAN');
 assert.equal(p.accessory.getAttribute('aria-hidden'),'true');
 assert.equal(p.accessory.style.pointerEvents,'none');
 assert.equal(p.accessory.style.transformOrigin,'50% 91%');
 assert.equal(p.accessory.hidden,false);
});

// Catches an independent accessory clock, reversed strip indexing, or duplicated body distortion.
test('all twelve accessory poses use the frame and direction actually rendered by the body',async()=>{
 const f=await fixture(),p=f.refresh(f.pet());
 assert(p.accessory,'an eligible pet needs its accessory layer');
 p.y=500;p.hopLift=-12;
 for(let frame=0;frame<12;frame++){
  p.hopFrame=frame;f.context.renderCow(p);
  assert.equal(p.accessory.style.backgroundImage,'url("prop-72-walk.png")');
  assert.equal(p.accessory.style.backgroundSize,'1200% 100%');
  assert.equal(p.accessory.style.backgroundPosition,p.sprite.style.backgroundPosition);
  assert.equal(p.accessory.style.transform,'scale(1,1)');
 }
 p.facing=-1;f.context.renderCow(p);assert.equal(p.accessory.style.transform,'scale(-1,1)');
 assert.equal(p.el.dataset.frame,11);
 assert.equal(p.el.style.transform,'translate(410px,398px) rotate(0deg)');
 const opposite=f.refresh(f.pet(92));assert.equal(opposite.accessory.style.transform,'scale(-1,1)');
 opposite.facing=-1;f.context.renderCow(opposite);assert.equal(opposite.accessory.style.transform,'scale(1,1)');
});

test('all thirty accessory poses follow the full-character motion frame and rendered direction',async()=>{
 const Motion=require('../src/motion.js'),f=await fixture(30),p=f.refresh(f.pet()),seen=new Set();
 Object.assign(p,{roamVX:1,roamVY:0,turnIn:100,wait:0});
 const options={enabled:true,speed:45,size:90,radius:20,bounds:{left:0,right:10000,top:0,bottom:700}};
 for(let i=0;i<500;i++){
  Motion.step(p,1/60,options,'prowl',Core,()=>.8);f.context.renderCow(p);seen.add(Number(p.el.dataset.frame));
  assert.equal(p.accessory.style.backgroundImage,'url("prop-72-walk.png")');
  assert.equal(p.accessory.style.backgroundSize,'3000% 100%');
  assert.equal(p.accessory.style.backgroundPosition,p.sprite.style.backgroundPosition);
  assert.equal(p.accessory.style.transform,p.sprite.style.transform);
 }
 assert.deepEqual([...seen].sort((a,b)=>a-b),Array.from({length:30},(_,i)=>i));
 p.facing=-1;f.context.renderCow(p);assert.equal(p.accessory.style.transform,'scale(-1,1)');
});

// Catches using frame zero of walking art in situations where the body uses its standing PNG.
for(const state of ['rest','held','airborne','reduced'])test(state+' uses static accessory art with the same body pose',async()=>{
 const f=await fixture(),p=f.refresh(f.pet());
 assert(p.accessory,'an eligible pet needs its accessory layer');
 if(state==='rest')p.motionStage='rest';else if(state==='reduced')f.disable(true);else p[state]=true;
 f.context.renderCow(p);
 assert.equal(p.im.hidden,false);
 assert.equal(p.accessory.style.backgroundImage,'url("prop-72.png")');
 assert.equal(p.accessory.style.backgroundSize,'100% 100%');
 assert.equal(p.accessory.style.backgroundPosition,'0% 0');
 assert.equal(p.accessory.style.transform,state==='held'?'scale(1.12,1.12)':'scale(1,1)');
 if(state==='airborne')assert.match(p.el.style.transform,/rotate\(9deg\)/);
});

// Catches applying logical-kind props after the duck theme changes the final visible species.
test('theme changes remove old props from duck display aliases and restore them on return',async()=>{
 const f=await fixture(),p=f.refresh(f.pet()),layer=p.accessory;
 assert(layer);assert.equal(f.custom.setTheme('yajiji'),true);f.refresh(p);
 assert.equal(p.kind,72);assert.equal(f.custom.cowCategory(p.visualKind),'yajiji');
 assert.equal(layer.hidden,true);assert.equal(layer.style.backgroundImage,'');
 assert.equal(f.custom.setTheme('cream'),true);f.refresh(p);
 assert.equal(p.visualKind,72);assert.equal(p.accessory,layer);assert.equal(layer.hidden,false);
 assert.equal(p.el.children.length,3);
});

// Catches leaving stock props over any successfully uploaded replacement type.
for(const [label,record] of [
 ['PNG',{type:'image',data:png}],['JPEG',{type:'image',data:'data:image/jpeg;base64,aA=='}],
 ['WebP',{type:'image',data:'data:image/webp;base64,aA=='}],['GIF',{type:'image',data:gif,poster:png}],
 ['frames',{type:'frames',data:png,poster:png,frames:2,durations:[80,120]}]
])test(label+' replacement clears accessory URL immediately and removal restores stock props',async()=>{
 const f=await fixture(),p=f.refresh(f.pet()),layer=p.accessory;
 assert(layer);f.custom.records.set('cow:72',record);f.context.cowVisual(p);
 assert.equal(layer.hidden,true);assert.equal(layer.style.backgroundImage,'');
 assert.equal(layer.style.backgroundSize,'');assert.equal(layer.style.backgroundPosition,'');
 f.custom.records.delete('cow:72');f.refresh(p);assert.equal(layer.hidden,false);
});

// Catches props following the avatar's fallback kind while a viewer photograph is displayed.
test('avatar presentation hides fallback props and failed avatars may use decorated fallback art',async()=>{
 const f=await fixture(),p=f.pet(1000000);p.avatarFailed=true;f.refresh(p);
 const layer=p.accessory;assert(layer);assert.equal(p.visualKind,72);
 p.avatarFailed=false;f.refresh(p);assert.equal(p.im.src,'https://example.com/viewer.png');
 assert.equal(layer.hidden,true);assert.equal(layer.style.backgroundImage,'');
 p.avatarFailed=true;f.refresh(p);assert.equal(layer.hidden,false);
});

// Catches stale art surviving a missing map entry or an invalid final visible kind.
test('unknown, undecorated and newly baked friends have no active accessory layer',async()=>{
 const f=await fixture(),p=f.refresh(f.pet()),layer=p.accessory;assert(layer);
 for(const kind of [0,999999,2000000,2000008,2000009,2000010,2000011]){
  p.kind=kind;f.refresh(p);assert.equal(layer.hidden,true);assert.equal(layer.style.backgroundImage,'');
 }
 p.kind=72;f.refresh(p);delete f.assets.accessories[72];f.context.cowVisual(p);
 assert.equal(layer.hidden,true);assert.equal(layer.style.backgroundImage,'');
});

// Catches borrowing a mismatched walking strip instead of safely using its static placement.
test('accessory derivation excludes replaced and invalid identities and mismatched strips stay static',async()=>{
 assert(Accessories,'the real accessory module must exist');
 const f=await fixture();assert.equal(Accessories.derive(72,f.custom,f.assets),f.assets.accessories[72]);
 assert.equal(Accessories.derive(72,f.custom,f.assets,true),null);
 assert.equal(Accessories.derive(999999,f.custom,{accessories:{999999:f.assets.accessories[72]}}),null);
 const p=f.refresh(f.pet());p.walkFrames=4;p.hopFrame=3;f.context.renderCow(p);
 assert.equal(p.accessory.style.backgroundImage,'url("prop-72.png")');
 assert.equal(p.accessory.style.backgroundSize,'100% 100%');
});

function backgroundWrites(layer){
 const writes={backgroundImage:[],backgroundSize:[],backgroundPosition:[]};
 for(const key of Object.keys(writes)){
  let value=layer.style[key];
  Object.defineProperty(layer.style,key,{configurable:true,get:()=>value,set:next=>{value=next;writes[key].push(next);}});
 }
 return writes;
}

// Catches rebuilding and submitting the same inline PNG URI at every animation tick.
for(const standing of [true,false])test((standing?'standing':'walking')+' repeated frames do not rewrite unchanged background image or size',async()=>{
 const f=await fixture(),row=JSON.parse(read('素材/配饰/manifest.json')).find(asset=>asset.kind===72);
 f.assets.accessories[72].src='data:image/png;base64,'+fs.readFileSync(path.join(root,'素材',row.src)).toString('base64');
 f.assets.accessories[72].walk='data:image/png;base64,'+fs.readFileSync(path.join(root,'素材',row.walk)).toString('base64');
 const p=f.refresh(f.pet());p.motionStage=standing?'rest':'hop';f.context.renderCow(p);
 const writes=backgroundWrites(p.accessory),source=p.accessory.style.backgroundImage;
 for(let i=0;i<120;i++)f.context.renderCow(p);
 assert.equal(p.accessory.style.backgroundImage,source);
 assert.equal(writes.backgroundImage.length,0,'the same PNG URI must not be submitted every tick');
 assert.equal(writes.backgroundSize.length,0,'unchanged background size must not be submitted every tick');
 p.hopFrame=5;f.context.renderCow(p);
 assert.equal(p.accessory.style.backgroundPosition,standing?'0% 0':p.sprite.style.backgroundPosition);
 assert.equal(writes.backgroundImage.length,0);assert.equal(writes.backgroundSize.length,0);
});

// Catches a cache ignoring static/walk transitions or a new source with the same dimensions.
test('background cache follows actual source and static to walk to static changes while frames keep updating',async()=>{
 const f=await fixture(),p=f.refresh(f.pet());p.motionStage='rest';f.context.renderCow(p);
 const writes=backgroundWrites(p.accessory);
 p.motionStage='hop';p.hopFrame=5;f.context.renderCow(p);
 assert.deepEqual(writes.backgroundImage,['url("prop-72-walk.png")']);
 assert.deepEqual(writes.backgroundSize,['1200% 100%']);
 assert.equal(p.accessory.style.backgroundPosition,'45.45454545454545% 0');
 p.hopFrame=6;f.context.renderCow(p);assert.equal(p.accessory.style.backgroundPosition,'54.54545454545454% 0');
 assert.equal(writes.backgroundImage.length,1);assert.equal(writes.backgroundSize.length,1);
 p.motionStage='rest';f.context.renderCow(p);
 assert.deepEqual(writes.backgroundImage,['url("prop-72-walk.png")','url("prop-72.png")']);
 assert.deepEqual(writes.backgroundSize,['1200% 100%','100% 100%']);
 f.assets.accessories[72].src='prop-72-revised.png';f.context.renderCow(p);
 assert.equal(writes.backgroundImage.at(-1),'url("prop-72-revised.png")');
 assert.equal(writes.backgroundImage.length,3);assert.equal(writes.backgroundSize.length,2);
});

// Catches stale cache entries preventing the same accessory from returning after being hidden.
test('clearing invalidates the background cache and re-enabling the same asset writes a fresh URL once',async()=>{
 const f=await fixture(),p=f.refresh(f.pet());p.motionStage='rest';f.context.renderCow(p);
 const writes=backgroundWrites(p.accessory);
 Accessories.sync(p,f.custom,f.assets,true);
 assert.equal(p.accessory.hidden,true);assert.deepEqual(writes.backgroundImage,['']);assert.deepEqual(writes.backgroundSize,['']);
 for(let i=0;i<120;i++)f.context.renderCow(p);
 assert.equal(writes.backgroundImage.length,1);assert.equal(writes.backgroundSize.length,1);
 Accessories.sync(p,f.custom,f.assets);
 assert.equal(p.accessory.hidden,false);
 assert.deepEqual(writes.backgroundImage,['','url("prop-72.png")']);
 assert.deepEqual(writes.backgroundSize,['','100% 100%']);
 for(let i=0;i<120;i++)f.context.renderCow(p);
 assert.equal(writes.backgroundImage.length,2);assert.equal(writes.backgroundSize.length,2);
});
