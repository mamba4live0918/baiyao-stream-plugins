'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {createStudio}=require('../electron/service.cjs');
const HTML='<!doctype html><html><body>Existing playable game</body></html>';
const answer={reply:'我们来确定玩法。',question:{text:'观众怎样互动？',options:['弹幕','礼物','自动演示']},summary:'AI整理：透明小游戏',suggestions:['建议先用本地演示'],visualNotes:[],prompt:'制作透明互动小游戏',ready:false};
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=';
const picture={name:'cat.png',dataUrl:`data:image/png;base64,${PNG}`,usage:'character'};
const textFile=(text)=>({name:'rules.md',dataUrl:`data:text/plain;base64,${Buffer.from(text).toString('base64')}`,usage:'requirements'});
async function fixture(t,behavior){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'guided-service-'));const calls=[];
 const spawnImpl=(file,args,options)=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{child.emit('close',null,'SIGTERM');return true;};const call={file,args,options,child,input:''};calls.push(call);child.stdin.on('data',c=>call.input+=c);child.stdin.on('finish',()=>setImmediate(async()=>{try{if(behavior)await behavior(call);else{await fs.writeFile(args[args.indexOf('-o')+1],JSON.stringify(answer));child.emit('close',0);}}catch(e){child.emit('error',e);}}));return child;};
 const options={root,skillDir:path.resolve(__dirname,'../resources/build-live-overlay-games'),codexPath:process.execPath,spawnImpl};const service=await createStudio(options);t.after(async()=>{await service.dispose();await fs.rm(root,{recursive:true,force:true});});return{root,calls,options,service,invoke:service.invoke};
}
async function done(invoke){for(let i=0;i<300;i++){const j=await invoke('jobs.current');if(j?.state!=='running')return j;await new Promise(r=>setTimeout(r,5));}throw Error('job timeout');}
test('adaptive Codex interview persists original answers without changing existing HTML',async t=>{
 const f=await fixture(t);const p=await f.invoke('projects.import',{name:'Game',html:HTML});
 const j=await f.invoke('interview.send',{projectId:p.id,text:'  请做一只猫，不要积分！  '});assert.equal(j.kind,'interview');assert.equal((await done(f.invoke)).state,'completed');
 const d=await f.invoke('projects.get',{id:p.id});assert.equal(d.html,HTML);assert.equal(d.versions,0);assert.equal(d.interview.messages[0].text,'  请做一只猫，不要积分！  ');assert.equal(d.interview.question.options.length,3);assert.equal(d.interview.summary,answer.summary);assert.ok(d.revision>p.revision);
 const c=f.calls[0];assert.equal(c.args[c.args.indexOf('--sandbox')+1],'read-only');assert.ok(c.input.includes('不要积分'));await assert.rejects(fs.access(path.join(c.options.cwd,'index.html')));
 const second=await createStudio(f.options);t.after(()=>second.dispose());assert.deepEqual((await second.invoke('projects.get',{id:p.id})).interview,d.interview);
});
test('quick mode stops after three questions and deep mode resumes without losing edited prompt',async t=>{
 const f=await fixture(t);const p=await f.invoke('projects.create',{name:'Game'});
 await f.invoke('interview.update',{projectId:p.id,prompt:'我手动确定：只有猫，绝不使用积分'});
 for(let i=0;i<4;i++){await f.invoke('interview.send',{projectId:p.id,text:`明确要求${i}`});assert.equal((await done(f.invoke)).state,'completed');}
 let d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.rounds,3);assert.equal(d.interview.question,null);assert.equal(d.interview.ready,true);assert.equal(d.interview.prompt,'我手动确定：只有猫，绝不使用积分');
 await f.invoke('interview.update',{projectId:p.id,mode:'deep'});await f.invoke('interview.send',{projectId:p.id,text:'再细化碰撞动画'});await done(f.invoke);d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.messages.length,10);assert.ok(d.interview.question);assert.ok(f.calls.at(-1).input.includes('只有猫，绝不使用积分'));
});
test('malformed interview result retains answer and retry never duplicates it',async t=>{
 let n=0;const f=await fixture(t,async c=>{await fs.writeFile(c.args[c.args.indexOf('-o')+1],n++===0?'not json':JSON.stringify(answer));c.child.emit('close',0);});const p=await f.invoke('projects.import',{name:'Game',html:HTML});
 await f.invoke('interview.send',{projectId:p.id,text:'我的原始答案'});assert.equal((await done(f.invoke)).state,'failed');let d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.messages.length,1);assert.equal(d.html,HTML);
 await f.invoke('interview.send',{projectId:p.id,retry:true});assert.equal((await done(f.invoke)).state,'completed');d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.messages.filter(m=>m.role==='user').length,1);await assert.rejects(f.invoke('interview.send',{projectId:p.id,retry:true}));
});
test('active interview blocks mutations and cancellation rejects a late result',async t=>{
 let pending;const f=await fixture(t,c=>{pending=c;});const p=await f.invoke('projects.import',{name:'Game',html:HTML});await f.invoke('interview.send',{projectId:p.id,text:'做一只猫'});
 await assert.rejects(f.invoke('projects.save',{id:p.id,name:'Other'}),/正在|任务/);await assert.rejects(f.invoke('interview.update',{projectId:p.id,mode:'deep'}));
 for(let i=0;!pending&&i<200;i++)await new Promise(r=>setTimeout(r,5));assert.ok(pending);await f.invoke('jobs.cancel');await fs.writeFile(pending.args[pending.args.indexOf('-o')+1],JSON.stringify(answer));pending.child.emit('close',0);await f.service.dispose();
 const second=await createStudio(f.options);t.after(()=>second.dispose());const d=await second.invoke('projects.get',{id:p.id});assert.equal(d.interview.messages.length,1);assert.equal(d.html,HTML);assert.equal(d.interview.summary,'');
});
test('reference CRUD validates entire batches and budgets before writes, removed assets never reach Codex',async t=>{
 const f=await fixture(t);const p=await f.invoke('projects.create',{name:'Refs'});
 await assert.rejects(f.invoke('references.add',{projectId:p.id,files:[picture,textFile('valid'),{name:'bad.html',dataUrl:'data:text/plain;base64,YQ=='}]}));assert.equal((await f.invoke('projects.get',{id:p.id})).references.length,0);await assert.rejects(fs.access(path.join(f.root,'projects',p.id,'references')));
 await assert.rejects(f.invoke('references.add',{projectId:p.id,files:Array(5).fill(picture)}));await assert.rejects(f.invoke('references.add',{projectId:p.id,files:Array(3).fill(textFile('a'.repeat(50000)))}));
 let d=await f.invoke('references.add',{projectId:p.id,files:[picture,textFile('透明背景，禁止积分')]});assert.equal(d.references.length,2);const ref=d.references[0];assert.equal((await f.invoke('references.get',{projectId:p.id,referenceId:ref.id})).dataUrl,picture.dataUrl);
 d=await f.invoke('references.update',{projectId:p.id,referenceId:ref.id,usage:'style'});assert.equal(d.references[0].usage,'style');await f.invoke('interview.send',{projectId:p.id});assert.equal((await done(f.invoke)).state,'completed');const c=f.calls.at(-1);assert.ok(c.args.includes('--image'));assert.ok(c.input.includes('透明背景，禁止积分'));assert.ok(path.isAbsolute(c.args[c.args.indexOf('--image')+1]));
 await f.invoke('references.remove',{projectId:p.id,referenceId:ref.id});await f.invoke('interview.send',{projectId:p.id,text:'继续'});await done(f.invoke);assert.equal(f.calls.at(-1).args.includes('--image'),false);await assert.rejects(f.invoke('references.get',{projectId:p.id,referenceId:ref.id}));
});
test('API interview and generation submit actual images, original transcript and authoritative prompt',async t=>{
 const requests=[];const f=await fixture(t);await f.service.dispose();const s=await createStudio({...f.options,fetchImpl:async(_url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);return new Response(JSON.stringify({choices:[{message:{content:requests.length===1?JSON.stringify(answer):HTML},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});}});t.after(()=>s.dispose());
 await s.invoke('providers.save',{id:'custom',baseUrl:'https://fixture.example/v1',model:'vision',apiKey:'fixture-secret'});await s.invoke('settings.save',{engine:'api',activeProvider:'custom'});const p=await s.invoke('projects.create',{name:'API'});await s.invoke('references.add',{projectId:p.id,files:[picture]});await s.invoke('interview.update',{projectId:p.id,prompt:'手写要求：不要计分'});await s.invoke('interview.send',{projectId:p.id,text:'原话：只要猫猫'});assert.equal((await done(s.invoke)).state,'completed');await s.invoke('jobs.start',{projectId:p.id});assert.equal((await done(s.invoke)).state,'completed');
 for(const request of requests){const content=request.messages.at(-1).content;assert.ok(Array.isArray(content));assert.equal(content.find(c=>c.type==='image_url').image_url.url,picture.dataUrl);assert.ok(content[0].text.includes('原话：只要猫猫'));assert.ok(content[0].text.includes('手写要求：不要计分'));}assert.equal((await s.invoke('projects.get',{id:p.id})).html,HTML);
});
test('compatible fenced JSON is accepted but extra prose, oversize replies and extra question choices are rejected',async t=>{
 let response;const f=await fixture(t,async c=>{await fs.writeFile(c.args[c.args.indexOf('-o')+1],response);c.child.emit('close',0);});const p=await f.invoke('projects.create',{name:'JSON'});
 for(const bad of [`Here you go: ${JSON.stringify(answer)}`,JSON.stringify({...answer,reply:'a'.repeat(6001)}),JSON.stringify({...answer,question:{text:'Question',options:['a','b','c','d']}})]){response=bad;await f.invoke('interview.send',{projectId:p.id,text:'保持原需求'});assert.equal((await done(f.invoke)).state,'failed');}
 response='```json\n'+JSON.stringify(answer)+'\n```';await f.invoke('interview.send',{projectId:p.id,retry:true});assert.equal((await done(f.invoke)).state,'completed');assert.equal((await f.invoke('projects.get',{id:p.id})).interview.messages.length,4);
});
test('late response cannot overwrite an externally revised project snapshot',async t=>{
 let pending;const f=await fixture(t,c=>{pending=c;});const p=await f.invoke('projects.import',{name:'Initial',html:HTML});await f.invoke('interview.send',{projectId:p.id,text:'original'});for(let i=0;!pending&&i<200;i++)await new Promise(r=>setTimeout(r,5));assert.ok(pending);
 const file=path.join(f.root,'projects',p.id,'project.json');const record=JSON.parse(await fs.readFile(file,'utf8'));record.name='Newer external revision';record.revision++;await fs.writeFile(file,JSON.stringify(record));await fs.writeFile(pending.args[pending.args.indexOf('-o')+1],JSON.stringify(answer));pending.child.emit('close',0);
 assert.equal((await done(f.invoke)).state,'failed');const d=await f.invoke('projects.get',{id:p.id});assert.equal(d.name,'Newer external revision');assert.equal(d.interview.messages.length,1);assert.equal(d.html,HTML);
});
test('conversation limit preserves all sixty messages and allows preview generation',async t=>{
 const f=await fixture(t,async c=>{await fs.writeFile(path.join(c.options.cwd,'index.html'),HTML);c.child.emit('close',0);});const p=await f.invoke('projects.create',{name:'Bounded'});
 const file=path.join(f.root,'projects',p.id,'project.json');const record=JSON.parse(await fs.readFile(file,'utf8'));record.interview.messages=Array.from({length:60},(_,i)=>({id:String(i),role:i%2?'assistant':'user',text:`keep requirement ${i}`,createdAt:new Date().toISOString()}));await fs.writeFile(file,JSON.stringify(record));
 await assert.rejects(f.invoke('interview.send',{projectId:p.id,text:'one more'}),/60/);assert.equal((await f.invoke('projects.get',{id:p.id})).interview.messages.length,60);await f.invoke('jobs.start',{projectId:p.id});assert.equal((await done(f.invoke)).state,'completed');assert.ok(f.calls[0].input.includes('keep requirement 0'));assert.ok(f.calls[0].input.includes('keep requirement 58'));
});
test('next interview receives preceding question and option meanings even when reply omitted the question',async t=>{
 let round=0;const f=await fixture(t,async c=>{const result={...answer,question:{text:++round===1?'猫是掉落还是跳跃？':'下一题',options:['掉落','跳跃']}};await fs.writeFile(c.args[c.args.indexOf('-o')+1],JSON.stringify(result));c.child.emit('close',0);});const p=await f.invoke('projects.create',{name:'Question context'});
 await f.invoke('interview.send',{projectId:p.id,text:'制作猫游戏'});await done(f.invoke);await f.invoke('interview.send',{projectId:p.id,text:'第二种'});await done(f.invoke);assert.ok(f.calls[1].input.includes('猫是掉落还是跳跃？'));assert.ok(f.calls[1].input.includes('跳跃'));
});
test('generation instructions persist as original user answers without freezing the AI prompt',async t=>{
 let interviewRound=0;
 const f=await fixture(t,async c=>{if(c.args[c.args.indexOf('--sandbox')+1]==='read-only')await fs.writeFile(c.args[c.args.indexOf('-o')+1],JSON.stringify({...answer,prompt:`AI refined prompt ${++interviewRound}`}));else await fs.writeFile(path.join(c.options.cwd,'index.html'),HTML);c.child.emit('close',0);});
 const p=await f.invoke('projects.create',{name:'First idea'});
 const instruction='  我的原话：制作猫猫跳跃，不要计分！  ';
 await f.invoke('jobs.start',{projectId:p.id,instruction});assert.equal((await done(f.invoke)).state,'completed');let d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.messages.length,1);assert.equal(d.interview.messages[0].role,'user');assert.equal(d.interview.messages[0].text,instruction);assert.ok(d.revision>p.revision);
 await f.invoke('interview.send',{projectId:p.id,text:'增加摇尾巴动画'});assert.equal((await done(f.invoke)).state,'completed');d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.prompt,'AI refined prompt 1');assert.ok(f.calls.at(-1).input.includes(instruction));
 await f.invoke('interview.update',{projectId:p.id,prompt:'手动最终提示词：只要白猫'});await f.invoke('interview.send',{projectId:p.id,text:'再聊一下场景'});assert.equal((await done(f.invoke)).state,'completed');d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.prompt,'手动最终提示词：只要白猫');
});
test('failed generation retains the original instruction and message limit rejects new instructions before launch',async t=>{
 const f=await fixture(t,c=>c.child.emit('close',1));const p=await f.invoke('projects.import',{name:'Retain failed idea',html:HTML});await f.invoke('jobs.start',{projectId:p.id,instruction:'请保留这句失败任务原话'});assert.equal((await done(f.invoke)).state,'failed');let d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.messages[0].text,'请保留这句失败任务原话');assert.equal(d.html,HTML);
 const file=path.join(f.root,'projects',p.id,'project.json');const record=JSON.parse(await fs.readFile(file,'utf8'));record.interview.messages=Array.from({length:60},(_,i)=>({id:String(i),role:i%2?'assistant':'user',text:`keep ${i}`,createdAt:new Date().toISOString()}));await fs.writeFile(file,JSON.stringify(record));await assert.rejects(f.invoke('jobs.start',{projectId:p.id,instruction:'超出上限的新修改'}),/60/);d=await f.invoke('projects.get',{id:p.id});assert.equal(d.interview.messages.length,60);assert.equal(d.html,HTML);assert.equal(f.calls.length,1);
});
