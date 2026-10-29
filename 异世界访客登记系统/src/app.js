(function(){
'use strict';
const E=window.VisitorEngine,B=window.VisitorBridge,$=id=>document.getElementById(id);
const KEY='bysl.otherworld.visitors.v1',FORMAT='otherworld-visitors',MAX_FILE=256*1024*1024;
const UI_DEFAULTS={hostName:'异世界的凛序',x:76,y:10,width:380,fontSize:25,visibleRows:5,scrollSec:5,accent:'#c8b6ff',motion:'system',effectX:49,effectY:50,effectSize:520,effectSec:6,bridgeUrl:'ws://localhost:9910',identityMode:'display'};
const CORE_KEYS=Object.keys(E.DEFAULTS),UI_KEYS=Object.keys(UI_DEFAULTS);
let settings={...E.DEFAULTS,...UI_DEFAULTS},real=E.createState(),demo=null,bridge=null,revision=0,storageBlocked=false,storageMessage='',savedAt=0,importToken=0,lastStored=null,effectiveRows=5;
let effectQueue=[],effectTimer=0,currentEffect=null,arrivalTimer=0,noticeTimer=0,scrollTimer=0,listIndex=0,panelOpen=false,confirmAction=null,lastFocus=null;
let lastEvent='',missingId=0,realDuringDemo=0,queueSkipped=0,storeFailed=false;
const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
function plain(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;}
function safeText(v,max,label){if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw Error(label+'无效');return v.trim();}
function number(v,min,max,label){if(!Number.isFinite(v)||!Number.isInteger(v)||v<min||v>max)throw Error(label+'须为 '+min+'–'+max+' 的整数');return v;}
function validUrl(raw){const u=new URL(raw);if(!['ws:','wss:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.hash)throw Error('仅支持本机 ws:// 或 wss:// 地址');return u.href;}
function validatePrefs(raw){
  if(!plain(raw))throw Error('设置结构无效');
  for(const key of Object.keys(raw))if(!CORE_KEYS.includes(key)&&!UI_KEYS.includes(key))throw Error('不支持的设置项：'+key);
  const core={};for(const k of CORE_KEYS)if(Object.hasOwn(raw,k))core[k]=raw[k];
  const s={...UI_DEFAULTS,...E.validateSettings(core)};
  for(const k of UI_KEYS)if(Object.hasOwn(raw,k))s[k]=raw[k];
  s.hostName=safeText(s.hostName,30,'主播名称');
  for(const k of ['x','y','effectX','effectY'])number(s[k],0,100,'位置');
  number(s.width,260,700,'名册宽度');number(s.fontSize,16,40,'字号');number(s.visibleRows,3,8,'显示人数');number(s.scrollSec,2,30,'滚动间隔');number(s.effectSize,280,800,'祝福尺寸');number(s.effectSec,3,15,'祝福时长');
  if(typeof s.accent!=='string'||!/^#[\da-f]{6}$/i.test(s.accent))throw Error('星光颜色无效');
  if(!['system','on','off'].includes(s.motion))throw Error('动画选项无效');
  if(!['display','strict'].includes(s.identityMode))throw Error('观众识别方式无效');
  s.bridgeUrl=validUrl(s.bridgeUrl);return s;
}
function payload(state=real,prefs=settings){return {format:FORMAT,version:1,savedAt:Date.now(),settings:prefs,state};}
function parseBackup(raw){
  if(!plain(raw)||raw.format!==FORMAT||raw.version!==1||!Object.hasOwn(raw,'settings')||!Object.hasOwn(raw,'state'))throw Error('不是此插件支持的名册备份');
  return {settings:validatePrefs(raw.settings),state:E.validateState(raw.state)};
}
function showStorage(message){storageMessage=message;$('storage-warning').textContent=message;$('storage-warning').hidden=!message;$('save-status').textContent=message?'本页临时使用 · 请导出备份':'已保存到当前浏览器';}
function load(){
  try{const raw=localStorage.getItem(KEY);lastStored=raw;if(!raw)return;const data=parseBackup(JSON.parse(raw));settings=data.settings;real=data.state;savedAt=Date.now();}
  catch(error){storageBlocked=true;showStorage('未能读取旧记录，已保留原存档。当前使用临时名册；可导出本页备份，或核对后导入有效备份。原因：'+error.message);}
}
function save(state=real,prefs=settings,explicit=false){
  if(storageBlocked&&!explicit)return false;
  try{
    if(!explicit&&localStorage.getItem(KEY)!==lastStored){storageBlocked=true;showStorage('另一个页面已更新存档，已阻止本页覆盖。请先导出本页备份，再刷新读取最新名册；直播时请只保留一个接收事件的插件实例。');return false;}
    const next=JSON.stringify(payload(state,prefs));localStorage.setItem(KEY,next);lastStored=next;savedAt=Date.now();storeFailed=false;storageBlocked=false;showStorage('');return true;
  }
  catch(error){storeFailed=true;showStorage('浏览器存储不可用或空间不足，旧存档未被替换。本页可临时继续，请导出备份后再关闭。');return false;}
}
function notice(message){clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,5500);}
function activeState(){return demo||real;}
function reduced(){return settings.motion==='off'||(settings.motion==='system'&&motionQuery.matches);}
function applyAppearance(){
  const root=document.documentElement;
  for(const [name,value] of Object.entries({'--accent':settings.accent,'--registry-width':settings.width+'px','--name-size':settings.fontSize+'px','--x':settings.x+'vw','--y':settings.y+'vh','--effect-x':settings.effectX+'vw','--effect-y':settings.effectY+'vh','--effect-size':settings.effectSize+'px','--registry-height':(260+settings.visibleRows*100)+'px'}))root.style.setProperty(name,value);
  document.body.classList.toggle('no-motion',reduced());document.body.classList.toggle('force-motion',settings.motion==='on');
  $('registry-host').textContent=settings.hostName;$('register-prompt').textContent='发送「'+settings.registerKeyword+'」 · 留下你的异世界足迹';
  $('effect-host').textContent=settings.hostName;$('demo-register').textContent='发送「'+settings.registerKeyword+'」';
  requestAnimationFrame(()=>{sizeRows();renderRegistry();});restartScroll();
}
function sizeRows(){const h=$('list-window').clientHeight;effectiveRows=Math.max(1,Math.min(settings.visibleRows,Math.floor(h/(settings.fontSize*2.864+28))));document.documentElement.style.setProperty('--row-height',Math.max(30,h/effectiveRows)+'px');}
function makeRow(person,index){
  const rank=E.getLevel(person.points,settings),li=document.createElement('li');li.className='visitor-row';li.dataset.level=rank.index;
  const ordinal=document.createElement('span');ordinal.className='visitor-number';ordinal.textContent=String(index+1).padStart(2,'0');
  const art=document.createElement('span');art.className='role-art';art.dataset.role=rank.index;art.setAttribute('aria-hidden','true');
  const body=document.createElement('div');body.className='visitor-content';const name=document.createElement('p');name.className='visitor-name';name.textContent=person.nickname;
  const line=document.createElement('p');line.className='visitor-rank';const title=document.createElement('span');title.textContent=rank.title;
  const stars=document.createElement('span');stars.className='visitor-stars';stars.textContent='★'.repeat(rank.stars);stars.setAttribute('aria-label',rank.stars+' 星');line.append(title,stars);body.append(name,line);li.append(ordinal,art,body);return li;
}
function renderRegistry(){
  const list=$('visitor-list'),people=activeState().visitors,total=people.length;
  if(listIndex>=total)listIndex=0;
  list.style.transition='none';list.style.transform='translateY(0)';list.replaceChildren();
  const count=total>effectiveRows?effectiveRows+1:total;
  for(let i=0;i<count;i++){const index=(listIndex+i)%total;list.append(makeRow(people[index],index));}
  $('empty-state').hidden=total>0;$('visitor-count').textContent='已登记 '+total+' 位访客';
}
function restartScroll(){clearInterval(scrollTimer);scrollTimer=setInterval(()=>{
  if(activeState().visitors.length<=effectiveRows)return;
  if(reduced()){listIndex=(listIndex+1)%activeState().visitors.length;renderRegistry();return;}
  const list=$('visitor-list');list.style.transition='transform .9s cubic-bezier(.22,.68,.25,1)';list.style.transform='translateY(-'+($('list-window').clientHeight/effectiveRows)+'px)';
  setTimeout(()=>{listIndex=(listIndex+1)%Math.max(1,activeState().visitors.length);renderRegistry();},950);
},settings.scrollSec*1000);}
function renderStats(){
  $('total-stat').textContent=real.visitors.length;$('guardian-stat').textContent=real.visitors.filter(p=>E.getLevel(p.points,settings).index===2).length;$('queue-stat').textContent=effectQueue.filter(e=>e.type==='blessing').length;
  $('event-status').textContent=(lastEvent||'尚未收到直播事件')+(missingId?' · 无法识别 '+missingId+' 条':'')+(queueSkipped?' · 队列满额忽略 '+queueSkipped+' 条特效':'');
  if(panelOpen&&!document.querySelector('[data-pane="data"]').hidden)renderData();
}
function sparkField(){const field=$('spark-field');field.replaceChildren();for(let i=0;i<11;i++){const node=document.createElement('span');node.className='effect-spark';node.textContent='✦';const t=i*Math.PI*2/11;node.style.left=(50+Math.cos(t)*(i%2?43:49))+'%';node.style.top=(50+Math.sin(t)*(i%2?43:49))+'%';node.style.setProperty('--s',(i%3===0?27:10)+'px');node.style.setProperty('--delay',(-i*.3)+'s');field.append(node);}}
function clearEffects(){clearTimeout(effectTimer);clearTimeout(arrivalTimer);currentEffect=null;effectQueue=[];$('celebration').hidden=true;$('arrival').hidden=true;document.body.classList.remove('effect-active');renderStats();}
function enqueue(effects){for(const effect of effects){
  if(effect.type==='registered'){clearTimeout(arrivalTimer);$('arrival').textContent='✦  '+effect.nickname+'，欢迎来到异世界';$('arrival').hidden=false;arrivalTimer=setTimeout(()=>$('arrival').hidden=true,3500);continue;}
  if(effectQueue.length>=30){queueSkipped++;continue;}effectQueue.push(effect);
}playNext();renderStats();}
function playNext(){
  if(currentEffect||!effectQueue.length)return;
  currentEffect=effectQueue.shift();const effect=currentEffect,isBless=effect.type==='blessing';
  $('celebration').dataset.role=effect.level.index;$('effect-art').dataset.role=effect.level.index;$('effect-role').textContent=effect.level.title+' · '+'★'.repeat(effect.level.stars);
  $('effect-title').textContent=isBless?'转正纪念':'星光晋升';$('effect-host').textContent=settings.hostName;
  $('effect-person').textContent=isBless?effect.nickname+' 送来了转正祝福':effect.nickname+' · '+effect.level.title+' '+'★'.repeat(effect.level.stars);
  $('effect-subtitle').textContent=isBless?'此刻星光，为你而来':'每一次相伴，都被星光铭记';
  const el=$('celebration');el.hidden=false;document.body.classList.add('effect-active');el.style.animation='none';void el.offsetWidth;el.style.animation='';
  effectTimer=setTimeout(()=>{el.hidden=true;document.body.classList.remove('effect-active');currentEffect=null;effectTimer=setTimeout(playNext,450);renderStats();},settings.effectSec*1000);
}
function receive(event){
  const result=E.processEvent(real,event,settings,Date.now());
  lastEvent='最近收到'+(event.type==='chat'?'弹幕':'礼物')+' · '+new Date().toLocaleTimeString();
  if(result.changed){revision++;save();}
  if(demo){if(result.changed)realDuringDemo++;}else{if(result.changed)renderRegistry();enqueue(result.effects);}
  renderStats();
}
function connect(){
  bridge?.stop();bridge=B.connect({url:settings.bridgeUrl,identityMode:settings.identityMode,onEvent:receive,onStatus:s=>{
    if(s.state==='missing-identity'){missingId++;renderStats();return;}
    $('connection-dot').classList.toggle('connected',s.state==='connected');
    $('connection-status').textContent=s.state==='connected'?(s.transport==='sdk'?'菘蓝 SDK 已接入':'本地事件通道已连接'):(s.state==='connecting'?'正在连接菘蓝':'等待菘蓝连接');
    $('connection-detail').textContent=s.message||'打开菘蓝后将自动重连';
  }});
}
function fillForms(){
  for(const form of [$('appearance-form'),$('rules-form')])for(const input of form.elements)if(input.name&&Object.hasOwn(settings,input.name))input.value=String(settings[input.name]);
  $('bridge-url').value=settings.bridgeUrl;
}
function renderData(){
  const query=$('search-visitor').value.trim().toLocaleLowerCase(),people=real.visitors.filter(p=>p.nickname.toLocaleLowerCase().includes(query)||(!p.id.startsWith('display:')&&p.id.toLocaleLowerCase().includes(query)));
  const container=$('data-list');container.replaceChildren();$('search-summary').textContent='共 '+people.length+' 位'+(people.length>80?'，显示前 80 位；可搜索缩小范围':'');
  for(const p of people.slice(0,80)){const row=document.createElement('div');row.className='data-row';const text=document.createElement('span'),name=document.createElement('strong'),id=document.createElement('small'),score=document.createElement('span'),edit=document.createElement('button');name.textContent=p.nickname;id.textContent=p.id.startsWith('display:')?'昵称＋头像识别':'ID · '+p.id;score.textContent=E.getLevel(p.points,settings).title+' · '+p.points+' 分';edit.type='button';edit.className='rename-person';edit.textContent='修改名字';edit.setAttribute('aria-label','修改'+p.nickname+'的名字');edit.onclick=()=>openRename(p.id);text.append(name,id);score.append(edit);row.append(text,score);container.append(row);}
}
function openRename(sourceId){
  const source=real.visitors.find(v=>v.id===sourceId);if(!source){notice('该观众档案已变更，请重新选择。');return;}
  let mergeSignature=null,previewMergeSignature=null;
  const destinationId=()=>sourceId.startsWith('display:')?'display:'+JSON.stringify([$('rename-nickname').value.trim(),JSON.parse(sourceId.slice(8))[1]]):sourceId;
  const preview=()=>{
    $('confirm-error').textContent='';$('rename-merge').checked=false;mergeSignature=null;previewMergeSignature=null;
    try{const current=real.visitors.find(v=>v.id===sourceId),target=real.visitors.find(v=>v.id===destinationId()&&v.id!==sourceId);if(!current)throw Error('原档案已发生变化，请重新选择');
      $('merge-choice').hidden=!target;
      if(target){previewMergeSignature=JSON.stringify([current.id,current.points,target.id,target.points]);$('rename-preview').textContent='新昵称已有同头像档案：'+current.points+' + '+target.points+' = '+(current.points+target.points)+' 分。合并后保留最早登记时间，并只保留一份档案。';}
      else $('rename-preview').textContent='保留 '+current.points+' 分、'+E.getLevel(current.points,settings).title+' 与原登记时间。请填写观众实际的新昵称，头像变化仍需另行核对。';
    }catch(error){$('merge-choice').hidden=true;$('rename-preview').textContent=error.message;}
  };
  confirm('修改观众名字','当前昵称：'+source.nickname+'\n保存后，新昵称的弹幕和礼物将继续使用这份档案。',()=>{
    try{
      if($('rename-merge').checked){const current=real.visitors.find(v=>v.id===sourceId),target=real.visitors.find(v=>v.id===destinationId()&&v.id!==sourceId),liveSignature=target&&current?JSON.stringify([current.id,current.points,target.id,target.points]):null;if(!liveSignature||mergeSignature!==liveSignature){preview();$('confirm-error').textContent='积分或档案发生变化，请重新核对后勾选合并。';return;}}
      const candidate=E.renameVisitor(real,sourceId,$('rename-nickname').value,{mergeDuplicate:$('rename-merge').checked});
      if(!save(candidate,settings)){ $('confirm-error').textContent='保存失败，旧档案和名字均未替换。请先处理控制台中的存储提示。';return;}
      real=candidate;revision++;closeConfirm();renderRegistry();renderStats();renderData();notice('名字已修改，积分和等级已保留。');
    }catch(error){$('confirm-error').textContent=error.message;}
  },'保存名字');
  $('rename-fields').hidden=false;$('rename-nickname').value=source.nickname;$('rename-nickname').oninput=preview;
  $('rename-merge').onchange=()=>{mergeSignature=$('rename-merge').checked?previewMergeSignature:null;};
  preview();$('rename-nickname').focus();$('rename-nickname').select();
}
function selectTab(name){for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-current',b.dataset.tab===name?'page':'false');}for(const pane of document.querySelectorAll('[data-pane]'))pane.hidden=pane.dataset.pane!==name;if(name==='data')renderData();}
function openPanel(){if(panelOpen)return;panelOpen=true;lastFocus=document.activeElement;$('panel-backdrop').hidden=false;fillForms();renderStats();$('close-panel').focus();}
function closePanel(){if(confirmAction)return;panelOpen=false;$('panel-backdrop').hidden=true;lastFocus?.focus?.();}
function confirm(title,copy,yes,label='确认'){confirmAction=yes;$('rename-fields').hidden=true;$('confirm-error').textContent='';$('confirm-title').textContent=title;$('confirm-copy').textContent=copy;$('confirm-yes').textContent=label;$('confirm-backdrop').hidden=false;$('confirm-no').focus();}
function closeConfirm(){confirmAction=null;$('confirm-backdrop').hidden=true;if(panelOpen)$('settings-panel').focus();}
function enterDemo(){
  if(demo)return;demo=E.createState();const names=['月见','星野','夜航船','浅夏','听风'],scores=[0,settings.starThreshold,settings.guardianThreshold,0,settings.starThreshold];
  names.forEach((nickname,i)=>{const id='demo-'+String(i+1).padStart(3,'0');E.processEvent(demo,{type:'chat',userId:id,nickname,text:settings.registerKeyword,eventId:'seed-'+i},settings,Date.now());demo.visitors[i].points=scores[i];});
  clearEffects();realDuringDemo=0;listIndex=0;$('test-marker').hidden=false;$('demo-start').hidden=true;$('demo-stop').hidden=false;$('demo-controls').hidden=false;$('demo-result').textContent='预演已开始，真实名册保持不变。';renderRegistry();
}
function exitDemo(){if(!demo)return;demo=null;clearEffects();listIndex=0;$('test-marker').hidden=true;$('demo-start').hidden=false;$('demo-stop').hidden=true;$('demo-controls').hidden=true;renderRegistry();notice('已恢复真实名册'+(realDuringDemo?'；预演期间另保存了 '+realDuringDemo+' 次真实互动':'')+'。');}
function demoEvent(type){
  if(!demo)return;const id=$('demo-id').value.trim(),nickname=$('demo-name').value.trim();if(!id||!nickname){$('demo-result').textContent='请填写模拟观众 ID 和昵称。';return;}
  const event={type:type==='gift'?'gift':'chat',userId:id,nickname,eventId:'demo-'+Date.now()+'-'+Math.random()};
  if(type==='register')event.text=settings.registerKeyword;else if(type==='bless')event.text=settings.blessingKeyword;else if(type==='chat')event.text='凛序，今天也要开心！';else event.count=10;
  const result=E.processEvent(demo,event,settings,Date.now());renderRegistry();enqueue(result.effects);
  const p=demo.visitors.find(v=>v.id===id);$('demo-result').textContent=(p?nickname+' · '+E.getLevel(p.points,settings).title+' · '+p.points+' 分':'此观众尚未登记')+'。'+(result.effects.some(e=>e.type==='blessing')?'祝福已加入展示队列。':(!result.changed?'未产生变更：重复登记、冷却中或尚未登记。':'已更新演示名册。'));
}
function download(){
  const blob=new Blob([JSON.stringify(payload())],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='异世界名册备份-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);notice('已导出真实名册与设置备份。');
}
async function importFile(file){
  const token=++importToken;if(!file)return;
  if(!/\.json$/i.test(file.name)||file.size>MAX_FILE||file.size===0){notice('请选择不超过 256 MB 的 JSON 备份文件。');return;}
  try{const text=await file.text();if(token!==importToken)return;const candidate=parseBackup(JSON.parse(text));
    const preview=()=>{const atRevision=revision;confirm('替换真实名册',file.name+'\n备份含 '+candidate.state.visitors.length+' 位访客，将替换当前 '+real.visitors.length+' 位访客，并恢复备份的外观与互动规则。\n若昵称或头像发生变化，新旧身份不会自动合并。',()=>{
      if(token!==importToken){closeConfirm();return;}
      if(revision!==atRevision){closeConfirm();notice('预览期间收到了新的真实互动，请重新核对当前人数。');preview();return;}
      if(!save(candidate.state,candidate.settings,true)){closeConfirm();notice('保存失败，当前名册未替换。');return;}
      real=candidate.state;settings=candidate.settings;revision++;if(demo)exitDemo();clearEffects();listIndex=0;closeConfirm();fillForms();applyAppearance();renderStats();connect();notice('备份已导入，名册与设置已恢复。');
    },'确认替换');};preview();
  }catch(error){if(token===importToken)notice('无法导入：'+error.message+'。当前名册未替换。');}
}
function saveForm(form,feedback){
  try{const next={...settings};for(const input of form.elements)if(input.name)next[input.name]=input.type==='number'?Number(input.value):input.value;
    const prefs=validatePrefs(next);settings=prefs;revision++;const ok=save();applyAppearance();renderStats();feedback.textContent=ok?'已保存，直播画面已更新。':'已在本页应用；存储失败，请导出备份。';
  }catch(error){feedback.textContent=error.message;}
}
load();
$('close-panel').onclick=closePanel;$('panel-backdrop').addEventListener('click',e=>{if(e.target===$('panel-backdrop'))closePanel();});
document.addEventListener('dblclick',e=>{if(!e.target.closest('#settings-panel,#confirm-backdrop'))openPanel();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();if(confirmAction){importToken++;closeConfirm();}else if(panelOpen)closePanel();else openPanel();return;}
  if(e.key==='Tab'&&(panelOpen||confirmAction)){const root=confirmAction?$('confirm-backdrop'):$('settings-panel');const nodes=Array.from(root.querySelectorAll('button,input,select,[tabindex="0"]')).filter(n=>!n.disabled&&n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){last.focus();e.preventDefault();}else if(!e.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){first.focus();e.preventDefault();}}
});
for(const tab of document.querySelectorAll('[data-tab]'))tab.onclick=()=>selectTab(tab.dataset.tab);
$('appearance-form').onsubmit=e=>{e.preventDefault();saveForm(e.currentTarget,$('appearance-feedback'));};$('rules-form').onsubmit=e=>{e.preventDefault();saveForm(e.currentTarget,$('rules-feedback'));};
$('demo-start').onclick=enterDemo;$('demo-stop').onclick=exitDemo;
for(const [id,type] of [['demo-register','register'],['demo-chat','chat'],['demo-gift','gift'],['demo-bless','bless']])$(id).onclick=()=>demoEvent(type);
for(const button of document.querySelectorAll('[data-preview-role]'))button.onclick=()=>{if(!demo)return;const index=Number(button.dataset.previewRole),points=[0,settings.starThreshold,settings.guardianThreshold][index];clearEffects();enqueue([{type:'blessing',nickname:['月见','星野','夜航船'][index],level:E.getLevel(points,settings)}]);$('demo-result').textContent='正在预演'+E.getLevel(points,settings).title+'卡面；真实名册不受影响。';};
$('reconnect').onclick=()=>{try{settings=validatePrefs({...settings,bridgeUrl:$('bridge-url').value.trim()});revision++;save();connect();notice('已更新地址，正在重新连接菘蓝。');}catch(error){notice(error.message);}};
$('search-visitor').oninput=renderData;$('export-backup').onclick=download;$('choose-import').onclick=()=>$('import-file').click();$('import-file').onchange=e=>{const file=e.target.files[0];e.target.value='';importFile(file);};
$('confirm-no').onclick=()=>{importToken++;closeConfirm();};$('confirm-yes').onclick=()=>{if(confirmAction)confirmAction();};
$('request-reset').onclick=()=>{const at=revision;confirm('清空全部登记和积分？','当前真实名册有 '+real.visitors.length+' 位访客。此操作无法撤销，建议先取消并导出备份。',()=>{
  if(at!==revision){closeConfirm();notice('确认期间名册发生变化，请重新核对后清空。');return;}const empty=E.createState();if(!save(empty,settings,true)){closeConfirm();notice('保存失败，名册未清空。');return;}real=empty;revision++;if(demo)exitDemo();clearEffects();listIndex=0;closeConfirm();renderRegistry();renderStats();notice('真实名册已清空。');
},'确认清空');};
window.addEventListener('resize',()=>{sizeRows();renderRegistry();});motionQuery.addEventListener?.('change',applyAppearance);
window.addEventListener('storage',event=>{if(event.key!==KEY&&event.key!==null)return;if(event.newValue===lastStored)return;storageBlocked=true;revision++;showStorage('另一个页面已更新存档，本页已暂停写入以保护最新记录。请先导出本页备份，再刷新读取最新名册；直播时只保留一个接收事件的插件实例。');});
window.addEventListener('pagehide',()=>{bridge?.stop();});
window.addEventListener('pageshow',e=>{if(e.persisted)connect();});
sparkField();fillForms();applyAppearance();renderStats();connect();
if(storageMessage)notice('旧存档未能读取，已保留原记录。双击画面查看详情。');
// A first-use hint disappears by itself; live overlay controls stay hidden.
else if(!real.visitors.length)notice('双击画面打开设置 · 可预演登记与祝福效果');
})();
