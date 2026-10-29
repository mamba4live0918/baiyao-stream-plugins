const test = require('node:test');
const assert = require('node:assert/strict');
const appearance = require('../src/appearance.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==';
const custom = (id, extra={}) => ({id,name:id,enabled:true,dataUrl:PNG,...extra});
const defaults = () => appearance.normalize();
function storageFake(initial={}) {
  const values = new Map(Object.entries(initial));
  return {getItem:key=>values.get(String(key))??null,setItem(key,value){values.set(String(key),String(value));}};
}

test('hard-ice artwork is independent, survives export/import, and defaults for old profiles',()=>{
 const store=storageFake(),state=defaults();state.ice={dataUrl:PNG,name:'透明冰球'};
 const saved=appearance.write(state,store),again=appearance.write(JSON.parse(JSON.stringify(saved)),storageFake());
 assert.deepEqual(saved.ice,state.ice);assert.deepEqual(again.ice,state.ice);assert.deepEqual(appearance.read(store).ice,state.ice);
 assert.deepEqual(saved.scoops,state.scoops);assert.deepEqual(saved.bowl,state.bowl);
 assert.deepEqual(appearance.normalize({scoops:state.scoops}).ice,{dataUrl:null,name:'默认冰球'});
 const restored=appearance.write({...saved,ice:{...appearance.DEFAULTS.ice}},store);assert.equal(restored.ice.dataUrl,null);assert.deepEqual(restored.scoops,state.scoops);
});
test('invalid hard-ice artwork is rejected on import and recovered safely in old storage',()=>{
 for(const dataUrl of ['https://example.com/ice.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,%%%']){
 const state={...defaults(),ice:{dataUrl,name:'坏图片'}};assert.throws(()=>appearance.write(state,storageFake()),/图片/);assert.equal(appearance.normalize(state).ice.dataUrl,null);
 }
 assert.throws(()=>appearance.write({...defaults(),ice:'bad'},storageFake()),/冰球/);
});
test('hard-ice artwork participates in the total image storage budget',()=>{
 const data='data:image/png;base64,'+'AAAA'.repeat(110000),state=defaults();
 state.bowl.dataUrl=data;state.ice={dataUrl:data,name:'冰球'};
 for(let i=0;i<5;i++)state.scoops.push(custom('budget-'+i,{dataUrl:data}));
 assert.throws(()=>appearance.write(state,storageFake()),/总容量/);
 const normalized=appearance.normalize(state);assert.equal(normalized.ice.dataUrl,data);assert.equal(normalized.scoops.filter(s=>s.dataUrl).length,4);
});

test('normalization provides twelve builtins and returns a deep independent state', () => {
  const state=defaults();
  assert.deepEqual(state.scoops.map(s=>s.name),['草莓','开心果','香草','葡萄','巧克力','蓝莓','芒果','薄荷巧克力','咖啡','蜜桃','黑芝麻','曲奇奶油']);
  assert.deepEqual(state.bowl,{dataUrl:null,name:'默认盘子',rim:0.08});
  const input={version:99,scoops:[...state.scoops,custom('flower')],bowl:{dataUrl:PNG,name:'我的碗',rim:0.3}};
  const before=JSON.stringify(input),out=appearance.normalize(input);
  assert.equal(JSON.stringify(input),before);
  assert.equal(out.version,2);
  out.scoops[0].name='不能修改原始对象';out.bowl.rim=0.7;
  assert.equal(input.scoops[0].name,'草莓');assert.equal(input.bowl.rim,0.3);
  assert.equal(appearance.DEFAULTS.scoops[0].name,'草莓');
});

test('at least one builtin returns when every scoop is disabled or custom data is unusable', () => {
  const input=defaults();input.scoops.forEach(s=>s.enabled=false);
  input.scoops.push(custom('broken',{dataUrl:'https://example.com/image.png'}));
  const out=appearance.normalize(input);
  assert.deepEqual(appearance.available(out).map(s=>s.id),['builtin-0']);
  assert.equal(out.scoops.length,12);
});

test('builtins can be disabled, custom flavors can be deleted, and selection never leaves the remaining list', () => {
  const state=defaults();state.scoops.forEach(s=>s.enabled=false);
  state.scoops.push(custom('one'),custom('two'));
  assert.deepEqual(appearance.available(state).map(s=>s.id),['one','two']);
  state.scoops=state.scoops.filter(s=>s.id!=='one');
  for(let batch=0;batch<12;batch++) assert.equal(appearance.select(state,batch,5).id,'two');
  state.scoops=state.scoops.filter(s=>s.id!=='two');
  assert.equal(appearance.select(state,12,7).id,'builtin-0');
});

test('all eighteen enabled flavors appear without stopping at the old builtin count', () => {
  const state=defaults();for(let n=0;n<6;n++)state.scoops.push(custom('custom-'+n));
  assert.deepEqual(Array.from({length:18},(_,n)=>appearance.select(state,0,n).id),
    [...Array.from({length:12},(_,n)=>'builtin-'+n),...Array.from({length:6},(_,n)=>'custom-'+n)]);
  assert.equal(appearance.select(state,7,5).id,'custom-0');
  assert.equal(appearance.select(state,-1,0).id,'custom-5');
});

test('normalization removes remote, SVG, malformed and oversized image data without retaining foreign fields', () => {
  const invalid=['https://example.com/a.png','file:///picture.png','data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,%%%','data:image/png;base64,A','data:image/gif;base64,AAAA',
    'data:image/png;base64,'+'A'.repeat(500000)];
  const input=defaults();input.scoops.push(...invalid.map((dataUrl,n)=>custom('invalid-'+n,{dataUrl})),
    custom('valid',{dataUrl:PNG,script:'should not survive'}));
  input.bowl={dataUrl:'https://example.com/bowl.jpg',name:'无效碗',rim:100};
  const out=appearance.normalize(input);
  assert.deepEqual(out.scoops.filter(s=>s.dataUrl).map(s=>s.id),['valid']);
  assert.equal('script' in out.scoops.at(-1),false);
  assert.equal(out.bowl.dataUrl,null);
  assert.equal(out.bowl.rim,0.8);
});

test('names are capped at forty Unicode characters and bowl rim is clamped to the supported range', () => {
  const state=defaults();state.scoops.push(custom('emoji',{name:'🍦'.repeat(45)}));
  state.bowl={dataUrl:PNG,name:'碗'.repeat(60),rim:-3};
  const out=appearance.normalize(state);
  assert.equal([...out.scoops.at(-1).name].length,40);
  assert.equal(out.bowl.name.length,40);
  assert.equal(out.bowl.rim,0);
  assert.equal(appearance.normalize({bowl:{rim:'bad'}}).bowl.rim,0.08);
});

test('sanitizing old configuration preserves all twelve builtin slots and permits at most twelve custom flavors', () => {
  const input={scoops:Array.from({length:15},(_,n)=>custom('custom-'+n))};
  const out=appearance.normalize(input);
  assert.equal(out.scoops.length,24);
  assert.deepEqual(out.scoops.slice(0,12).map(s=>s.builtin),Array.from({length:12},(_,n)=>n));
  assert.equal(out.scoops.filter(s=>s.dataUrl).length,12);
});

test('sanitizing over-budget saved images keeps total data below three million characters', () => {
  const big='data:image/png;base64,'+'A'.repeat(499000);
  const input=defaults();input.scoops.push(...Array.from({length:8},(_,n)=>custom('big-'+n,{dataUrl:big})));
  input.bowl={dataUrl:big,name:'大碗',rim:0.08};
  const out=appearance.normalize(input);
  const total=out.scoops.reduce((n,s)=>n+(s.dataUrl?.length||0),0)+(out.bowl.dataUrl?.length||0);
  assert.ok(total<=3000000);
  assert.ok(out.scoops.filter(s=>s.dataUrl).length<8);
  assert.ok(appearance.available(out).length>0);
});

test('read and write isolate their storage key, round trip valid images, and tolerate broken saved JSON', () => {
  const storage=storageFake({'gelato.catch.v1.config':'keep me'});
  const state=defaults();state.scoops.push(custom('saved'));state.bowl={dataUrl:PNG,name:'茶碗',rim:0.2};
  const saved=appearance.write(state,storage);
  assert.deepEqual(appearance.read(storage),saved);
  assert.equal(storage.getItem('gelato.catch.v1.config'),'keep me');
  assert.ok(storage.getItem('gelato.catch.v2.appearance').includes('saved'));
  storage.setItem('gelato.catch.v2.appearance','{broken');
  assert.deepEqual(appearance.read(storage),defaults());
  assert.deepEqual(appearance.read({getItem(){throw new Error('blocked');}}),defaults());
});

test('quota failure throws a Chinese save error and leaves prior saved configuration intact', () => {
  const storage=storageFake();appearance.write(defaults(),storage);
  const prior=storage.getItem('gelato.catch.v2.appearance');
  storage.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};
  const state=defaults();state.scoops.push(custom('new'));
  assert.throws(()=>appearance.write(state,storage),/保存失败/);
  assert.equal(storage.getItem('gelato.catch.v2.appearance'),prior);
});

test('write rejects image format errors, image limits, and total budget overflow before storage changes', () => {
  const invalidStates=[];
  for(const dataUrl of ['https://example.com/a.png','data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,???','data:image/png;base64,'+'A'.repeat(500000)]) {
    const state=defaults();state.scoops.push(custom('invalid',{dataUrl}));invalidStates.push(state);
  }
  const tooMany=defaults();tooMany.scoops.push(...Array.from({length:13},(_,n)=>custom('n-'+n)));invalidStates.push(tooMany);
  const tooLarge=defaults();const big='data:image/png;base64,'+'A'.repeat(499000);
  tooLarge.scoops.push(...Array.from({length:6},(_,n)=>custom('b-'+n,{dataUrl:big})));
  tooLarge.bowl={dataUrl:big,name:'大碗',rim:0.08};invalidStates.push(tooLarge);
  const badBowl=defaults();badBowl.bowl={dataUrl:'data:image/svg+xml;base64,PHN2Zy8+',name:'bad',rim:0.08};invalidStates.push(badBowl);
  const storage=storageFake();appearance.write(defaults(),storage);
  const prior=storage.getItem('gelato.catch.v2.appearance');
  for(const state of invalidStates){assert.throws(()=>appearance.write(state,storage),/[图片种款容量格式超限]/);assert.equal(storage.getItem('gelato.catch.v2.appearance'),prior);}
});

test('write rejects duplicate custom IDs instead of silently losing an imported image', () => {
  const state=defaults();state.scoops.push(custom('duplicate'),custom('duplicate'));
  assert.throws(()=>appearance.write(state,storageFake()),/重复/);
});

test('import rejects empty, unsupported, and over-eight-megabyte files before trying to decode', async () => {
  await assert.rejects(()=>appearance.importFile({type:'image/png',size:0,name:'empty.png'}),/空/);
  await assert.rejects(()=>appearance.importFile({type:'image/svg+xml',size:100,name:'bad.svg'}),/PNG|JPG|WebP/);
  await assert.rejects(()=>appearance.importFile({type:'image/png',size:8*1024*1024+1,name:'large.png'}),/8 MB/);
});

test('upgrading an old custom-only selection preserves its custom images and does not enable added presets', () => {
  const state={version:1,scoops:[...defaults().scoops.slice(0,4).map(s=>({...s,enabled:false})),...Array.from({length:12},(_,n)=>custom('legacy-'+n))]};
  const result=appearance.normalize(state);
  assert.equal(result.scoops.length,24);
  assert.deepEqual(appearance.available(result).map(s=>s.id),Array.from({length:12},(_,n)=>'legacy-'+n));
  assert.deepEqual(appearance.read(storageFake()),defaults());
  assert.deepEqual(appearance.normalize(result),result);
});

test('upgrading an old chosen preset subset keeps that subset while untouched defaults receive the new art', () => {
  const oldDefaults={version:1,scoops:defaults().scoops.slice(0,4)};
  assert.equal(appearance.available(oldDefaults).length,12);
  const selected={version:1,scoops:oldDefaults.scoops.map((s,n)=>({...s,enabled:n===2}))};
  assert.deepEqual(appearance.available(selected).map(s=>s.id),['builtin-2']);
  const enabled=appearance.normalize(selected);enabled.scoops[11].enabled=true;
  assert.deepEqual(appearance.available(appearance.write(enabled,storageFake())).map(s=>s.id),['builtin-2','builtin-11']);
});

test('the highest new builtin is accepted but out-of-range indexes are rejected before saving', () => {
  const state=defaults();state.scoops[11].name='曲奇';
  assert.equal(appearance.write(state,storageFake()).scoops[11].name,'曲奇');
  const invalid=defaults();invalid.scoops[11]={id:'builtin-12',builtin:12,enabled:true,name:'bad'};
  assert.throws(()=>appearance.write(invalid,storageFake()),/内置/);
});
