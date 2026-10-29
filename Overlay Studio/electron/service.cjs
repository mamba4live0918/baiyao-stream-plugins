'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { createStorage, identifier, fields, validateHtml, MAX_HTML } = require('./storage.cjs');
const { redact, lineReader, resolveCodex, terminate, getStatus } = require('./codex.cjs');
const {createProviderStore}=require('./provider-config.cjs');
const {requestCompletion,testConnection,extractHtml}=require('./model-api.cjs');
const {listModels}=require('./model-catalog.cjs');
const {emptyInterview,boundedText,parseInterview,assertRoom,requirements,interviewRequest}=require('./interview.cjs');
const {validateReferenceFile,storeReference,readReference,collectReferenceInputs}=require('./reference-files.cjs');
const {validateDiagnostics,parseReview,reviewRequest}=require('./review.cjs');
const LIVE_CONFIG_GUIDANCE='Include one <script id="overlay-studio-config" type="application/json"> containing {"version":1,"fields":[{"key":"speed","label":"移动速度","type":"number","value":1,"min":0.25,"max":3,"step":0.25}]} with only controls relevant to THIS game. At most 24 fields. Supported types: number, color (#RRGGBB), boolean, text (max200 chars). Keys match /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/ and exclude constructor/prototype/__proto__; labels max80 chars. Numbers must be finite with valid bounds and positive step. At startup, runtime MUST read the JSON element values and use each field in actual behavior or rendering. Expose applicable speed, size, color or round duration controls; never add decorative nonfunctional controls. Editing the JSON and reloading must change gameplay/rendering. Escape < in JSON as \\u003c. Preserve or improve existing functional configuration on updates.';

async function createStudio({ root, skillDir, emit = () => {}, codexPath = '', spawnImpl = cp.spawn, secretCodec=null, fetchImpl=globalThis.fetch }) {
  const storage = await createStorage(root);
  const providers=await createProviderStore({storage,secretCodec});
  const now = () => new Date().toISOString();
  const clone = value => value === null ? null : JSON.parse(JSON.stringify(value));
  const notify = event => { try { emit(clone(event)); } catch {} };
  let settings = { codexPath: codexPath || '' }, current = null, active = null, disposed = false, queue = Promise.resolve();
  try {
    const saved = JSON.parse(await storage.read('settings.json', 16384));
    if (typeof saved.codexPath === 'string') settings = { codexPath: saved.codexPath };
  } catch (error) { if (error.code !== 'ENOENT') throw new Error(`无法读取工作台设置: ${error.message}`); }
  const enqueue = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  const publicSettings=()=>({...settings,...providers.publicSettings()});
  async function runtimeStatus(){
    const config=providers.publicSettings();
    if(config.engine==='codex'){const state=await getStatus(settings.codexPath,storage.root,spawnImpl);return {...state,engine:'codex',ready:state.available&&state.loggedIn};}
    const provider=config.providers.find(p=>p.id===config.activeProvider);
    const ready=Boolean(provider.baseUrl&&provider.model&&provider.hasKey);
    return {engine:'api',available:true,loggedIn:provider.hasKey,ready,providerName:provider.name,model:provider.model,version:'',path:'',authLabel:'API 配置',dataDir:storage.root,skillName:'build-live-overlay-games',error:provider.keyError||(!ready?'请在设置中保存服务地址、模型和 API Key。':'')};
  }
  const projectFile = id => path.join('projects', identifier(id), 'project.json');
  async function readProject(id) {
    const p = JSON.parse(await storage.read(projectFile(id), 2 * 1024 * 1024));
    if (p.id !== id || !Array.isArray(p.history)) throw new Error('项目记录损坏');
    fields(p); if (p.artifact) identifier(p.artifact);
    for (const revision of p.history) identifier(revision.id);
    p.references ??= []; p.revision ??= 0; p.interview = {...emptyInterview(),...p.interview};
    return p;
  }
  const summarize = p => ({ id: p.id, name: p.name, brief: p.brief, width: p.width, height: p.height, style: p.style,
    createdAt: p.createdAt, updatedAt: p.updatedAt, status: p.artifact ? 'ready' : 'draft', hasHtml: Boolean(p.artifact), versions: p.history.length });
  const htmlFile = (p, revision = p.artifact) => path.join('projects', identifier(p.id), 'artifacts', `${identifier(revision)}.html`);
  async function detail(p) { return { ...summarize(p), references:p.references,revision:p.revision,interview:p.interview,review:p.review??null, html: p.artifact ? await storage.read(htmlFile(p)) : '', history: p.history.map(({ id, createdAt, label }) => ({ id, createdAt, label })) }; }
  async function saveRecord(p) { p.revision=(p.revision??0)+1;p.updatedAt=now();await storage.atomic(projectFile(p.id), JSON.stringify(p, null, 2)); }
  function assertMutable(id){if(active?.job.projectId===id)throw new Error('此项目正在处理任务，请等待或取消后再修改。');}
  async function unchanged(context,p){if(context.cancelled||disposed)return false;if((await readProject(p.id)).revision!==p.revision)throw new Error('项目已更新，已忽略过期模型结果。请基于当前内容重试。');return true;}
  async function referenceInputs(p){return p.references.length?collectReferenceInputs(storage,p.id,p.references):{images:[],text:'',imagePaths:[]};}
  function findReference(p,id){identifier(id);const ref=p.references.find(r=>r.id===id);if(!ref)throw new Error('找不到此参考文件');return ref;}
  async function list() {
    const directory = await storage.checked('projects');
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try { identifier(entry.name); result.push(summarize(await readProject(entry.name))); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error(`无法读取项目 ${entry.name}: ${error.message}`); }
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async function create(input, html = null) {
    const attributes = fields(input); if (html !== null) validateHtml(html);
    const p = { ...attributes, id: randomUUID(), createdAt: now(), updatedAt: now(), artifact: null, history: [],references:[],revision:0,interview:emptyInterview() };
    await storage.mkdir(path.join('projects', p.id, 'artifacts'));
    if (html !== null) { p.artifact = randomUUID(); await storage.atomic(htmlFile(p), html); }
    await saveRecord(p); notify({ type: 'projects' }); return detail(p);
  }
  async function promote(id, html, label) {
    validateHtml(html);
    const p = await readProject(id), revision = randomUUID();
    await storage.atomic(htmlFile(p, revision), html);
    if (p.artifact) p.history.unshift({ id: p.artifact, createdAt: p.updatedAt, label });
    p.artifact = revision; p.updatedAt = now(); await saveRecord(p);
    notify({ type: 'projects' }); return detail(p);
  }
  async function rules() {
    if (!skillDir) throw new Error('未配置内置技能目录');
    const content = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    const referenceDir = path.join(skillDir, 'references');
    const names = (await fs.readdir(referenceDir)).filter(n => /^[a-z0-9_-]+\.md$/i.test(n)).sort();
    const sections = [];
    for (const name of names) sections.push({ name, content: await fs.readFile(path.join(referenceDir, name), 'utf8') });
    return { title: '直播小游戏制作规则', content, sections };
  }
  function log(job, text, kind = 'info') {
    const raw=active?.apiKey?String(text).split(active.apiKey).join('[已隐藏凭据]'):text;
    const cleaned = redact(raw).slice(0, 1600).trim(); if (!cleaned) return;
    job.logs.push({ time: now(), text: cleaned, kind });
    if (job.logs.length > 160) job.logs.splice(0, job.logs.length - 160);
    notify({ type: 'job', job });
  }
  function finish(context, state, error) {
    if (context.job.state !== 'running') return;
    context.job.state = state; context.job.endedAt = now();
    if (error) context.job.error = redact(context.apiKey?String(error).split(context.apiKey).join('[已隐藏凭据]'):error).slice(0, 1600);
    log(context.job, error || (state === 'completed' ? (context.job.kind==='interview'?'需求问答已保存，可以继续回答或生成预览。':context.job.kind==='review'?'审查报告已保存，作品源码与预览版本未改动。':'生成完成，已保存为项目新版本。') : '已取消任务，保留回答和原有版本。'), state === 'failed' ? 'error' : state === 'completed' ? 'success' : 'info');
  }
  async function runCodex(context, p, instruction) {
    const job = context.job;
    try {
      const executable = await resolveCodex(settings.codexPath);
      const references=await referenceInputs(p);
      const ruleSet = await rules();
      const workspaceRelative = path.join('jobs', job.id);
      const cwd = await storage.mkdir(workspaceRelative);
      const inputHtml = p.artifact ? await storage.read(htmlFile(p)) : null;
      if (inputHtml !== null) await storage.atomic(path.join(workspaceRelative, 'index.html'), inputHtml);
      const bundled = path.join(workspaceRelative, '.overlay-skill');
      for (const folder of ['references', 'assets', 'scripts']) await storage.mkdir(path.join(bundled, folder));
      await storage.atomic(path.join(bundled, 'SKILL.md'), ruleSet.content);
      for (const section of ruleSet.sections) await storage.atomic(path.join(bundled, 'references', section.name), section.content);
      for (const file of ['assets/overlay-starter.html', 'scripts/test-starter.cjs']) {
        await storage.atomic(path.join(bundled, file), await fs.readFile(path.join(skillDir, file), 'utf8'));
      }
      if (context.cancelled) return;
      const prompt = [
        'You are implementing a local livestream HTML overlay. Work only inside this job workspace.',
        'Deliver one complete, offline self-contained index.html, with inline CSS/JS. No external assets, network, package installs, deployment, or real livestream connections.',
        'The canvas background must be transparent. Provide a functional local demonstration/test mode and clear event adapter boundaries. Keep controls and gameplay fully working.',
        LIVE_CONFIG_GUIDANCE,
        p.artifact ? 'An existing index.html is provided. Preserve its useful features while applying the requested update.' : 'Create index.html from scratch.',
        `Project: ${p.name}\nCanvas: ${p.width} x ${p.height}\nVisual style: ${p.style}`,
        `User brief:\n${p.brief || '制作一个可直接运行的透明直播互动小游戏。'}`,
        requirements(p), references.text,
        instruction ? `Requested update:\n${instruction}` : '',
        'Apply the bundled skill guidance below. This service already provides isolated execution. Do not stop to ask questions; choose reasonable defaults and deliver the file.',
        'The complete bundled skill, its references, starter HTML, and starter test are available under .overlay-skill/ in this workspace. Resolve its relative links from there. Write the finished deliverable to ./index.html.',
        ruleSet.content,
        ...ruleSet.sections.map(section => `REFERENCE ${section.name}\n${section.content}`),
        'Finish by verifying index.html exists and is a complete HTML document. Report the local controls and any limitations briefly. Your final message is not the deliverable; index.html is.'
      ].filter(Boolean).join('\n\n');
      const args = ['-a', 'never', 'exec', '--json', '--color', 'never', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', cwd, '-o', path.join(cwd, 'result.txt'), '-'];
      args.splice(args.length-1,0,...references.imagePaths.flatMap(file=>['--image',file]));
      log(job, '正在调用本机 Codex；生成需要网络服务，项目文件仍保存在本地。');
      let turnFailure = '';
      context.diagnostics = [];
      await new Promise((resolve, reject) => {
        let settled = false;
        const settle = error => { if (settled) return; settled = true; clearTimeout(context.timeout); context.forceFinish = null; out.end(); err.end(); error ? reject(error) : resolve(); };
        const out = lineReader(line => {
          let event; try { event = JSON.parse(line); } catch { return; }
          if (event.type === 'thread.started') log(job, 'Codex 会话已建立。');
          if (event.type === 'turn.started') log(job, '正在分析需求并制作 HTML。');
          if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') log(job, event.item.text);
          if (event.type === 'turn.failed' || event.type === 'error') { turnFailure = typeof event.error?.message === 'string' ? event.error.message : typeof event.message === 'string' ? event.message : 'Codex 生成失败'; log(job, turnFailure, 'error'); }
        });
        const err = lineReader(line => {
          // Codex emits routine startup warnings (skill icons, shell snapshots) on stderr.
          // Keep useful diagnostics bounded and only reveal them if the job actually fails.
          if (!line || /\b(?:WARN|DEBUG|TRACE|INFO)\b/.test(line)) return;
          context.diagnostics.push(redact(line).slice(0, 1200));
          if (context.diagnostics.length > 8) context.diagnostics.shift();
        }, 8192);
        try {
          const child = spawnImpl(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
          context.child = child;
          context.forceFinish = () => settle(new Error('生成已取消'));
          child.stdout.on('data', chunk => out.write(chunk)); child.stderr.on('data', chunk => err.write(chunk));
          child.on('error', error => settle(error));
          child.on('close', (code, signal) => settle(code === 0 ? null : new Error(`Codex 进程退出（${code ?? signal ?? 'unknown'}）`)));
          child.stdin.on('error', error => { if (!context.cancelled) settle(error); });
          context.timeout = setTimeout(() => { terminate(child); settle(new Error('生成超过 30 分钟，已停止并保留原版本。')); }, 30 * 60 * 1000);
          child.stdin.end(prompt);
          if (context.cancelled) terminate(child);
        } catch (error) { settle(error); }
      });
      if (context.cancelled) return;
      if (turnFailure) throw new Error(turnFailure);
      const html = validateHtml(await storage.read(path.join(workspaceRelative, 'index.html'), MAX_HTML));
      if (inputHtml !== null && html === inputHtml) throw new Error('Codex 未修改 index.html，未创建新版本。请补充具体修改要求后重试；原版本已保留。');
      await enqueue(async () => { if (!await unchanged(context,p)) return; await promote(p.id, html, '生成前版本'); finish(context, 'completed'); });
    } catch (error) {
      if (!context.cancelled) {
        for (const diagnostic of context.diagnostics || []) log(job, diagnostic, 'error');
        finish(context, 'failed', error.code === 'ENOENT' ? 'Codex 未生成 index.html，原版本已保留。' : error.message);
      }
    } finally {
      clearTimeout(context.timeout); clearTimeout(context.cancelTimer);
      if (active === context) active = null;
    }
  }
  async function runApi(context,p,instruction){
    const job=context.job;
    try{
      if(context.cancelled)return;
      const ruleSet=await rules();
      const original=p.artifact?await storage.read(htmlFile(p)):null;
      const references=await referenceInputs(p);
      if(context.cancelled)return;
      context.controller=new AbortController();
      const system=[
        'Create a complete self-contained HTML livestream mini-game. Return ONLY the complete HTML document, starting with <!doctype html> and ending with </html>. No markdown fences or commentary.',
        'Inline all CSS, JavaScript and assets. Preserve alpha transparency. Include working start/pause/reset controls and local simulation where relevant. No external resources, network requests, tracking, credentials or real platform connections.',
        LIVE_CONFIG_GUIDANCE,
        'You do not have shell, filesystem, browser or tool access. Apply the following skill as game-design/runtime guidance only; do not claim to have run tests. Any referenced files are unavailable; their relevant contents follow.',
        ruleSet.content,
        ...ruleSet.sections.filter(s=>['runtime-contract.md','event-adapter.md','acceptance.md'].includes(s.name)).map(s=>s.content)
      ].join('\n\n');
      const prompt=[`作品名称：${p.name}\n画布：${p.width} × ${p.height}\n视觉风格：${p.style}`,`需求：\n${p.brief}`,requirements(p),references.text,instruction?`本次修改：\n${instruction}`:'',original?`以下是需要修改的现有HTML。保留有用功能，返回完整替代文档：\n${original}`:'创建一个新作品。'].filter(Boolean).join('\n\n');
      log(job,`正在使用 ${context.apiConfig.name} / ${context.apiConfig.model} 生成 HTML。`);
      let previousProgress=0;
      const result=await requestCompletion({config:context.apiConfig,apiKey:context.apiKey,system,prompt,images:references.images,signal:context.controller.signal,fetchImpl,onProgress:({characters})=>{if(characters-previousProgress>=2000){previousProgress=characters;log(job,`已接收 ${characters.toLocaleString('zh-CN')} 字符，正在继续生成…`);}}});
      if(context.cancelled)return;
      const html=validateHtml(extractHtml(result.text));
      if(html.includes(context.apiKey))throw new Error('返回内容包含敏感配置，未保存。请检查服务地址后重试。');
      if(original!==null&&html===original)throw new Error('模型未修改 HTML，原版本已保留。请补充具体修改要求。');
      await enqueue(async()=>{if(!await unchanged(context,p))return;await promote(p.id,html,'API 生成前版本');log(job,'HTML 已接收完整。请在预览中检查玩法；API 模式未执行浏览器测试。');finish(context,'completed');});
    }catch(error){if(!context.cancelled)finish(context,'failed',error.message||'API 生成失败，原版本已保留。');}
    finally{context.apiKey='';if(active===context)active=null;}
  }
  async function readOnlyCodex(context,request,references){
    const executable=await resolveCodex(settings.codexPath);
    const relative=path.join('jobs',context.job.id);const cwd=await storage.mkdir(relative);
    if(context.cancelled)return '';
    const output=path.join(relative,`${context.job.kind}.json`),label=context.job.kind==='review'?'审查':'问答';
    const args=['-a','never','exec','--json','--color','never','--skip-git-repo-check','--sandbox','read-only','-C',cwd,'-o',await storage.checked(output,true),...references.imagePaths.flatMap(file=>['--image',file]),'-'];
    let failure='';
    await new Promise((resolve,reject)=>{
      let settled=false;
      const settle=error=>{if(settled)return;settled=true;clearTimeout(context.timeout);context.forceFinish=null;out.end();error?reject(error):resolve();};
      const out=lineReader(line=>{let e;try{e=JSON.parse(line);}catch{return;}if(e.type==='turn.failed'||e.type==='error')failure=typeof e.error?.message==='string'?e.error.message:typeof e.message==='string'?e.message:`Codex ${label}失败`;});
      try{
        const child=spawnImpl(executable,args,{cwd,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});context.child=child;context.forceFinish=()=>settle(new Error(`${label}已取消`));
        child.stdout.on('data',chunk=>out.write(chunk));child.stderr.on('data',()=>{});
        child.on('error',settle);child.on('close',(code,signal)=>settle(code===0?null:new Error(`Codex ${label}进程退出（${code??signal??'unknown'}）`)));
        child.stdin.on('error',error=>{if(!context.cancelled)settle(error);});
        context.timeout=setTimeout(()=>{terminate(child);settle(new Error(`${label}超过 5 分钟，已停止。原项目内容仍保留，可重试。`));},5*60*1000);
        child.stdin.end(`${request.system}\n\n${request.prompt}`);if(context.cancelled)terminate(child);
      }catch(error){settle(error);}
    });
    if(context.cancelled)return '';
    if(failure)throw new Error(failure);
    return storage.read(output,context.job.kind==='review'?400000:160000);
  }
  async function runInterview(context,p){
    try{
      if(context.cancelled)return;
      const references=await referenceInputs(p);const request=interviewRequest(p,references.text,references.images.length);
      if(context.cancelled)return;
      let text;
      if(context.apiConfig){context.controller=new AbortController();text=(await requestCompletion({config:context.apiConfig,apiKey:context.apiKey,...request,images:references.images,signal:context.controller.signal,fetchImpl})).text;}
      else text=await readOnlyCodex(context,request,references);
      if(context.cancelled)return;
      if(context.apiKey&&text.includes(context.apiKey))throw new Error('模型返回内容包含敏感配置，未保存。');
      const result=parseInterview(text);
      await enqueue(async()=>{
        if(!await unchanged(context,p))return;
        if(p.interview.mode==='quick'&&p.interview.rounds>=3){result.question=null;result.ready=true;}
        const message={id:randomUUID(),role:'assistant',text:result.reply,createdAt:now()};
        p.interview.messages.push(message);
        if(result.question){p.interviewQuestions??={};p.interviewQuestions[message.id]=result.question;}
        Object.assign(p.interview,{summary:result.summary,suggestions:result.suggestions,visualNotes:result.visualNotes,prompt:p.manualPrompt?p.interview.prompt:result.prompt,question:result.question,ready:result.ready,rounds:p.interview.rounds+(result.question?1:0)});
        p.interviewTurn=null;await saveRecord(p);notify({type:'projects'});finish(context,'completed');
      });
    }catch(error){if(!context.cancelled)finish(context,'failed',error.code==='ENOENT'?'Codex 未返回问答结果；你的回答已保留，可以重试。':error.message);}
    finally{clearTimeout(context.timeout);clearTimeout(context.cancelTimer);context.apiKey='';if(active===context)active=null;}
  }
  async function runReview(context,p,input){
    try{
      if(context.cancelled)return;
      const references={images:[],imagePaths:[]};
      if(input.screenshot){
        const screenshot=input.screenshot;
        references.images.push({mime:screenshot.mime,data:screenshot.buffer.toString('base64'),name:screenshot.name,usage:'layout'});
        if(!context.apiConfig){
          const relative=path.join('jobs',context.job.id);await storage.mkdir(relative);
          const file=path.join(relative,screenshot.mime==='image/png'?'preview.png':'preview.jpg');
          await storage.atomic(file,screenshot.buffer);references.imagePaths.push(await storage.checked(file));
        }
      }
      if(context.cancelled)return;
      const request=reviewRequest(p,input);let text;
      if(context.apiConfig){context.controller=new AbortController();text=(await requestCompletion({config:context.apiConfig,apiKey:context.apiKey,...request,images:references.images,signal:context.controller.signal,fetchImpl})).text;}
      else text=await readOnlyCodex(context,request,references);
      if(context.cancelled)return;
      if(context.apiKey&&text.includes(context.apiKey))throw new Error('模型返回内容包含敏感配置，未保存。');
      const report=parseReview(text);
      await enqueue(async()=>{
        if(!await unchanged(context,p))return;
        p.review={...report,createdAt:now(),htmlHash:createHash('sha256').update(input.html,'utf8').digest('hex'),withScreenshot:Boolean(input.screenshot)};
        await saveRecord(p);notify({type:'projects'});finish(context,'completed');
      });
    }catch(error){if(!context.cancelled)finish(context,'failed',error.code==='ENOENT'?'Codex 未返回审查报告；原作品与已有报告已保留。':error.message);}
    finally{clearTimeout(context.timeout);clearTimeout(context.cancelTimer);context.apiKey='';if(active===context)active=null;}
  }
  function launch(p,kind,instruction='',reviewInput=null){
    if(active)throw new Error('已有正在运行的任务，请等待或取消');
    const mode=providers.publicSettings();const credential=mode.engine==='api'?providers.credentials(mode.activeProvider):null;
    const job={id:randomUUID(),projectId:p.id,kind,state:'running',startedAt:now(),logs:[],engineLabel:credential?credential.config.name:'Codex'};
    const context={job,cancelled:false,child:null,apiConfig:credential?.config,apiKey:credential?.apiKey};current=job;active=context;
    log(job,kind==='interview'?'正在理解需求并准备下一条问题。':kind==='review'?'正在审查源码与提供的预览证据；本任务不会修改作品。':credential?'任务已创建，将使用所选 API 生成 HTML。':'任务已创建，将在独立工作目录中生成。');
    context.promise=new Promise(resolve=>setImmediate(resolve)).then(()=>kind==='interview'?runInterview(context,p):kind==='review'?runReview(context,p,reviewInput):credential?runApi(context,p,instruction):runCodex(context,p,instruction));
    return clone(job);
  }
  async function cancel() {
    if (!active) return clone(current);
    const context = active; context.cancelled = true; finish(context, 'cancelled');
    context.controller?.abort();
    terminate(context.child);
    // A defective child may never deliver close. Release only after a bounded termination grace period.
    if (context.forceFinish) context.cancelTimer = setTimeout(() => context.forceFinish?.(), 3000);
    return clone(context.job);
  }
  const actions = {
    bootstrap: async () => ({ projects: await list(), status: await runtimeStatus(), job: clone(current), settings: publicSettings() }),
    status: runtimeStatus,
    'projects.list': list,
    'projects.create': input => create(input),
    'projects.get': async ({ id }) => detail(await readProject(id)),
    'projects.save': async input => { assertMutable(input.id);const p = await readProject(input.id); Object.assign(p, fields(input, p), { updatedAt: now() }); await saveRecord(p); notify({ type: 'projects' }); return detail(p); },
    'projects.commit':async({id,html,expectedRevision})=>{
      if(active)throw new Error('正在处理任务，请等待或取消后再保存版本。');
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('请提供有效的基础版本号');
      validateHtml(html);const p=await readProject(id);
      if(p.revision!==expectedRevision)throw new Error('项目已更新，当前草稿基于旧版本。请先核对最新版本，避免覆盖更新。');
      if(p.artifact&&await storage.read(htmlFile(p))===html)return detail(p);
      return promote(id,html,'实时编辑前版本');
    },
    'projects.import': ({ name, html }) => create({ name, brief: '从本地导入的 HTML 插件' }, validateHtml(html)),
    'projects.seed': async ({ template }) => { if (template !== 'starter') throw new Error('未知模板'); return create({ name: '落球互动 · 示例', brief: '基于内置模板的透明落球互动小游戏' }, validateHtml(await fs.readFile(path.join(skillDir, 'assets', 'overlay-starter.html'), 'utf8'))); },
    'projects.export': async ({ id }) => { const p = await readProject(id); if (!p.artifact) throw new Error('项目还没有可导出的 HTML'); return { name: p.name, html: await storage.read(htmlFile(p)) }; },
    'projects.restore': async ({ id, versionId }) => { const p = await readProject(id); identifier(versionId); if (active?.job.projectId === id) throw new Error('正在生成，请先取消再恢复版本'); if (!p.history.some(v => v.id === versionId)) throw new Error('找不到此历史版本'); return promote(id, await storage.read(htmlFile(p, versionId)), '恢复前版本'); },
    'jobs.start': async ({ projectId, instruction = '' }) => {
      if (active) throw new Error('已有正在运行的生成任务，请等待或取消');
      if (typeof instruction !== 'string' || instruction.length > 30000) throw new Error('修改要求不能超过 30000 字符');
      const p = await readProject(projectId);
      if(instruction.trim()){
        boundedText(instruction,'修改要求',30000);
        const message={id:randomUUID(),role:'user',text:instruction,createdAt:now()};
        assertRoom({...p.interview,messages:[...p.interview.messages,message]},0);
        p.interview.messages.push(message);p.interviewTurn=null;
        await saveRecord(p);notify({type:'projects'});
      }
      return launch(p,'generation',instruction);
    },
    'review.start':async({projectId,html,diagnostics=[],screenshot})=>{
      if(active)throw new Error('已有正在运行的任务，请等待或取消');
      const p=await readProject(projectId);
      if(html===undefined){if(!p.artifact)throw new Error('请先生成、导入作品或提供完整源码再审查');html=await storage.read(htmlFile(p));}
      validateHtml(html);const evidence=validateDiagnostics(diagnostics);let image=null;
      if(screenshot!==undefined){
        if(typeof screenshot!=='string'||!/^data:image\/(png|jpeg);base64,/.test(screenshot))throw new Error('审查截图必须是 PNG/JPEG 图片数据');
        image=validateReferenceFile({name:screenshot.startsWith('data:image/png;')?'preview.png':'preview.jpg',dataUrl:screenshot,usage:'layout'});
      }
      return launch(p,'review','',{html,diagnostics:evidence,screenshot:image});
    },
    'references.add':async({projectId,files})=>{
      assertMutable(projectId);const p=await readProject(projectId);
      if(!Array.isArray(files)||!files.length||files.length>8)throw new Error('请选择 1–8 个参考文件');
      const validated=files.map(validateReferenceFile),all=[...p.references,...validated];
      if(all.filter(r=>r.kind==='image').length>4)throw new Error('最多上传 4 张参考图片');
      const texts=all.filter(r=>r.kind==='text');if(texts.length>4||texts.reduce((n,r)=>n+r.size,0)>128*1024)throw new Error('参考文本最多 4 份，合计不能超过 128 KiB');
      // Validate the complete batch before creating any files or changing associations.
      const added=[];for(const file of validated)added.push(await storeReference(storage,p.id,file));
      p.references.push(...added);await saveRecord(p);notify({type:'projects'});return detail(p);
    },
    'references.get':async({projectId,referenceId})=>{const p=await readProject(projectId);return readReference(storage,p.id,findReference(p,referenceId));},
    'references.update':async({projectId,referenceId,usage})=>{
      assertMutable(projectId);if(!['style','layout','character','requirements','general'].includes(usage))throw new Error('参考用途无效');
      const p=await readProject(projectId);findReference(p,referenceId).usage=usage;await saveRecord(p);notify({type:'projects'});return detail(p);
    },
    'references.remove':async({projectId,referenceId})=>{
      assertMutable(projectId);const p=await readProject(projectId);findReference(p,referenceId);p.references=p.references.filter(r=>r.id!==referenceId);await saveRecord(p);notify({type:'projects'});return detail(p);
    },
    'interview.update':async({projectId,mode,prompt})=>{
      assertMutable(projectId);const p=await readProject(projectId);
      if(mode!==undefined){if(!['quick','deep'].includes(mode))throw new Error('无效的问答模式');p.interview.mode=mode;}
      if(prompt!==undefined){p.interview.prompt=boundedText(prompt,'提示词',30000);p.manualPrompt=Boolean(prompt.trim());}
      await saveRecord(p);notify({type:'projects'});return detail(p);
    },
    'interview.send':async({projectId,text='',action='answer',retry=false})=>{
      if(active)throw new Error('已有正在运行的任务，请等待或取消');
      if(!['answer','skip','decide'].includes(action)||typeof retry!=='boolean')throw new Error('无效的问答操作');
      boundedText(text,'回答',6000);const p=await readProject(projectId);
      if(retry){if(!p.interviewTurn||p.interview.messages.at(-1)?.id!==p.interviewTurn)throw new Error('没有可重试的失败回答');assertRoom(p.interview,1);}
      else{
        if(!text.trim())text=action==='skip'?'跳过这个问题，暂不决定。':action==='decide'?'这个问题请你替我决定，并标明你的建议。':p.references.length?'请理解已上传的参考资料，帮我一步步明确直播互动小游戏的需求。':p.brief||p.interview.prompt||'';
        if(!text.trim())throw new Error('请先说一句想法，或上传参考资料。');
        // Reserve space for the model reply; never silently truncate earlier explicit answers.
        assertRoom({...p.interview,messages:[...p.interview.messages,{text}]},1);
        const message={id:randomUUID(),role:'user',text,createdAt:now()};p.interview.messages.push(message);p.interviewTurn=message.id;
        await saveRecord(p);notify({type:'projects'});
      }
      return launch(p,'interview');
    },
    'jobs.cancel': cancel,
    'jobs.current': () => clone(current),
    'rules.read': rules,
    'settings.save': async (input) => {
      if(active)throw new Error('正在制作，请完成或取消后再修改生成配置。');
      if(input.codexPath!==undefined){let selected=input.codexPath;if(typeof selected!=='string')throw new Error('Codex 路径必须是文本');selected=selected.trim();if(selected)await resolveCodex(selected);settings={codexPath:selected};await storage.atomic('settings.json',JSON.stringify(settings,null,2));}
      if(input.engine!==undefined||input.activeProvider!==undefined)await providers.select(input);
      return publicSettings();
    },
    'providers.save':async input=>{if(active)throw new Error('正在制作，请完成或取消后再修改模型配置。');await providers.save(input);return publicSettings();},
    'providers.models':async input=>{if(active)throw new Error('正在制作，请稍后同步模型。');const credential=providers.discovery(input);try{return await listModels({...credential,fetchImpl});}finally{credential.apiKey='';}},
    'providers.test':async ({id})=>{if(active)throw new Error('正在制作，请稍后测试连接。');const credential=providers.credentials(id);try{return await testConnection({...credential,fetchImpl});}finally{credential.apiKey='';}}
  };
  function invoke(action, payload = {}) {
    if (disposed) return Promise.reject(new Error('工作台服务已关闭'));
    if (!Object.hasOwn(actions, action)) return Promise.reject(new Error('未知操作'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return Promise.reject(new Error('无效的操作参数'));
    return enqueue(() => actions[action](payload));
  }
  async function dispose() { disposed = true; const context = active; await cancel(); if (context?.promise) await context.promise; await queue;providers.dispose(); }
  return { invoke, dispose };
}
module.exports = { createStudio };
