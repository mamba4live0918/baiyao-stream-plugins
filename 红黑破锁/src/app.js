(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const themes=new Set(['fufu','horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream']);
  const soundEvents=[['lock','加锁的时候'],['hit','每按一下'],['layer','破掉一条'],['clear','全部破开']];
  const soundModes=[['default','默认'],['custom','自己的'],['off','关掉']];
  const MAX_SOUND_BYTES=3*1024*1024,MAX_SOUND_SECONDS=10,DEFAULT_TARGET=60,FREEZE_MAX_SECONDS=3600;
  const defaultSound=()=>({master:80,events:Object.fromEntries(soundEvents.map(([key])=>[key,{mode:'default',volume:100}]))});
  const defaults={theme:'horror',key:'Space',motion:'on',decayRate:35,decayDelay:0.25,sceneMode:'lock',challengeMode:'bar',materialId:'theme',displaySize:'large'};
  const defaultTargetPool=()=>[
    {id:'light',name:'轻锁',min:30,max:60,percent:60,enabled:true,look:'normal'},
    {id:'heavy',name:'重锁',min:61,max:120,percent:30,enabled:true,look:'rare'},
    {id:'extreme',name:'极限锁',min:121,max:240,percent:10,enabled:true,look:'legendary'}
  ];
  const defaultRules=[
    {name:'小心心',kind:'lock',value:1,target:60},
    {name:'玫瑰',kind:'lock',value:1,target:120},
    {name:'嘉年华',kind:'lock',value:1,target:240},
    {name:'破锁钥匙',kind:'relief',value:60,target:60}
  ];
  const prefix='red-black-lock-v1:';
  let temporary=false,settings=freshSettings(),rules=LockGiftRules.normalizeInlineRules(defaultRules,{});
  let state=null,waiting=[],frozenUntil=0,cleared=0,settingsOpen=false,viewSequence=0,toastTimer=0,clearArmTimer=0,keyRecording=false,keyComposing=false,lastRoundHits=0;
  let configuration=null,countState=null,roundId=0;
  // 两种玩法 × 两种画面，互不相干：
  //   玩法 challengeMode：'bar' 进度条（每条要按几下设好，停手往回掉，礼物加进度条）/ 'count' 次数（礼物只往一个总数上加，不回落）
  //   画面 sceneMode：'lock' 锁链 / 'cage' 牢笼
  const isCount=()=>settings.challengeMode==='count',isCage=()=>settings.sceneMode==='cage';
  const challengeActive=()=>isCount()?!!countState?.remaining:!!state?.layers||waiting.length>0;
  const activeKey=()=>isCount()?countState?.key:state?.key;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const dedupe=LockGiftRules.createDeduper();
  const store={
    get(key){try{return localStorage.getItem(prefix+key);}catch{return null;}},
    set(key,value){try{localStorage.setItem(prefix+key,value);return true;}catch{storageWarning();return false;}},
    del(key){try{localStorage.removeItem(prefix+key);return true;}catch{storageWarning();return false;}}
  };
  function freshSettings(){return {...defaults,sound:defaultSound(),targetPool:defaultTargetPool(),multipliers:[]};}
  function storageWarning(){temporary=true;$('storage-status').textContent='浏览器存不了设置，关掉就丢';$('settings-storage-status').textContent='这个浏览器存不了东西：现在能玩，但关掉或刷新以后，设置和进度都会丢。';$('settings-storage-status').style.setProperty('color','#ffadba','important');}
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
  const customArt=LockCustomArt.create({getTheme:()=>settings.theme,getMode:()=>settings.sceneMode,overlay:$('typing-lock-overlay'),holder:$('custom-art'),notify:toast,onStorageError:storageWarning});
  const presentation=LockPresentation.create({getSettings:()=>settings,overlay:$('typing-lock-overlay')});
  const feedback=LockHitFeedback.create({getSettings:()=>settings,overlay:$('typing-lock-overlay'),spawn:(...args)=>fxSpawn(...args)});
  const scenes=LockScenes.create({getSettings:()=>settings,overlay:$('typing-lock-overlay'),notify:toast});
  const giftTables=LockGiftTables.create({holders:{lock:$('gift-lock'),mess:$('gift-mess'),help:$('gift-help')},api:{
    rules:()=>rules,save:next=>{if(!persistRules(next))return false;rules=next;return true;},clean:rule=>cleanRules([rule])?.[0]||null,
    play:()=>settings.challengeMode,scene:()=>settings.sceneMode,test:rule=>testRule(rule),toast}});
  // 进度条玩法按「条」算、次数玩法按「次」算；锁链说「按」、牢笼说「拍」
  const unitWord=()=>isCount()?'次':'条',pressWord=()=>isCage()?'拍':'按';
  function cleanMultipliers(value){if(!Array.isArray(value)||value.length>1000)return null;const ids=new Set(),out=[];for(const item of value){if(!item||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>40||!Number.isSafeInteger(Number(item.factor))||String(item.factor).trim()===''||Number(item.factor)<1||Number(item.factor)>1000)return null;ids.add(item.id);out.push({id:item.id,name:item.name.trim(),factor:Number(item.factor)});}return out;}
  function applyMaterial(){const overlay=$('typing-lock-overlay'),entry=window.LockMaterialBank?.[settings.materialId];for(const prop of ['--typing-lock-chain','--typing-lock-padlock','--lock-chain-ratio-x','--lock-chain-ratio-y','--lock-chain-offset','--lock-art-split','--lock-art-bottom'])overlay.style.removeProperty(prop);delete overlay.dataset.material;
    if(entry){overlay.dataset.material=settings.materialId;overlay.style.setProperty('--typing-lock-chain','url("'+entry.chain+'")');overlay.style.setProperty('--typing-lock-padlock','url("'+entry.padlock+'")');overlay.style.setProperty('--lock-chain-ratio-x',entry.chainRatioX);overlay.style.setProperty('--lock-chain-ratio-y',entry.chainRatioY);overlay.style.setProperty('--lock-chain-offset',entry.chainOffset);overlay.style.setProperty('--lock-art-split','100%');overlay.style.setProperty('--lock-art-bottom','0%');}
    customArt.apply();customArt.render();presentation.invalidate();scenes.applyStyle();scenes.position();
  }

  /* ---------- 音效：默认合成音 / 自定义音频 / 关闭 ---------- */
  const customSounds=new Map(); // event -> {name, buffer}
  const playing=new Map();
  const uploadToken={};
  function audioContext(){const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;const ctx=audioContext.ctx||(audioContext.ctx=new Ctx());if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx;}
  function eventGain(kind){const conf=settings.sound.events[kind];return (settings.sound.master/100)*(conf.volume/100);}
  function synth(ctx,kind,gainScale){
    if(isCage()&&kind==='hit'){feedback.synthDoor(ctx,gainScale);return;}
    if(settings.theme==='fufu'){presentation.synth(ctx,kind,gainScale);return;}
    const start=ctx.currentTime,notes={clear:[560,830,1180],lock:[130,100],layer:[420,640,900],hit:[340,500]}[kind];
    for(const [index,freq] of notes.entries()){const o=ctx.createOscillator(),g=ctx.createGain(),t=start+index*(kind==='layer'?.06:.08),peak=Math.max(.0011,.055*gainScale);o.type=kind==='lock'?'sawtooth':'triangle';o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(peak,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+.15);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+.16);}
  }
  function playBuffer(ctx,kind,buffer,gainScale){
    const list=playing.get(kind)||[];while(list.length>=6){try{list.shift().stop();}catch{}}
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=gainScale;source.connect(gain).connect(ctx.destination);
    source.onended=()=>{const i=list.indexOf(source);if(i>=0)list.splice(i,1);};list.push(source);playing.set(kind,list);source.start();
  }
  function sound(kind,force=false){
    try{
      const conf=settings.sound.events[kind];if(!conf||(!force&&conf.mode==='off'))return;
      const gainScale=eventGain(kind);if(gainScale<=0)return;
      const ctx=audioContext();if(!ctx)return;
      const custom=customSounds.get(kind);
      // 试听（force）时有自定义音频就放自定义，否则放默认，与当前模式无关。
      const useCustom=custom&&(force?conf.mode!=='default':conf.mode==='custom');
      if(useCustom)playBuffer(ctx,kind,custom.buffer,gainScale);else synth(ctx,kind,gainScale);
    }catch{}
  }
  function stopSound(kind){for(const source of playing.get(kind)||[]){try{source.stop();}catch{}}playing.set(kind,[]);}
  const soundDb={
    // 打开数据库最多等 4 秒；浏览器卡住或被拦截时按“无法保存”处理，不让上传一直挂起。
    open(){if(soundDb.promise)return soundDb.promise;soundDb.promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('indexedDB timeout')),4000);try{const req=indexedDB.open('red-black-lock-sounds',1);req.onupgradeneeded=()=>req.result.createObjectStore('sounds');req.onsuccess=()=>{clearTimeout(timer);resolve(req.result);};req.onerror=()=>{clearTimeout(timer);reject(req.error);};req.onblocked=()=>{clearTimeout(timer);reject(new Error('indexedDB blocked'));};}catch(error){clearTimeout(timer);reject(error);}});soundDb.promise.catch(()=>{soundDb.promise=null;});return soundDb.promise;},
    async run(mode,fn){const db=await soundDb.open();return new Promise((resolve,reject)=>{const tx=db.transaction('sounds',mode),req=fn(tx.objectStore('sounds'));tx.oncomplete=()=>resolve(req?.result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('sound store failed'));});},
    put(kind,record){return soundDb.run('readwrite',s=>s.put(record,kind));},
    del(kind){return soundDb.run('readwrite',s=>s.delete(kind));},
    get(kind){return soundDb.run('readonly',s=>s.get(kind));}
  };
  async function decode(bytes){const ctx=audioContext();if(!ctx)throw new Error('no audio');return await ctx.decodeAudioData(bytes.slice(0));}
  async function loadCustomSounds(){
    for(const [kind] of soundEvents){
      const token=uploadToken[kind]||0; // 启动读取期间若已上传或移除，以用户的新操作为准
      try{const record=await soundDb.get(kind);if(!record||!(record.data instanceof ArrayBuffer))continue;const buffer=await decode(record.data);if((uploadToken[kind]||0)===token)customSounds.set(kind,{name:String(record.name||'自定义音频'),buffer,bytes:record.data,type:String(record.type||'')});}
      catch{/* 读取或解码失败时保留默认音效 */}
    }
    renderSounds();
  }
  async function uploadSound(kind,file){
    if(!file)return;
    // 先校验再占用上传序号：被拒绝的文件不会顶掉正在处理的有效上传。
    if(file.size>MAX_SOUND_BYTES){toast('声音文件不能超过 3 MB');return;}
    if(file.type&&!file.type.startsWith('audio/')){toast('要选声音文件（MP3、WAV、OGG 都行）');return;}
    const token=(uploadToken[kind]||0)+1;uploadToken[kind]=token;
    let bytes,buffer;
    try{bytes=await file.arrayBuffer();buffer=await decode(bytes);}catch{if(uploadToken[kind]===token)toast('这个声音文件放不出来，还用原来的');return;}
    if(uploadToken[kind]!==token)return;
    if(buffer.duration>MAX_SOUND_SECONDS){toast('声音要在 '+MAX_SOUND_SECONDS+' 秒以内，还用原来的');return;}
    const name=String(file.name||'自定义音频').slice(0,60);
    let saved=true;try{await soundDb.put(kind,{name,type:file.type,data:bytes});}catch{saved=false;}
    if(uploadToken[kind]!==token)return;
    if(!saved){storageWarning();toast('浏览器没能存下这个声音，还用原来的');return;}
    customSounds.set(kind,{name,buffer,bytes,type:file.type||''});
    const next=activeConfiguration();next.settings.sound.events[kind].mode='custom';
    const configured=persistConfiguration(next);if(configured)settings.sound.events[kind].mode='custom';renderSounds();
    toast(configured?'换成了「'+name+'」':'声音存下了，但没能切换过去，请再点一次「自己的」');sound(kind,true);
  }
  async function removeSound(kind){
    uploadToken[kind]=(uploadToken[kind]||0)+1;
    let removed=true;try{await soundDb.del(kind);}catch{removed=false;}
    stopSound(kind);customSounds.delete(kind);const next=activeConfiguration();if(next.settings.sound.events[kind].mode==='custom')next.settings.sound.events[kind].mode='default';
    if(persistConfiguration(next))settings.sound.events[kind].mode=next.settings.sound.events[kind].mode;renderSounds();
    toast(removed?'删掉了，换回默认声音':'这里换回默认声音了，但浏览器没删掉存着的那个，刷新后可能还在');
  }
  function renderSounds(){
    const holder=$('sounds');if(!holder)return;holder.replaceChildren();
    $('sound-master').value=settings.sound.master;$('sound-master-value').textContent=settings.sound.master+'%';
    for(const [kind,label] of soundEvents){
      if(isCount()&&kind==='layer')continue;
      const conf=settings.sound.events[kind],custom=customSounds.get(kind);
      const row=document.createElement('div');row.className='sound-row';row.dataset.sound=kind;
      const head=document.createElement('div');head.className='sound-head';
      const title=document.createElement('strong');title.textContent=kind==='lock'?(isCount()?'加次数的时候':isCage()?'关笼的时候':label):kind==='hit'&&isCage()?'每拍一下':kind==='clear'&&isCage()?'门开了':label;
      const mode=createChoice(soundModes,conf.mode==='custom'&&!custom?'default':conf.mode,label+'音效');
      mode.querySelector('button[data-value=custom]').disabled=!custom;
      mode.addEventListener('click',event=>{const b=event.target.closest('button[data-value]');if(!b||b.disabled)return;const live=settings.sound.events[kind];live.mode=b.dataset.value;saveSettingsObject();renderSounds();if(live.mode!=='off')sound(kind);});
      head.append(title,mode);
      const tools=document.createElement('div');tools.className='sound-tools';
      const vol=document.createElement('input');vol.type='range';vol.min='0';vol.max='100';vol.step='5';vol.value=conf.volume;vol.setAttribute('aria-label',label+'音量');
      const volText=document.createElement('span');volText.className='sound-vol';volText.textContent=conf.volume+'%';
      vol.addEventListener('input',()=>{volText.textContent=vol.value+'%';});
      vol.addEventListener('change',()=>{settings.sound.events[kind].volume=Math.max(0,Math.min(100,Math.round(Number(vol.value)/5)*5));saveSettingsObject();sound(kind,true);});
      const file=document.createElement('input');file.type='file';file.accept='audio/*';file.hidden=true;
      file.addEventListener('change',()=>{const f=file.files?.[0];file.value='';uploadSound(kind,f);});
      const upload=document.createElement('button');upload.type='button';upload.className='secondary small';upload.textContent=custom?'换一个':'换成自己的';upload.onclick=()=>file.click();
      const test=document.createElement('button');test.type='button';test.className='secondary small';test.textContent='试听';test.onclick=()=>sound(kind,true);
      tools.append(vol,volText,upload,test);
      if(custom){const remove=document.createElement('button');remove.type='button';remove.className='secondary small';remove.textContent='删掉自己的';remove.onclick=()=>removeSound(kind);tools.append(remove);}
      tools.append(file);
      const note=document.createElement('div');note.className='sound-note';
      note.textContent=custom?'自己的：'+custom.name:conf.mode==='custom'?'自己的声音读不出来，先用默认的':'用的是默认声音';
      row.append(head,tools,note);holder.append(row);
    }
  }

  /* ---------- 设置、档位与规则 ---------- */
  function cleanSound(value){
    const result=defaultSound();if(!value||typeof value!=='object')return result;
    const pct=n=>Number.isFinite(Number(n))?Math.max(0,Math.min(100,Math.round(Number(n)))):null;
    if(pct(value.master)!==null)result.master=pct(value.master);
    for(const [kind] of soundEvents){const conf=value.events?.[kind];if(!conf)continue;if(['default','custom','off'].includes(conf.mode))result.events[kind].mode=conf.mode;if(pct(conf.volume)!==null)result.events[kind].volume=pct(conf.volume);}
    return result;
  }
  function cleanSettings(value){
    const result=freshSettings();
    if(value&&typeof value==='object'){
      const legacy=['lock','cage','count'].includes(value.mode)?value.mode:null; // V2.3 的多条进度 / 牢笼拍门 / 累计次数
      result.sceneMode=['lock','cage'].includes(value.sceneMode)?value.sceneMode:legacy==='cage'?'cage':'lock';
      result.challengeMode=['bar','count'].includes(value.challengeMode)?value.challengeMode:legacy==='count'?'count':'bar';
      if(value.demo&&typeof value.demo==='object')result.demo=Object.fromEntries(Object.entries(value.demo).filter(([key,n])=>['amount','layers','target','factor','divisor','points','seconds'].includes(key)&&Number.isSafeInteger(n)&&n>=1&&n<=10000000));
      if(themes.has(value.theme))result.theme=value.theme;if(TypingLockModel.keyValid(value.key))result.key=value.key;if(['on','auto','off'].includes(value.motion))result.motion=value.motion;
      if(['theme','forged-steel','antique-brass','arcane-anime','candy-toon'].includes(value.materialId))result.materialId=value.materialId;
      if(['standard','large','xlarge'].includes(value.displaySize))result.displaySize=value.displaySize;
      if(value.multipliers!==undefined){const levels=cleanMultipliers(value.multipliers);if(levels)result.multipliers=levels;}
      if(Array.isArray(value.tiers))result.tiers=value.tiers.slice(0,1000).filter(tier=>tier&&typeof tier.id==='string'&&TypingLockModel.target(tier.target)!==null).map(tier=>({...tier,target:TypingLockModel.target(tier.target)}));
      if(value.targets&&typeof value.targets==='object'){result.targets={};for(const [id,target] of Object.entries(value.targets)){const n=TypingLockModel.target(target);if(n!==null)result.targets[id]=n;}}
      result.sound=cleanSound(value.sound);
      if(value.targetPool!==undefined){const pool=LockGiftRules.cleanTargetPool(value.targetPool);if(pool)result.targetPool=pool;}
      const rateOk=Number(value.decayRate),delayOk=Number(value.decayDelay);
      if(value.decayRate!==undefined&&value.decayRate!==null&&value.decayRate!==''&&Number.isFinite(rateOk)&&rateOk>=0&&rateOk<=500)result.decayRate=Math.round(rateOk);
      if(value.decayDelay!==undefined&&value.decayDelay!==null&&value.decayDelay!==''&&Number.isFinite(delayOk)&&delayOk>=0&&delayOk<=10)result.decayDelay=Math.round(delayOk*100)/100;
    }
    return result;
  }
  function applyDecay(){TypingLockModel.setDecay({rate:settings.decayRate/100,graceMs:settings.decayDelay*1000});}
  // 加锁规则自带「每层连点次数」。旧版（V1.3 固定三档、V1.4 自定义档位）规则按原档位的次数迁移过来。
  function legacyTargets(raw){
    const map={normal:60,rare:120,legendary:240};
    if(Array.isArray(raw?.tiers)){for(const tier of raw.tiers){const n=TypingLockModel.target(tier?.target);if(n!==null&&typeof tier.id==='string')map[tier.id]=n;}}
    else if(raw?.targets&&typeof raw.targets==='object'){for(const key of Object.keys(map)){const n=TypingLockModel.target(raw.targets[key]);if(n!==null)map[key]=n;}}
    return map;
  }
  function cleanRules(value,legacy,sourceSettings=settings){
    if(!Array.isArray(value)||value.length>50)return null;
    const prepared=value.map(rule=>{
      if(!rule||typeof rule!=='object')return rule;
      const next={...rule};
      if(next.target===undefined&&next.targetMin===undefined&&legacy)next.target=Object.hasOwn(legacy,next.tier)?legacy[next.tier]:DEFAULT_TARGET;
      return next;
    });
    return sourceSettings?.challengeMode==='count'?LockModes.normalizeCountRules(prepared):LockGiftRules.normalizeInlineRules(prepared,sourceSettings);
  }
  // 存档第 25 版（插件 V2.4）：一份设置 + 两张礼物表（进度条一张、次数一张）。画面单独选，不跟礼物表绑在一起。
  // 老版本的存档（V2.3 的 config-v23、V2.4 测试版的 config-v24）只读不写：第一次打开时换算过来，老版本照样用它自己那一份。
  const CONFIG_KEY='config-v25',STATE_KEY='state-v25',PLAYS=['bar','count'],OLD_MODES=['lock','cage','count'];
  // V2.3 以前的礼物格式：只有累计次数是按次数，多条进度和牢笼拍门都是一条条的
  const v23Shape=st=>({...(st||{}),challengeMode:st?.mode==='count'?'count':'bar'});
  function normalizeConfiguration(raw){
    if(!raw||raw.version!==25||!raw.settings||!raw.rules)return null;
    const st=cleanSettings(raw.settings),legacy=legacyTargets(raw.settings);
    const bar=cleanRules(raw.rules.bar,legacy,{...st,challengeMode:'bar'}),count=cleanRules(raw.rules.count,legacy,{...st,challengeMode:'count'});
    return bar&&count?{version:25,settings:st,rules:{bar,count}}:null;
  }
  // 三种玩法各存一份的老存档 → 现在：设置用当时正在用的那一份；进度条礼物用「多条进度」的（当时用牢笼拍门就用它的），次数礼物用「累计次数」的。
  // V2.4 测试版里牢笼拍门是按次数的，所以它的礼物算进次数那张表。
  function fromProfiles(raw,active=raw?.mode){
    if(!raw||![23,24].includes(raw.version)||!raw.profiles||!OLD_MODES.includes(active))return null;
    const playOf=mode=>mode==='count'||raw.version===24&&mode==='cage'?'count':'bar';
    const rulesOf=mode=>{const p=raw.profiles[mode];return p?cleanRules(p.rules,legacyTargets(p.settings),{...cleanSettings(p.settings),challengeMode:playOf(mode)}):null;};
    const p=raw.profiles[active],play=playOf(active);if(!p)return null;
    const st=cleanSettings({...p.settings,sceneMode:active==='cage'?'cage':'lock',challengeMode:play});
    const bar=rulesOf(play==='bar'?active:'lock'),count=rulesOf(play==='count'?active:'count');
    return bar&&count?{version:25,settings:st,rules:{bar,count}}:null;
  }
  function activeConfiguration(st=settings,rr=rules){const next=clone(configuration);next.settings=clone(st);next.rules[st.challengeMode]=clone(rr);return next;}
  function persistConfiguration(next){
    // 只写自己的 config-v25，老版本的存档一个都不写
    if(!store.set(CONFIG_KEY,JSON.stringify(next)))return false;
    configuration=clone(next);return true;
  }
  function persistRules(next){return persistConfiguration(activeConfiguration(settings,next));}
  function restore(){
    const readRecord=key=>{try{return JSON.parse(store.get(key)||'null');}catch{toast('部分旧存档无法读取，正在保留可用记录');return null;}};
    const raw=readRecord('settings'),saved=readRecord(STATE_KEY)||readRecord('state-v24')||readRecord('state'),stored=readRecord(CONFIG_KEY);
    let legacyRules=LockGiftRules.normalizeInlineRules(defaultRules,{});
    try{const value=JSON.parse(store.get('rules')||'null');if(value!==null){const migrated=cleanRules(value,legacyTargets(raw),v23Shape(raw));if(migrated)legacyRules=migrated;else toast('礼物规则存档无效，保留旧存档并暂用默认规则');}}catch{toast('礼物规则存档读取失败，保留旧存档');}
    // 老存档里正在玩的那局用的是哪一份，换算时就用那一份的设置
    const oldActive=[23,24].includes(saved?.version)&&(saved.lock?.layers||saved.count?.remaining)&&OLD_MODES.includes(saved.mode)?saved.mode:undefined;
    configuration=normalizeConfiguration(stored);
    if(stored&&!configuration)toast('设置存档坏了，先用旧版的设置；可以从备份导入');
    configuration=configuration||fromProfiles(readRecord('config-v24'),oldActive)||fromProfiles(readRecord('config-v23'),oldActive)||fromProfiles(LockModes.migrateConfig(raw||defaults,legacyRules))||fromProfiles(LockModes.migrateConfig(defaults,defaultRules));
    // 正在玩的那局是什么玩法就接着用什么玩法（换玩法要先清空，平常不会对不上）
    if(saved?.count?.remaining)configuration.settings.challengeMode='count';else if(saved?.lock?.layers)configuration.settings.challengeMode='bar';
    settings=clone(configuration.settings);rules=clone(configuration.rules[settings.challengeMode]);applyDecay();
    try{if(saved&&[1,23,24,25].includes(saved.version)){
      cleared=Number.isSafeInteger(saved.cleared)&&saved.cleared>=0?saved.cleared:0;frozenUntil=Number.isFinite(saved.frozenUntil)?Math.min(saved.frozenUntil,Date.now()+FREEZE_MAX_SECONDS*1000):0;
      if(isCount())countState=saved.count?LockModes.restoreCount(saved.count):null;
      else{state=TypingLockModel.restore(saved.lock,Date.now());state=state?.layers?state:null;waiting=cleanWaiting(saved.waiting);if(waiting.length)pourWaiting(Date.now());}
    }}catch{toast('挑战存档读取失败，原始存档仍保留');}
  }
  function save(){store.set(STATE_KEY,JSON.stringify({version:25,play:settings.challengeMode,lock:state?.layers?state:null,count:countState?.remaining?countState:null,waiting,frozenUntil:frozenLeft()>0?frozenUntil:0,cleared}));}
  function saveSettingsObject(){const previous=configuration.settings;if(persistConfiguration(activeConfiguration()))return true;settings=clone(previous);toast('设置未能保存，已保留原配置');return false;}
  function saveRules(){return persistRules(rules);}
  function motionEnabled(){return settings.motion==='on'||settings.motion==='auto'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function refreshMotion(){const overlay=$('typing-lock-overlay');overlay.dataset.motion=motionEnabled()?'on':'off';}
  function position(){presentation.fit();const w=innerWidth;$('typing-lock-overlay').style.setProperty('--lock-panel-width',Math.max(270,Math.min(440,w*.43))+'px');scenes.position();}

  /* ---------- 画面 ---------- */
  function render(){
    const locked=challengeActive(),overlay=$('typing-lock-overlay');overlay.dataset.mode=settings.sceneMode;
    if(isCount()){renderCount();return;}
    overlay.dataset.challenge=state?.challengeMode||settings.challengeMode;
    $('lock-action').textContent=isCage()?'拍开门':settings.theme==='fufu'?'啃开锁':'破锁';
    presentation.fit();
    $('lock-counter').hidden=true;$('typing-lock-layers').hidden=false;$('typing-lock-meter').hidden=false;
    if($('clear-locks')?.dataset.armed==='true'){if(locked)clearLabel();else disarmClear();}
    $('total-cleared').textContent='已破除 '+cleared.toLocaleString()+' 层';
    $('arena-state').textContent=locked?(settings.sceneMode==='cage'?'关押中':'封锁中')+' · 剩余 '+totalLayers().toLocaleString()+' 层':'等待观众关笼／加锁';
    if(!locked){scenes.render(null,{motion:motionEnabled(),totalLayers:0,totalHits:0,remaining:0});return;}
    TypingLockModel.tick(state,Date.now());const total=state.progress+state.relief,ratio=Math.min(.999,total/state.target),remaining=Math.max(0,Math.ceil(state.target-total));
    overlay.dataset.tier='legendary';$('typing-lock-grade').textContent=state.tierName;$('typing-lock-key').textContent=TypingLockModel.keyLabel(state.key);renderFreeze(overlay);
    $('typing-lock-layers').textContent='×'+totalLayers().toLocaleString();$('typing-lock-fill').style.transform='scaleX('+ratio+')';presentation.updateProgress(Math.min(1,total/state.target));feedback.update(Math.min(1,total/state.target),roundId+':'+cleared);$('typing-lock-relief').style.transform='scaleX('+(state.relief/state.target)+')';$('typing-lock-progress').textContent=Math.floor(total)+' / '+state.target;
    $('lock-total-hits').textContent=(state.totalHits||0).toLocaleString();$('lock-remaining-hits').textContent=remaining.toLocaleString();
    const meter=$('typing-lock-meter');meter.setAttribute('aria-valuenow',String(Math.round(ratio*100)));meter.setAttribute('aria-valuetext',Math.floor(total)+' / '+state.target+'，剩余'+state.layers+'层');
    $('typing-lock-support').textContent=(state.source?'来自 '+String(state.source):'')+(state.relief?' · 已帮'+pressWord()+' '+Math.floor(state.relief)+' 下':'');
    const queue=state.queue.slice(0,6).map(batch=>batch.tierName+'×'+batch.layers.toLocaleString());if(state.queue.length>6)queue.push('另 '+(state.queue.length-6)+' 批');$('typing-lock-queue').replaceChildren(...queue.map(label=>{const span=document.createElement('span');span.textContent=label;return span;}));
    scenes.render(state,{motion:motionEnabled(),totalLayers:totalLayers(),totalHits:state.totalHits||0,remaining});
  }
  function showEntrance(){viewSequence++;const overlay=$('typing-lock-overlay');$('lock-fx')?.replaceChildren();feedback.reset();roundId++;overlay.hidden=false;overlay.className='';refreshMotion();position();void overlay.offsetWidth;overlay.classList.add(motionEnabled()?'lock-wrapping':'lock-held');const entranceDuration=scenes.entrance();const sequence=viewSequence;if(motionEnabled())setTimeout(()=>{if(sequence===viewSequence&&challengeActive()){overlay.classList.remove('lock-wrapping');overlay.classList.add('lock-held');}},entranceDuration||1450);$('idle-screen').hidden=true;render();}
  function showExit(){if(isCount()){showCountExit();return;}$('lock-remaining-hits').textContent='0';$('lock-total-hits').textContent=lastRoundHits.toLocaleString();const overlay=$('typing-lock-overlay'),sequence=++viewSequence;$('typing-lock-fill').style.transform='scaleX(1)';presentation.updateProgress(1);$('typing-lock-progress').textContent=settings.theme==='fufu'?'啃开啦':'已破锁';$('typing-lock-layers').textContent='×0';$('typing-lock-meter').setAttribute('aria-valuenow','100');$('typing-lock-meter').setAttribute('aria-valuetext','全部锁链已破除');overlay.className='';refreshMotion();const exitDuration=scenes.exit({totalHits:lastRoundHits});if(motionEnabled()){overlay.classList.add('lock-opening');setTimeout(()=>{if(sequence===viewSequence&&!challengeActive()){overlay.hidden=true;overlay.className='';$('idle-screen').hidden=false;}},exitDuration||950);}else{overlay.hidden=true;$('idle-screen').hidden=false;}render();}


  /* ---------- 特效：连点火花、破层爆裂、加锁震链、全破爆发（动画偏好关闭时不播） ---------- */
  const FX_MAX_NODES=90;
  function fxLayer(){return $('lock-fx');}
  function fxRun(el,frames,options){try{if(el.matches?.('.lock-emblem,.chain-arm'))frames=[{filter:'brightness(1)'},{filter:'brightness(1.38)'},{filter:'brightness(1)'}];return el.animate(frames,options);}catch{return null;}}
  function fxSpawn(className,frames,options){
    const layer=fxLayer();if(!layer||layer.childElementCount>=FX_MAX_NODES)return;
    const node=document.createElement('i');node.className=className;layer.append(node);
    const anim=fxRun(node,frames,{fill:'forwards',...options});
    if(anim)anim.onfinish=()=>node.remove();else setTimeout(()=>node.remove(),options.duration||500);
  }
  function fxSparks(count,reach,duration){
    for(let i=0;i<count;i++){
      const angle=Math.random()*360,start=40+Math.random()*25,dist=start+reach*(.55+Math.random()*.6),scale=.6+Math.random()*.7;
      fxSpawn('fx-spark',[{transform:`rotate(${angle}deg) translateY(-${start}px) scaleY(${scale})`,opacity:1},{transform:`rotate(${angle}deg) translateY(-${dist}px) scaleY(${scale*.3})`,opacity:0}],{duration:duration*(.8+Math.random()*.4),easing:'cubic-bezier(.15,.7,.3,1)'});
    }
  }
  function fxChains(strength,duration){
    for(const chain of document.querySelectorAll('#typing-lock-overlay .chain-arm .lock-chain')){
      const d=strength*(.6+Math.random()*.8);
      fxRun(chain,[{translate:'0 0'},{translate:`0 ${d}px`},{translate:`0 ${-d*.7}px`},{translate:`0 ${d*.35}px`},{translate:'0 0'}],{duration,easing:'ease-out'});
    }
  }
  function fxHit(){if(motionEnabled()&&settings.theme!=='fufu'&&!isCage())fxSparks(7,90,420);}
  function fxBreak(big=false){
    if(!motionEnabled())return;
    if(settings.theme==='fufu'){if(!isCage())presentation.layerBreak();presentation.effects(big?'clear':'layer',fxSpawn);return;}
    fxSpawn('fx-flash',[{transform:'scale(.3)',opacity:1},{transform:`scale(${big?1.9:1.25})`,opacity:.85,offset:.35},{transform:`scale(${big?2.3:1.5})`,opacity:0}],{duration:big?650:420,easing:'ease-out'});
    fxSpawn('fx-ring',[{transform:'scale(.3)',opacity:1},{transform:`scale(${big?3.2:2.1})`,opacity:0}],{duration:big?750:520,easing:'cubic-bezier(.1,.7,.3,1)'});
    fxSparks(big?34:18,big?300:200,big?850:600);
    for(let i=0;i<(big?14:8);i++){
      const angle=Math.random()*360,dist=60+(big?260:170)*(.5+Math.random()*.7),spin=(Math.random()*540-270)|0;
      fxSpawn('fx-shard',[{transform:`rotate(${angle}deg) translateY(-50px) rotate(0deg)`,opacity:1},{transform:`rotate(${angle}deg) translateY(-${dist}px) rotate(${spin}deg) scale(.4)`,opacity:0}],{duration:(big?900:620)*(.8+Math.random()*.4),easing:'cubic-bezier(.2,.8,.3,1)'});
    }
    fxChains(big?9:6,big?520:360);
    const readout=$('typing-lock-layers');if(readout&&!big)fxRun(readout,[{transform:'scale(1.45)',color:'#fff'},{transform:'scale(1)'}],{duration:320,easing:'ease-out'});
  }
  function fxAdd(){
    if(!motionEnabled())return;
    if(settings.theme==='fufu'){presentation.effects('lock',fxSpawn);return;}
    fxChains(7,520);
    const emblem=document.querySelector('#typing-lock-overlay .lock-emblem');
    if(emblem)fxRun(emblem,[{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(.97)'},{transform:'scale(1)'}],{duration:420,easing:'ease-out'});
    const readout=$('typing-lock-layers');if(readout)fxRun(readout,[{transform:'scale(1.5)'},{transform:'scale(1)'}],{duration:360,easing:'ease-out'});
  }


  /* ---------- 禁用按键：观众送礼让破锁键失效若干秒，多份叠加，封顶 1 小时 ---------- */
  const frozenLeft=()=>Math.max(0,frozenUntil-Date.now());
  function renderFreeze(overlay){
    const left=frozenLeft(),box=$('typing-lock-freeze');
    overlay.classList.toggle('lock-frozen',left>0);
    if(!box)return;box.hidden=!(left>0);
    if(left>0){$('typing-lock-freeze-left').textContent=left>=10000?Math.ceil(left/1000):(left/1000).toFixed(1);}
  }
  function freezeKeys(seconds,source='试玩'){
    if(!Number.isSafeInteger(seconds)||seconds<1){toast('失灵几秒要填正整数');return false;}
    const now=Date.now(),base=Math.max(now,frozenUntil),until=Math.min(base+seconds*1000,now+FREEZE_MAX_SECONDS*1000),added=Math.round((until-base)/1000);
    frozenUntil=until;save();
    const label=String(source||'礼物').slice(0,80),total=Math.ceil(frozenLeft()/1000);
    $('last-event').textContent=label+' · 按键失灵 '+added+' 秒（还剩 '+total+' 秒）';
    toast(label+'：按键失灵 '+added+' 秒，还剩 '+total+' 秒'+(added<seconds?'（最多失灵 1 小时）':''));
    if(challengeActive()){render();fxFreeze();}
    sound('lock');return true;
  }
  function denyTap(){
    if(!motionEnabled())return;
    if(settings.theme==='fufu'){presentation.effects('blocked',fxSpawn);return;}
    const emblem=document.querySelector('#typing-lock-overlay .lock-emblem');
    if(emblem)fxRun(emblem,[{transform:'none'},{transform:'translateX(-7px) rotate(-4deg)'},{transform:'translateX(7px) rotate(4deg)'},{transform:'translateX(-4px)'},{transform:'none'}],{duration:220,easing:'ease-out'});
    const box=$('typing-lock-freeze');if(box)fxRun(box,[{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:200,easing:'ease-out'});
  }
  function fxFreeze(){
    if(!motionEnabled())return;
    if(settings.theme==='fufu'){presentation.effects('blocked',fxSpawn);return;}
    fxChains(8,560);
    fxSpawn('fx-ring fx-ban',[{transform:'scale(2.4)',opacity:0},{transform:'scale(1)',opacity:1,offset:.45},{transform:'scale(1.15)',opacity:0}],{duration:620,easing:'cubic-bezier(.2,.8,.3,1)'});
  }

  /* ---------- 玩法 ---------- */
  /* ---------- 超过 20000 层：先加到上限，多出的按到达顺序排在后面，层数降下来再自动补进去 ---------- */
  const ACTIVE_CAP=20000,WAITING_MAX_LAYERS=10000000,WAITING_MAX_ENTRIES=500;
  const waitingLayers=()=>waiting.reduce((sum,item)=>sum+item.layers,0);
  const totalLayers=()=>(state?.layers||0)+waitingLayers();
  function cleanWaiting(value){
    if(!Array.isArray(value))return [];const result=[];let total=0,skipped=0;
    for(const item of value.slice(0,WAITING_MAX_ENTRIES)){
      const layers=Number(item?.layers),target=TypingLockModel.target(item?.target);
      if(!Number.isSafeInteger(layers)||layers<1||target===null||!TypingLockModel.keyValid(item?.key)){skipped++;continue;}
      const take=Math.min(layers,WAITING_MAX_LAYERS-total);if(take<1)break;
      const source=String(item.source??'礼物').slice(0,80);
      const targetPool=item.targetPool===undefined?undefined:LockGiftRules.cleanTargetPool(item.targetPool);
      if(item.targetPool!==undefined&&!targetPool){skipped++;continue;}
      if(item.rngState!==undefined&&(!Number.isSafeInteger(item.rngState)||item.rngState<0||item.rngState>4294967295)){skipped++;continue;}
      total+=take;
      const multiplier=item.multiplier===undefined?1:item.multiplier,challengeMode=item.challengeMode===undefined?'bar':item.challengeMode;if(!Number.isSafeInteger(multiplier)||multiplier<1||multiplier>1000000000||!['bar','count'].includes(challengeMode)){skipped++;total-=take;continue;}
      result.push({layers:take,target,key:item.key,source,tierName:String(item.tierName||source).slice(0,40).trim()||'礼物',multiplier,challengeMode,...(targetPool?{targetPool}:{}),...(Number.isSafeInteger(item.rngState)&&item.rngState>=0?{rngState:item.rngState}:{})});
    }
    if(skipped)toast('排队记录有 '+skipped+' 条无效，本页跳过并保留健康锁链');return result;
  }
  function pourWaiting(now){
    let poured=0;
    while(waiting.length&&(state?.layers||0)<ACTIVE_CAP){
      const first=waiting[0],take=Math.min(first.layers,ACTIVE_CAP-(state?.layers||0));
      const entry={tier:'gift',tierName:first.tierName,look:'normal',key:first.key,target:first.target,source:first.source,multiplier:first.multiplier,challengeMode:first.challengeMode,...(first.targetPool?{targetPool:first.targetPool}:{}),...(first.rngState!==undefined?{rngState:first.rngState}:{})};
      if(state){if(!TypingLockModel.add(state,take,now,entry))break;}else{state=TypingLockModel.create(take,entry,now);if(!state)break;}
      first.layers-=take;poured+=take;if(!first.layers)waiting.shift();
    }
    return poured;
  }
  function addLock(layers,target,source='试玩',targetPool,multiplier=1){
    if(isCount())return addCount(layers,source);
    if(!Number.isSafeInteger(layers)||layers<1||layers>WAITING_MAX_LAYERS){toast('一次加的'+unitWord()+'数要在 1～'+WAITING_MAX_LAYERS.toLocaleString()+' 之间');return false;}
    if(TypingLockModel.target(target)===null){toast('每条'+pressWord()+'几下要填 '+TypingLockModel.TARGET_MIN+'～'+TypingLockModel.TARGET_MAX);return false;}
    const pool=targetPool?LockGiftRules.cleanTargetPool(targetPool):null;
    if(targetPool&&!pool){toast('旧版概率设置坏了，这次没加上');return false;}
    const label=String(source||'礼物').slice(0,80),now=Date.now(),entry={tier:'gift',tierName:label.slice(0,40).trim()||'礼物',look:'normal',key:settings.key,target,source:label,multiplier,challengeMode:settings.challengeMode,...(pool?{targetPool:pool}:{})};
    // 已有排队的礼物时，新礼物也排在它们后面，保持先来先破。
    const room=waiting.length?0:Math.max(0,ACTIVE_CAP-(state?.layers||0)),direct=Math.min(layers,room);
    let rest=layers-direct,dropped=0;
    if(rest){
      const space=WAITING_MAX_LAYERS-waitingLayers();if(rest>space){dropped=rest-space;rest=space;}
      if(rest){const last=waiting[waiting.length-1];
        if(last&&!pool&&!last.targetPool&&last.target===target&&last.key===entry.key&&last.source===label&&last.multiplier===multiplier&&last.challengeMode===entry.challengeMode)last.layers+=rest;
        else if(waiting.length<WAITING_MAX_ENTRIES)waiting.push({layers:rest,target,key:entry.key,source:label,tierName:entry.tierName,multiplier,challengeMode:entry.challengeMode,...(pool?{targetPool:pool}:{})});
        else{dropped+=rest;rest=0;}}
    }
    const wasLocked=!!state?.layers;
    if(direct){if(state){if(!TypingLockModel.add(state,direct,now,entry))return false;}else{state=TypingLockModel.create(direct,entry,now);if(!state)return false;}}
    if(!direct&&!rest){toast('排队的太多了，这次没加上');return false;}
    if(wasLocked){render();fxAdd();scenes.add();}else showEntrance();
    // 每条按几下填了范围时，rules.js 会把它变成只有一档的 inline_range；真正的旧版概率才有好几档
    const unit=unitWord(),each='每条'+pressWord(),scaled=n=>Math.min(1000000000,n*multiplier).toLocaleString();
    const ranged=pool?.length===1&&pool[0].id==='inline_range',difficulty=!pool?each+' '+scaled(target)+' 下':ranged?each+' '+scaled(pool[0].min)+'～'+scaled(pool[0].max)+' 下（每条随机）':each+'几下按旧版概率抽';
    save();$('last-event').textContent=label+' · 加 '+(direct+rest).toLocaleString()+' '+unit+'（'+difficulty+'）';
    toast(label+'：加 '+(direct+rest).toLocaleString()+' '+unit+'，'+difficulty+(rest?'（'+rest.toLocaleString()+' '+unit+'先排队，前面的破掉就补上）':'')+(dropped?'；排不下的 '+dropped.toLocaleString()+' '+unit+'没加上':''));
    sound('lock');return true;
  }
  function relieve(points,source='试玩'){
    if(isCount())return changeCount('relief',points,1,source);
    const press=pressWord();
    if(!Number.isSafeInteger(points)||points<1||points>10000000){toast('帮'+press+'几下要填 1～10000000');return false;}
    if(!state?.layers){toast(source+'：现在没有锁，这次帮'+press+'没用上');return false;}
    const before=totalLayers(),now=Date.now();let unused=points,applied=0,clearedLayers=0;
    // 抵扣完当前层数后，排队的锁补进来，剩余点数继续抵扣。
    while(unused>0&&state?.layers){
      const result=TypingLockModel.relieve(state,unused,now);if(!result||!result.applied)break;
      applied+=result.applied;unused=result.unused;clearedLayers+=result.clearedLayers;
      if(!pourWaiting(now))break;
    }
    if(!applied)return false;
    cleared+=before-totalLayers();$('last-event').textContent=source+' · 帮'+press+' '+applied.toLocaleString()+' 下';toast(source+'：帮你'+press+'掉 '+applied.toLocaleString()+' 下'+(clearedLayers?'，破掉 '+clearedLayers.toLocaleString()+' '+unitWord():'')+(unused?'（多出来的不留）':''));
    if(!state.layers){lastRoundHits=state.totalHits||0;state=null;showExit();fxBreak(true);sound('clear');}else{if(clearedLayers){sound('layer');fxBreak();}render();}
    save();return true;
  }
  function multiplyLocks(factor,repetitions=1,source='试玩'){
    if(isCount())return changeCount('multiply',factor,repetitions,source);
    if(!state?.layers){toast(source+'：现在没有锁，这次翻倍没用上');return false;}
    const changed=TypingLockModel.multiplyRemaining(state,factor,Date.now(),repetitions);let waitingChanged=false;
    if(factor>1){for(const item of waiting){let next=item.multiplier||1,turns=repetitions;while(turns-->0&&next<1000000000)next=Math.min(1000000000,next*factor);if(next!==(item.multiplier||1)){item.multiplier=next;waitingChanged=true;}}}
    if(!changed&&!waitingChanged){toast(source+'：剩下的没变（乘的是 1，或者已经到上限了）');return false;}
    const remain='剩下要'+pressWord()+'的',times=repetitions>1?'，连乘 '+repetitions+' 次':'';
    save();render();scenes.add();fxAdd();sound('lock');$('last-event').textContent=source+' · '+remain+' ×'+factor+times;toast(source+'：'+remain+' ×'+factor+times);return true;
  }
  // ④ 减半：剩下要按的总数 ÷ N（向上取整，至少留 1 下，不会直接放出来）；送几份就连除几次
  function shrink(total,factor,repetitions){let next=total;for(let i=0;i<repetitions&&next>1;i++)next=Math.ceil(next/factor);return next;}
  function divideLocks(factor,repetitions=1,source='试玩'){
    if(!Number.isSafeInteger(factor)||factor<1||factor>1000){toast('除以几要填 1～1000 的整数');return false;}
    if(isCount())return changeCount('divide',factor,repetitions,source);
    if(!state?.layers){toast(source+'：现在没有锁，这次减半没用上');return false;}
    const now=Date.now();TypingLockModel.tick(state,now);
    const total=LockModes.legacyRemaining(state,waiting),before=total?.remaining||0,after=shrink(before,factor,repetitions);
    if(!total||after>=before){toast(source+'：剩下的没变（除的是 1，或者只剩 1 下了）');return false;}
    // 多条进度从最前面的进度条开始扣，和帮按一样；扣完正在按的这批，排队的补进来继续扣
    const beforeLayers=totalLayers();let unused=before-after,clearedLayers=0;
    while(unused>0&&state?.layers){
      const result=TypingLockModel.relieve(state,unused,now);if(!result||!result.applied)break;
      unused=result.unused;clearedLayers+=result.clearedLayers;
      if(!pourWaiting(now))break;
    }
    cleared+=beforeLayers-totalLayers();
    const press=pressWord(),text='剩下要'+press+'的 ÷'+factor+(repetitions>1?'，连除 '+repetitions+' 次':'')+'（'+before.toLocaleString()+' 下 → '+after.toLocaleString()+' 下）';
    $('last-event').textContent=source+' · '+text;toast(source+'：'+text);
    if(!state.layers){lastRoundHits=state.totalHits||0;state=null;showExit();fxBreak(true);sound('clear');}else{sound(clearedLayers?'layer':'hit');fxBreak();render();}
    save();return true;
  }
  function hit(){if(isCount()){hitCount();return;}if(!state?.layers)return;const before=state.layers,now=Date.now();TypingLockModel.press(state,now);const broke=before-state.layers;feedback.update(broke?1:Math.min(1,(state.progress+state.relief)/state.target),roundId+':'+cleared);feedback.hit();if(isCage())sound('hit');lastRoundHits=state.totalHits||0;$('lock-total-hits').textContent=(state.totalHits||0).toLocaleString();cleared+=broke;if(broke){pourWaiting(now);scenes.layerBreak();}if(!state.layers){state=null;showExit();fxBreak(true);sound('clear');$('last-event').textContent='全部锁链已破除';}else{if(broke||!isCage())sound(broke?'layer':'hit');render();if(broke)fxBreak();else fxHit();}save();}
  // 观众送「清空」礼物：立刻清掉当前和排队的全部锁链，按全部破除的特效和音效退场（不计入已破除层数）。
  function clearByGift(label){
    if(isCount())return clearCount(label);
    if(!state?.layers&&!waiting.length&&frozenLeft()>0){frozenUntil=0;save();render();toast(label+'：按键恢复了');return true;}
    if(!state?.layers&&!waiting.length){toast(label+'：现在没有锁，这次没用上');return false;}
    const count=totalLayers();lastRoundHits=state?.totalHits||0;disarmClear();state=null;waiting=[];frozenUntil=0;save();showExit();fxBreak(true);sound('clear');
    $('last-event').textContent=label+' · 全部解开（'+count.toLocaleString()+' '+unitWord()+'）';toast(label+'：'+(isCage()?'门开了':'全部解开了')+'（'+count.toLocaleString()+' '+unitWord()+'）');return true;
  }
  function clearAll(){
    disarmClear();
    if(isCount()){clearCount('手动清空');return;}
    if(!state?.layers&&!waiting.length&&frozenLeft()>0){frozenUntil=0;save();render();toast('按键恢复了');return;}
    if(!state?.layers&&!waiting.length){toast('现在没有挑战');return;}
    const count=totalLayers();lastRoundHits=state?.totalHits||0;state=null;waiting=[];frozenUntil=0;save();showExit();$('last-event').textContent='手动清空了 '+count.toLocaleString()+' '+unitWord();toast('清空了（'+count.toLocaleString()+' '+unitWord()+'）');
  }
  // 清空要两次单独点击：第二次须在 0.4–3 秒之间，双击不会直接清空；按钮上实时显示将要清掉的层数。
  let clearArmedAt=0;
  function clearLabel(){const b=$('clear-locks');if(b?.dataset.armed==='true')b.textContent='再点一次就清空（'+(isCount()?(countState?.remaining||0).toLocaleString():totalLayers().toLocaleString())+' '+unitWord()+'）';}
  function disarmClear(){clearTimeout(clearArmTimer);const b=$('clear-locks');if(b){b.dataset.armed='false';b.textContent='清空现在的挑战';}}
  function armClear(event){
    const b=$('clear-locks');
    if(b.dataset.armed==='true'){if(event?.detail>1||Date.now()-clearArmedAt<400)return;clearAll();return;}
    if(event?.detail>1)return;
    if(!challengeActive()&&frozenLeft()<=0){toast('现在没有挑战');return;}
    b.dataset.armed='true';clearArmedAt=Date.now();clearLabel();clearTimeout(clearArmTimer);clearArmTimer=setTimeout(disarmClear,3000);
  }

  function renderCount(){
    const o=$('typing-lock-overlay'),live=!!countState?.remaining;o.dataset.mode='count';o.dataset.challenge='count';
    $('lock-counter').hidden=false;$('typing-lock-layers').hidden=true;$('typing-lock-meter').hidden=true;$('typing-lock-layers').textContent='';$('typing-lock-queue').replaceChildren();
    $('lock-action').textContent=isCage()?'拍开门':settings.theme==='fufu'?'啃开锁':'破锁';$('count-done-label').textContent=isCage()?'已拍':settings.theme==='fufu'?'已啃':'已按';
    if(live){$('lock-remaining-hits').textContent=countState.remaining.toLocaleString();$('lock-total-hits').textContent=countState.pressed.toLocaleString();$('typing-lock-key').textContent=TypingLockModel.keyLabel(countState.key);$('typing-lock-grade').textContent=countState.source||'次数挑战';$('typing-lock-support').textContent='';renderFreeze(o);const ratio=LockModes.countProgress(countState);presentation.updateProgress(ratio);feedback.update(ratio,'count:'+roundId);}
    $('total-cleared').textContent='次数挑战';$('arena-state').textContent=live?'还需 '+countState.remaining.toLocaleString()+' 次':'等待观众加次数';
    presentation.fit();scenes.render(null,{motion:motionEnabled(),totalLayers:live?1:0,totalHits:countState?.pressed||0,remaining:countState?.remaining||0});
    if($('clear-locks').dataset.armed==='true')clearLabel();
  }
  function addCount(amount,source='礼物',giftCapped=false){
    if(!Number.isSafeInteger(amount)||amount<1){toast('加几次要填正整数');return false;}
    const wasLocked=!!countState?.remaining;let result;
    if(wasLocked)result=LockModes.addCount(countState,amount,{key:settings.key,source});else{countState=LockModes.createCount(amount,{key:settings.key,source});result={changed:!!countState,capped:amount>LockModes.MAX_COUNT};}
    if(!countState)return false;if(wasLocked){render();fxAdd();if(isCage())scenes.add();}else showEntrance();save();sound('lock');$('last-event').textContent=source+' · 加 '+amount.toLocaleString()+' '+unitWord();toast(source+'：加 '+amount.toLocaleString()+' '+unitWord()+(result.capped||giftCapped?'（到上限了）':''));return true;
  }
  function finishCount(){countState=null;save();showCountExit();fxBreak(true);sound('clear');}
  function hitCount(){if(!countState?.remaining)return;const previous=countState.pressed;const result=LockModes.pressCount(countState);lastRoundHits=previous+1;feedback.update(result.completed?1:LockModes.countProgress(countState),'count:'+roundId);feedback.hit();if(result.completed){finishCount();$('last-event').textContent='本轮次数已完成';}else{render();sound('hit');fxHit();save();}}
  function changeCount(kind,value,repetitions,source){if(!countState?.remaining){toast(source+'：现在没有挑战，这次没用上');return false;}const hits=countState.pressed,before=countState.remaining;const result=kind==='relief'?LockModes.relieveCount(countState,value):kind==='divide'?LockModes.relieveCount(countState,before-shrink(before,value,repetitions)):LockModes.multiplyCount(countState,value,repetitions);if(!result?.changed){if(kind!=='relief')toast(source+'：剩下的没变（'+(kind==='divide'?'除的是 1，或者只剩 1 '+unitWord()+'了':'乘的是 1，或者已经到上限了')+'）');return false;}lastRoundHits=hits;if(result.completed)finishCount();else{render();save();if(kind==='multiply'){fxAdd();sound('lock');if(isCage())scenes.add();}if(kind==='divide')fxBreak();}const w=LockGiftTables.words(settings.challengeMode,settings.sceneMode);toast(source+(kind==='relief'?'：'+w.relief+' '+result.applied.toLocaleString()+' '+unitWord():kind==='divide'?'：'+w.remain+' ÷'+value+(repetitions>1?'，连除 '+repetitions+' 次':'')+'（'+before.toLocaleString()+' → '+countState.remaining.toLocaleString()+' '+unitWord()+'）':'：'+w.remain+' ×'+value+(repetitions>1?'，连乘 '+repetitions+' 次':''))+(result.capped?'（到上限了）':''));return true;}
  function clearCount(source){if(!countState?.remaining&&frozenLeft()<=0){toast(source+'：现在没有挑战，这次没用上');return false;}lastRoundHits=countState?.pressed||0;countState=null;frozenUntil=0;disarmClear();save();showCountExit();fxBreak(true);sound('clear');toast(source+(isCage()?'：门开了':'：次数清零了'));return true;}
  function showCountExit(){const o=$('typing-lock-overlay'),sequence=++viewSequence;$('lock-remaining-hits').textContent='0';$('lock-total-hits').textContent=String(lastRoundHits);presentation.updateProgress(1);o.className='';refreshMotion();const duration=scenes.exit({totalHits:lastRoundHits});if(motionEnabled()){o.classList.add('lock-opening');setTimeout(()=>{if(sequence===viewSequence&&!challengeActive()){o.hidden=true;o.className='';$('idle-screen').hidden=false;feedback.reset();$('lock-total-hits').textContent='0';}},duration||950);}else{o.hidden=true;$('idle-screen').hidden=false;feedback.reset();$('lock-total-hits').textContent='0';}render();}

  /* ---------- 连点识别：只认一下一下的点按，长按（含 OBS 成对转发的自动重复）不计数 ---------- */
  // 自动重复的「松开+按下」几乎同时产生（<8 ms）；8–25 ms 的间隔只有在这次按键已按住 0.2 秒以上时才算重复，
  // 这样双指快速交替（松开到按下约 20 ms）的真人连点不会被误拦。
  const TAP_MIN_INTERVAL=45,PAIR_GAP_ALWAYS=8,PAIR_GAP_HELD=25,HOLD_DELAY=200,STALE_HOLD=1200;
  const taps=new Map();
  const tapOf=code=>{let tap=taps.get(code);if(!tap){tap={down:false,downAt:-1e9,upAt:-1e9,pressAt:-1e9};taps.set(code,tap);}return tap;};
  const eventTime=event=>Number.isFinite(event.timeStamp)&&event.timeStamp>0?event.timeStamp:performance.now();
  function acceptTap(code,event){
    const t=eventTime(event),tap=tapOf(code),gapUp=t-tap.upAt;
    const shimGuess=event.__obsRepeatGuess||Object.prototype.hasOwnProperty.call(event,'repeat'); // 兼容脚本（含白曜注入的版本）按时钟猜的 repeat
    const nativeRepeat=event.repeat&&!shimGuess;                                           // 交给下面按事件时间的判断
    const stillHeld=tap.down&&t-tap.downAt<STALE_HOLD;                                   // 没松开又来一次按下
    const tooFast=t-tap.downAt<TAP_MIN_INTERVAL;                                         // 两次按下间隔短于人手极限
    const paired=gapUp<PAIR_GAP_ALWAYS||gapUp<PAIR_GAP_HELD&&t-tap.pressAt>=HOLD_DELAY;  // 自动重复被拆成松开+按下
    const auto=nativeRepeat||stillHeld||tooFast||paired;
    if(!auto)tap.pressAt=t;
    tap.down=true;tap.downAt=t;
    return !auto;
  }
  function releaseTap(code,event){const tap=tapOf(code);tap.down=false;tap.upAt=eventTime(event);}


  /* ---------- 停手以后进度往回掉 ---------- */
  function renderDecay(){
    $('decay-rate').value=settings.decayRate;$('decay-delay').value=settings.decayDelay;
    let preset=false;
    for(const b of $('decay-presets').querySelectorAll('button[data-value]')){const on=Number(b.dataset.value)===settings.decayRate;preset||=on;b.setAttribute('aria-pressed',String(on));}
    const secs=settings.decayRate?Math.round(100/settings.decayRate*10)/10:0,full='按满的一条';
    $('decay-hint').textContent=!settings.decayRate?'停手以后进度不动，不会往回掉。':(preset?'':'高级设置里自己调过：')+'停手 '+settings.decayDelay+' 秒后开始往回掉，'+full+'大约 '+secs+' 秒掉光。';
  }
  function commitDecay(rate,delay){
    const r=Number(rate),d=Number(delay);
    if(!Number.isFinite(r)||r<0||r>500||!Number.isInteger(r)){toast('每秒掉多少要填 0～500 的整数（0 = 不掉）');renderDecay();return;}
    if(!Number.isFinite(d)||d<0||d>10){toast('停手几秒以后开始掉，要填 0～10');renderDecay();return;}
    if(state?.layers)TypingLockModel.tick(state,Date.now()); // 先按旧速度结算到现在，再换新速度
    settings.decayRate=r;settings.decayDelay=Math.round(d*100)/100;saveSettingsObject();applyDecay();renderDecay();if(state?.layers){render();save();}
  }

  /* ---------- 设置面板：一页从上往下。① 玩法 ②③④ 礼物表 ⑤ 按键 ⑥ 样子 ⑦ 声音，其余收在「高级设置」 ---------- */
  function openSettings(){if(settingsOpen)return;settingsOpen=true;document.body.classList.add('settings-visible');$('settings').hidden=false;$('settings-backdrop').hidden=false;$('settings-close').focus();}
  function closeSettings(){if(!settingsOpen)return;cancelKeyRecording();settingsOpen=false;disarmClear();document.body.classList.remove('settings-visible');$('settings').hidden=true;$('settings-backdrop').hidden=true;$('arena').focus({preventScroll:true});}
  function setChoiceNode(box,value){const button=[...box.querySelectorAll('button[data-value]')].find(item=>item.dataset.value===value);if(!button&&box.id!=='lock-key')return false;box.dataset.value=value;for(const item of box.querySelectorAll('button[data-value]'))item.setAttribute('aria-pressed',String(item===button));return true;}
  function setChoice(id,value){return setChoiceNode($(id),value);}
  function choice(id){return $(id).dataset.value;}
  function bindChoice(id,onChange){$(id).addEventListener('click',event=>{const button=event.target.closest('button[data-value]');if(!button||!$(id).contains(button))return;setChoice(id,button.dataset.value);onChange?.();});}
  // 空闲页和「自由试玩」的说法：跟着玩法（进度条 / 次数）和画面（按 / 拍）走
  function playCopy(){
    const cage=isCage(),press=pressWord();
    if(isCount())return {idle:cage?'笼门尚未关闭':'等待次数挑战',say:'观众送礼把要'+press+'的次数一直往上加，只有一个总数；'+press+'一下少一次，到 0 '+(cage?'门就开':'就出来')+'。',quick:'试一下：加 60 次',unit:'次',each:'',factor:'剩下的次数 ×',points:'帮你减掉',pointsUnit:'次'};
    return {idle:cage?'笼门尚未关闭':'锁链尚未降临',say:'观众送礼给你加进度条，'+press+'满一条破一条，全部'+press+'完'+(cage?'门才开':'才出来')+'；停手会往回掉。',quick:'试一下：加一条进度',unit:'条，',each:'每条'+press,factor:'剩下要'+press+'的 ×',points:'帮你'+press+'掉',pointsUnit:'下'};
  }
  function syncModeMenu(){
    const count=isCount(),copy=playCopy();
    for(const [id,value] of [['play',settings.challengeMode],['scene',settings.sceneMode]])for(const b of $(id).querySelectorAll('button')){const on=b.dataset.value===value;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;}
    $('decay-settings').hidden=count;$('decay-fine').hidden=count;
    $('simulate-unit').textContent=copy.unit;$('simulate-target-label').hidden=count;$('simulate-each').textContent=copy.each;
    $('simulate-factor-label').textContent=copy.factor;$('simulate-divide-label').textContent=copy.factor.replace('×','÷');$('simulate-points-label').textContent=copy.points;$('simulate-points-unit').textContent=copy.pointsUnit;
    $('quick-lock').textContent=copy.quick;$('key-note').textContent='要一下一下按，按住不放不算。'+keyChangeNote();
    $('idle-screen').querySelector('h1').textContent=copy.idle;$('idle-screen').querySelector('p').textContent=copy.say;disarmClear();
  }
  function fillSettings(){setChoice('theme',settings.theme);presentation.syncCards();setChoice('display-size',settings.displaySize);syncLockKey();setChoice('motion',settings.motion);setChoice('material-choice',settings.materialId);syncModeMenu();const demo=settings.demo||{};for(const [id,key,fallback] of [['simulate-layers',isCount()?'amount':'layers',isCount()?60:1],['simulate-target','target',60],['simulate-factor','factor',2],['simulate-divisor','divisor',2],['simulate-points','points',60],['simulate-seconds','seconds',10]])$(id).value=demo[key]||fallback;giftTables.render();renderSounds();renderDecay();applyMaterial();}
  // 换玩法：两种玩法算法不一样，正在玩的时候不能换；礼物表跟着换成这个玩法的那张
  function switchPlay(play){
    if(play===settings.challengeMode||!PLAYS.includes(play))return;
    if(challengeActive()||frozenLeft()>0){toast('正在玩，换不了玩法：先点下面的「清空现在的挑战」，或者等它结束');return;}
    const next=activeConfiguration();next.settings.challengeMode=play;
    if(!persistConfiguration(next)){toast('没能保存，还是原来的玩法');return;}
    settings=clone(configuration.settings);rules=clone(configuration.rules[play]);state=null;countState=null;waiting=[];roundId++;viewSequence++;feedback.reset();presentation.stop();$('typing-lock-overlay').hidden=true;$('idle-screen').hidden=false;applyDecay();refreshMotion();fillSettings();render();save();
  }
  // 换画面：只换样子，礼物表和正在玩的那局都不动
  function switchScene(scene){
    if(scene===settings.sceneMode||!['lock','cage'].includes(scene))return;
    settings.sceneMode=scene;if(!saveSettingsObject())return;
    presentation.stop();feedback.reset();$('lock-fx').replaceChildren();fillSettings();render();
  }
  function saveBasics(){const before=clone(settings),themeChanged=settings.theme!==choice('theme');settings.theme=choice('theme');settings.displaySize=choice('display-size');if(themeChanged){setChoice('material-choice','theme');presentation.stop();feedback.reset();$('lock-fx').replaceChildren();}settings.motion=choice('motion');settings.materialId=choice('material-choice');settings=cleanSettings(settings);if(!saveSettingsObject())settings=before;document.documentElement.dataset.theme=settings.theme;presentation.syncCards();refreshMotion();applyMaterial();render();}
  function syncLockKey(){setChoice('lock-key',settings.key);$('lock-key-current').textContent=TypingLockModel.keyLabel(settings.key);$('record-lock-key').textContent=keyRecording?'现在按一下想用的键…':'换一个键';$('record-lock-key').setAttribute('aria-pressed',String(keyRecording));$('cancel-lock-key').hidden=!keyRecording;}
  function cancelKeyRecording(message){const active=keyRecording;keyRecording=false;syncLockKey();if(active||message)$('lock-key-status').textContent=message||'没换，还用原来的键。';}
  function keyChangeNote(){return isCount()?'换了键以后，正在玩的这一轮还用原来的键，下一轮才用新键。':'换了键以后，已经加上的锁还用原来的键，新加的锁才用新键。';}
  function commitLockKey(code){
    if(!TypingLockModel.keyValid(code))return false;
    if(!persistConfiguration(activeConfiguration({...settings,key:code},rules))){cancelKeyRecording('没能保存，还用原来的键。');toast('没能保存，还用原来的键');return false;}
    settings.key=code;keyRecording=false;syncLockKey();$('lock-key-status').textContent='换成「'+TypingLockModel.keyLabel(code)+'」了。'+keyChangeNote();toast('破锁键换成「'+TypingLockModel.keyLabel(code)+'」了');return true;
  }
  function startKeyRecording(){keyRecording=true;syncLockKey();$('lock-key-status').textContent='现在按一下想用的键（只能一个键）。不想换了就点「不换了」。';}
  function recordLockKey(event){
    event.preventDefault();event.stopImmediatePropagation();
    if(keyComposing||event.isComposing||event.keyCode===229||event.key==='Process'){$('lock-key-status').textContent='先把输入法的选字关掉，再按一下想用的键。';return;}
    const code=breakKeyCode(event);
    if(event.ctrlKey||event.altKey||event.metaKey||!code){$('lock-key-status').textContent='只能用一个键，不能用 Ctrl、Alt 这种组合键。';return;}
    if(event.repeat||!acceptTap(code,event)){$('lock-key-status').textContent='先松开，再按一下。';return;}
    commitLockKey(code);
  }
  function createChoice(options,current,label){const box=document.createElement('div');box.className='seg sound-choice';box.setAttribute('role','group');box.setAttribute('aria-label',label);for(const [value,text] of options){const button=document.createElement('button');button.type='button';button.dataset.value=value;button.textContent=text;box.append(button);}setChoiceNode(box,current);return box;}
  // ▶：当作有人送了 1 个这条礼物，和真礼物走同一套效果
  function testRule(rule){applyGiftRoute((isCount()?LockModes.routeCountGift:LockGiftRules.routeGift)([rule],{giftName:rule.name,count:1}),'试玩：'+rule.name);}

  /* ---------- 设置备份：导出成文件带到别的电脑/软件，导入前先预览确认 ---------- */
  const BACKUP_APP='red-black-lock',BACKUP_FORMAT=1,MAX_BACKUP_BYTES=140*1024*1024;
  let pendingImport=null,importToken=0;
  function toBase64(bytes){const view=new Uint8Array(bytes);let out='';for(let i=0;i<view.length;i+=0x8000)out+=String.fromCharCode.apply(null,view.subarray(i,i+0x8000));return btoa(out);}
  function fromBase64(text){const raw=atob(text),view=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)view[i]=raw.charCodeAt(i);return view.buffer;}
  function exportSettings(){
    const sounds={};for(const [kind] of soundEvents){const custom=customSounds.get(kind);if(custom?.bytes)sounds[kind]={name:custom.name,type:custom.type||'',data:toBase64(custom.bytes)};}
    const payload={app:BACKUP_APP,format:BACKUP_FORMAT,exportedAt:new Date().toISOString(),settings,rules,modes:activeConfiguration(),sounds,customArt:customArt.exportAssets()};
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    const d=new Date(),stamp=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
    a.href=url;a.download='红黑破锁设置-'+stamp+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    const count=Object.keys(sounds).length;toast('导出好了：'+rules.length+' 个礼物、'+payload.customArt.items.length+' 张自己的图片'+(count?'、'+count+' 个自己的声音':'')+'。到别处点「导入设置」就行');
  }
  function hideImportPreview(){customArt.discardImport(pendingImport?.customArt);pendingImport=null;$('import-preview').hidden=true;$('import-summary').textContent='';}
  async function readBackup(file){
    const token=++importToken;hideImportPreview();
    if(!file)return;
    if(file.size>MAX_BACKUP_BYTES){toast('文件太大了，不是红黑破锁导出的设置');return;}
    let data;try{data=JSON.parse(await file.text());}catch{if(token===importToken)toast('读不出来：要选红黑破锁「导出设置」存下的 .json 文件');return;}
    if(token!==importToken)return;
    if(!data||data.app!==BACKUP_APP||data.format!==BACKUP_FORMAT){toast('这不是红黑破锁导出的设置，没导入');return;}
    const migrated=data.modes?(data.modes.version===25?normalizeConfiguration(data.modes):fromProfiles(data.modes)):fromProfiles(LockModes.migrateConfig(data.settings||defaults,cleanRules(data.rules,legacyTargets(data.settings),v23Shape(data.settings))));
    if(!migrated){toast('文件里的设置坏了，没导入');return;}const nextSettings=migrated.settings,nextRules=migrated.rules[nextSettings.challengeMode];
    if(!nextRules){toast('文件里的礼物表坏了，没导入');return;}
    
    
    if(data.settings?.targetPool!==undefined&&!LockGiftRules.cleanTargetPool(data.settings.targetPool)){toast('文件里的旧版概率设置坏了，没导入');return;}
    let nextArt;try{nextArt=await customArt.validateImport(data.customArt||{version:1,items:[]});}catch{if(token===importToken)toast('文件里自己的图片坏了，没导入');return;}
    if(token!==importToken){customArt.discardImport(nextArt);return;}
    const sounds={},failed=[];
    for(const [kind,label] of soundEvents){
      const item=data.sounds?.[kind];if(!item)continue;
      try{const bytes=fromBase64(String(item.data||''));if(bytes.byteLength>MAX_SOUND_BYTES)throw 0;const buffer=await decode(bytes);if(buffer.duration>MAX_SOUND_SECONDS)throw 0;sounds[kind]={name:String(item.name||'自定义音频').slice(0,60),type:String(item.type||''),bytes,buffer};}
      catch{failed.push(label);}
      if(token!==importToken){customArt.discardImport(nextArt);return;}
    }
    for(const [kind] of soundEvents)if(nextSettings.sound.events[kind].mode==='custom'&&!sounds[kind])nextSettings.sound.events[kind].mode='default';
    pendingImport={token,modes:migrated,settings:nextSettings,rules:nextRules,sounds,customArt:nextArt};
    const themeName=$('theme').querySelector(`button[data-value="${nextSettings.theme}"]`)?.textContent||nextSettings.theme;
    const names=nextRules.slice(0,5).map(rule=>rule.name+'：'+LockGiftTables.describe(rule,nextSettings.challengeMode,nextSettings.sceneMode)).join('；');
    $('import-summary').textContent='导入以后，设置和两张礼物表都会换成文件里的。文件里：玩法「'+(nextSettings.challengeMode==='count'?'次数':'进度条')+'」，画面「'+(nextSettings.sceneMode==='cage'?'牢笼':'锁链')+'」，样子「'+themeName+'」，按键「'+TypingLockModel.keyLabel(nextSettings.key)+'」，这个玩法的礼物 '+nextRules.length+' 个（'+(names||'没有')+(nextRules.length>5?' 等':'')+'），自己的声音 '+Object.keys(sounds).length+' 个、图片 '+(data.customArt?.items?.length||0)+' 张。正在玩的挑战不受影响。'+(failed.length?'声音「'+failed.join('、')+'」读不出来，会用默认的。':'');
    $('import-preview').hidden=false;
  }
  async function applyImport(){
    const pending=pendingImport;if(!pending||pending.token!==importToken){hideImportPreview();return;}
    if((challengeActive()||frozenLeft()>0)&&pending.modes.settings.challengeMode!==settings.challengeMode){toast('正在玩，先点「清空现在的挑战」，或者等它结束再导入');return;}const previousConfig=activeConfiguration(),previousArt=customArt.exportAssets();
    $('import-confirm').disabled=true;$('import-cancel').disabled=true;
    try{await customArt.importAssets(pending.customArt,()=>pending.token===importToken);}catch{toast('图片没能存下，没导入，还是原来的设置');$('import-confirm').disabled=false;$('import-cancel').disabled=false;return;}
    if(pending.token!==importToken){$('import-confirm').disabled=false;$('import-cancel').disabled=false;return;}
    // Gifts can arrive while IndexedDB is saving artwork. Re-check after the await.
    if((challengeActive()||frozenLeft()>0)&&pending.modes.settings.challengeMode!==settings.challengeMode){
      try{const previous=await customArt.validateImport(previousArt);await customArt.importAssets(previous);}catch{storageWarning();}
      hideImportPreview();$('import-confirm').disabled=false;$('import-cancel').disabled=false;
      toast('正在玩，先点「清空现在的挑战」，或者等它结束再导入（这次没导入）');return;
    }
    if(!persistConfiguration(pending.modes)){try{const old=await customArt.validateImport(previousArt);await customArt.importAssets(old);}catch{}toast('没能保存，还是原来的设置');$('import-confirm').disabled=false;$('import-cancel').disabled=false;return;}
    pendingImport=null;settings=clone(pending.settings);rules=clone(pending.rules);feedback.reset();
    let unsaved=0;
    for(const [kind] of soundEvents){
      uploadToken[kind]=(uploadToken[kind]||0)+1;stopSound(kind);
      const next=pending.sounds[kind];
      if(next){customSounds.set(kind,{name:next.name,buffer:next.buffer,bytes:next.bytes,type:next.type});try{await soundDb.put(kind,{name:next.name,type:next.type,data:next.bytes});}catch{unsaved++;}}
      else{customSounds.delete(kind);try{await soundDb.del(kind);}catch{}}
    }
    applyDecay();saveSettingsObject();saveRules();document.documentElement.dataset.theme=settings.theme;refreshMotion();fillSettings();hideImportPreview();
    $('import-confirm').disabled=false;$('import-cancel').disabled=false;toast('导入好了'+(unsaved?'；有 '+unsaved+' 个声音浏览器没能存下，刷新后会变回默认':''));
  }

  /* ---------- 礼物连接 ---------- */
  function applyGiftRoute(routed,source){if(!routed)return false;if(isCount()&&routed.kind==='lock')return addCount(routed.value,source,routed.capped);if(routed.kind==='lock')return addLock(routed.value,routed.target,source,routed.targetPool,routed.multiplier||1);if(routed.kind==='multiply')return multiplyLocks(routed.multiplier,routed.value,source);if(routed.kind==='divide')return divideLocks(routed.multiplier,routed.value,source);if(routed.kind==='clear')return clearByGift(source);if(routed.kind==='freeze')return freezeKeys(routed.value,source);return relieve(routed.value,source);}
  function gift(name,count=1){return applyGiftRoute((isCount()?LockModes.routeCountGift:LockGiftRules.routeGift)(rules,{giftName:name,count}),String(name).slice(0,80));}
  function extractGift(message){if(!message||typeof message!=='object')return null;const type=String(message.type??message.msgType??message.method??'gift').toLowerCase();if(!type.includes('gift')&&type!=='2')return null;const data=message.data||{},g=message.gift||data.gift||data;const name=message.giftName||g.giftName||g.name||data.giftName||data.name;if(!name)return null;const count=message.giftCount??message.count??message.comboCount??message.repeatCount??g.giftCount??g.count??g.comboCount??g.repeatCount??1;const id=message.eventId??message.event_id??message.msgId??data.eventId;return {name:String(name),count:Number(count),id};}
  function connectionStatus(value){
    $('connection').textContent=value;$('settings-connection').textContent=value;
    const on=value!=='未连接',line=$('settings-live');line.dataset.state=on?'on':'off';
    line.textContent=on?'已连上直播间（'+(value==='菘蓝 SDK'?'白曜 / 菘蓝':value)+'），观众送礼马上生效。':'还没连上直播间：在白曜或菘蓝里导入这个插件就会自动连上。没连上也能点每行的 ▶ 试。';
  }
  const giftChannel=LockGiftChannel.create({getSdk:()=>window.SonglanPlugin,onStatus:connectionStatus,onGift:data=>{const g=extractGift(data);if(g&&!dedupe(g.id))gift(g.name,g.count);}});
  function breakKeyCode(event){return TypingLockModel.keyFromEvent(event);}
  function init(){
    restore();document.documentElement.dataset.theme=settings.theme;fillSettings();position();refreshMotion();
    $('typing-lock-overlay').hidden=!challengeActive();$('idle-screen').hidden=challengeActive();
    if(challengeActive())$('typing-lock-overlay').classList.add('lock-held');render();
    $('settings-open').onclick=openSettings;$('settings-close').onclick=closeSettings;$('settings-backdrop').onclick=closeSettings;
    document.addEventListener('dblclick',event=>{if(!event.target.closest('#settings'))openSettings();});
    document.addEventListener('keydown',event=>{
      if(settingsOpen){
        if(keyRecording){recordLockKey(event);return;}
        const menuCode=breakKeyCode(event),menuComposing=keyComposing||event.isComposing||event.keyCode===229;
        // 菜单内只更新按住/松开识别，不破锁；关闭后迟到的自动重复仍算按住。
        const menuTap=!menuComposing&&TypingLockModel.keyValid(menuCode)&&acceptTap(menuCode,event);
        if(!menuTap&&!menuComposing&&['Enter',' '].includes(event.key)&&event.target.closest?.('button,[role=combobox]'))event.preventDefault();
        if(menuCode==='Escape'&&menuTap&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();closeSettings();}
        return;
      }
      const code=breakKeyCode(event),composing=event.isComposing||event.keyCode===229;
      // 无锁时也记录按住状态，锁链降临时仍按着的键不会被当成一次点击。
      const accepted=!composing&&TypingLockModel.keyValid(code)&&acceptTap(code,event);
      if(!challengeActive())return;
      if(event.ctrlKey||event.metaKey||event.altKey)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(accepted&&code===activeKey()){if(frozenLeft()>0)denyTap();else hit();}
    },true);
    document.addEventListener('keyup',event=>{const code=breakKeyCode(event);if(TypingLockModel.keyValid(code))releaseTap(code,event);},true);
    document.addEventListener('compositionstart',()=>{keyComposing=true;});document.addEventListener('compositionend',()=>{keyComposing=false;});
    window.addEventListener('blur',()=>{for(const tap of taps.values())tap.down=false;keyComposing=false;cancelKeyRecording();save();});window.addEventListener('pagehide',save);window.addEventListener('resize',position);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',refreshMotion);
    presentation.bindCards();
    for(const [id,pick] of [['play',switchPlay],['scene',switchScene]]){
      $(id).addEventListener('click',e=>{const b=e.target.closest('button[data-value]');if(b)pick(b.dataset.value);});
      $(id).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...$(id).querySelectorAll('button')],i=Math.max(0,buttons.indexOf(e.target)),n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:buttons.length-1))%buttons.length;buttons[n].focus();buttons[n].click();});
    }
    bindChoice('theme',()=>{setChoice('material-choice','theme');saveBasics();});
    for(const id of ['motion','material-choice','display-size'])bindChoice(id,saveBasics);
    $('lock-key').addEventListener('click',event=>{const b=event.target.closest('button[data-value]');if(b&&$('lock-key').contains(b))commitLockKey(b.dataset.value);});
    $('record-lock-key').onclick=startKeyRecording;$('cancel-lock-key').onclick=()=>cancelKeyRecording();
    $('settings').addEventListener('focusin',event=>{if(keyRecording&&!event.target.closest('#record-lock-key,#cancel-lock-key'))cancelKeyRecording();});
    $('sound-master').addEventListener('input',()=>{$('sound-master-value').textContent=$('sound-master').value+'%';});
    $('sound-master').addEventListener('change',()=>{settings.sound.master=Math.max(0,Math.min(100,Math.round(Number($('sound-master').value))));saveSettingsObject();sound('hit',true);});
    $('quick-lock').onclick=()=>addLock(isCount()?60:1,DEFAULT_TARGET,'试玩');
    $('simulate-lock').onclick=()=>{const raw=String($('simulate-layers').value).trim(),n=/^\d+$/.test(raw)?Number(raw):NaN;if(!Number.isSafeInteger(n)||n<1||n>100000){toast('加多少要填 1～100000 的整数');return;}const t=TypingLockModel.target($('simulate-target').value);if(t===null){toast('每条'+pressWord()+'几下要填 '+TypingLockModel.TARGET_MIN+'～'+TypingLockModel.TARGET_MAX+' 的整数');return;}addLock(n,t,'试玩');};
    $('simulate-multiply').onclick=()=>{const factor=Number($('simulate-factor').value);if(!Number.isSafeInteger(factor)||factor<1||factor>1000){toast('乘几倍要填 1～1000 的整数');return;}multiplyLocks(factor,1,'试玩');};
    $('simulate-divide').onclick=()=>{const factor=Number($('simulate-divisor').value);if(!Number.isSafeInteger(factor)||factor<1||factor>1000){toast('除以几要填 1～1000 的整数');return;}divideLocks(factor,1,'试玩');};
    $('simulate-relief').onclick=()=>{const n=Number($('simulate-points').value);if(!Number.isSafeInteger(n)||n<1||n>10000000){toast('帮多少下要填 1～10000000 的整数');return;}relieve(n,'试玩');};
    for(const [id,key] of [['simulate-layers','amount'],['simulate-target','target'],['simulate-factor','factor'],['simulate-divisor','divisor'],['simulate-points','points'],['simulate-seconds','seconds']])$(id).addEventListener('change',()=>{const n=Number($(id).value);if(Number.isSafeInteger(n)&&n>=1&&n<=10000000){settings.demo={...settings.demo,[id==='simulate-layers'&&!isCount()?'layers':key]:n};saveSettingsObject();}});
    $('clear-locks').onclick=armClear;
    $('decay-presets').addEventListener('click',event=>{const b=event.target.closest('button[data-value]');if(b)commitDecay(b.dataset.value,settings.decayDelay);});
    $('decay-rate').addEventListener('change',()=>commitDecay($('decay-rate').value,settings.decayDelay));
    $('decay-delay').addEventListener('change',()=>commitDecay(settings.decayRate,$('decay-delay').value));
    $('simulate-freeze').onclick=()=>{const raw=String($('simulate-seconds').value).trim(),n=/^\d+$/.test(raw)?Number(raw):NaN;if(!Number.isSafeInteger(n)||n<1||n>FREEZE_MAX_SECONDS){toast('失灵几秒要填 1～'+FREEZE_MAX_SECONDS+' 的整数');return;}freezeKeys(n,'试玩');};
    $('unfreeze').onclick=()=>{if(frozenLeft()<=0){toast('按键没有失灵');return;}frozenUntil=0;save();render();toast('按键恢复了');};
    $('export-settings').onclick=exportSettings;
    $('import-settings').onclick=()=>$('import-file').click();
    $('import-file').addEventListener('change',()=>{const f=$('import-file').files?.[0];$('import-file').value='';readBackup(f);});
    $('import-confirm').onclick=applyImport;$('import-cancel').onclick=()=>{importToken++;hideImportPreview();};
    setInterval(()=>{if(challengeActive())render();},60);giftChannel.start();window.addEventListener('pagehide',()=>{giftChannel.stop();presentation.stop();feedback.stop();});window.addEventListener('pageshow',()=>giftChannel.start());document.fonts?.ready.then(()=>{presentation.invalidate();scenes.position();});document.fonts?.addEventListener('loadingdone',()=>{presentation.invalidate();scenes.position();});
    loadCustomSounds();customArt.load().then(()=>{scenes.applyStyle();scenes.position();});
  }
  init();
})();
