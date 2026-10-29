(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const themes=new Set(['fufu','horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream']);
  const soundEvents=[['lock','上锁'],['hit','每次连点'],['layer','破掉一层'],['clear','全部破除']];
  const soundModes=[['default','默认'],['custom','自定义'],['off','关闭']];
  const MAX_SOUND_BYTES=3*1024*1024,MAX_SOUND_SECONDS=10,DEFAULT_TARGET=60,FREEZE_MAX_SECONDS=3600;
  const defaultSound=()=>({master:80,events:Object.fromEntries(soundEvents.map(([key])=>[key,{mode:'default',volume:100}]))});
  const defaults={mode:'lock',theme:'horror',key:'Space',motion:'on',decayRate:35,decayDelay:0.25,sceneMode:'lock',challengeMode:'bar',materialId:'theme',displaySize:'large'};
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
  const isCount=()=>settings.mode==='count';
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
  function storageWarning(){temporary=true;$('storage-status').textContent='浏览器存储不可用，本页临时运行';$('settings-storage-status').textContent='浏览器存储不可用：本页可临时运行，关闭或刷新后无法恢复。';$('settings-storage-status').style.color='#ffadba';}
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
  const customArt=LockCustomArt.create({getTheme:()=>settings.theme,getMode:()=>settings.mode,overlay:$('typing-lock-overlay'),holder:$('custom-art'),notify:toast,onStorageError:storageWarning});
  const presentation=LockPresentation.create({getSettings:()=>settings,overlay:$('typing-lock-overlay')});
  const feedback=LockHitFeedback.create({getSettings:()=>settings,overlay:$('typing-lock-overlay'),spawn:(...args)=>fxSpawn(...args)});
  const scenes=LockScenes.create({getSettings:()=>settings,overlay:$('typing-lock-overlay'),notify:toast});
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
    if(settings.mode==='cage'&&kind==='hit'){feedback.synthDoor(ctx,gainScale);return;}
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
    const originMode=settings.mode;
    // 先校验再占用上传序号：被拒绝的文件不会顶掉正在处理的有效上传。
    if(file.size>MAX_SOUND_BYTES){toast('音频不能超过 3 MB');return;}
    if(file.type&&!file.type.startsWith('audio/')){toast('请选择音频文件（MP3、WAV、OGG 等）');return;}
    const token=(uploadToken[kind]||0)+1;uploadToken[kind]=token;
    let bytes,buffer;
    try{bytes=await file.arrayBuffer();buffer=await decode(bytes);}catch{if(uploadToken[kind]===token)toast('无法解码这个音频文件，已保留原音效');return;}
    if(uploadToken[kind]!==token)return;
    if(buffer.duration>MAX_SOUND_SECONDS){toast('音效请控制在 '+MAX_SOUND_SECONDS+' 秒以内，已保留原音效');return;}
    const name=String(file.name||'自定义音频').slice(0,60);
    let saved=true;try{await soundDb.put(kind,{name,type:file.type,data:bytes});}catch{saved=false;}
    if(uploadToken[kind]!==token)return;
    if(!saved){storageWarning();toast('音效未能保存，已保留原音效');return;}
    customSounds.set(kind,{name,buffer,bytes,type:file.type||''});
    const next=activeConfiguration();next.profiles[originMode].settings.sound.events[kind].mode='custom';
    const configured=persistConfiguration(next);if(configured&&settings.mode===originMode)settings.sound.events[kind].mode='custom';renderSounds();
    toast(configured?'已为'+{lock:'多条进度',cage:'牢笼拍门',count:'累计次数'}[originMode]+'模式换成「'+name+'」':'音频已保存到素材库，但启用选项未能保存');if(settings.mode===originMode)sound(kind,true);
  }
  async function removeSound(kind){
    const originMode=settings.mode;
    uploadToken[kind]=(uploadToken[kind]||0)+1;
    let removed=true;try{await soundDb.del(kind);}catch{removed=false;}
    stopSound(kind);customSounds.delete(kind);const next=activeConfiguration();if(next.profiles[originMode].settings.sound.events[kind].mode==='custom')next.profiles[originMode].settings.sound.events[kind].mode='default';
    if(persistConfiguration(next)&&settings.mode===originMode)settings.sound.events[kind].mode=next.profiles[originMode].settings.sound.events[kind].mode;renderSounds();
    toast(removed?'已移除自定义音频，恢复默认音效':'本页已恢复默认音效，但浏览器没能删除存档里的音频，刷新后可能还会列出');
  }
  function renderSounds(){
    const holder=$('sounds');if(!holder)return;holder.replaceChildren();
    $('sound-master').value=settings.sound.master;$('sound-master-value').textContent=settings.sound.master+'%';
    for(const [kind,label] of soundEvents){
      if(isCount()&&kind==='layer')continue;
      const conf=settings.sound.events[kind],custom=customSounds.get(kind);
      const row=document.createElement('div');row.className='sound-row';row.dataset.sound=kind;
      const head=document.createElement('div');head.className='sound-head';
      const title=document.createElement('strong');title.textContent=kind==='hit'&&settings.mode==='cage'?'每次拍门':kind==='lock'&&isCount()?'增加次数':label;
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
      const upload=document.createElement('button');upload.type='button';upload.className='secondary small';upload.textContent=custom?'更换音频':'上传音频';upload.onclick=()=>file.click();
      const test=document.createElement('button');test.type='button';test.className='secondary small';test.textContent='试听';test.onclick=()=>sound(kind,true);
      tools.append(vol,volText,upload,test);
      if(custom){const remove=document.createElement('button');remove.type='button';remove.className='secondary small';remove.textContent='移除';remove.onclick=()=>removeSound(kind);tools.append(remove);}
      tools.append(file);
      const note=document.createElement('div');note.className='sound-note';
      note.textContent=custom?'自定义：'+custom.name:conf.mode==='custom'?'自定义音频未能读取，暂用默认音效':'未上传自定义音频';
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
      if(['lock','cage','count'].includes(value.mode))result.mode=value.mode;else result.mode=value.challengeMode==='count'?'count':value.sceneMode==='cage'?'cage':'lock';
      if(value.demo&&typeof value.demo==='object')result.demo=Object.fromEntries(Object.entries(value.demo).filter(([key,n])=>['amount','layers','target','factor','points','seconds'].includes(key)&&Number.isSafeInteger(n)&&n>=1&&n<=10000000));
      if(themes.has(value.theme))result.theme=value.theme;if(TypingLockModel.keyValid(value.key))result.key=value.key;if(['on','auto','off'].includes(value.motion))result.motion=value.motion;
      if(['lock','cage'].includes(value.sceneMode))result.sceneMode=value.sceneMode;if(['bar','count'].includes(value.challengeMode))result.challengeMode=value.challengeMode;if(['theme','forged-steel','antique-brass','arcane-anime','candy-toon'].includes(value.materialId))result.materialId=value.materialId;
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
    result.sceneMode=result.mode==='cage'?'cage':'lock';result.challengeMode=result.mode==='count'?'count':'bar';
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
    return sourceSettings?.mode==='count'?LockModes.normalizeCountRules(prepared):LockGiftRules.normalizeInlineRules(prepared,sourceSettings);
  }
  function normalizeConfiguration(raw){
    if(!raw||raw.version!==23||!['lock','cage','count'].includes(raw.mode))return null;
    const profiles={};for(const mode of ['lock','cage','count']){const p=raw.profiles?.[mode];if(!p)return null;const st=cleanSettings({...p.settings,mode}),rr=cleanRules(p.rules,legacyTargets(p.settings),st);if(!rr)return null;profiles[mode]={settings:st,rules:rr};}return {version:23,mode:raw.mode,profiles};
  }
  function activeConfiguration(st=settings,rr=rules){const next=clone(configuration);next.mode=st.mode;next.profiles[st.mode]={settings:clone(st),rules:clone(rr)};return next;}
  function persistConfiguration(next){
    // One authoritative profile envelope, with compatibility mirrors. Roll back a refused write.
    const profile=next.profiles[next.mode],changedRules=configuration?.mode!==next.mode||JSON.stringify(configuration?.profiles[next.mode]?.rules)!==JSON.stringify(profile.rules),writes=[['settings',JSON.stringify(profile.settings)],...(changedRules?[['rules',JSON.stringify(profile.rules)]]:[]),['config-v23',JSON.stringify(next)]],before=writes.map(([key])=>store.get(key));
    for(let i=0;i<writes.length;i++){if(!store.set(...writes[i])){for(let j=i-1;j>=0;j--){if(before[j]===null)store.del(writes[j][0]);else store.set(writes[j][0],before[j]);}return false;}}
    configuration=clone(next);return true;
  }
  function persistRules(next){return persistConfiguration(activeConfiguration(settings,next));}
  function restore(){
    const readRecord=key=>{try{return JSON.parse(store.get(key)||'null');}catch{toast('部分旧存档无法读取，正在保留可用记录');return null;}};
    let raw=readRecord('settings'),saved=readRecord('state'),storedConfig=readRecord('config-v23');
    settings=cleanSettings(raw);let legacyRules=LockGiftRules.normalizeInlineRules(defaultRules,{});
    try{const value=JSON.parse(store.get('rules')||'null');if(value!==null){const migrated=cleanRules(value,legacyTargets(raw),raw||{});if(migrated)legacyRules=migrated;else toast('礼物规则存档无效，保留旧存档并暂用默认规则');}}catch{toast('礼物规则存档读取失败，保留旧存档');}
    configuration=normalizeConfiguration(storedConfig);if(storedConfig&&!configuration)toast('三模式存档损坏，已从当前模式镜像恢复；其他模式缺失的规则请从备份导入');
    configuration=configuration||normalizeConfiguration(LockModes.migrateConfig(raw||defaults,legacyRules));
    if(!configuration)configuration=normalizeConfiguration(LockModes.migrateConfig(defaults,defaultRules));
    if(saved?.version===23&&['lock','cage','count'].includes(saved.mode)&&(saved.lock?.layers||saved.count?.remaining))configuration.mode=saved.mode;
    settings=clone(configuration.profiles[configuration.mode].settings);rules=clone(configuration.profiles[configuration.mode].rules);applyDecay();
    try{if(saved&&[1,23].includes(saved.version)){
      cleared=Number.isSafeInteger(saved.cleared)&&saved.cleared>=0?saved.cleared:0;frozenUntil=Number.isFinite(saved.frozenUntil)?Math.min(saved.frozenUntil,Date.now()+FREEZE_MAX_SECONDS*1000):0;
      if(isCount()&&saved.version===23)countState=LockModes.restoreCount(saved.count);
      else {state=TypingLockModel.restore(saved.lock,Date.now());state=state?.layers?state:null;waiting=cleanWaiting(saved.waiting);
        if(isCount()){const total=LockModes.legacyRemaining(state,waiting);if(total){if(total.remaining){countState=LockModes.createCount(total.remaining,{key:state?.key||settings.key,source:state?.source||'旧挑战'});if(countState)countState.pressed=state?.totalHits||0;if(total.seededMissing)toast('旧排队盲盒尚未抽取，已按固定迁移序列结算并保存');}state=null;waiting=[];if(total.seededMissing){persistConfiguration(configuration);save();}}else{configuration.mode=raw?.sceneMode==='cage'?'cage':'lock';settings=clone(configuration.profiles[configuration.mode].settings);settings.decayRate=0;rules=clone(configuration.profiles[configuration.mode].rules);if(state){state.challengeMode='bar';for(const q of state.queue)q.challengeMode='bar';}for(const q of waiting)q.challengeMode='bar';applyDecay();toast('旧挑战无法安全折算，已按不回落分层挑战保留；请完成或清空后切换次数模式');}}
        else if(waiting.length)pourWaiting(Date.now());
      }
    }}catch{toast('挑战存档读取失败，原始存档仍保留');}
  }
  function save(){store.set('state',JSON.stringify({version:23,mode:settings.mode,lock:state?.layers?state:null,count:countState?.remaining?countState:null,waiting,frozenUntil:frozenLeft()>0?frozenUntil:0,cleared}));}
  function saveSettingsObject(){const previous=configuration.profiles[settings.mode].settings;if(persistConfiguration(activeConfiguration()))return true;settings=clone(previous);toast('设置未能保存，已保留原配置');return false;}
  function saveRules(){return persistRules(rules);}
  function motionEnabled(){return settings.motion==='on'||settings.motion==='auto'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function refreshMotion(){const overlay=$('typing-lock-overlay');overlay.dataset.motion=motionEnabled()?'on':'off';}
  function position(){presentation.fit();const w=innerWidth;$('typing-lock-overlay').style.setProperty('--lock-panel-width',Math.max(270,Math.min(440,w*.43))+'px');scenes.position();}

  /* ---------- 画面 ---------- */
  function render(){
    const locked=challengeActive(),overlay=$('typing-lock-overlay');overlay.dataset.mode=settings.mode;
    if(isCount()){renderCount();return;}
    overlay.dataset.challenge=state?.challengeMode||settings.challengeMode;
    $('lock-action').textContent=settings.mode==='cage'?'拍开门':settings.theme==='fufu'?'啃开锁':'破锁';
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
    $('typing-lock-support').textContent=(state.source?'当前来自 '+String(state.source):'')+(state.relief?' · 永久援助 '+Math.floor(state.relief)+' 次':'');
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
  function fxHit(){if(motionEnabled()&&settings.theme!=='fufu'&&settings.mode!=='cage')fxSparks(7,90,420);}
  function fxBreak(big=false){
    if(!motionEnabled())return;
    if(settings.theme==='fufu'){if(settings.mode!=='cage')presentation.layerBreak();presentation.effects(big?'clear':'layer',fxSpawn);return;}
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
  function freezeKeys(seconds,source='模拟'){
    if(!Number.isSafeInteger(seconds)||seconds<1){toast('禁用秒数需为正整数');return false;}
    const now=Date.now(),base=Math.max(now,frozenUntil),until=Math.min(base+seconds*1000,now+FREEZE_MAX_SECONDS*1000),added=Math.round((until-base)/1000);
    frozenUntil=until;save();
    const label=String(source||'礼物').slice(0,80),total=Math.ceil(frozenLeft()/1000);
    $('last-event').textContent=label+' · 禁用破锁键 '+added+' 秒（共剩 '+total+' 秒）';
    toast(label+' 禁用了破锁键 '+added+' 秒，还剩 '+total+' 秒'+(added<seconds?'（已到 1 小时上限）':''));
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
  function addLock(layers,target,source='模拟',targetPool,multiplier=1){
    if(isCount())return addCount(layers,source);
    if(!Number.isSafeInteger(layers)||layers<1||layers>WAITING_MAX_LAYERS){toast('锁层需为 1–'+WAITING_MAX_LAYERS.toLocaleString());return false;}
    if(TypingLockModel.target(target)===null){toast('每层连点次数需为 '+TypingLockModel.TARGET_MIN+'–'+TypingLockModel.TARGET_MAX);return false;}
    const pool=targetPool?LockGiftRules.cleanTargetPool(targetPool):null;
    if(targetPool&&!pool){toast('次数盲盒档位无效，本次未加锁');return false;}
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
    if(!direct&&!rest){toast('排队锁链已达上限，本次礼物未加入');return false;}
    if(wasLocked){render();fxAdd();scenes.add();}else showEntrance();
    const difficulty=(pool?'每层独立抽取次数档位':'每层连点 '+Math.min(1000000000,target*multiplier)+' 次')+(multiplier!==1?' · ×'+multiplier:'');
    save();$('last-event').textContent=label+' · 加锁 +'+(direct+rest)+' 层（'+difficulty+'）';
    toast(label+' 加锁 '+(direct+rest).toLocaleString()+' 层，'+difficulty+(rest?'（'+rest.toLocaleString()+' 层排在后面，破到 2 万层以下自动补上）':'')+(dropped?'；超出上限的 '+dropped.toLocaleString()+' 层未加入':''));
    sound('lock');return true;
  }
  function relieve(points,source='模拟'){
    if(isCount())return changeCount('relief',points,1,source);
    if(!Number.isSafeInteger(points)||points<1||points>10000000){toast('减链点数需为 1–10000000');return false;}
    if(!state?.layers){toast('当前没有锁链，本次减链未生效');return false;}
    const before=totalLayers(),now=Date.now();let unused=points,applied=0,clearedLayers=0;
    // 抵扣完当前层数后，排队的锁补进来，剩余点数继续抵扣。
    while(unused>0&&state?.layers){
      const result=TypingLockModel.relieve(state,unused,now);if(!result||!result.applied)break;
      applied+=result.applied;unused=result.unused;clearedLayers+=result.clearedLayers;
      if(!pourWaiting(now))break;
    }
    if(!applied)return false;
    cleared+=before-totalLayers();$('last-event').textContent=source+' · 减链 '+applied+' 点';toast('减链 '+applied+' 点，破除 '+clearedLayers+' 层'+(unused?'，多余点数不留存':''));
    if(!state.layers){lastRoundHits=state.totalHits||0;state=null;showExit();fxBreak(true);sound('clear');}else{if(clearedLayers){sound('layer');fxBreak();}render();}
    save();return true;
  }
  function multiplyLocks(factor,repetitions=1,source='模拟加固'){
    if(isCount())return changeCount('multiply',factor,repetitions,source);
    if(!state?.layers){toast('当前没有锁链或牢笼，本次加固未生效');return false;}
    const changed=TypingLockModel.multiplyRemaining(state,factor,Date.now(),repetitions);let waitingChanged=false;
    if(factor>1){for(const item of waiting){let next=item.multiplier||1,turns=repetitions;while(turns-->0&&next<1000000000)next=Math.min(1000000000,next*factor);if(next!==(item.multiplier||1)){item.multiplier=next;waitingChanged=true;}}}
    if(!changed&&!waitingChanged){toast('剩余次数未改变（倍率为 1 或已达上限）');return false;}
    save();render();scenes.add();fxAdd();sound('lock');$('last-event').textContent=source+' · 剩余次数 ×'+factor+(repetitions>1?'，重复 '+repetitions+' 次':'');toast('已加固：剩余次数 ×'+factor+'，保留已按次数与永久援助；每层最多 10 亿次');return true;
  }
  function hit(){if(isCount()){hitCount();return;}if(!state?.layers)return;const before=state.layers,now=Date.now();TypingLockModel.press(state,now);const broke=before-state.layers;feedback.update(broke?1:Math.min(1,(state.progress+state.relief)/state.target),roundId+':'+cleared);feedback.hit();if(settings.mode==='cage')sound('hit');lastRoundHits=state.totalHits||0;$('lock-total-hits').textContent=(state.totalHits||0).toLocaleString();cleared+=broke;if(broke){pourWaiting(now);scenes.layerBreak();}if(!state.layers){state=null;showExit();fxBreak(true);sound('clear');$('last-event').textContent='全部锁链已破除';}else{if(broke||settings.mode!=='cage')sound(broke?'layer':'hit');render();if(broke)fxBreak();else fxHit();}save();}
  // 观众送「清空」礼物：立刻清掉当前和排队的全部锁链，按全部破除的特效和音效退场（不计入已破除层数）。
  function clearByGift(label){
    if(isCount())return clearCount(label);
    if(!state?.layers&&!waiting.length&&frozenLeft()>0){frozenUntil=0;save();render();toast(label+'：已解除禁用');return true;}
    if(!state?.layers&&!waiting.length){toast(label+'：当前没有锁链，本次清空未生效');return false;}
    const count=totalLayers();lastRoundHits=state?.totalHits||0;disarmClear();state=null;waiting=[];frozenUntil=0;save();showExit();fxBreak(true);sound('clear');
    $('last-event').textContent=label+' · 清空全部锁链（'+count.toLocaleString()+' 层）';toast(label+' 清空了全部锁链（'+count.toLocaleString()+' 层）');return true;
  }
  function clearAll(){
    disarmClear();
    if(isCount()){clearCount('手动清空');return;}
    if(!state?.layers&&!waiting.length&&frozenLeft()>0){frozenUntil=0;save();render();toast('已清空禁用挑战');return;}
    if(!state?.layers&&!waiting.length){toast('当前没有锁链');return;}
    const count=totalLayers();lastRoundHits=state?.totalHits||0;state=null;waiting=[];frozenUntil=0;save();showExit();$('last-event').textContent='手动清空 '+count.toLocaleString()+' 层锁链';toast('已清空全部锁链（'+count.toLocaleString()+' 层）');
  }
  // 清空要两次单独点击：第二次须在 0.4–3 秒之间，双击不会直接清空；按钮上实时显示将要清掉的层数。
  let clearArmedAt=0;
  function clearLabel(){const b=$('clear-locks');if(b?.dataset.armed==='true')b.textContent='再点一次确认清空（'+(isCount()?(countState?.remaining||0).toLocaleString()+' 次':totalLayers().toLocaleString()+' 层')+'）';}
  function disarmClear(){clearTimeout(clearArmTimer);const b=$('clear-locks');if(b){b.dataset.armed='false';b.textContent=isCount()?'清空全部次数':'清空全部锁链';}}
  function armClear(event){
    const b=$('clear-locks');
    if(b.dataset.armed==='true'){if(event?.detail>1||Date.now()-clearArmedAt<400)return;clearAll();return;}
    if(event?.detail>1)return;
    if(!challengeActive()&&frozenLeft()<=0){toast('当前没有挑战');return;}
    b.dataset.armed='true';clearArmedAt=Date.now();clearLabel();clearTimeout(clearArmTimer);clearArmTimer=setTimeout(disarmClear,3000);
  }

  function renderCount(){
    const o=$('typing-lock-overlay'),live=!!countState?.remaining;o.dataset.mode='count';o.dataset.challenge='count';
    $('lock-counter').hidden=false;$('typing-lock-layers').hidden=true;$('typing-lock-meter').hidden=true;$('typing-lock-layers').textContent='';$('typing-lock-queue').replaceChildren();
    $('lock-action').textContent=settings.mode==='cage'?'拍开门':settings.theme==='fufu'?'啃开锁':'破锁';$('count-done-label').textContent=settings.theme==='fufu'?'已啃':'已按';
    if(live){$('lock-remaining-hits').textContent=countState.remaining.toLocaleString();$('lock-total-hits').textContent=countState.pressed.toLocaleString();$('typing-lock-key').textContent=TypingLockModel.keyLabel(countState.key);$('typing-lock-grade').textContent=countState.source||'次数挑战';$('typing-lock-support').textContent='';renderFreeze(o);const ratio=LockModes.countProgress(countState);presentation.updateProgress(ratio);feedback.update(ratio,'count:'+roundId);}
    $('total-cleared').textContent='次数挑战';$('arena-state').textContent=live?'还需 '+countState.remaining.toLocaleString()+' 次':'等待观众加次数';
    presentation.fit();scenes.render(null,{motion:motionEnabled(),totalLayers:0,totalHits:countState?.pressed||0,remaining:countState?.remaining||0});
    if($('clear-locks').dataset.armed==='true')clearLabel();
  }
  function addCount(amount,source='礼物',giftCapped=false){
    if(!Number.isSafeInteger(amount)||amount<1){toast('增加次数需为正整数');return false;}
    const wasLocked=!!countState?.remaining;let result;
    if(wasLocked)result=LockModes.addCount(countState,amount,{key:settings.key,source});else{countState=LockModes.createCount(amount,{key:settings.key,source});result={changed:!!countState,capped:amount>LockModes.MAX_COUNT};}
    if(!countState)return false;if(wasLocked){render();fxAdd();}else showEntrance();save();sound('lock');$('last-event').textContent=source+' · 增加 '+amount.toLocaleString()+' 次';toast(source+' 增加 '+amount.toLocaleString()+' 次'+(result.capped||giftCapped?'（已达安全上限）':''));return true;
  }
  function finishCount(){countState=null;save();showCountExit();fxBreak(true);sound('clear');}
  function hitCount(){if(!countState?.remaining)return;const previous=countState.pressed;const result=LockModes.pressCount(countState);lastRoundHits=previous+1;feedback.update(result.completed?1:LockModes.countProgress(countState),'count:'+roundId);feedback.hit();if(result.completed){finishCount();$('last-event').textContent='本轮次数已完成';}else{render();sound('hit');fxHit();save();}}
  function changeCount(kind,value,repetitions,source){if(!countState?.remaining){toast('当前没有次数挑战');return false;}const hits=countState.pressed;const result=kind==='relief'?LockModes.relieveCount(countState,value):LockModes.multiplyCount(countState,value,repetitions);if(!result?.changed)return false;lastRoundHits=hits;if(result.completed)finishCount();else{render();save();if(kind==='multiply'){fxAdd();sound('lock');}}toast(source+(kind==='relief'?' 减少次数':' 加固剩余次数')+(result.capped?'（已达安全上限）':''));return true;}
  function clearCount(source){if(!countState?.remaining&&frozenLeft()<=0)return false;lastRoundHits=countState?.pressed||0;countState=null;frozenUntil=0;disarmClear();save();showCountExit();fxBreak(true);sound('clear');toast(source+'：本轮次数已清空');return true;}
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


  /* ---------- 停手回落速度 ---------- */
  const decayPresets=[[0,'不回落'],[15,'慢'],[35,'默认'],[80,'快']];
  function renderDecay(){
    $('decay-rate').value=settings.decayRate;$('decay-delay').value=settings.decayDelay;
    for(const b of $('decay-presets').querySelectorAll('button[data-value]'))b.setAttribute('aria-pressed',String(Number(b.dataset.value)===settings.decayRate));
    const secs=settings.decayRate?Math.round(100/settings.decayRate*10)/10:0;
    $('decay-hint').textContent=settings.decayRate?'停手 '+settings.decayDelay+' 秒后开始回落，填满的一层约 '+secs+' 秒掉光（每秒掉 '+settings.decayRate+'%）。':'停手后进度保持不动，不会回落。';
  }
  function commitDecay(rate,delay){
    const r=Number(rate),d=Number(delay);
    if(!Number.isFinite(r)||r<0||r>500||!Number.isInteger(r)){toast('回落速度填 0–500 的整数（每秒掉一层的百分之几，0 = 不回落）');renderDecay();return;}
    if(!Number.isFinite(d)||d<0||d>10){toast('开始回落前的等待填 0–10 秒');renderDecay();return;}
    if(state?.layers)TypingLockModel.tick(state,Date.now()); // 先按旧速度结算到现在，再换新速度
    settings.decayRate=r;settings.decayDelay=Math.round(d*100)/100;saveSettingsObject();applyDecay();renderDecay();if(state?.layers){render();save();}
  }

  /* ---------- 设置面板 ---------- */
  function openSettings(){if(settingsOpen)return;settingsOpen=true;document.body.classList.add('settings-visible');$('settings').hidden=false;$('settings-backdrop').hidden=false;$('settings-close').focus();}
  function closeSettings(){if(!settingsOpen)return;LockMenu.close();cancelKeyRecording();settingsOpen=false;disarmClear();document.body.classList.remove('settings-visible');$('settings').hidden=true;$('settings-backdrop').hidden=true;$('arena').focus({preventScroll:true});}
  function setChoiceNode(box,value){const button=[...box.querySelectorAll('button[data-value]')].find(item=>item.dataset.value===value);if(!button&&box.id!=='lock-key')return false;box.dataset.value=value;for(const item of box.querySelectorAll('button[data-value]'))item.setAttribute('aria-pressed',String(item===button));return true;}
  function setChoice(id,value){return setChoiceNode($(id),value);}
  function choice(id){return $(id).dataset.value;}
  function bindChoice(id,onChange){$(id).addEventListener('click',event=>{const button=event.target.closest('button[data-value]');if(!button||!$(id).contains(button))return;setChoice(id,button.dataset.value);onChange?.();});}
  const giftMenuCopy={
    lock:{name:'多条进度',tab:'进度礼物',title:'多条进度 · 填满一条消一条',description:'礼物增加进度条，逐条填满后破锁。×N 表示剩余条数；每条按几次只决定这一条的难度。',add:'增加进度条',multiply:'增加破锁难度',relief:'抵扣破锁次数',clear:'解开全部锁',freeze:'暂停破锁按键',value:'每份礼物加几条进度',unit:'条',target:'每条进度按几次',factor:'新进度条难度乘几倍',repeat:'每份连续加固几次',reliefField:'每份抵扣多少次按键'},
    cage:{name:'牢笼拍门',tab:'关笼礼物',title:'礼物关笼 · 拍开封锁逃出去',description:'观众送礼给笼门加封锁，主播拍门解除；所有封锁解除后，双门打开。',add:'给笼门加封锁',multiply:'加固笼门',relief:'抵扣拍门次数',clear:'开门放主播出来',freeze:'暂停拍门',value:'每份礼物加几道封锁',unit:'道',target:'每道封锁拍门几次',factor:'新封锁拍门次数乘几倍',repeat:'每份连续加固几次',reliefField:'每份抵扣多少次拍门'},
    count:{name:'累计次数',tab:'次数礼物',title:'累计次数 · 没有层数，按到 0 结束',description:'礼物不断往剩余次数里加，主播按一下减 1，减到 0 就破锁。停手不会回落。',add:'增加剩余次数',multiply:'剩余次数翻倍',relief:'减少剩余次数',clear:'清空本轮次数',freeze:'暂停倒数按键',value:'每份礼物增加多少次',unit:'次',target:'',factor:'原规则次数乘几倍',repeat:'每份连续翻倍几次',reliefField:'每份减少多少次'}
  };
  function syncModeMenu(){
    const count=isCount(),copy=giftMenuCopy[settings.mode];
    for(const b of $('mode').querySelectorAll('button')){const on=b.dataset.value===settings.mode;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;}
    $('decay-settings').hidden=count;$('mode-description').textContent=copy.description;
    $('gift-menu').dataset.mode=settings.mode;$('rules-title').textContent=copy.title;
    $('rules-scope').textContent='当前启用：'+copy.name+'模式 · 只修改本模式的礼物';
    $('rules-description').textContent=copy.description;
    $('menu-nav').querySelector('[data-menu-tab=gifts]').textContent=copy.tab;
    $('add-rule').textContent='＋ 添加'+copy.name+'模式的礼物';
    $('rules-random-help').textContent=count?'增加、减少次数：范围先抽一次，再乘礼物份数。翻倍只作用于剩余次数。':'增加数量：范围先抽一次，再乘礼物份数。'+(settings.mode==='cage'?'每道封锁的拍门次数':'每条进度的按键次数')+'独立抽取；同批礼物共用一次倍率抽取。';
    $('simulate-amount-label').textContent=count?'增加次数':settings.mode==='cage'?'增加几道封锁':'增加几条进度';
    $('simulate-target-label').hidden=count;$('simulate-target-label').firstChild.textContent=copy.target;
    $('simulate-lock').textContent=count?'模拟加次数':settings.mode==='cage'?'模拟关笼':'模拟加锁';
    $('simulate-relief').textContent=count?'模拟援助':'模拟减链';
    $('quick-lock').textContent=count?'模拟增加 60 次':settings.mode==='cage'?'模拟一道笼门封锁':'模拟增加一条进度';
    $('idle-screen').querySelector('h1').textContent=count?'等待次数挑战':settings.mode==='cage'?'笼门尚未关闭':'锁链尚未降临';
    $('idle-screen').querySelector('p').textContent=copy.description;disarmClear();
  }
  // Explain the saved rule without sampling randomness or changing its gameplay.
  function giftOutcome(rule){
    const copy=giftMenuCopy[settings.mode],range=(lo,hi)=>lo===hi?String(lo):'随机 '+lo+'～'+hi;
    const value=range(rule.valueMin,rule.valueMax),factor=range(rule.multiplierMin,rule.multiplierMax);
    const multiplied=rule.multiplierMin!==1||rule.multiplierMax!==1;
    let effect='';
    if(rule.kind==='lock'){
      if(isCount())effect='增加 '+value+' 次'+(multiplied?'，再乘 '+factor+' 倍':'')+'；主播每按一下减 1';
      else{
        const cage=settings.mode==='cage',target=rule.targetMode==='blindbox'?'按旧版概率抽取':range(rule.targetMin,rule.targetMax)+' 次';
        effect='增加 '+value+(cage?' 道封锁；每道拍门':' 条进度；每条按键')+' '+target+(multiplied?'，次数再乘 '+factor+' 倍':'');
      }
    }else if(rule.kind==='multiply')effect=(isCount()?'剩余次数':settings.mode==='cage'?'现有封锁的拍门难度':'现有锁的破锁难度')+' × '+factor+' 倍，连续执行 '+value+' 次（无挑战时不生效）';
    else if(rule.kind==='relief')effect=isCount()?'剩余次数减少 '+value+' 次':'抵扣 '+value+' 次'+(settings.mode==='cage'?'拍门':'破锁按键');
    else if(rule.kind==='clear')effect=copy.clear;
    else effect='暂停主播按键 '+value+' 秒';
    return '送 1 个「'+rule.name+'」 → '+effect+'。';
  }
  function fillSettings(){setChoice('theme',settings.theme);presentation.syncCards();setChoice('display-size',settings.displaySize);syncLockKey();setChoice('motion',settings.motion);setChoice('material-choice',settings.materialId);syncModeMenu();const demo=settings.demo||{};for(const [id,key,fallback] of [['simulate-layers',isCount()?'amount':'layers',isCount()?60:1],['simulate-target','target',60],['simulate-factor','factor',2],['simulate-points','points',60],['simulate-seconds','seconds',10]])$(id).value=demo[key]||fallback;renderRules();renderSounds();renderDecay();applyMaterial();}
  function switchMode(mode){if(mode===settings.mode||!['lock','cage','count'].includes(mode))return;if(challengeActive()||frozenLeft()>0){toast('当前还有挑战，先在试玩页清空，或者等它结束');return;}const next=activeConfiguration();next.mode=mode;if(!persistConfiguration(next)){toast('模式未能保存，保留当前模式');return;}settings=clone(configuration.profiles[mode].settings);rules=clone(configuration.profiles[mode].rules);state=null;countState=null;waiting=[];roundId++;viewSequence++;feedback.reset();presentation.stop();$('typing-lock-overlay').hidden=true;$('idle-screen').hidden=false;document.documentElement.dataset.theme=settings.theme;applyDecay();refreshMotion();fillSettings();render();save();}
  function saveBasics(){const before=clone(settings),themeChanged=settings.theme!==choice('theme');settings.theme=choice('theme');settings.displaySize=choice('display-size');if(themeChanged){setChoice('material-choice','theme');presentation.stop();feedback.reset();$('lock-fx').replaceChildren();}settings.motion=choice('motion');settings.materialId=choice('material-choice');settings=cleanSettings(settings);if(!saveSettingsObject())settings=before;document.documentElement.dataset.theme=settings.theme;presentation.syncCards();refreshMotion();applyMaterial();render();}
  function syncLockKey(){setChoice('lock-key',settings.key);$('lock-key').dataset.placeholder='快捷选择 · 当前 '+TypingLockModel.keyLabel(settings.key);$('lock-key-current').textContent=TypingLockModel.keyLabel(settings.key);$('record-lock-key').textContent=keyRecording?'等待按键…':'录入按键';$('record-lock-key').setAttribute('aria-pressed',String(keyRecording));$('cancel-lock-key').hidden=!keyRecording;}
  function cancelKeyRecording(message){const active=keyRecording;keyRecording=false;syncLockKey();if(active||message)$('lock-key-status').textContent=message||'已取消录入，保留当前按键。';}
  function commitLockKey(code){
    if(!TypingLockModel.keyValid(code))return false;
    if(!persistConfiguration(activeConfiguration({...settings,key:code},rules))){cancelKeyRecording('按键未能保存，已保留原按键。');toast('按键未能保存，已保留原按键');return false;}
    settings.key=code;keyRecording=false;syncLockKey();$('lock-key-status').textContent='已保存「'+TypingLockModel.keyLabel(code)+'」，用于随后新增的锁链。';toast('破锁键已设为「'+TypingLockModel.keyLabel(code)+'」');return true;
  }
  function startKeyRecording(){keyRecording=true;syncLockKey();$('lock-key-status').textContent='等待按键：按一下想用的单键；取消请点“取消录入”。';}
  function recordLockKey(event){
    event.preventDefault();event.stopImmediatePropagation();
    if(keyComposing||event.isComposing||event.keyCode===229||event.key==='Process'){$('lock-key-status').textContent='中文选词不参与录入，请结束选词后按单键。';return;}
    const code=breakKeyCode(event);
    if(event.ctrlKey||event.altKey||event.metaKey||!code){$('lock-key-status').textContent='请按独立的字母、数字、方向或其他单键，组合键和修饰键不录入。';return;}
    if(event.repeat||!acceptTap(code,event)){$('lock-key-status').textContent='请先松开，再按一下想用的键。';return;}
    commitLockKey(code);
  }
  function createChoice(options,current,label){const box=document.createElement('div');box.className='choice-grid rule-choice';box.setAttribute('role','group');box.setAttribute('aria-label',label);for(const [value,text] of options){const button=document.createElement('button');button.type='button';button.dataset.value=value;button.textContent=text;box.append(button);}setChoiceNode(box,current);return box;}
  function renderRules(){
    const holder=$('rules'),copy=giftMenuCopy[settings.mode];holder.replaceChildren();
    rules.forEach((rule,index)=>{
      const row=document.createElement('div');row.className='rule-row simple-rule';row.dataset.index=index;
      const main=document.createElement('div');main.className='rule-main rule-main-v15';
      const name=document.createElement('input');name.className='gift-name';name.value=rule.name;name.maxLength=80;name.setAttribute('aria-label','礼物名称');
      const nameLabel=document.createElement('label');nameLabel.className='rule-name-wrap';nameLabel.append('礼物名称',name);
      const kind=createChoice([['lock',copy.add],['multiply',copy.multiply],['relief',copy.relief],['clear',copy.clear],['freeze',copy.freeze]],rule.kind,'互动效果');
      const kindLabel=document.createElement('div');kindLabel.className='rule-effect-wrap';const caption=document.createElement('span');caption.textContent='收到礼物后做什么';kindLabel.append(caption,kind);
      const tools=document.createElement('div');tools.className='rule-tools';
      const test=document.createElement('button');test.type='button';test.className='secondary rule-test';test.textContent='测试';test.onclick=()=>testRule(rule);
      const remove=document.createElement('button');remove.type='button';remove.className='secondary rule-delete';remove.textContent='删除';remove.onclick=event=>{if(event.detail>1)return;const at=rules.indexOf(rule);if(at>=0){const next=rules.filter(item=>item!==rule);if(!persistRules(next)){toast('删除未能保存，已保留原规则');return;}rules=next;renderRules();}};
      tools.append(test,remove);main.append(nameLabel,kindLabel,tools);
      const params=document.createElement('div');params.className='simple-rule-params';
      const makeRange=(key,label,unit,max,minValue,maxValue)=>{
        const wrap=document.createElement('div');wrap.className='inline-range rule-'+key+'-range';const title=document.createElement('label');title.textContent=label;
        const pair=document.createElement('div');pair.className='range-pair';const inputs=[];
        for(const [side,value] of [['min',minValue],['max',maxValue]]){const input=document.createElement('input');input.type='number';input.min='1';input.max=String(max);input.step='1';input.value=value;input.className='rule-'+key+'-'+side;input.setAttribute('aria-label',label+(side==='min'?'下限':'上限'));inputs.push(input);if(side==='max'){const to=document.createElement('span');to.textContent='～';pair.append(to);}pair.append(input);}
        const suffix=document.createElement('span');suffix.className='range-unit';suffix.textContent=unit;pair.append(suffix);title.append(pair);wrap.append(title);params.append(wrap);return {wrap,title,pair,min:inputs[0],max:inputs[1],suffix};
      };
      const limits={lock:isCount()?LockModes.MAX_COUNT:20000,relief:isCount()?LockModes.MAX_COUNT:10000000,freeze:3600,multiply:99,clear:1};
      const value=makeRange('value','增加层数','层',limits[rule.kind],rule.valueMin,rule.valueMax);
      const target=makeRange('target','每层按键次数','次',99999,rule.targetMin,rule.targetMax);
      const factor=makeRange('factor','倍率','倍',1000,rule.multiplierMin,rule.multiplierMax);
      const status=document.createElement('p');status.className='rule-save-status';status.setAttribute('role','status');status.textContent='改完自动保存 · 两端相同固定，不同随机。';
      const outcome=document.createElement('p');outcome.className='rule-outcome';outcome.setAttribute('aria-live','polite');
      const legacy=document.createElement('details');legacy.className='legacy-pool-editor';
      const summary=document.createElement('summary');summary.textContent='旧版多档抽取（原概率已保留）';legacy.append(summary);
      if(rule.targetMode==='blindbox'&&rule.targetPool){
        for(const tier of rule.targetPool){if(!tier.enabled)continue;const text=document.createElement('p');text.textContent=tier.name+'：'+tier.min+'～'+tier.max+' 次，'+tier.percent+'%';legacy.append(text);}
        const note=document.createElement('p');note.textContent='这条礼物沿用旧概率。点下面按钮可改成普通次数范围（等概率），其他礼物不受影响。';legacy.append(note);
        const simple=document.createElement('button');simple.type='button';simple.className='secondary use-simple-range';simple.textContent='改用简单次数范围';simple.onclick=()=>{const next={...rule};delete next.targetMode;delete next.targetPool;const cleaned=cleanRules([next]);if(cleaned&&persistRules(rules.map(item=>item===rule?cleaned[0]:item))){Object.assign(rule,cleaned[0]);delete rule.targetMode;delete rule.targetPool;renderRules();}};legacy.append(simple);
      }
      const show=()=>{
        const labels={lock:[copy.value,copy.unit],relief:[copy.reliefField,'次'],freeze:['每份暂停多少秒','秒'],multiply:[copy.repeat,'次'],clear:['','']},current=labels[rule.kind];
        const labelRange=(field,label)=>{field.title.firstChild.textContent=label;field.min.setAttribute('aria-label',label+'下限');field.max.setAttribute('aria-label',label+'上限');};
        labelRange(value,current[0]);value.suffix.textContent=current[1];value.min.max=value.max.max=String(limits[rule.kind]);value.wrap.hidden=rule.kind==='clear';
        labelRange(target,copy.target);target.wrap.hidden=isCount()||rule.kind!=='lock'||rule.targetMode==='blindbox';
        factor.wrap.hidden=isCount()?!(rule.kind==='multiply'||rule.kind==='lock'&&(rule.multiplierMin!==1||rule.multiplierMax!==1)):!['lock','multiply'].includes(rule.kind);
        labelRange(factor,rule.kind==='multiply'?'每次乘几倍':copy.factor);
        legacy.hidden=isCount()||rule.kind!=='lock'||rule.targetMode!=='blindbox';
        params.dataset.fields=String([value,target,factor].filter(field=>!field.wrap.hidden).length);
        outcome.textContent=giftOutcome(rule);

      };
      const update=(event)=>{
        const nextKind=kind.dataset.value;
        if(nextKind!==rule.kind){const fixed={lock:1,relief:60,freeze:10,multiply:1,clear:1}[nextKind];value.min.value=value.max.value=fixed;if(nextKind==='multiply'&&Number(factor.min.value)===1&&Number(factor.max.value)===1)factor.min.value=factor.max.value=2;}
        for(const range of [value,target,factor]){if(event?.target===range.min&&Number(range.min.value)>Number(range.max.value))range.max.value=range.min.value;}
        const next={...rule,name:name.value.trim(),kind:nextKind,value:Number(value.min.value),valueMin:value.min.value,valueMax:value.max.value,target:Number(target.min.value),targetMin:target.min.value,targetMax:target.max.value,multiplier:Number(factor.min.value),multiplierMin:factor.min.value,multiplierMax:factor.max.value};
        const cleaned=cleanRules([next]);
        if(!cleaned){setChoiceNode(kind,rule.kind);status.textContent='未保存：请填完整名称与合法范围，下限不能大于上限。';status.classList.add('unsaved');return;}
        const candidate=rules.map(item=>item===rule?cleaned[0]:item);
        if(!persistRules(candidate)){status.textContent='未保存：浏览器拒绝存储，当前效果仍使用原设置。';status.classList.add('unsaved');return;}
        Object.assign(rule,cleaned[0]);name.value=rule.name;status.textContent='已保存 · 数值相同是固定值，不同是随机范围。';status.classList.remove('unsaved');show();
      };
      for(const input of [name,value.min,value.max,target.min,target.max,factor.min,factor.max])input.addEventListener('change',update);
      kind.addEventListener('click',event=>{const option=event.target.closest('button[data-value]');if(option){setChoiceNode(kind,option.dataset.value);update(event);}});
      row.append(main,params,legacy,outcome,status);holder.append(row);show();
    });
  }
  function testRule(rule){const at=rules.indexOf(rule);if(at<0)return;const pending=$('rules').children[at]?.querySelector('.rule-save-status.unsaved');if(pending){toast('这一行还有未保存的值，请先修正再测试');return;}applyGiftRoute((isCount()?LockModes.routeCountGift:LockGiftRules.routeGift)([rule],{giftName:rule.name,count:1}),'测试：'+rule.name);}

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
    const count=Object.keys(sounds).length;toast('已导出：'+rules.length+' 条礼物规则及各行数值范围、'+payload.customArt.items.length+' 张自定义素材'+(count?'、'+count+' 个自定义音效':'')+'。在别处点「导入设置」即可');
  }
  function hideImportPreview(){customArt.discardImport(pendingImport?.customArt);pendingImport=null;$('import-preview').hidden=true;$('import-summary').textContent='';}
  async function readBackup(file){
    const token=++importToken;hideImportPreview();
    if(!file)return;
    if(file.size>MAX_BACKUP_BYTES){toast('设置文件太大，不是本插件导出的文件');return;}
    let data;try{data=JSON.parse(await file.text());}catch{if(token===importToken)toast('无法读取：请选择本插件导出的 .json 设置文件');return;}
    if(token!==importToken)return;
    if(!data||data.app!==BACKUP_APP||data.format!==BACKUP_FORMAT){toast('这不是红黑破锁导出的设置文件，未导入');return;}
    const migrated=data.modes?normalizeConfiguration(data.modes):normalizeConfiguration(LockModes.migrateConfig(data.settings||defaults,cleanRules(data.rules,legacyTargets(data.settings),data.settings||{})));
    if(!migrated){toast('三模式设置无效，未导入');return;}const nextSettings=migrated.profiles[migrated.mode].settings,nextRules=migrated.profiles[migrated.mode].rules;
    if(!nextRules){toast('设置文件里的礼物规则无效，未导入');return;}
    
    
    if(data.settings?.targetPool!==undefined&&!LockGiftRules.cleanTargetPool(data.settings.targetPool)){toast('设置文件里的次数盲盒无效，未导入');return;}
    let nextArt;try{nextArt=await customArt.validateImport(data.customArt||{version:1,items:[]});}catch{if(token===importToken)toast('设置文件里的自定义素材无效，未导入');return;}
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
    const rangeText=(min,max)=>min===max?String(min):min+'～'+max;
    const names=nextRules.slice(0,5).map(rule=>rule.name+(rule.kind==='lock'?(nextSettings.mode==='count'?'（增加 '+rangeText(rule.valueMin,rule.valueMax)+' 次）':'（加 '+rangeText(rule.valueMin,rule.valueMax)+' 层，每层 '+(rule.targetMode==='blindbox'?'保留旧概率':rangeText(rule.targetMin,rule.targetMax)+' 次')+'）'):rule.kind==='clear'?'（清空）':rule.kind==='freeze'?'（禁用 '+rangeText(rule.valueMin,rule.valueMax)+' 秒）':rule.kind==='multiply'?'（加固 ×'+rangeText(rule.multiplierMin,rule.multiplierMax)+'）':'（减 '+rangeText(rule.valueMin,rule.valueMax)+' 次）')).join('、');
    $('import-summary').textContent='将替换三种模式的全部设置；当前预览 '+{lock:'多条进度',cage:'牢笼拍门',count:'累计次数'}[migrated.mode]+'，主题「'+themeName+'」，破锁键「'+TypingLockModel.keyLabel(nextSettings.key)+'」，礼物规则 '+nextRules.length+' 条（'+(names||'无')+(nextRules.length>5?' 等':'')+'），自定义音效 '+Object.keys(sounds).length+' 个、自定义素材 '+(data.customArt?.items?.length||0)+' 张。规则数值直接保存在各行；当前与排队的挑战不受影响。'+(failed.length?'音效 '+failed.join('、')+' 无法读取，将用默认音效。':'');
    $('import-preview').hidden=false;
  }
  async function applyImport(){
    const pending=pendingImport;if(!pending||pending.token!==importToken){hideImportPreview();return;}
    if((challengeActive()||frozenLeft()>0)&&pending.modes.mode!==settings.mode){toast('当前还有挑战，先在试玩页清空，或者等它结束');return;}const previousConfig=activeConfiguration(),previousArt=customArt.exportAssets();
    $('import-confirm').disabled=true;$('import-cancel').disabled=true;
    try{await customArt.importAssets(pending.customArt,()=>pending.token===importToken);}catch{toast('素材未能保存，未导入设置，已保留原配置');$('import-confirm').disabled=false;$('import-cancel').disabled=false;return;}
    if(pending.token!==importToken){$('import-confirm').disabled=false;$('import-cancel').disabled=false;return;}
    // Gifts can arrive while IndexedDB is saving artwork. Re-check after the await.
    if((challengeActive()||frozenLeft()>0)&&pending.modes.mode!==settings.mode){
      try{const previous=await customArt.validateImport(previousArt);await customArt.importAssets(previous);}catch{storageWarning();}
      hideImportPreview();$('import-confirm').disabled=false;$('import-cancel').disabled=false;
      toast('当前还有挑战，先在试玩页清空，或者等它结束；本次跨模式导入已取消');return;
    }
    if(!persistConfiguration(pending.modes)){try{const old=await customArt.validateImport(previousArt);await customArt.importAssets(old);}catch{}toast('设置未能保存，已保留原配置');$('import-confirm').disabled=false;$('import-cancel').disabled=false;return;}
    pendingImport=null;settings=clone(pending.settings);rules=clone(pending.rules);feedback.reset();
    let unsaved=0;
    for(const [kind] of soundEvents){
      uploadToken[kind]=(uploadToken[kind]||0)+1;stopSound(kind);
      const next=pending.sounds[kind];
      if(next){customSounds.set(kind,{name:next.name,buffer:next.buffer,bytes:next.bytes,type:next.type});try{await soundDb.put(kind,{name:next.name,type:next.type,data:next.bytes});}catch{unsaved++;}}
      else{customSounds.delete(kind);try{await soundDb.del(kind);}catch{}}
    }
    applyDecay();saveSettingsObject();saveRules();document.documentElement.dataset.theme=settings.theme;refreshMotion();fillSettings();hideImportPreview();
    $('import-confirm').disabled=false;$('import-cancel').disabled=false;toast('设置已导入'+(unsaved?'；有 '+unsaved+' 个音效浏览器没能保存，刷新后恢复默认':''));
  }

  /* ---------- 礼物连接 ---------- */
  function applyGiftRoute(routed,source){if(!routed)return false;if(isCount()&&routed.kind==='lock')return addCount(routed.value,source,routed.capped);if(routed.kind==='lock')return addLock(routed.value,routed.target,source,routed.targetPool,routed.multiplier||1);if(routed.kind==='multiply')return multiplyLocks(routed.multiplier,routed.value,source);if(routed.kind==='clear')return clearByGift(source);if(routed.kind==='freeze')return freezeKeys(routed.value,source);return relieve(routed.value,source);}
  function gift(name,count=1){return applyGiftRoute((isCount()?LockModes.routeCountGift:LockGiftRules.routeGift)(rules,{giftName:name,count}),String(name).slice(0,80));}
  function extractGift(message){if(!message||typeof message!=='object')return null;const type=String(message.type??message.msgType??message.method??'gift').toLowerCase();if(!type.includes('gift')&&type!=='2')return null;const data=message.data||{},g=message.gift||data.gift||data;const name=message.giftName||g.giftName||g.name||data.giftName||data.name;if(!name)return null;const count=message.giftCount??message.count??message.comboCount??message.repeatCount??g.giftCount??g.count??g.comboCount??g.repeatCount??1;const id=message.eventId??message.event_id??message.msgId??data.eventId;return {name:String(name),count:Number(count),id};}
  function connectionStatus(value){$('connection').textContent=value;$('settings-connection').textContent=value;}
  const giftChannel=LockGiftChannel.create({getSdk:()=>window.SonglanPlugin,onStatus:connectionStatus,onGift:data=>{const g=extractGift(data);if(g&&!dedupe(g.id))gift(g.name,g.count);}});
  function breakKeyCode(event){return TypingLockModel.keyFromEvent(event);}
  function init(){
    restore();document.documentElement.dataset.theme=settings.theme;fillSettings();position();refreshMotion();
    LockMenu.init({onMenuKey:event=>{if(settingsOpen&&!event.isComposing&&event.keyCode!==229){const code=breakKeyCode(event);if(TypingLockModel.keyValid(code))acceptTap(code,event);}}});
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
    presentation.bindCards();$('mode').addEventListener('click',e=>{const b=e.target.closest('button[data-value]');if(b)switchMode(b.dataset.value);});$('mode').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...$('mode').querySelectorAll('button')],i=buttons.indexOf(e.target);const n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;buttons[n].focus();buttons[n].click();});
    bindChoice('theme',()=>{setChoice('material-choice','theme');saveBasics();});
    for(const id of ['motion','material-choice','display-size'])bindChoice(id,saveBasics);
    $('lock-key').addEventListener('click',event=>{const b=event.target.closest('button[data-value]');if(b&&$('lock-key').contains(b))commitLockKey(b.dataset.value);});
    $('record-lock-key').onclick=startKeyRecording;$('cancel-lock-key').onclick=()=>cancelKeyRecording();
    $('add-rule').onclick=()=>{if(rules.length>=50){toast('最多设置 50 条礼物规则');return;}const next=[...rules,cleanRules([{name:'新礼物'+(rules.length+1),kind:'lock',value:isCount()?60:1,target:DEFAULT_TARGET}])[0]];if(!persistRules(next)){toast('新增未能保存，已保留原规则');return;}rules=next;renderRules();};
    $('sound-master').addEventListener('input',()=>{$('sound-master-value').textContent=$('sound-master').value+'%';});
    $('sound-master').addEventListener('change',()=>{settings.sound.master=Math.max(0,Math.min(100,Math.round(Number($('sound-master').value))));saveSettingsObject();sound('hit',true);});
    $('quick-lock').onclick=()=>addLock(isCount()?60:1,DEFAULT_TARGET,'本地模拟');
    $('simulate-lock').onclick=()=>{const raw=String($('simulate-layers').value).trim(),n=/^\d+$/.test(raw)?Number(raw):NaN;if(!Number.isSafeInteger(n)||n<1||n>100000){toast('模拟层数必须是 1–100000 的整数');return;}const t=TypingLockModel.target($('simulate-target').value);if(t===null){toast('每层连点次数必须是 '+TypingLockModel.TARGET_MIN+'–'+TypingLockModel.TARGET_MAX+' 的整数');return;}addLock(n,t,'本地模拟');};
    $('simulate-multiply').onclick=()=>{const factor=Number($('simulate-factor').value);if(!Number.isSafeInteger(factor)||factor<1||factor>1000){toast('加固倍率需为 1–1000 的整数');return;}multiplyLocks(factor,1,'模拟加固');};
    $('simulate-relief').onclick=()=>{const n=Number($('simulate-points').value);if(!Number.isSafeInteger(n)||n<1||n>10000000){toast('模拟减链点数必须是 1–10000000 的整数');return;}relieve(n,'本地模拟');};
    for(const [id,key] of [['simulate-layers','amount'],['simulate-target','target'],['simulate-factor','factor'],['simulate-points','points'],['simulate-seconds','seconds']])$(id).addEventListener('change',()=>{const n=Number($(id).value);if(Number.isSafeInteger(n)&&n>=1&&n<=10000000){settings.demo={...settings.demo,[id==='simulate-layers'&&!isCount()?'layers':key]:n};saveSettingsObject();}});
    $('clear-locks').onclick=armClear;
    $('decay-presets').addEventListener('click',event=>{const b=event.target.closest('button[data-value]');if(b)commitDecay(b.dataset.value,settings.decayDelay);});
    $('decay-rate').addEventListener('change',()=>commitDecay($('decay-rate').value,settings.decayDelay));
    $('decay-delay').addEventListener('change',()=>commitDecay(settings.decayRate,$('decay-delay').value));
    $('simulate-freeze').onclick=()=>{const raw=String($('simulate-seconds').value).trim(),n=/^\d+$/.test(raw)?Number(raw):NaN;if(!Number.isSafeInteger(n)||n<1||n>FREEZE_MAX_SECONDS){toast('禁用秒数必须是 1–'+FREEZE_MAX_SECONDS+' 的整数');return;}freezeKeys(n,'本地模拟');};
    $('unfreeze').onclick=()=>{if(frozenLeft()<=0){toast('破锁键没有被禁用');return;}frozenUntil=0;save();render();toast('已解除按键禁用');};
    $('export-settings').onclick=exportSettings;
    $('import-settings').onclick=()=>$('import-file').click();
    $('import-file').addEventListener('change',()=>{const f=$('import-file').files?.[0];$('import-file').value='';readBackup(f);});
    $('import-confirm').onclick=applyImport;$('import-cancel').onclick=()=>{importToken++;hideImportPreview();};
    setInterval(()=>{if(challengeActive())render();},60);giftChannel.start();window.addEventListener('pagehide',()=>{giftChannel.stop();presentation.stop();feedback.stop();});window.addEventListener('pageshow',()=>giftChannel.start());document.fonts?.ready.then(()=>{presentation.invalidate();scenes.position();});document.fonts?.addEventListener('loadingdone',()=>{presentation.invalidate();scenes.position();});
    loadCustomSounds();customArt.load().then(()=>{scenes.applyStyle();scenes.position();});
  }
  init();
})();
