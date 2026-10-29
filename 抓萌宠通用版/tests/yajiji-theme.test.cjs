const test=require('node:test'),assert=require('node:assert/strict'),Themes=require('../src/themes.js');
const assets={cows:[{id:'old'},{id:'duck-prism-tall',kind:2000000,category:'yajiji'}],categories:[{id:'dog'},{id:'aquarium'},{id:'yajiji'}],barns:[{id:'nest-6'},{id:'aquarium-pod'},{id:'yajiji-nest'}]};
test('duck theme defaults to its own category and nest while preserving other theme selections',()=>{
 const prior={theme:'cream',activeCategory:'dog',barn:0,castA:100,castB:-1};const next=Themes.transition(prior,'yajiji',assets);assert(next);assert.equal(next.activeCategory,'yajiji');assert.equal(next.barn,2);assert.equal(next.theme,'yajiji');
 const back=Themes.transition({...next,castA:2000000},'cream',assets);assert.equal(back.activeCategory,'dog');assert.equal(back.castA,100);assert.equal(Themes.transition(back,'yajiji',assets).castA,2000000);
});
test('duck captions and object labels are local; the page stays transparent and stored progress is untouched',()=>{
 const nodes=new Map(),doc={body:{dataset:{bg:'transparent'}},getElementById:id=>{if(!nodes.has(id))nodes.set(id,{setAttribute(k,v){this[k]=v;}});return nodes.get(id);}};
 Themes.apply('yajiji',doc);assert.equal(doc.body.dataset.theme,'yajiji');assert.equal(doc.body.dataset.bg,'transparent');assert.equal(doc.getElementById('home-label').textContent,'已进鸭窝');assert.equal(doc.getElementById('pen-img').alt,'炫彩星糖鸭窝');
 Themes.apply('aquarium',doc);assert.equal(doc.body.dataset.theme,'aquarium');assert.equal(doc.getElementById('home-label').textContent,'已入馆');
});
