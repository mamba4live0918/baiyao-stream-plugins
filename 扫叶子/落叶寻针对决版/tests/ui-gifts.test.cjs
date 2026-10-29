const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const U=require('../src/ui-gifts.js');
// effects.js 由另一个子代理并行编写，这里用接口相同的小目录，不依赖它
const P=(key,label,min,max,tiers,step=1)=>({key,label,min,max,step,tiers});
const EFFECTS=[
  {id:'drift',name:'飘落叶',icon:'🍂',side:'troll',kind:'quantity',params:[P('count','每份片数',1,200,[5,15,40])]},
  {id:'tornado',name:'龙卷风',icon:'🌪',side:'troll',kind:'scene',params:[P('seconds','持续秒数',1,20,[4,6,9]),P('radius','半径',20,300,[70,100,140])]},
  {id:'sweep',name:'扫一扫',icon:'🧹',side:'help',kind:'quantity',params:[P('count','每份片数',1,200,[3,8,20])]},
  {id:'sun',name:'阳光',icon:'☀️',side:'help',kind:'scene',params:[P('area','光圈面积占叶堆（%）',5,60,[33,25,12.5],0.5)]}
];
const fx={EFFECTS,EFFECT_BY_ID:Object.fromEntries(EFFECTS.map(e=>[e.id,e])),TIERS:['small','medium','large'],TIER_NAMES:{small:'小',medium:'中',large:'大'},
  presetRules:()=>[{gift:'玫瑰',effect:'drift',tier:'small',portions:1},{gift:'珍爱玫瑰',effect:'tornado',tier:'large',portions:1},{gift:'抖音',effect:'sweep',tier:'small',portions:1}]};
const banner=(user,effect,tier,portions=1)=>({user,effect,tier,portions});

test('loads in Node without a DOM and refuses to start without an effects catalogue',()=>{
  for(const k of ['create','makeSelect','legendGroups','mergeBanner','bannerParts','applyPreset','clampLegend'])assert.equal(typeof U[k],'function',k);
  assert.throws(()=>U.create(),/effects/);assert.throws(()=>U.create({overlay:{}}),/effects/);
});

test('effect labels read 图标 效果·档位 ×份数 and drop ×1, unknown tiers and unknown effects',()=>{
  assert.equal(U.effectLabel(fx,'tornado','medium',3),'🌪 龙卷风·中 ×3');
  assert.equal(U.effectLabel(fx,'drift','small',1),'🍂 飘落叶·小');
  assert.equal(U.effectLabel(fx,'drift','small','x'),'🍂 飘落叶·小');
  assert.equal(U.effectLabel(fx,'drift','huge',2),'🍂 飘落叶 ×2');
  assert.equal(U.effectLabel(fx,'gone','small',2),'');assert.equal(U.effectLabel(fx,'constructor','small',1),'');
  assert.deepEqual(U.effectOptions(fx).map(o=>[o.value,o.label,o.group,o.tone]),[['drift','🍂 飘落叶','捣乱','troll'],['tornado','🌪 龙卷风','捣乱','troll'],['sweep','🧹 扫一扫','帮忙','help'],['sun','☀️ 阳光','帮忙','help']]);
  assert.deepEqual(U.tierOptions(fx),[{value:'small',label:'小'},{value:'medium',label:'中'},{value:'large',label:'大'}]);
});

test('legendGroups splits rules into 捣乱 and 帮忙 in rule order, skipping blank gifts and unknown effects',()=>{
  const cfg={rules:[{gift:' 玫瑰 ',effect:'drift',tier:'small',portions:1},{gift:'抖音',effect:'sweep',tier:'small',portions:1},{gift:'',effect:'tornado',tier:'large',portions:1},
    {gift:'   ',effect:'drift',tier:'small',portions:1},{gift:'神秘',effect:'gone',tier:'small',portions:1},null,{gift:'浪漫营地',effect:'sun',tier:'medium',portions:5},{gift:'珍爱玫瑰',effect:'tornado',tier:'large',portions:1}]};
  assert.deepEqual(U.legendGroups(cfg,fx),{
    troll:[{gift:'玫瑰',effect:'drift',side:'troll',text:'🍂 飘落叶·小'},{gift:'珍爱玫瑰',effect:'tornado',side:'troll',text:'🌪 龙卷风·大'}],
    help:[{gift:'抖音',effect:'sweep',side:'help',text:'🧹 扫一扫·小'},{gift:'浪漫营地',effect:'sun',side:'help',text:'☀️ 阳光·中 ×5'}]});
  for(const empty of [{},null,{rules:'x'},{rules:[{gift:'',effect:'drift'}]}])assert.deepEqual(U.legendGroups(empty,fx),{troll:[],help:[]});
});

test('mergeBanner merges the same viewer, effect and tier within 3 s of the last gift, without mutating the queue',()=>{
  const a=U.mergeBanner([],{...banner(' 小明 ','tornado','medium'),avatar:'https://a.cn/x.png'},1000);
  assert.deepEqual([a.length,a[0].user,a[0].portions,a[0].avatar,a[0].rev],[1,'小明',1,'https://a.cn/x.png',0]);
  const frozen=Object.freeze(a.map(e=>Object.freeze({...e})));
  const b=U.mergeBanner(frozen,banner('小明','tornado','medium',2),3999);
  assert.deepEqual([b.length,b[0].portions,b[0].rev,b[0].id],[1,3,1,a[0].id]);assert.equal(frozen[0].portions,1);
  const c=U.mergeBanner(b,banner('小明','tornado','medium'),6998);
  assert.deepEqual([c.length,c[0].portions],[1,4],'a running combo keeps merging');
  const d=U.mergeBanner(c,banner('小明','tornado','medium'),9998);
  assert.deepEqual([d.length,d[1].portions],[2,1],'3 s after the last gift starts a new banner');
  for(const other of [banner('小红','tornado','medium'),banner('小明','drift','medium'),banner('小明','tornado','large')])assert.equal(U.mergeBanner(d,other,10000).length,3);
});

test('mergeBanner refreshes the banner on screen, defaults the nickname and ignores items without an effect',()=>{
  const shown=[{...U.mergeBanner([],banner('','drift','small'),0)[0],shown:true}];
  assert.equal(shown[0].user,'观众');
  const m=U.mergeBanner(shown,banner('  ','drift','small',5),2000);
  assert.deepEqual([m.length,m[0].shown,m[0].portions,m[0].rev],[1,true,6,1]);
  assert.equal(U.mergeBanner(m,{user:'x'},1),m);assert.equal(U.mergeBanner(m,null,1),m);
  const odd=U.mergeBanner([],{...banner('x','drift','small',0),avatar:'javascript:alert(1)'},0)[0];
  assert.deepEqual([odd.portions,odd.avatar],[1,'']);
});

test('mergeBanner caps the backlog: folds queued repeats first, then drops the oldest queued, never the one on screen',()=>{
  let q=[{...U.mergeBanner([],banner('主角','drift','small'),0)[0],shown:true}];
  for(let i=0;i<25;i++)q=U.mergeBanner(q,banner('观众'+i,'tornado','small'),100+i);
  assert.equal(q.length,U.QUEUE_MAX);assert.equal(q[0].user,'主角');
  assert.deepEqual(q.slice(1).map(e=>e.user),Array.from({length:19},(_,i)=>'观众'+(i+6)));
  let r=[{...U.mergeBanner([],banner('主角','drift','small'),0)[0],shown:true}];
  r=U.mergeBanner(r,banner('阿甲','sun','large',2),10);
  for(let i=0;i<17;i++)r=U.mergeBanner(r,banner('路人'+i,'sweep','small'),20+i);
  r=U.mergeBanner(r,banner('阿甲','sun','large',3),5000);assert.equal(r.length,20);
  r=U.mergeBanner(r,banner('新人','drift','small'),5001);
  assert.equal(r.length,20);assert.deepEqual(r.filter(e=>e.user==='阿甲').map(e=>e.portions),[5]);
  assert.deepEqual([r[0].user,r[1].user,r[2].user,r.at(-1).user],['主角','阿甲','路人0','新人']);
});

test('banner wording, stay time and initials',()=>{
  assert.deepEqual([U.bannerStay({tier:'large'}),U.bannerStay({tier:'medium'}),U.bannerStay({tier:'small'})],[3000,2000,2000]);
  assert.deepEqual(U.bannerParts(banner('小明','tornado','medium',3),fx),{side:'troll',nick:'@小明',initial:'小',verb:'召来了',effect:'🌪 龙卷风·中',count:'×3'});
  assert.deepEqual(U.bannerParts(banner('','sweep','small'),fx),{side:'help',nick:'@观众',initial:'观',verb:'召来了',effect:'🧹 扫一扫·小',count:''});
  assert.equal(U.bannerParts(banner('名'.repeat(30),'drift','small'),fx).nick,'@'+'名'.repeat(24));
  assert.deepEqual(['alice','😀abc','👨‍👩‍👧小家',null,'  '].map(U.initialOf),['A','😀','👨‍👩‍👧','观','观']);
  for(const ok of ['https://a.cn/x.png','http://a.cn/x.png','data:image/png;base64,AA'])assert.equal(U.safeAvatar(' '+ok+' '),ok);
  for(const bad of ['javascript:alert(1)','data:text/html,x','//a.cn/x.png','',null,42])assert.equal(U.safeAvatar(bad),'');
});

test('clampLegend keeps the legend inside the 1440×810 stage',()=>{
  assert.deepEqual(U.clampLegend(24.4,560.6,300,200),{x:24,y:561});
  assert.deepEqual(U.clampLegend(-50,-9,300,200),{x:0,y:0});
  assert.deepEqual(U.clampLegend(1400,800,300,200),{x:1140,y:610});
  assert.deepEqual(U.clampLegend(100,100,2000,1000),{x:0,y:0});
  assert.deepEqual(U.clampLegend(NaN,undefined,NaN,null),{x:0,y:0});
});

test('applyPreset overwrites same-name rules in place, appends missing presets and keeps the rest',()=>{
  const mine=Object.freeze([{gift:'鲜花',effect:'sun',tier:'small',portions:2},{gift:' 玫瑰！',effect:'tornado',tier:'large',portions:9},{gift:'',effect:'drift',tier:'medium',portions:1},{gift:'玫瑰',effect:'sweep',tier:'small',portions:1}].map(Object.freeze));
  const r=U.applyPreset(mine,fx.presetRules());
  assert.deepEqual(r.rules,[{gift:'鲜花',effect:'sun',tier:'small',portions:2},{gift:'玫瑰',effect:'drift',tier:'small',portions:1},{gift:'',effect:'drift',tier:'medium',portions:1},
    {gift:'珍爱玫瑰',effect:'tornado',tier:'large',portions:1},{gift:'抖音',effect:'sweep',tier:'small',portions:1}]);
  assert.deepEqual([r.replaced,r.added],[1,2]);assert.equal(mine[1].portions,9);assert.deepEqual(U.duplicateRows(r.rules),[]);
  const again=U.applyPreset(r.rules,fx.presetRules());assert.deepEqual(again.rules,r.rules);assert.deepEqual([again.replaced,again.added],[3,0]);
  assert.deepEqual(U.applyPreset(null,fx.presetRules()).rules.map(x=>x.gift),['玫瑰','珍爱玫瑰','抖音']);
});

test('duplicateRows marks every row whose name collides after normalising',()=>{
  assert.deepEqual(U.duplicateRows([{gift:'玫瑰'},{gift:'ＡＢ'},{gift:' 玫瑰！'},{gift:'ab'},{gift:''},{gift:''},null,{gift:'鲜花'}]),[0,1,2,3]);
  assert.deepEqual(U.duplicateRows([{gift:'玫瑰'},{gift:'鲜花'}]),[]);assert.deepEqual(U.duplicateRows('x'),[]);
});

test('setIn copies only the changed branch',()=>{
  const cfg=Object.freeze({rules:Object.freeze([Object.freeze({gift:'a'}),Object.freeze({gift:'b'})]),likes:Object.freeze({step:1000})});
  const next=U.setIn(cfg,['rules',1,'gift'],'c');
  assert.deepEqual(next.rules.map(r=>r.gift),['a','c']);assert.equal(cfg.rules[1].gift,'b');
  assert.equal(next.likes,cfg.likes);assert.equal(next.rules[0],cfg.rules[0]);assert.notEqual(next.rules,cfg.rules);
  assert.deepEqual(U.setIn({},['params','gust','small','count'],9),{params:{gust:{small:{count:9}}}});
  assert.deepEqual(U.setIn({},['rules',0,'gift'],'x'),{rules:[{gift:'x'}]});
});

test('error paths map to field keys and tabs',()=>{
  assert.deepEqual([U.pathKey('rules[3].portions'),U.pathKey('rules.3.portions'),U.pathKey(['params','gust','small','count']),U.pathKey('params["sun"].large.area'),U.pathKey(undefined)],['rules.3.portions','rules.3.portions','params.gust.small.count','params.sun.large.area','']);
  assert.deepEqual(['rules.2.gift','legend.x','params.sun.large.area','likes.step','other',''].map(p=>U.tabOfPath(p)),['rules','rules','params','likes','','']);
});

test('number inputs keep text they cannot parse for validateConfig, and the live range check is strict',()=>{
  assert.deepEqual(['12',' 3.5 ','','  ','abc',null,7].map(v=>U.numOrRaw(v)),[12,3.5,'','','abc','',7]);
  const o={min:1,max:100,integer:true};
  assert.deepEqual([1,100,50,0,101,2.5,'5',NaN].map(v=>U.fitsRange(v,o)),[true,true,true,false,false,false,false,false]);
  assert.equal(U.fitsRange(12.5,{min:5,max:60}),true);assert.equal(U.fitsRange(1e9,{min:1}),true);
});

test('like and connection status views',()=>{
  assert.deepEqual(U.likeView({enabled:true,total:12345,carry:345,step:1000}),{enabled:true,total:12345,carry:345,step:1000,remain:655,ratio:0.345});
  assert.deepEqual(U.likeView({total:-1,carry:1.5,step:0}),{enabled:false,total:0,carry:0,step:0,remain:0,ratio:0});
  assert.deepEqual(U.likeView(undefined),{enabled:false,total:0,carry:0,step:0,remain:0,ratio:0});
  assert.deepEqual([0,999,1000,1234567].map(n=>U.groupDigits(n)),['0','999','1,000','1,234,567']);
  assert.deepEqual(U.connectionView({sdk:true,ws:'open',url:'ws://localhost:10030'}),{sdk:{tone:'ok',text:'已接入'},ws:{tone:'ok',text:'已连接'},url:'ws://localhost:10030'});
  assert.deepEqual(['off','connecting','open','closed','constructor',undefined].map(ws=>U.connectionView({ws}).ws.tone),['off','wait','ok','bad','off','off']);
  assert.deepEqual(U.connectionView(null),{sdk:{tone:'off',text:'未检测到'},ws:{tone:'off',text:'未连接'},url:''});
});

test('source stays OBS-safe: no HTML injection or native popups, no CSS nesting, lg- class names only',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../src/ui-gifts.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../src/ui-gifts.css'),'utf8');
  assert.doesNotMatch(js,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\balert\(|\bconfirm\(|\bprompt\(|createElement\(['"](?:select|dialog)['"]|['"]color['"]/);
  assert.doesNotMatch(css,/&/,'no CSS nesting');
  const cssClasses=[...css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\{[^{}]*\}/g,'{}').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m=>m[1]);
  assert.ok(cssClasses.length>50);assert.deepEqual(cssClasses.filter(c=>!c.startsWith('lg-')),[]);
  const jsClasses=[...js.matchAll(/class:'([^']+)'/g)].flatMap(m=>m[1].split(/\s+/)).concat([...js.matchAll(/(?:classList\.(?:add|toggle|remove)|restart\([^,]+,)\s*\(?'([^']+)'/g)].map(m=>m[1]));
  assert.ok(jsClasses.length>40);assert.deepEqual(jsClasses.filter(c=>!c.startsWith('lg-')),[]);
});
