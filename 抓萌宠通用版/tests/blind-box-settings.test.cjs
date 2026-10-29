const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/core.js');
let Box,UI;try{Box=require('../src/blind-box.js');}catch{}try{UI=require('../src/box-settings.js');}catch{}
class Element extends EventTarget{
 constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.attrs={};this.classList={toggle(){}};this.value='';this.checked=false;}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}hasAttribute(k){return k in this.attrs;}
 click(){this.dispatchEvent(new Event('click'));this.onclick?.();}
}
function documentFixture(){const nodes=new Map(),doc={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element('div',doc));return nodes.get(id);},createElement:tag=>new Element(tag,doc),createTextNode:text=>({textContent:text}),querySelectorAll:()=>[]};return{doc,nodes};}
function walk(node){return[node,...(node.children||[]).flatMap(walk)];}
function field(f,id,key){return walk(f.container).find(el=>el.dataset?.boxTier===id&&el.dataset?.boxField===key);}
function edit(f,id,key,value){const input=field(f,id,key);assert(input,'editable '+key);if(key==='enabled'){input.checked=value;input.dispatchEvent(new Event('change'));}else{input.value=value;input.dispatchEvent(new Event(key==='mode'?'change':'input'));}}
const tier=(id,name,count,gift='')=>({id,name,gift,mode:'fixed',count,min:count,max:count,enabled:true});
function fixture(){
 assert.equal(typeof UI,'function','blind-box settings controller exists');assert.equal(typeof Box?.validateTiers,'function','real blind-box validator exists');
 const {doc}=documentFixture(),container=doc.getElementById('tier-list'),summary=doc.getElementById('tier-summary');
 let live=[tier('a','Small',5,'Rose'),tier('b','Large',20,'Star')],saves=0;const opened=[],gifts=[],notices=[],current={id:'old',count:77,applied:false};
 const ui=new UI({container,summary,blindBox:Box,getTiers:()=>live,onApply:rows=>{live=rows;saves++;return true;},onPreview:id=>opened.push(id),onGiftTest:gift=>gifts.push(gift),toast:text=>notices.push(text)});
 return{ui,container,summary,opened,gifts,notices,current,get live(){return live;},get saves(){return saves;},replaceLive:rows=>live=rows};
}
test('edits stay in draft until a valid apply, and an active opening snapshot is unchanged',()=>{
 const f=fixture();edit(f,'a','name','New small');edit(f,'a','count','20');
 assert.equal(f.live[0].name,'Small');assert.equal(f.saves,0);assert.equal(f.ui.apply(),true);
 assert.equal(f.live[0].name,'New small');assert.equal(f.live[0].count,20);assert.equal(f.live[1].count,20);assert.equal(f.saves,1);assert.deepEqual(f.current,{id:'old',count:77,applied:false});
});
test('invalid amounts, duplicate normalized gift names and empty names never alter live rules',()=>{
 const f=fixture();for(const [key,value]of [['count',''],['count','0'],['count','1.5'],['count','100001'],['name',''],['gift',' Ｓｔａｒ ']]){
  f.ui.reset();edit(f,'a',key,value);assert.equal(f.ui.apply(),false);assert.equal(f.saves,0);assert.equal(f.live[0].count,5);
 }
 assert.equal(walk(f.container).some(el=>el.dataset?.boxAction==='normalize'||el.dataset?.boxField==='chance'),false);
});
test('random mode stages both ends together and fixed mode preserves the canonical amount',()=>{
 const f=fixture();edit(f,'a','mode','random');assert.equal(field(f,'a','count'),undefined);edit(f,'a','min','40');edit(f,'a','max','20');assert.equal(f.ui.apply(),false);assert.equal(f.live[0].mode,'fixed');
 edit(f,'a','max','100000');assert.equal(f.ui.apply(),true);assert.deepEqual(f.live[0],{id:'a',name:'Small',gift:'Rose',mode:'random',count:40,min:40,max:100000,enabled:true});
 edit(f,'a','mode','fixed');assert.equal(field(f,'a','min'),undefined);edit(f,'a','count','99999');assert.equal(f.ui.apply(),true);assert.deepEqual(f.live[0],tier('a','Small',99999,'Rose'));
});
test('add and delete remain staged; blank gift names remain available for manual testing',()=>{
 const f=fixture();assert.equal(f.ui.add(),true);assert.equal(f.live.length,2);assert.equal(f.saves,0);
 const fresh=walk(f.container).find(el=>el.dataset?.boxField==='name'&&!['a','b'].includes(el.dataset.boxTier));assert(fresh);
 assert.equal(field(f,fresh.dataset.boxTier,'gift').value,'');assert.equal(f.ui.remove('a'),true);assert.equal(f.live.length,2);
 assert.equal(f.ui.apply(),true);assert.equal(f.live.some(r=>r.id==='a'),false);assert.equal(f.ui.testTier(fresh.dataset.boxTier),true);assert.equal(f.ui.testGift(fresh.dataset.boxTier),false);
 edit(f,'b','enabled',false);assert.equal(f.ui.apply(),true);assert.equal(f.ui.testGift('b'),false);
});
test('unrelated rerenders retain drafts; both testing routes use only applied enabled bindings',()=>{
 const f=fixture();assert.equal(f.ui.testTier('a'),true);assert.deepEqual(f.opened,['a']);
 assert.equal(f.ui.testGift('a'),true);assert.deepEqual(f.gifts,[{giftName:'Rose',count:1}]);
 edit(f,'a','gift','New gift');f.ui.sync();assert.equal(field(f,'a','gift').value,'New gift');assert.equal(f.ui.testTier('a'),false);assert.equal(f.ui.testGift('a'),false);assert.deepEqual(f.opened,['a']);
 f.ui.reset();assert.equal(f.ui.testTier('missing'),false);edit(f,'b','enabled',false);f.ui.apply();assert.equal(f.ui.testTier('b'),false);
});
test('external live changes require an explicit draft reload instead of silently replacing either version',()=>{
 const f=fixture();edit(f,'a','name','Draft name');f.replaceLive([tier('new','External',99)]);f.ui.sync();
 assert.equal(field(f,'a','name').value,'Draft name');assert.equal(f.ui.apply(),false);assert.equal(f.saves,0);
 f.ui.reset();assert.equal(field(f,'new','name').value,'External');assert.equal(f.ui.apply(),true);
});
test('a failed apply callback leaves the draft available and the last live rows intact',()=>{
 const f=fixture();f.ui.onApply=()=>false;edit(f,'a','name','Retry me');assert.equal(f.ui.apply(),false);assert.equal(f.live[0].name,'Small');assert.equal(field(f,'a','name').value,'Retry me');
});
function customFixture(saved,hooks={}){
 assert.equal(typeof Box?.migrate,'function');const {doc,nodes}=documentFixture(),warnings=[],writes=[];const raw=JSON.stringify(saved),storage={getItem:()=>raw,setItem:(key,value)=>writes.push([key,value])};
 const context={document:doc,structuredClone,setTimeout,clearTimeout,PetRoamGeometry:require('../src/roam-geometry.js'),localStorage:storage,Option:function(text,value){return{textContent:text,value};},Audio:function(){throw Error('Legacy audio must not play');}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/customize.js'),'utf8')+';globalThis.Type=CowCustomizer;',context);
 const Type=context.Type,loadMedia=Type.prototype.loadMedia;for(const key of ['bind','bindPenManipulation','render'])Type.prototype[key]=()=>{};Type.prototype.loadMedia=async()=>{};
 const assets={cows:[{id:'pet',name:'Pet',category:'dog',src:'data:image/png;base64,AA'}],categories:[{id:'dog',name:'Dog'}],barns:Array.from({length:6},()=>({src:'data:image/png;base64,AA'})),balls:[{id:'ball',src:'data:image/png;base64,AA'}],audio:{},durations:{}};
 const c=new Type({assets,core:C,blindBox:Box,boxSettings:UI,toast:text=>warnings.push(text),onChange(){},...hooks});return{c,warnings,writes,nodes,context,loadMedia:()=>loadMedia.call(c)};
}
test('customizer migrates old quantity tiers to unbound fixed boxes without changing old tier or audio records',async()=>{
 const legacy=[{id:'old-a',count:5,enabled:true},{id:'old-b',count:8,enabled:true},{id:'off',count:50,enabled:false}],f=customFixture({tiers:legacy,ballSettings:[{enabled:false}]});await f.c.ready;
 assert.deepEqual(JSON.parse(JSON.stringify(f.c.cfg.tiers)),legacy);assert.deepEqual(Array.from(f.c.cfg.boxTiers,r=>[r.id,r.mode,r.gift,r.count,r.enabled]),[['old-a','fixed','',5,true],['old-b','fixed','',8,true],['off','fixed','',50,false]]);assert.equal(f.writes.length,0);
 f.c.records.set('audio:start',{data:'data:audio/wav;base64,AA'});assert.equal(f.c.previewAudio('audio:start'),false);assert.equal(f.c.records.has('audio:start'),true);assert.deepEqual(Array.from(f.c.roundCues({})),[]);
 f.c.save();assert.equal(f.writes.length,1);assert.deepEqual(JSON.parse(f.writes[0][1]).tiers,legacy);
});
test('new gift tiers restore and interim probability rows migrate without changing their name or quantity',async()=>{
 const rows=[tier('saved','Saved',99,' Rose ')],a=customFixture({tiers:C.defaultTiers(),boxTiers:rows});await a.c.ready;assert.equal(a.c.cfg.boxTiers[0].gift,'Rose');assert.equal(a.writes.length,0);assert.equal(a.c.boxTierForGift(' Ｒｏｓｅ ').id,'saved');
 const interim=[{id:'saved',name:'My old box',count:99,chance:10000,enabled:true}],b=customFixture({tiers:C.defaultTiers(),boxTiers:interim});await b.c.ready;assert.deepEqual(JSON.parse(JSON.stringify(b.c.cfg.boxTiers)),[tier('saved','My old box',99)]);assert.equal(b.writes.length,0);
});
test('blind-box common audio exposes new cues and interactions while synthetic preview calls the supplied hook',async()=>{
 const f=customFixture({tiers:C.defaultTiers()}),keys=[];await f.c.ready;f.c.audioMixer={mountLevel:(row,key)=>keys.push(key)};f.c.renderCommonAudio();
 assert.deepEqual(keys,['audio:boxopen','audio:boxreveal','audio:grab','audio:home','audio:recall','audio:tornado','audio:boom','audio:ballpop']);
 const heard=[];f.c.onSoundPreview=key=>heard.push(key);f.c.previewAudio('audio:boxopen');f.c.previewAudio('audio:home');assert.deepEqual(heard,['audio:boxopen','audio:home']);f.c.syncStartAudio();
});
test('unrelated saves preserve rejected stored box rows until the user explicitly applies a valid replacement',async()=>{
 const invalid=[{...tier('saved','Invalid',99),mode:'random',min:100,max:1}],f=customFixture({tiers:C.defaultTiers(),boxTiers:invalid});await f.c.ready;
 f.c.cfg.showX=30;f.c.save();assert.deepEqual(JSON.parse(f.writes.at(-1)[1]).boxTiers,invalid);
 assert.equal(f.c.commitBoxTiers(invalid),false);f.c.save();assert.deepEqual(JSON.parse(f.writes.at(-1)[1]).boxTiers,invalid);
 const valid=[tier('saved','Valid',99)];assert.equal(f.c.commitBoxTiers(valid),true);assert.deepEqual(JSON.parse(f.writes.at(-1)[1]).boxTiers,valid);
});
test('small-window box layout measures visible content and keeps the show container within the viewport',async()=>{
 const f=customFixture({tiers:C.defaultTiers()});await f.c.ready;Object.assign(f.context,{innerWidth:320,innerHeight:180});
 f.c.cfg.showX=99;f.c.cfg.showY=99;f.c.cfg.showWidth=800;const show=f.context.document.getElementById('show');show.hidden=true;show.offsetHeight=260;
 f.c.applyLayout(true);const width=parseFloat(show.style.width),left=parseFloat(show.style.left),top=parseFloat(show.style.top),height=parseFloat(show.style.height);
 assert.equal(show.hidden,false);assert(width<=90);assert(left-width/2>=0&&left+width/2<=320);assert(top-height/2>=0&&top+height/2<=180);assert.equal(show.style.overflowY,'visible');assert.equal(show.style.overflowX,'visible');
 assert.equal(left,160);assert.equal(top,90);
});
test('the tier editor can add beyond one thousand rows without a fixed row limit',()=>{
 const f=fixture();f.replaceLive(Array.from({length:1001},(_,i)=>tier('many-'+i,'Box '+i,1)));f.ui.reset();assert.equal(f.ui.add(),true);assert.equal(f.ui.apply(),true);assert.equal(f.live.length,1002);
});
test('all-disabled and empty catalogs apply without reintroducing a default tier or binding',()=>{
 const f=fixture();edit(f,'a','enabled',false);edit(f,'b','enabled',false);assert.equal(f.ui.apply(),true);assert.equal(f.ui.testTier('a'),false);assert.equal(f.ui.testGift('a'),false);
 f.ui.remove('a');f.ui.remove('b');assert.equal(f.ui.apply(),true);assert.deepEqual(f.live,[]);assert.match(f.summary.textContent,/共 0 档/);
});
test('customizer tier gift simulation calls the injected real gift route with the applied normalized name',async()=>{
 const gifts=[],f=customFixture({tiers:C.defaultTiers(),boxTiers:[tier('bound','Bound',100000,' Ｒｏｓｅ ')]},{onGiftTest:data=>gifts.push(data)});await f.c.ready;
 f.c.renderTiers();assert.equal(f.c.boxEditor.testGift('bound'),true);assert.deepEqual(gifts,[{giftName:'Rose',count:1}]);assert.equal(f.c.boxTierForGift('Rose').count,100000);
});
test('stored opening and reveal uploads load under new audio keys without removing legacy voice records',async()=>{
 const f=customFixture({tiers:C.defaultTiers()});await f.c.ready;const keys=['audio:boxopen','audio:boxreveal','audio:start'],values=keys.map(key=>({type:'audio',data:'data:audio/wav;base64,AA',name:key,duration:1}));
 const db={transaction(){const tx={objectStore:()=>({getAllKeys:()=>({result:keys}),getAll:()=>({result:values})})};setImmediate(()=>tx.oncomplete());return tx;},close(){}};
 f.context.indexedDB={open(){const req={result:db};setImmediate(()=>req.onsuccess());return req;}};
 await f.loadMedia();for(const key of keys)assert.equal(f.c.records.get(key).name,key);
});
