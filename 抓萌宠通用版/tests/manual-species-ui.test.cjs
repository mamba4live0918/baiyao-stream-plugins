const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../src/core.js'),Roster=require('../src/roster.js'),Themes=require('../src/themes.js');
const source=fs.readFileSync(path.join(__dirname,'../src/customize.js'),'utf8');
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attrs={};this.classList={toggle(){}};}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}hasAttribute(k){return k in this.attrs;}
}
async function fixture(){
 const nodes=new Map(),calls=[],warnings=[],writes=[];
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
 const ctx={document,structuredClone,PetRoamGeometry:require('../src/roam-geometry.js'),Option:function(text,value){return{textContent:text,value};},localStorage:{getItem:()=>null,setItem:(k,v)=>writes.push([k,v])}};
 vm.runInNewContext(source+';globalThis.Type=CowCustomizer;',ctx);const Type=ctx.Type;
 for(const method of ['bind','bindPenManipulation','render'])Type.prototype[method]=()=>{};Type.prototype.loadMedia=async()=>{};
 const cows=Array.from({length:95},(_,i)=>({id:'native-'+i,name:'Native '+i,category:'dog',src:'data:image/png;base64,AA'})).concat(Array.from({length:8},(_,i)=>({id:'duck-'+i,kind:2000000+i,name:'Duck '+i,category:'yajiji',src:'data:image/png;base64,AA'})));
 const assets={cows,categories:[{id:'dog',name:'Dog'},{id:'yajiji',name:'Duck'},{id:'xiaoyao',name:'Friends',members:['native-0'],labels:{'native-0':'Group alias'}}],barns:Array.from({length:8},()=>({src:'data:image/png;base64,AA'})),balls:[{id:'ball',src:'data:image/png;base64,AA'}],audio:{}};
 const c=new Type({assets,core:Core,roster:Roster,themes:Themes,toast:text=>warnings.push(text),onChange(){},onManualAdd:(kind,n)=>{calls.push([kind,n]);return Math.min(n,3);}});await c.ready;
 c.cfg.customCows.push({kind:100,name:'My pet',enabled:true,scale:200,fps:8,motion:'walk',category:'dog'});c.records.set('cow:100',{type:'image',data:'data:image/png;base64,AA'});
 const card=(kind,category='dog')=>{c.galleryCategory=category;c.renderCows();return [...nodes.get('cow-gallery').children,...nodes.get('custom-cow-gallery').children].find(el=>Number(el.dataset.cow)===kind);};
 return{c,calls,warnings,writes,card,nodes};
}
function controls(card){const group=card.children.find(el=>el.className==='species-add-controls');assert(group,'species card has independent manual-add controls');return{group,input:group.children.find(el=>el.tagName==='INPUT'),button:group.children.find(el=>el.tagName==='BUTTON')};}
test('native and extension cards pass exact logical kinds and return the actual callback amount',async()=>{
 const f=await fixture(),ordinary=controls(f.card(0)),extended=controls(f.card(2000005,'yajiji'));
 assert.equal(String(ordinary.input.value),'1');assert.equal(String(ordinary.input.min),'1');assert.equal(String(ordinary.input.max),'10000');assert.equal(String(ordinary.input.step),'1');assert.equal(ordinary.button.textContent,'+');
 ordinary.input.value='8';assert.equal(ordinary.button.onclick(),3);assert.equal(extended.button.onclick(),1);assert.deepEqual(f.calls,[[0,8],[2000005,1]]);
 assert.equal(extended.button.attrs['aria-label'],'加入 Duck 5');assert(!extended.button.title);
});
test('disabled native and personal species remain manually addable without changing random configuration',async()=>{
 const f=await fixture();f.c.cfg.cowSettings[0].enabled=false;f.c.cfg.customCows[0].enabled=false;f.c.cfg.activeCategory='yajiji';f.c.cfg.theme='aquarium';f.c.cfg.castA=2000000;
 const before=JSON.stringify(f.c.cfg),ordinary=controls(f.card(0)),own=controls(f.card(100));assert.equal(ordinary.button.disabled,false);assert.equal(own.button.disabled,false);
 ordinary.button.onclick();own.input.value='7';own.button.onclick();assert.deepEqual(f.calls,[[0,1],[100,7]]);assert.equal(JSON.stringify(f.c.cfg),before);assert.equal(f.writes.length,0);
});
test('quantity keys never add pets; clicking plus still adds the entered species quantity',async()=>{
 const f=await fixture(),{input,button}=controls(f.card(100));input.value='10000';let prevented=0,stopped=0;
 const event={key:'Enter',preventDefault(){prevented++;},stopPropagation(){stopped++;}};
 for(const change of [{},{repeat:true},{isComposing:true},{key:'ArrowUp'}])input.onkeydown?.({...event,...change});
 assert.deepEqual(f.calls,[]);assert.equal(prevented,0);assert.equal(stopped,0);assert.equal(input.value,'10000');
 input.oninput();assert.equal(input.hasAttribute('aria-invalid'),false);assert.equal(button.onclick(),3);assert.deepEqual(f.calls,[[100,10000]]);
});
test('invalid quantities mark the field and do not call the addition hook or change config',async()=>{
 const f=await fixture(),{input,button}=controls(f.card(0)),before=JSON.stringify(f.c.cfg);
 for(const value of ['', ' ', '0','-1','1.5','10001','NaN','Infinity','abc']){input.value=value;assert.equal(button.onclick(),0);assert.equal(input.attrs['aria-invalid'],'true');}
 assert.deepEqual(f.calls,[]);assert(f.warnings.length);assert.equal(JSON.stringify(f.c.cfg),before);assert.equal(f.writes.length,0);
 input.value='2';input.oninput();assert.equal(input.hasAttribute('aria-invalid'),false);assert.equal(button.onclick(),2);
});
test('Xiaoyao aliases keep the same original logical ID and accessible display name',async()=>{
 const f=await fixture(),{button}=controls(f.card(0,'xiaoyao'));assert.equal(button.attrs['aria-label'],'加入 Group alias');button.onclick();assert.deepEqual(f.calls,[[0,1]]);
});
test('a stale deleted personal card cannot accidentally add the native asset at its former array index',async()=>{
 const f=await fixture(),{input,button}=controls(f.card(100));f.c.cfg.customCows=[];f.c.records.delete('cow:100');input.value='4';assert.equal(button.onclick(),0);assert.deepEqual(f.calls,[]);assert(f.warnings.some(text=>text.includes('删除')||text.includes('不可用')));
});
test('missing personal artwork and absent injection do not silently substitute another pet',async()=>{
 const f=await fixture();f.c.records.delete('cow:100');const missing=controls(f.card(100));assert.equal(missing.button.disabled,true);assert.equal(missing.button.onclick(),0);assert.deepEqual(f.calls,[]);
 f.c.onManualAdd=null;const noHook=controls(f.card(0));assert.equal(noHook.button.disabled,true);assert.equal(noHook.button.onclick(),0);
});
test('the duck theme blocks non-duck cards and old handlers recheck the current theme before adding',async()=>{
 const f=await fixture(),stale=controls(f.card(0));assert.equal(stale.button.disabled,false);f.c.cfg.theme='yajiji';
 assert.equal(stale.button.onclick(),0);assert.deepEqual(f.calls,[]);
 for(const kind of [0,100]){const {input,button}=controls(f.card(kind));assert.equal(button.disabled,true);assert.equal(input.disabled,true);assert(!button.title);assert.equal(button.onclick(),0);}
 assert(f.warnings.some(text=>text.includes('先切换主题')));assert.deepEqual(f.calls,[]);
});
test('duck membership is determined by category rather than logical ID range or random enabled flags',async()=>{
 const f=await fixture();f.c.cfg.theme='yajiji';f.c.cfg.customCows[0].category='yajiji';f.c.cfg.customCows[0].enabled=false;f.c.cfg.cowSettings[f.c.builtinIndex(2000005)].enabled=false;
 const own=controls(f.card(100,'yajiji')),native=controls(f.card(2000005,'yajiji'));assert.equal(own.button.disabled,false);assert.equal(native.button.disabled,false);own.button.onclick();native.button.onclick();assert.deepEqual(f.calls,[[100,1],[2000005,1]]);
 f.c.builtinCow(2000005).category='dog';assert.equal(native.button.onclick(),0);assert.deepEqual(f.calls,[[100,1],[2000005,1]]);
});
