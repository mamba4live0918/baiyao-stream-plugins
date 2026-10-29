const test=require('node:test'),assert=require('node:assert/strict'),Themes=require('../src/themes.js');
const assets={categories:[{id:'dog'},{id:'aquarium'}],barns:[{id:'nest-6'},{id:'aquarium-pod'}],cows:Array.from({length:92},(_,i)=>({id:'p'+i}))};
test('old settings stay cream and each theme restores its own category, pod and cast without editing population',()=>{
 const cfg={theme:'cream',activeCategory:'dog',barn:0,castA:5,castB:-1,themeMemory:Themes.memory(null,assets)},stats={outside:23,home:10};
 const next=Themes.transition(cfg,'aquarium',assets);assert.equal(next.activeCategory,'aquarium');assert.equal(next.barn,1);assert.equal(cfg.theme,'cream');
 const back=Themes.transition({...next,castA:80},'cream',assets);assert.equal(back.activeCategory,'dog');assert.equal(back.barn,0);assert.equal(back.castA,5);
 assert.deepEqual(stats,{outside:23,home:10});assert.equal(Themes.transition(back,'aquarium',assets).castA,80);
});
test('invalid theme memory cannot restore nonexistent nests, kinds or categories',()=>{
 const saved={cream:{activeCategory:'broken',barn:500,castA:9999999,castB:'80'},aquarium:{activeCategory:'aquarium',barn:1,castA:81,castB:82}};
 const memory=Themes.memory(saved,assets);assert.equal(memory.cream.activeCategory,'all');assert.equal(memory.cream.barn,0);assert.equal(memory.cream.castA,-1);
 assert.equal(memory.aquarium.castA,81);assert.equal(Themes.transition({theme:'cream'},'invalid',assets),null);
});
test('theme application changes only localized styling and captions; it never adds a page background',()=>{
 const nodes=new Map(),doc={body:{dataset:{}},getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',setAttribute(k,v){this[k]=v;}});return nodes.get(id);}};
 Themes.apply('aquarium',doc);assert.equal(doc.body.dataset.theme,'aquarium');assert.equal(doc.getElementById('outside-label').textContent,'游动中');assert.equal(doc.getElementById('home-label').textContent,'已入馆');
 Themes.apply('cream',doc);assert.equal(doc.getElementById('home-label').textContent,'已回家');assert.equal(doc.body.dataset.bg,undefined);
});
