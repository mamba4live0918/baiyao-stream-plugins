'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'mua.js'),'utf8');
const kinds=['mua','blush','sparkle','question','heartbeat','headpat'],keys=['m','b','s','q','h','p'];
async function page(search='',{load=true}={}){
 const elements=new Map(),listeners={},windows={},images=[],dispatches=[],storage=new Map();let reads=0,frame,heartOptions,momentOptions;
 const context={clearRect(){},getImageData(){reads++;return {data:Uint8ClampedArray.from([0,0,0,8,0,0,0,0])};}};
 function element(id){
  if(!elements.has(id)){
   const classes=new Set(),attributes={};
   elements.set(id,{id,style:{},dataset:{},events:{},attributes,value:'',checked:true,disabled:false,textContent:'',
    classList:{toggle(name,value){const on=value===undefined?!classes.has(name):value;if(on)classes.add(name);else classes.delete(name);return on;},add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
    addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){attributes[name]=String(value);},
    getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}),setPointerCapture(){},
    querySelector(selector){if(id==='aim'&&selector==='.aim-label')return element('aim-label');throw Error('Unexpected selector: '+selector);}
   });
  }return elements.get(id);
 }
 const cards=kinds.map((kind,i)=>{const node=element(i?'card-'+kind:'play');node.dataset.moment=kind;return node;});
 const document={hidden:false,body:element('body'),getElementById:element,querySelectorAll(selector){assert.equal(selector,'[data-moment]');return cards;},addEventListener:(name,fn)=>{listeners[name]=fn;}};
 function engine(type){let jobs=[],prepared=0;return {
  clear(){jobs=[];},enqueue(job,time){jobs.push({job,time});dispatches.push({engine:type,kind:type==='heart'?'mua':job.moment,time,point:{...job.point}});},
  draw(ctx,time){jobs=jobs.filter(item=>time-item.time<1800);},active:()=>jobs.length>0,prepareTextures(){prepared++;},get prepared(){return prepared;},
  snapshot:()=>type==='heart'?{hearts:jobs.map(({job})=>({origin:{...job.point},x:job.point.x*1280,y:job.point.y*720,motionPhase:'mua-glide'})),shards:0,bursts:[]}:
   {moments:jobs.map(({job})=>({moment:job.moment,point:{...job.point}}))}
 };}
 const fx=engine('heart'),moments=engine('moments');class Image{constructor(){images.push(this);}decode(){return Promise.resolve();}}
 const box={document,location:{search},URLSearchParams,Image,MuaSpriteMeta:{},BaiyaoHeartProjectile:{create(options){heartOptions=options;return fx;}},BaiyaoAnimeMoments:{create(options){momentOptions=options;return moments;}},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame(){},window:{addEventListener:(name,fn)=>{windows[name]=fn;}}};
 vm.createContext(box);vm.runInContext(source,box);const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const api={element,cards,images,fx,moments,dispatches,storage,get plays(){return dispatches.length;},get reads(){return reads;},get lastPoint(){return dispatches.at(-1)?.point;},get heartOptions(){return heartOptions;},get momentOptions(){return momentOptions;},
  async loadImage(index){await images[index].onload();await settle();},async loadAll(){await Promise.all(images.map(image=>image.onload()));await settle();},async failImage(index){images[index].onerror();await settle();},
  click(id){const node=element(id);if(!node.disabled)node.events.click();},key(key,options={}){let prevented=false;listeners.keydown({key,target:{closest:()=>options.editing?{}:null},preventDefault(){prevented=true;},...options});return prevented;},
  visibility(hidden){document.hidden=hidden;listeners.visibilitychange();},tick(now){frame(now);},anchor(name){element('anchor').value=name;element('anchor').events.change();},
  input(name,value){const input=element(name);input.value=value;input.valueAsNumber=value===''?NaN:Number(value);input.events.input();}
 };if(load)await api.loadAll();return api;
}
test('transparent source resumes only on a visible manual trigger after being hidden',async()=>{
 const p=await page();p.key('m');assert.equal(p.plays,1);p.visibility(true);p.key('m');assert.equal(p.plays,1);assert.equal(p.element('fx').dataset.paused,'true');
 p.visibility(false);p.tick(200);assert.equal(p.plays,1);assert.equal(p.element('fx').dataset.paused,'true');p.key('m');assert.equal(p.plays,2);assert.equal(p.element('fx').dataset.paused,'false');
});
test('preview stays paused until Continue and excludes paused time and the resume baseline',async()=>{
 const p=await page('?preview=1');p.tick(100);p.tick(400);const before=p.element('fx').dataset.gameTime;
 p.visibility(true);p.visibility(false);p.key('m');p.tick(5000);assert.equal(p.plays,0);assert.equal(p.element('fx').dataset.gameTime,before);
 p.click('pause');p.key('m');assert.equal(p.plays,1);p.tick(5100);assert.equal(p.element('fx').dataset.gameTime,before);p.tick(5400);assert.equal(p.element('fx').dataset.gameTime,'600.0');
});
test('ordinary source and preview avoid pixel readback during play, pause, idle and clear',async()=>{
 for(const search of ['', '?preview=1']){const p=await page(search);p.tick(200);p.key('m');p.tick(400);assert.equal(p.element('fx').dataset.paintedPixels,undefined);p.click('pause');p.tick(600);p.click('clear');assert.equal(p.reads,0);assert.equal(p.element('fx').dataset.paintedPixels,'0');}
});
test('debug=1 explicitly enables alpha inspection',async()=>{const p=await page('?preview=1&debug=1');assert.ok(p.reads>0);p.key('m');assert.equal(p.element('fx').dataset.paintedPixels,'1');});
test('numeric input moves the anchor without rewriting typed text and repairs empty fields on change',async()=>{
 const p=await page('?preview=1');for(const [key,value] of [['x','25.00'],['y','45']]){p.input(key,value);assert.equal(p.element(key).value,value);}
 assert.equal(p.element('aim').style.left,'25%');assert.equal(p.element('aim').style.top,'45%');p.key('m');assert.equal(p.lastPoint.x,.25);assert.equal(p.lastPoint.y,.45);
 p.element('x').events.change();assert.equal(p.element('x').value,'25.0');assert.equal(p.element('y').value,'45.0');p.input('x','');assert.equal(p.element('aim').style.left,'25%');p.element('x').events.change();assert.equal(p.element('x').value,'25.0');
});
test('six cards dispatch distinct effects to the correct engine; diagnostics use actual moments snapshots',async()=>{
 const p=await page('?preview=1');for(let i=0;i<kinds.length;i++){p.click(p.cards[i].id);assert.equal(p.plays,i+1);assert.equal(p.dispatches[i].kind,kinds[i]);assert.equal(p.dispatches[i].engine,i?'moments':'heart');}
 assert.equal(p.element('fx').dataset.moments,'5');assert.equal(p.element('fx').dataset.kinds,kinds.slice(1).join(','));p.click('clear');p.click('card-question');assert.equal(p.element('fx').dataset.phase,'question');assert.equal(p.element('fx').dataset.moments,'1');
});
test('shortcuts select distinct effects; repeats, modifiers and editable targets do not trigger',async()=>{
 const p=await page('?preview=1');for(let i=0;i<keys.length;i++){assert.equal(p.key(keys[i].toUpperCase()),true);assert.equal(p.dispatches[i].kind,kinds[i]);}
 const before=p.plays;for(const key of [...keys,'g'])for(const options of [{repeat:true},{editing:true},{ctrlKey:true},{metaKey:true},{altKey:true}])p.key(key,options);assert.equal(p.plays,before);assert.equal(p.element('fx').dataset.pending,'0');
});
test('five anchors retain independent calibration and effects use their named anchor',async()=>{
 const p=await page('?preview=1'),positions={mouth:[25,45],headTop:[10,15],cheekL:[20,25],cheekR:[75,33],chest:[45,68]};
 for(const [name,[x,y]] of Object.entries(positions)){p.anchor(name);p.input('x',String(x));p.input('y',String(y));}
 for(const [name,[x,y]] of Object.entries(positions)){p.anchor(name);assert.equal(p.element('x').value,x.toFixed(1));assert.equal(p.element('y').value,y.toFixed(1));const resolved=p.momentOptions.resolvePoint({},name);assert.equal(resolved.x,x/100);assert.equal(resolved.y,y/100);}
 const expected=['mouth','cheekL','cheekL','headTop','chest','headTop'];for(let i=0;i<kinds.length;i++){p.click(p.cards[i].id);const [x,y]=positions[expected[i]];assert.equal(p.lastPoint.x,x/100);assert.equal(p.lastPoint.y,y/100);assert.equal(p.element('anchor').value,expected[i]);}
 assert.equal(p.heartOptions.resolvePoint().x,.25);assert.match(p.element('aim').attributes['aria-label'],/头顶准心/);const saved=JSON.parse(p.storage.get('baiyao.anime-preview.v2'));assert.equal(saved.points.mouth.x,.25);assert.equal(saved.points.cheekR.x,.75);
});
test('small scene dispatches in game-clock order and excludes paused time',async()=>{
 const p=await page('?preview=1');p.tick(100);p.click('scene-sweet');p.tick(200);assert.deepEqual(p.dispatches.map(x=>x.kind),['sparkle']);p.tick(600);
 p.click('pause');const frozen=p.element('fx').dataset.gameTime;p.tick(1600);p.tick(5000);assert.equal(p.plays,1);assert.equal(p.element('fx').dataset.gameTime,frozen);
 p.click('pause');p.tick(5100);assert.equal(p.plays,1);p.tick(5200);assert.deepEqual(p.dispatches.map(x=>x.kind),['sparkle','blush']);p.tick(5900);assert.equal(p.plays,2);p.tick(6000);
 assert.deepEqual(p.dispatches.map(x=>x.kind),['sparkle','blush','mua']);assert.deepEqual(p.dispatches.map(x=>x.time),[100,600,1400]);assert.equal(p.element('fx').dataset.pending,'0');
});
test('clear cancels future scene actions; an individual card replaces the pending sequence',async()=>{
 for(const replacement of ['clear','card-question']){const p=await page('?preview=1');p.tick(100);p.click('scene-sweet');p.tick(200);assert.equal(p.plays,1);p.click('pause');
  if(replacement==='clear'){p.click('clear');assert.equal(p.element('fx').dataset.pending,'0');p.click('pause');}else{p.click('pause');p.click(replacement);}
  p.tick(300);p.tick(1300);p.tick(2300);p.tick(3300);assert.deepEqual(p.dispatches.map(x=>x.kind),replacement==='clear'?['sparkle']:['sparkle','question']);assert.equal(p.element('fx').dataset.pending,'0');
 }
});
test('all four assets must load before cards or sequence are enabled',async()=>{
 const p=await page('?preview=1',{load:false});assert.equal(p.images.length,4);assert.deepEqual(p.images.map(image=>image.src),['mua-heart.png','moment-blush.png','moment-question.png','moment-hand.png']);
 for(let i=0;i<3;i++){await p.loadImage(i);assert.ok(p.cards.every(card=>card.disabled));assert.equal(p.element('scene-sweet').disabled,true);p.key(keys[i]);}
 assert.equal(p.plays,0);await p.loadImage(3);assert.ok(p.cards.every(card=>!card.disabled));assert.equal(p.element('scene-sweet').disabled,false);assert.equal(p.fx.prepared,1);assert.equal(p.moments.prepared,1);p.click('card-blush');assert.equal(p.plays,1);
});
test('asset failure gates dispatch controls even after pause toggles',async()=>{
 const p=await page('?preview=1',{load:false});await p.failImage(2);for(const i of [0,1,3])await p.loadImage(i);
 assert.ok(p.cards.every(card=>card.disabled));assert.equal(p.element('scene-sweet').disabled,true);assert.equal(p.element('state').textContent,'素材未加载');p.click('pause');p.click('pause');for(const key of [...keys,'g'])p.key(key);p.tick(100);p.tick(1000);
 assert.equal(p.plays,0);assert.ok(p.cards.every(card=>card.disabled));assert.equal(p.element('scene-sweet').disabled,true);assert.equal(p.fx.prepared,0);assert.equal(p.moments.prepared,0);
});
