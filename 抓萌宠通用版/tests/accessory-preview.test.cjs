const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const Core=require('../src/core.js'),Roster=require('../src/roster.js'),Themes=require('../src/themes.js');
const png='data:image/png;base64,dXBsb2Fk',gif='data:image/gif;base64,dXBsb2Fk',poster='data:image/png;base64,cG9zdGVy';

class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attributes={};this.classList={toggle(){}};}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
 setAttribute(key,value){this.attributes[key]=String(value);}removeAttribute(key){delete this.attributes[key];}hasAttribute(key){return key in this.attributes;}
}

async function fixture(){
 const nodes=new Map(),document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
 const context={document,structuredClone,PetRoamGeometry:require('../src/roam-geometry.js'),Option:function(text,value){return{textContent:text,value};},localStorage:{getItem:()=>null,setItem(){}}};
 vm.runInNewContext(read('src/customize.js')+';globalThis.Type=CowCustomizer;',context);
 const Type=context.Type;
 for(const method of ['bind','bindPenManipulation','render'])Type.prototype[method]=()=>{};
 Type.prototype.loadMedia=async()=>{};
 const assets=JSON.parse(read('素材/manifest.json'));
 assets.cows=assets.cows.map((asset,index)=>({...asset,src:'base-'+(asset.kind??index)+'.png',walk:'walk-'+(asset.kind??index)+'.png'}));
 assets.accessories={72:{src:'prop-72.png',walk:'prop-72-walk.png',frames:12,preview:'decorated-72.png'}};
 const custom=new Type({assets,core:Core,roster:Roster,themes:Themes,toast(){},onChange(){}});await custom.ready;
 custom.cfg.customCows.push({kind:100,name:'Personal pet',enabled:true,scale:200,fps:8,motion:'walk',category:'xiaoyao-furry'});
 custom.records.set('cow:100',{type:'image',data:png});
 const card=(kind,category='xiaoyao-furry')=>{custom.galleryCategory=category;custom.renderCows();return [...nodes.get('cow-gallery').children,...nodes.get('custom-cow-gallery').children].find(item=>Number(item.dataset.cow)===kind);};
 return{custom,assets,nodes,card};
}

// Catches using the flattened gallery image as the scene source and applying props twice.
test('decorated built-ins have a separate preview while scene image and walking sources remain original',async()=>{
 const {custom}=await fixture();assert.equal(typeof custom.cowPreview,'function','a separate gallery preview source is required');
 assert.equal(custom.cowPreview(72),'decorated-72.png');
 assert.equal(custom.cowSource(72),'base-72.png');
 assert.equal(custom.cowStaticSource(72),'base-72.png');
 assert.equal(custom.cowWalk(72),'walk-72.png');
});

// Catches bypassing an uploaded replacement because stock accessory art has a preview.
for(const [label,record,want] of [
 ['PNG',{type:'image',data:png},png],
 ['GIF',{type:'image',data:gif,poster},gif],
 ['frames',{type:'frames',data:png,poster,frames:2,durations:[80,120]},poster]
])test(label+' uploads take precedence over decorated builtin gallery previews',async()=>{
 const {custom}=await fixture();assert.equal(typeof custom.cowPreview,'function','a separate gallery preview source is required');
 custom.records.set('cow:72',record);assert.equal(custom.cowPreview(72),want);
 custom.records.delete('cow:72');assert.equal(custom.cowPreview(72),'decorated-72.png');
});

// Catches a malformed or missing preview blanking an otherwise valid original image.
test('missing and invalid accessory preview values fall back to the existing source',async()=>{
 const {custom,assets}=await fixture();assert.equal(typeof custom.cowPreview,'function','a separate gallery preview source is required');
 for(const value of [undefined,null,false,17,'',' ']){assets.accessories[72].preview=value;assert.equal(custom.cowPreview(72),'base-72.png');}
 delete assets.accessories;assert.equal(custom.cowPreview(72),'base-72.png');
});

// Catches looking up props by array position or applying a map entry to unknown/personal kinds.
test('unknown and personal kinds use existing sources even if their IDs have preview entries',async()=>{
 const {custom,assets}=await fixture();assert.equal(typeof custom.cowPreview,'function','a separate gallery preview source is required');
 assets.accessories[100]={preview:'wrong-native-index.png'};assets.accessories[999999]={preview:'wrong-unknown.png'};
 assert.equal(custom.cowPreview(100),png);custom.records.delete('cow:100');assert.equal(custom.cowPreview(100),'base-0.png');
 assert.equal(custom.cowPreview(999999),'base-0.png');assert.equal(custom.cowPreview('72'),'base-0.png');
 assert.equal(custom.cowPreview(2000005),'base-2000005.png');
});

// Catches adding a helper without switching the visible card to its preview source.
test('the actual gallery card uses decorated art and rerenders uploaded originals',async()=>{
 const f=await fixture();assert.equal(f.card(72).children[0].src,'decorated-72.png');
 f.custom.records.set('cow:72',{type:'image',data:gif,poster});assert.equal(f.card(72).children[0].src,gif);
 assert.equal(f.card(100).children[0].src,png);
 f.custom.records.delete('cow:72');assert.equal(f.card(72).children[0].src,'decorated-72.png');
});

// Catches remapping gallery identities globally when the scene uses the duck theme.
test('duck-theme gallery categories keep each native preview tied to its actual species',async()=>{
 const f=await fixture();assert.equal(typeof f.custom.cowPreview,'function','a separate gallery preview source is required');
 f.custom.cfg.theme='yajiji';assert.equal(f.custom.cowPreview(72),'decorated-72.png');
 assert.equal(f.card(72).children[0].src,'decorated-72.png');
 assert.equal(f.card(2000005,'yajiji').children[0].src,'base-2000005.png');
 assert.equal(f.nodes.get('cow-gallery').children.some(card=>Number(card.dataset.cow)===72),false);
});
