const {test}=require('node:test'),assert=require('node:assert/strict');
const {EFFECTS,EFFECT_BY_ID,TIERS,TIER_NAMES,TIER_SCORE,defaultConfig,presetRules,validateConfig}=require('../src/effects.js');
const paths=r=>r.errors.map(e=>e.path);
const deepFreeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(deepFreeze);}return o;};
const R=(gift,effect,tier='small',portions=1)=>({gift,effect,tier,portions});

test('the catalogue lists the eleven effects in order with kind, side and three-tier defaults',()=>{
  assert.deepEqual(EFFECTS.map(e=>e.id),['drift','gust','frost','rain','burst','tornado','sweep','tailwind','quick','sun','time']);
  assert.deepEqual(EFFECTS.map(e=>e.kind),['quantity','scene','stack','scene','quantity','scene','quantity','quantity','stack','scene','stack']);
  assert.deepEqual(EFFECTS.map(e=>e.side),[...Array(6).fill('troll'),...Array(5).fill('help')]);
  const table=Object.fromEntries(EFFECTS.map(e=>[e.id,e.params.map(p=>[p.key,p.min,p.max,p.step,...p.tiers])]));
  assert.deepEqual(table,{
    drift:[['count',1,200,1,5,15,40]],gust:[['count',1,300,1,25,40,80]],frost:[['clicks',1,200,1,10,20,35]],rain:[['count',1,1000,1,60,120,250]],burst:[['count',1,500,1,30,60,120]],
    tornado:[['seconds',1,20,1,4,6,9],['radius',20,300,1,70,100,140],['count',1,500,1,60,120,220],['needleDepth',0,60,1,0,10,15]],
    sweep:[['count',1,200,1,3,8,20]],tailwind:[['count',1,500,1,25,40,100]],quick:[['seconds',1,120,1,5,10,20],['layers',2,10,1,2,3,4]],
    sun:[['area',5,60,0.5,33,25,12.5],['seconds',1,60,1,6,8,10]],time:[['seconds',1,600,1,15,30,60]]
  });
  assert.deepEqual(EFFECTS.map(e=>e.name+e.icon),['飘落叶🍂','一阵风🌬','结霜🧊','落叶雨🍁','篮子炸了🧺','龙卷风🌪','扫一扫🧹','顺风🍃','快手✋','阳光☀️','加时⏱']);
  for(const e of EFFECTS){assert.equal(EFFECT_BY_ID[e.id],e);for(const p of e.params)assert.ok(typeof p.label==='string'&&p.label.length>0);}
  assert.deepEqual([TIERS,TIER_NAMES,TIER_SCORE],[['small','medium','large'],{small:'小',medium:'中',large:'大'},{small:1,medium:5,large:20}]);
  assert.ok(Object.isFrozen(EFFECTS)&&Object.isFrozen(EFFECTS[5].params[3])&&Object.isFrozen(EFFECT_BY_ID),'the shared catalogue cannot be edited by accident');
});

test('defaultConfig passes validation untouched and every call returns a fresh copy',()=>{
  const d=defaultConfig(),r=validateConfig(d);
  assert.deepEqual([r.ok,r.errors],[true,[]]);assert.deepEqual(r.config,d);
  assert.deepEqual(d.params.tornado,{small:{seconds:4,radius:70,count:60,needleDepth:0},medium:{seconds:6,radius:100,count:120,needleDepth:10},large:{seconds:9,radius:140,count:220,needleDepth:15}});
  assert.deepEqual(d.params.sun.large,{area:12.5,seconds:10});
  assert.deepEqual(d.likes,{enabled:true,step:1000,effect:'drift',tier:'small',portions:2});
  assert.deepEqual(d.legend,{visible:true,x:24,y:560,collapsed:false});
  d.params.drift.small.count=99;d.rules.length=0;d.likes.step=5;d.legend.x=0;
  const e=defaultConfig();assert.deepEqual([e.params.drift.small.count,e.rules.length,e.likes.step,e.legend.x],[5,13,1000,24]);
});

test('presetRules is the eleven-row room preset; the default config adds blank frost and time rules',()=>{
  const p=presetRules();
  assert.deepEqual(p.map(r=>[r.gift,r.effect,r.tier,r.portions]),[
    ['玫瑰','drift','small',1],['加油鸭','gust','medium',1],['暮光星辰','rain','medium',1],['珍爱玫瑰','tornado','large',1],['比心兔兔','tornado','medium',1],['棒棒糖','burst','medium',1],
    ['抖音','sweep','small',1],['鲜花','tailwind','medium',1],['一束花开','sun','medium',1],['摸摸头','quick','medium',1],['浪漫营地','tailwind','medium',5]
  ]);
  p[0].gift='改掉';assert.equal(presetRules()[0].gift,'玫瑰','each call is a copy');
  const rules=defaultConfig().rules;
  assert.deepEqual(rules.slice(0,11),presetRules());assert.deepEqual(rules.slice(11).map(r=>[r.gift,r.effect]),[['','frost'],['','time']]);
});

test('validateConfig never modifies the object it is given',()=>{
  const cfg={params:{drift:{small:{count:'7'}},tornado:{large:{radius:999}}},rules:[R(' 玫瑰 ','drift','small','2'),R('玫瑰','gust','large')],likes:{step:'500'},legend:{x:-5}};
  const before=JSON.stringify(cfg);deepFreeze(cfg);
  const r=validateConfig(cfg);
  assert.equal(JSON.stringify(cfg),before);assert.equal(r.ok,false);
  assert.notEqual(r.config.rules[0],cfg.rules[0]);assert.deepEqual(r.config.rules[0],R('玫瑰','drift','small',2));
});

test('missing parts come from the defaults (old saves) and numeric strings are converted',()=>{
  assert.deepEqual(validateConfig(undefined),{ok:true,errors:[],config:defaultConfig()});
  assert.deepEqual(validateConfig({}),{ok:true,errors:[],config:defaultConfig()});
  const r=validateConfig({params:{drift:{medium:{count:' 18 '}},sun:{large:{area:'7.5'}},quick:{}},rules:[{gift:'小心心',effect:'frost'},{gift:520,effect:'time',tier:'large'}],likes:{enabled:false},legend:{x:'100',y:0.5}});
  assert.deepEqual([r.ok,r.errors],[true,[]]);
  const c=r.config,d=defaultConfig();
  assert.equal(c.params.drift.medium.count,18);assert.equal(c.params.drift.small.count,5);assert.equal(c.params.sun.large.area,7.5);
  assert.deepEqual(c.params.quick,d.params.quick);assert.deepEqual(c.params.tornado,d.params.tornado);
  assert.deepEqual(c.rules,[R('小心心','frost','medium',1),R('520','time','large',1)]);
  assert.deepEqual(c.likes,{...d.likes,enabled:false});assert.deepEqual(c.legend,{...d.legend,x:100,y:0.5});
  assert.deepEqual(validateConfig({rules:[]}).config.rules,[],'an emptied rule list stays empty');
});

test('out-of-range, fractional and non-numeric parameters are rejected with a readable message',()=>{
  const r=validateConfig({params:{drift:{small:{count:0}},gust:{large:{count:2.5}},tornado:{medium:{needleDepth:61,radius:'abc'}},sun:{small:{area:4.5}},quick:{large:{layers:''}},rain:'x',burst:{medium:[]}}});
  assert.equal(r.ok,false);
  assert.deepEqual(paths(r).sort(),['params.burst.medium','params.drift.small.count','params.gust.large.count','params.quick.large.layers','params.rain','params.sun.small.area','params.tornado.medium.needleDepth','params.tornado.medium.radius'].sort());
  const msg=Object.fromEntries(r.errors.map(e=>[e.path,e.message]));
  assert.match(msg['params.drift.small.count'],/飘落叶·小.*每份片数.*1–200/);assert.match(msg['params.gust.large.count'],/整数/);
  assert.match(msg['params.tornado.medium.radius'],/数字/);assert.match(msg['params.quick.large.layers'],/数字/);
  assert.equal(r.config.params.drift.small.count,5,'a rejected value falls back to its default in the cleaned copy');
  assert.equal(validateConfig({params:{sun:{small:{area:12.25}}}}).ok,true,'area is the one parameter that may be fractional');
  assert.equal(validateConfig({params:{tornado:{small:{needleDepth:0}},time:{large:{seconds:600}}}}).ok,true,'the ends of each range are allowed');
});

test('rules: effect and tier must exist, portions 1–100 whole, names up to 40 characters, at most 100 rules',()=>{
  const r=validateConfig({rules:[R('a','boom'),R('b','drift','huge'),R('c','drift','small',0),R('d','drift','small',101),R('e','drift','small',1.5),R('字'.repeat(41),'drift'),{gift:{},effect:'drift'},null,R('f','constructor')]});
  assert.deepEqual(paths(r),['rules.0.effect','rules.1.tier','rules.2.portions','rules.3.portions','rules.4.portions','rules.5.gift','rules.6.gift','rules.7','rules.8.effect']);
  assert.ok(r.errors.every(e=>/第 \d+ 条规则/.test(e.message)),'messages name the row');
  assert.equal(r.config.rules.length,6,'rows without a usable effect are left out of the cleaned copy');
  assert.equal(validateConfig({rules:[R('字'.repeat(40),'drift','small',100),R('🌹'.repeat(40),'gust')]}).ok,true,'40 characters, counted as characters');
  const many=Array.from({length:101},(_,i)=>R('g'+i,'drift'));
  const m=validateConfig({rules:many});assert.deepEqual(paths(m),['rules']);assert.equal(m.config.rules.length,100);
  assert.equal(validateConfig({rules:many.slice(0,100)}).ok,true);
  assert.deepEqual(paths(validateConfig({rules:'x'})),['rules']);
});

test('gift names that collide after normalisation are rejected on every row involved; blank names may repeat',()=>{
  const r=validateConfig({rules:[R('玫瑰','drift'),R('小心心','gust'),R(' 玫 瑰！','rain','large'),R('','frost'),R('','time'),R('Ｈｅａｒｔ','sun'),R('heart','sun','large')]});
  assert.equal(r.ok,false);assert.deepEqual(paths(r),['rules.0.gift','rules.2.gift','rules.5.gift','rules.6.gift']);
  assert.match(r.errors[1].message,/玫 瑰！.*重复/);
  assert.equal(validateConfig({rules:[R('玫瑰','drift'),R('玫瑰花','drift')]}).ok,true);
});

test('likes and legend are checked field by field',()=>{
  const r=validateConfig({likes:{enabled:'yes',step:0,effect:'boom',tier:'mid',portions:101},legend:{visible:1,x:1441,y:-1,collapsed:'no'}});
  assert.deepEqual(paths(r),['likes.enabled','likes.step','likes.effect','likes.tier','likes.portions','legend.visible','legend.x','legend.y','legend.collapsed']);
  assert.deepEqual(r.config.likes,defaultConfig().likes);assert.deepEqual(r.config.legend,defaultConfig().legend);
  const ok=validateConfig({likes:{enabled:false,step:'100000',effect:'tornado',tier:'large',portions:'100'},legend:{visible:false,x:1440,y:810,collapsed:true}});
  assert.deepEqual([ok.ok,ok.config.likes,ok.config.legend],[true,{enabled:false,step:100000,effect:'tornado',tier:'large',portions:100},{visible:false,x:1440,y:810,collapsed:true}]);
  assert.deepEqual(paths(validateConfig({likes:{step:1.5}})),['likes.step']);
  assert.deepEqual(paths(validateConfig({params:[],likes:[],legend:'x'})),['params','likes','legend']);
  const bad=validateConfig('x');assert.deepEqual([bad.ok,paths(bad)],[false,['']]);assert.deepEqual(bad.config,defaultConfig());
});
