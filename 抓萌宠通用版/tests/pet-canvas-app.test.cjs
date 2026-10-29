const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bootstrap,dispatch}=require('./helpers/app-harness.cjs'),Core=require('../src/core.js'),Frames=require('../src/walk-frames.js'),Canvas=require('../src/pet-canvas.js');

// Stands in for the frame provider's bitmap jobs: records requests and bakes whatever the test publishes.
function bitmaps({enabled=true}={}){
 const fake={ready:new Map(),requests:[],dropped:[],instance:null};
 class Provider{
  constructor(hooks){Object.assign(this,hooks);this.enabled=enabled;fake.instance=this;}
  get(){return null;}prune(){}status(){return{enabled};}
  bitmap(key,source,opts){fake.requests.push({key,source,opts});return fake.ready.get(key)||null;}
  drop(match){let n=0;for(const k of [...fake.ready.keys()])if(match(k)){fake.ready.delete(k);fake.dropped.push(k);n++;}return n;}
 }
 fake.publish=key=>{const req=fake.requests.find(r=>r.key===key),frames=req?.opts?.frames||1;const entry={key,state:'ready',bake:req?.opts||{},atlas:{bitmap:{id:key},frames,cols:Math.ceil(Math.sqrt(frames)),cw:118,ch:125,w:96,h:96,px:11,pt:11,key}};fake.ready.set(key,entry);fake.instance.onReady(key);return entry;};
 fake.publishAll=()=>{let n=0;for(const r of [...fake.requests])if(!fake.ready.has(r.key)){fake.publish(r.key);n++;}return n;};
 return{fake,globals:{PetWalkFrames:{Provider,setFrameClass:Frames.setFrameClass},PetCanvas:Canvas}};
}
function surface(){
 const calls=[];return{calls,globalAlpha:1,filter:'none',lineWidth:1,strokeStyle:'',shadowColor:'',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,fillStyle:'',imageSmoothingQuality:'low',
  setTransform(...a){calls.push(['setTransform',...a]);},drawImage(img,...a){calls.push(['drawImage',img,...a,{alpha:this.globalAlpha,filter:this.filter}]);},
  clearRect(){calls.push(['clear']);},beginPath(){},arc(){},stroke(){calls.push(['stroke',this.strokeStyle]);},save(){},restore(){},fill(){},clip(){}};
}
async function scene({count=3,prefs=null,state=null,provider={},spread=true,realEffects=false,gpu=true}={}){
 const s=state||Core.fresh();if(!state){s.outside=count;s.positions=Array.from({length:count},(_,i)=>({kind:0,x:spread?.1+i*.3:.3,y:.6}));}
 const {fake,globals}=bitmaps(provider),ctx2d=surface();
 // No WebGL2 here, but a hardware WebGL1 probe: a GPU-backed page, so the 2D canvas renderer is used.
 const webgl1=gpu?{getParameter(){},getExtension:()=>null}:null;
 const f=await bootstrap(s,prefs,{globals,realEffects,canvasFactory:()=>({getContext:type=>type==='2d'?ctx2d:type==='webgl'?webgl1:null})});
 for(let t=0;t<64;t+=16)f.ctx.frame(t);
 return{f,fake,ctx2d,pets:f.ctx.effectInstance.getCows(),field:f.document.getElementById('field'),layer:f.document.all.find(n=>n.className==='pet-canvas-layer')};
}
const draws=ctx=>ctx.calls.filter(c=>c[0]==='drawImage');
const box=size=>{const need=size;return need<240?Math.max(64,Math.ceil(need/16)*16):Math.min(1024,Math.ceil(need/64)*64);};
// Where the round button of a standing pet is on screen.
const centre=p=>({clientX:p.x,clientY:p.y+(p.hopLift||0)});
async function onCanvas(opts){const s=await scene(opts);s.fake.publishAll();s.f.ctx.frame(80);return s;}

test('pets keep their DOM buttons until every bitmap is baked, then draw on the canvas with their button hidden',async()=>{
 const {f,fake,ctx2d,pets,layer}=await scene(),p=pets[0];
 assert(layer,'the canvas layer sits in the field');assert.equal(layer.style.zIndex,'10');assert.equal(layer.style.pointerEvents,'none');
 const px=box(p.size),walk=fake.requests.find(r=>r.key===p.cvWalkKey),still=fake.requests.find(r=>r.key===p.cvStillKey);
 assert.equal(p.cvWalkKey,'Cb0@12#'+px,'walk frames keep the DOM frame buckets');assert.match(p.cvStillKey,new RegExp('^S\\d+#'+Math.round(p.size)+'$'),'standing art is baked at the exact drawn size');
 assert.deepEqual([walk.opts.frames,walk.opts.size,walk.opts.shadow,walk.opts.pad],[12,px,Canvas.SHADOW,Canvas.PAD]);assert.equal(walk.source,p.walkSrc);
 assert.equal(still.opts.fit,'contain');assert.equal(still.source,p.im.src);assert.deepEqual([still.opts.size,still.opts.ref],[Math.round(p.size),p.size]);
 fake.publish(p.cvWalkKey);f.ctx.frame(80);
 assert(!p.onCanvas,'the standing art is still baking');assert(!p.el.classList.contains('pet-canvas'));assert.equal(draws(ctx2d).length,0);
 fake.publishAll();
 assert(pets.every(c=>c.onCanvas),'ready pets switch at once');assert(pets.every(c=>!c.el.classList.contains('pet-canvas')),'buttons hide only after a canvas draw');
 f.ctx.frame(96);
 assert(pets.every(c=>c.el.classList.contains('pet-canvas')));
 ctx2d.calls.length=0;f.ctx.frame(112);assert.equal(draws(ctx2d).length,pets.length,'one draw per pet per frame');
});

test('canvas pets change walk frames without DOM writes and never spend the per-frame DOM frame budget',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const ctx={reduced:()=>false,petCanvas:{active:true},canvasReady:c=>!c.held,canvasPose(c,...a){c.pose=a;c.onCanvas=true;},leaveCanvas(c){c.onCanvas=false;}};
 vm.runInNewContext(source.slice(source.indexOf('function sequenceFrame('),source.indexOf('function penRect('))+';globalThis.render=renderCow;',ctx);
 const node=()=>({style:{},dataset:{},hidden:false,isConnected:true});
 const p={el:node(),im:node(),sprite:node(),x:100,y:180,size:85,articulated:true,walkSrc:'strip.png',walkFrames:12,walkMode:'default',motionStage:'walk',hopFrame:4,facing:-1,sourceFacing:1,walking:true};
 ctx.render(p);p.hopFrame=9;const gate=ctx.render.gate={budget:0,starved:false};ctx.render(p);
 assert.equal(p.shownFrame,9);assert.equal(gate.starved,false);assert.equal(gate.budget,0);
 assert.deepEqual(p.pose,[58,138,0,-1,1,9,false],'device-pixel snapped like the DOM transform');
 assert.deepEqual(p.el.style,{},'no DOM transform while drawn on the canvas');assert.deepEqual(p.el.dataset,{});
 p.held=true;ctx.render.gate=null;ctx.render(p);
 assert.equal(p.onCanvas,false);assert.match(p.el.style.transform,/translate/);assert.equal(p.im.style.transform,'scale(-1.12,1.12)');
});

test('grabbing a canvas pet shows its real button (held glow, grip scale) and releasing returns it to the canvas',async()=>{
 const {f,pets,field}=await onCanvas({realEffects:true}),p=pets[1];
 dispatch(field,'pointerdown',centre(p));
 assert.equal(p.held,true);assert.equal(p.onCanvas,false);assert(!p.el.classList.contains('pet-canvas'));assert(p.el.classList.contains('held'));
 assert.match(p.el.style.transform,/translate/);assert.match(p.im.style.transform,/^scale\(-?1\.12,1\.12\)$/);
 assert(pets.filter(c=>c!==p).every(c=>!c.held),'one pet per grab without the strong grip');
 dispatch(field,'pointermove',{clientX:600,clientY:300});assert.equal(p.x,600);
 dispatch(field,'pointerup',{});
 assert.equal(p.held,false);assert.equal(p.onCanvas,true);f.ctx.frame(120);assert(p.el.classList.contains('pet-canvas'));
});

test('presses, right-clicks and double-clicks find canvas pets by their round button and nothing else',async()=>{
 const {f,pets,field}=await onCanvas({realEffects:true}),p=pets[0],d=f.document,empty={clientX:1150,clientY:60};
 dispatch(field,'pointerdown',empty);assert(pets.every(c=>!c.held),'empty field');
 dispatch(field,'pointerdown',{clientX:p.x-p.size*.45,clientY:p.y-p.size*.45});assert(pets.every(c=>!c.held),'box corner is outside border-radius 50%');
 const menu=dispatch(field,'contextmenu',centre(p));
 assert.equal(menu.defaultPrevented,true);assert.equal(d.getElementById('pet-panel').hidden,false);assert.equal(f.ctx.controlsInstance.actor,p);
 assert.equal(dispatch(field,'contextmenu',empty).defaultPrevented,false,'the browser menu stays elsewhere');
 dispatch(field,'pointerdown',centre(pets[2]));assert.equal(d.getElementById('pet-panel').hidden,false,'pressing another pet keeps the panel, as with buttons');
 dispatch(field,'pointerup',{});
 dispatch(field,'dblclick',centre(pets[2]));assert.equal(d.getElementById('shade').classList.contains('open'),false);
 dispatch(field,'dblclick',empty);assert.equal(d.getElementById('shade').classList.contains('open'),true);
});

test('hovering a canvas pet shows the grab cursor',async()=>{
 const {f,pets,field}=await onCanvas();
 dispatch(field,'pointermove',centre(pets[0]));f.ctx.frame(130);assert.equal(field.style.cursor,'grab');
 dispatch(field,'pointermove',{clientX:1150,clientY:60});f.ctx.frame(146);assert.equal(field.style.cursor,'');
});

test('tornado, sweep and nest returns animate the real button from the pose the canvas drew',async()=>{
 const {f,pets}=await onCanvas({count:3}),fx=f.ctx.effectInstance,[a,b,c]=pets;
 assert.equal(fx.windCollect(a,a.x,a.y),1);
 assert.equal(a.domOnly,true);assert(!a.el.classList.contains('pet-canvas'),'shown before flying');assert.match(a.el.style.transform,/translate/);
 assert.equal(fx.sweepCollect([b]),1);assert.equal(b.domOnly,true);assert(!b.el.classList.contains('pet-canvas'));
 f.document.getElementById('collect-test').click();
 assert(c.el.classList.contains('returning'));assert(!c.el.classList.contains('pet-canvas'));assert.match(c.el.style.transform,/scale\(\.15\)/);
 const ctx2d=f.document.all.find(n=>n.className==='pet-canvas-layer').getContext('2d');ctx2d.calls.length=0;f.ctx.frame(200);
 assert.equal(draws(ctx2d).filter(d=>[a,b,c].some(p=>p.cvState?.body?.bitmap===d[1])).length,0,'flying pets are no longer drawn on the canvas');
});

test('gift glow, ball reveal and water arrival replay on canvas pets and keep their CSS classes',async()=>{
 const {f,pets,ctx2d}=await onCanvas(),fx=f.ctx.effectInstance,p=pets[0];
 fx.petEffect(p,'gift-arrival',1200);
 assert(p.el.classList.contains('gift-arrival'));assert.equal(p.fx.name,'gift-arrival');
 ctx2d.calls.length=0;f.ctx.frame(100);
 const glow=draws(ctx2d).find(d=>d.at(-1).filter!=='none');assert(glow,'drawn with the glow filter');assert.match(glow.at(-1).filter,/drop-shadow\(0px 0px [\d.]+px rgba\(255,216,146/);
 assert(draws(ctx2d).filter(d=>d.at(-1).filter==='none').length>=pets.length-1,'other pets are drawn plainly');
 ctx2d.calls.length=0;f.ctx.frame(2000);assert(draws(ctx2d).every(d=>d.at(-1).filter==='none'&&d.at(-1).alpha===1),'the effect ends');
});

test('grabbing a canvas pet mid-effect drops the effect instead of replaying its CSS from the start',async()=>{
 const {f,pets,field}=await onCanvas({realEffects:true}),p=pets[1];
 f.ctx.effectInstance.petEffect(p,'seal-ball-reveal',650);f.ctx.frame(140);
 assert(p.el.classList.contains('pet-canvas')&&p.el.classList.contains('seal-ball-reveal'));
 dispatch(field,'pointerdown',centre(p));
 assert.equal(p.held,true);assert(!p.el.classList.contains('pet-canvas'));assert(!p.el.classList.contains('seal-ball-reveal'),'a re-shown button would restart the reveal at scale .2');
 const q=pets[2];f.ctx.effectInstance.petEffect(q,'gift-arrival',1200);assert(q.el.classList.contains('gift-arrival'),'pets that stay buttons keep their running CSS effect');
});

test('reduced motion bakes only the standing art for articulated pets',async()=>{
 const {f,fake,pets}=await scene({prefs:{motion:'off'}}),p=pets[0];
 assert.equal(p.cvWalkKey,null);assert(p.cvStillKey);assert(!fake.requests.some(r=>r.key.startsWith('C')));
 fake.publishAll();f.ctx.frame(80);assert(pets.every(c=>c.onCanvas));assert.equal(p.cvState.body,p.cvStill.atlas);
});

test('a size change keeps the drawn bitmaps until the new size is baked',async()=>{
 const {f,fake,pets}=await onCanvas({count:1}),p=pets[0],old=p.cvWalk;
 const input=f.document.getElementById('size');input.value='50';for(const fn of input.events.input||[])fn({target:input});
 assert.notEqual(p.cvWalkKey,old.key);assert.equal(p.cvWalk,old,'old atlas kept meanwhile');
 f.ctx.frame(140);assert.equal(p.onCanvas,true);
 fake.publishAll();assert.notEqual(p.cvWalk,old);assert.equal(p.cvWalk.key,p.cvWalkKey);
});

test('a lost GPU context returns every pet to its button, and a restored one re-bakes the bitmaps',async()=>{
 const {f,fake,pets,layer}=await onCanvas();
 dispatch(layer,'contextlost');f.ctx.frame(150);
 assert(pets.every(c=>!c.onCanvas&&!c.el.classList.contains('pet-canvas')));
 const before=fake.requests.length;dispatch(layer,'contextrestored');
 assert(fake.dropped.length>0&&fake.dropped.every(k=>/^[CSAT]/.test(k)),'only canvas bitmaps are dropped');
 assert(fake.requests.length>before,'pets ask again');f.ctx.frame(166);assert(pets.every(c=>!c.onCanvas));
 fake.publishAll();f.ctx.frame(182);assert(pets.every(c=>c.onCanvas));
});

test('without the frame provider workers no canvas layer is made and pets stay plain DOM',async()=>{
 const {f,pets,layer}=await scene({provider:{enabled:false}});
 assert.equal(layer,undefined);assert(pets.every(c=>!c.onCanvas&&c.cvMode===undefined));
 assert(pets.every(c=>/translate/.test(c.el.style.transform)));
 for(let t=200;t<400;t+=16)f.ctx.frame(t);assert(pets.every(c=>!c.el.classList.contains('pet-canvas')));
});

test('without a GPU (software rendering) no canvas layer is made: DOM pets measured fastest there',async()=>{
 const {f,fake,pets,layer}=await scene({gpu:false});
 assert.equal(layer,undefined);assert.equal(fake.requests.length,0,'nothing is baked');
 for(let t=200;t<400;t+=16)f.ctx.frame(t);assert(pets.every(c=>!c.onCanvas&&!c.el.classList.contains('pet-canvas')&&/translate/.test(c.el.style.transform)));
});

test('viewer avatars are drawn from their loaded photo, baked once per size',async()=>{
 const s=Core.fresh(),kind=Core.registerAvatar(s,'https://example.com/viewer.png','Viewer',0);s.outside=1;s.positions=[{kind,x:.4,y:.6}];
 const {f,fake,pets}=await scene({state:s}),p=pets[0];
 // Startup prunes avatar rows no box or gift references; register on the live state as a gift would.
 p.kind=Core.registerAvatar(f.ctx.effectInstance.getState(),'https://example.com/viewer.png','Viewer',0);assert(p.kind>=1000000);
 f.ctx.customInstance.cfg.avatarMode=true;f.ctx.customInstance.onChange();f.ctx.frame(80);
 assert.equal(p.cvMode,'avatar');assert(!p.onCanvas,'not before the photo has loaded');
 assert(!fake.requests.some(r=>r.source==='https://example.com/viewer.png'),'avatars are not sent to workers');
 Object.assign(p.im,{complete:true,naturalWidth:120,naturalHeight:90});f.ctx.frame(96);
 assert.equal(p.onCanvas,true);assert.equal(p.cvState.body,p.cvAvatar);assert.equal(p.cvAvatar.key,'https://example.com/viewer.png#'+Math.round(p.size));
});
