const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {createStudio}=require('../electron/service.cjs');
const HTML='<!doctype html><html><head><title>API</title></head><body>API result</body></html>';
const OLD='<!doctype html><html><head></head><body>Original</body></html>';
const testKey='fixture-api-integration-no-live-key';
async function setup(t,fetchImpl){const root=await fs.mkdtemp(path.join(os.tmpdir(),'overlay-api-service-'));const events=[];const service=await createStudio({root,skillDir:path.resolve(__dirname,'../resources/build-live-overlay-games'),emit:e=>events.push(e),fetchImpl,spawnImpl(){throw new Error('API mode must not spawn Codex');}});t.after(async()=>{await service.dispose();await fs.rm(root,{recursive:true,force:true});});return {...service,root,events};}
async function configure(s){await s.invoke('providers.save',{id:'deepseek',baseUrl:'https://provider.example/v1',model:'fixture-model',maxTokens:8192,apiKey:testKey});await s.invoke('settings.save',{engine:'api',activeProvider:'deepseek'});}
async function finished(s){for(let i=0;i<250;i++){const j=await s.invoke('jobs.current');if(j&&j.state!=='running')return j;await new Promise(r=>setTimeout(r,10));}throw new Error('Job timeout');}
test('draft model sync works before saving model or tokens, never persists a draft key, and protects saved-key origin',async t=>{
 const requests=[];const s=await setup(t,async(url,opts)=>{requests.push({url,opts});return new Response(JSON.stringify({data:[{id:'discovered-model'}]}));});
 const before=await s.invoke('bootstrap');
 const listed=await s.invoke('providers.models',{id:'deepseek',baseUrl:'https://provider.example/v1',apiKey:testKey});
 assert.equal(listed.models[0].id,'discovered-model');assert.deepEqual(await s.invoke('bootstrap'),before);
 await configure(s);await s.invoke('providers.models',{id:'deepseek'});assert.equal(requests.length,2);
 await assert.rejects(s.invoke('providers.models',{id:'deepseek',baseUrl:'https://other.example/v1'}),/新密钥|重新/);assert.equal(requests.length,2);
 await s.invoke('providers.models',{id:'deepseek',baseUrl:'https://other.example/v1',apiKey:'replacement-fixture'});assert.equal(requests[2].opts.headers.authorization,'Bearer replacement-fixture');
 assert(!(await fs.readFile(path.join(s.root,'provider-state.json'),'utf8')).includes(testKey));
});
test('API configuration and generation work without Codex, secret never enters artifacts/logs/settings responses',async t=>{
 const requests=[];const s=await setup(t,async(url,opts)=>{requests.push({url,opts});return new Response(JSON.stringify({choices:[{message:{content:HTML},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});});
 await configure(s);const status=await s.invoke('status');assert.equal(status.engine,'api');assert.equal(status.ready,true);
 const p=await s.invoke('projects.create',{name:'API demo',brief:'Make a test'});await s.invoke('jobs.start',{projectId:p.id});assert.equal((await finished(s)).state,'completed');
 assert.equal((await s.invoke('projects.get',{id:p.id})).html,HTML);assert.equal(requests.length,1);assert(!requests[0].opts.body.includes(testKey));assert(!JSON.stringify(await s.invoke('bootstrap')).includes(testKey));assert(!JSON.stringify(s.events).includes(testKey));
});
test('discovered large output budgets persist and reach generation without the old 131072 cap',async t=>{
 let sent;const s=await setup(t,async(_url,opts)=>{sent=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:HTML},finish_reason:'stop'}]}));});
 await configure(s);await s.invoke('providers.save',{id:'deepseek',maxTokens:393216});
 assert.equal((await s.invoke('bootstrap')).settings.providers.find(p=>p.id==='deepseek').maxTokens,393216);
 const p=await s.invoke('projects.import',{name:'Large budget',html:OLD});await s.invoke('jobs.start',{projectId:p.id});assert.equal((await finished(s)).state,'completed');assert.equal(sent.max_tokens,393216);
});
test('API truncation cannot overwrite a previous working HTML',async t=>{
 const s=await setup(t,async()=>new Response(JSON.stringify({choices:[{message:{content:HTML},finish_reason:'length'}]}),{headers:{'content-type':'application/json'}}));await configure(s);
 const p=await s.invoke('projects.import',{name:'Keep me',html:OLD});await s.invoke('jobs.start',{projectId:p.id});assert.equal((await finished(s)).state,'failed');assert.equal((await s.invoke('projects.get',{id:p.id})).html,OLD);
});
test('API cancel aborts active request and preserves original; configuration cannot change mid-job',async t=>{
 let started;const begin=new Promise(r=>started=r);let aborted=false;
 const s=await setup(t,(_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true});started();}));await configure(s);
 const p=await s.invoke('projects.import',{name:'Keep on cancel',html:OLD});await s.invoke('jobs.start',{projectId:p.id});await begin;
 await assert.rejects(s.invoke('settings.save',{engine:'codex'}),/正在|制作/);
 await s.invoke('jobs.cancel');assert.equal((await finished(s)).state,'cancelled');assert.equal(aborted,true);assert.equal((await s.invoke('projects.get',{id:p.id})).html,OLD);
});
