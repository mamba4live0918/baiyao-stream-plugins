const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/core.js');
function document(){const c=C.defaultConfig(),p=C.defaultProfile('model','模型');p.layouts['16:9']=C.ensureLayout(p,1920,1080);c.profiles.model=p;return c;}
test('legacy model settings and kick rules migrate to shoe without altering original records',()=>{
 const c=document();for(const s of Object.values(c.profiles.model.layouts['16:9'].settings))delete s.variant;c.rules=[{name:'礼物',action:'kick',count:2}];const r=C.validateConfig(c);
 assert.equal(r.ok,true);assert.equal(r.value.profiles.model.layouts['16:9'].settings.kick.variant,'shoe');assert.equal(r.value.rules[0].variant,'shoe');assert.equal(c.rules[0].variant,undefined);
});
test('shoe and barefoot choices survive export and import independently for models and gift rules',()=>{
 const c=document();c.profiles.model.layouts['16:9'].settings.kick.variant='barefoot';c.rules=[{name:'鞋踢礼物',action:'kick',count:1,variant:'shoe'},{name:'赤脚礼物',action:'kick',count:3,variant:'barefoot'}];
 const exported=C.exportConfig(c);assert.equal(exported.ok,true);const r=C.importConfig(exported.text);assert.equal(r.ok,true);assert.equal(r.value.profiles.model.layouts['16:9'].settings.kick.variant,'barefoot');assert.deepEqual(r.value.rules.map(r=>r.variant),['shoe','barefoot']);
});
test('invalid known kick variant is rejected instead of silently replaced',()=>{
 for(const variant of ['other',null,3]){const c=document();c.rules=[{name:'礼物',action:'kick',count:1,variant}];assert.equal(C.validateConfig(c).ok,false);const p=document();p.profiles.model.layouts['16:9'].settings.kick.variant=variant;assert.equal(C.validateConfig(p).ok,false);}
});
test('gift queue snapshots each kick appearance without overwriting current preview choice',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),start=text.indexOf('function enqueue('),end=text.indexOf('\nfunction receiveGift(',start);
 const layout=C.ensureLayout(C.defaultProfile('model','模型'),1920,1080);layout.settings.kick.variant='shoe';
 const c=vm.createContext({layout,profileID:'model',queue:[],busy:false,demoController:null,clone:o=>JSON.parse(JSON.stringify(o)),toast(){},updateQueue(){},pump(){}});vm.runInContext(text.slice(start,end),c);
 assert.equal(c.enqueue('kick',1,true,'barefoot'),true);assert.equal(c.enqueue('kick',1,true,'shoe'),true);assert.equal(c.queue[0].settings.variant,'barefoot');assert.equal(c.queue[1].settings.variant,'shoe');assert.equal(layout.settings.kick.variant,'shoe');
 c.queue.length=0;c.demoController={running:true};assert.equal(c.enqueue('hit',1,false),false);assert.equal(c.queue.length,0);
});
