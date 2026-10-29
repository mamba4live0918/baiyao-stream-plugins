(function () {
'use strict';
const C = PuppetCore, $ = id => document.getElementById(id);
const labels = {hit:'打脸',hitHead:'打头',pinchLeft:'捏左',pinchRight:'捏右',pinch:'捏',kick:'踢'};
const clone = obj => JSON.parse(JSON.stringify(obj));
const loaded = C.loadConfig();
let config = loaded.value, storageLocked = !loaded.ok;
let profileID = 'demo', layout, action = 'hit', anchor = 'hit';
let live = false, busy = false, queue = [], currentAbort = null;
let demoController = null;
let pendingImport = null, importGeneration = 0, toastTimer, audioContext;
let giftSocket = null, giftReconnect = null, giftWanted = false, sdkBound = false;
const seenEvents = new Map();
const temporaryProfiles = new Map();
function toast(text, persistent = false) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); if (!persistent) toastTimer = setTimeout(() => {$('toast').hidden = true;}, 4800);
}
function storageWarning(text) { $('storage-warning').textContent = text; $('storage-warning').hidden = false; }
if (!loaded.ok) storageWarning('旧配置读取失败，当前页临时使用，旧记录不会自动覆盖。可导入有效备份后确认替换。' + loaded.error);
function profile() {
  if (!Object.hasOwn(config.profiles, profileID)) {
    if (Object.keys(config.profiles).length >= 100) {
      if (!temporaryProfiles.has(profileID)) temporaryProfiles.set(profileID,C.defaultProfile(profileID,profileID==='demo'?'演示配置':(client.model?.modelName||profileID)));
      return temporaryProfiles.get(profileID);
    }
    config.profiles[profileID] = C.defaultProfile(profileID, profileID === 'demo' ? '演示配置' : (client.model?.modelName || profileID));
  }
  return config.profiles[profileID];
}
function key() {return C.aspectKey(config.scene.width, config.scene.height);}
function remember() { profile().layouts[key()] = clone(layout); }
function persist(show = false) {
  remember();
  if (!Object.hasOwn(config.profiles,profileID) && profileID!=='demo') {
    storageWarning('已有100套模型配置，当前新模型仅在本页临时适配。请先导出并整理已有配置。');
    return false;
  }
  if (storageLocked) { if (show) toast('本页临时使用：旧配置读取失败，请先导入有效备份；原记录未覆盖。'); return false; }
  const saved = C.saveConfig(undefined, config);
  if (!saved.ok) { storageWarning('保存失败，当前页可临时使用。关闭前请导出配置。' + saved.error); if (show) toast('未能持久保存，请导出配置备份。'); return false; }
  $('storage-warning').hidden = true; if (show) toast('配置已保存到当前浏览器。'); return true;
}
function updateQueue() { $('queue-state').textContent = '队列 ' + queue.length + (busy ? ' · 动作中' : ''); }
function stopAll(message) {
  live = false; $('enable-live').checked = false; queue = [];
  demoController?.cancel();
  if (currentAbort) currentAbort.abort();
  updateQueue(); if (message) toast(message);
}
const client = new PuppetVTS.Client({
  onStatus(status,text) {
    $('connection-state').textContent = text || status;
    $('connection-state').className = 'state ' + status;
    const connected = !!client.authenticated;
    $('disconnect-vts').hidden = !connected;
    $('refresh-vts').hidden = !connected;
    $('test-action').disabled = !connected || !client.model;
    $('demo-actions').disabled = !connected || !client.model;
    if (['disconnected','error','no-model'].includes(status)) stopAll();
    if (status === 'connected') renderBindings();
  },
  onModel(model) {
    stopAll();
    remember();
    const id = model?.modelID || 'demo';
    if (['__proto__','constructor','prototype'].includes(id)) {toast('模型标识无效，已停止互动。'); return;}
    profileID = id;
    try { layout = C.ensureLayout(profile(), config.scene.width,config.scene.height); renderAll(); }
    catch (error) { toast(error.message); }
  },
  onError(error) { toast(error?.message || String(error)); }
});
layout = C.ensureLayout(profile(),config.scene.width,config.scene.height);
anchor=layout.settings.hit.hitTarget==='head'?'hitHead':'hit';


function loadProfile() {layout = C.ensureLayout(profile(),config.scene.width,config.scene.height);}
function syncResolutionControls() {
  const {width:w,height:h}=config.scene;
  $('scene-width').value=w;$('scene-height').value=h;
  const preset=w+'x'+h;
  $('resolution-select').value=[...$('resolution-select').options].some(o=>o.value===preset)?preset:'custom';
  $('custom-resolution').hidden=$('resolution-select').value!=='custom';
  window.PuppetSelects?.refresh($('resolution-select'));
}
function renderScene() {
  const {width:w,height:h} = config.scene;
  const fit = C.fitRect(w,h,window.innerWidth,window.innerHeight);
  Object.assign($('world').style,{width:w+'px',height:h+'px',left:fit.left+'px',top:fit.top+'px',transform:'scale('+fit.scale+')'});
  const shell = $('preview-shell');
  const maxW = Math.max(1,shell.clientWidth - 2), maxH = window.innerWidth < 700 ? 430 : 365;
  const previewFit = C.fitRect(w,h,maxW,maxH);
  Object.assign($('preview').style,{width:previewFit.width+'px',height:previewFit.height+'px',aspectRatio:w+'/'+h});
  $('canvas-info').textContent = key() + ' · 当前窗口 ' + window.innerWidth + '×' + window.innerHeight;
  positionMarkers();
}
function createMarkers() {
  for (const id of ['preview-markers','live-markers']) {
    $(id).replaceChildren();
    for (const name of ['hit','hitHead','pinchLeft','pinchRight','kick']) {
      const el = document.createElement(id === 'preview-markers' ? 'button' : 'div');
      el.className = 'marker '+name; el.dataset.anchor = name;
      if (el.tagName === 'BUTTON') {el.type='button'; el.setAttribute('aria-label','拖动'+labels[name]+'准星');}
      const cross = document.createElement('span'); cross.className='cross';
      const label = document.createElement('strong'); label.textContent=labels[name];
      el.append(cross,label); $(id).append(el);
    }
  }
}
function positionMarkers() {
  if (!layout) return;
  document.querySelectorAll('.marker').forEach(el=>{
    const name = el.dataset.anchor, point=layout.anchors[name];
    el.style.left=point.x*100+'%'; el.style.top=point.y*100+'%';
    el.classList.toggle('selected',name===anchor);
    if (el.parentNode.id==='live-markers') el.style.transform = 'translate(-50%,-50%) scale('+(Math.min(config.scene.width,config.scene.height)/600)+')';
  });
  $('anchor-select').value=anchor;
  if(document.activeElement!==$('anchor-x'))$('anchor-x').value=+(layout.anchors[anchor].x*100).toFixed(2);
  if(document.activeElement!==$('anchor-y'))$('anchor-y').value=+(layout.anchors[anchor].y*100).toFixed(2);
  $('calibration-state').textContent=layout.calibrated ? key()+' 已校准' : key()+' 待校准';
  $('calibration-state').style.color=layout.calibrated?'var(--accent)':'var(--orange)';
  window.PuppetSelects?.refresh($('anchor-select'));
}
function selectOptions(select,items,value,first) {
  const targetItems=[{label:first,value:''},...items];
  if(value&&!items.some(item=>item.value===value))targetItems.push({label:'未找到：'+value,value});
  if(select.options.length===targetItems.length&&targetItems.every((item,i)=>select.options[i].value===item.value&&select.options[i].text===item.label)){if(select.value!==value)select.value=value;return;}
  select.replaceChildren(new Option(first,''));
  for (const item of items) select.add(new Option(item.label,item.value));
  if (value && !items.some(item=>item.value===value)) select.add(new Option('未找到：'+value,value));
  select.value=value;
}
function renderBindings() {
  if (!layout) return;
  const settings=layout.settings[action];
  selectOptions($('action-hotkey'),(client.hotkeys||[]).map(h=>({label:(h.name||h.hotkeyID)+(h.type?' · '+h.type:''),value:h.hotkeyID})),settings.hotkeyID,'不触发');
  selectOptions($('action-parameter'),(client.inputs||[]).filter(p=>action!=='pinch'||!/^Face(?:Angle|Position)[XYZ]$/.test(p.name)).map(p=>({label:p.name+' ['+p.min+', '+p.max+']',value:p.name})),settings.parameter,'只使用通用反馈');
  window.PuppetSelects?.refresh();
}
function renderPinchLook() {
  const settings=layout.settings.pinch;
  if(document.activeElement!==$('pinch-skin-color'))$('pinch-skin-color').value=settings.skinColor;
  $('skin-swatch').style.backgroundColor=settings.skinColor;
  document.querySelectorAll('[data-skin-color]').forEach(button=>{const chosen=button.dataset.skinColor===settings.skinColor;button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',chosen);});
  $('pinch-mark-scale').value=settings.pinchMarkScale*100;$('mark-scale-value').textContent=Math.round(settings.pinchMarkScale*100)+'%';
  $('pinch-mark-opacity').value=settings.pinchMarkOpacity*100;$('mark-opacity-value').textContent=Math.round(settings.pinchMarkOpacity*100)+'%';
}
function renderAction() {
  const settings=layout.settings[action];
  document.querySelectorAll('[data-action]').forEach(el=>{const selected=el.dataset.action===action;el.classList.toggle('selected',selected);el.setAttribute('aria-selected',selected);});
  PuppetEffects.icon($('action-icon'),action,settings.variant);
  $('action-title').textContent={hit:settings.hitTarget==='head'?'头顶拍击':'贴合打脸',pinch:'持续夹捏',kick:'旋转踢飞'}[action];
  $('action-description').textContent={hit:settings.hitTarget==='head'?'从上拍下，接触压痕配合低头回弹。':'掌心对齐脸颊，接触压缩后留下短暂肤色掌印。',pinch:'头部不随动作摆动；手指夹合、捏痕拉扯后慢慢淡出。',kick:'命中后向远处飞出、转两圈并缩小，再飞回原位。'}[action];
  $('action-size').value=settings.size*100; $('size-value').textContent=Math.round(settings.size*100)+'%';
  if(document.activeElement!==$('action-size-number'))$('action-size-number').value=Math.round(settings.size*100);
  $('effect-size-row').hidden=action==='pinch';$('action-effect-scale').value=settings.effectScale*100;$('effect-scale-value').textContent=Math.round(settings.effectScale*100)+'%';
  $('hit-extra').hidden=action!=='hit';$('hit-target').value=layout.settings.hit.hitTarget;
  $('hit-contact-scale').value=layout.settings.hit.contactScale*100;$('contact-scale-value').textContent=Math.round(layout.settings.hit.contactScale*100)+'%';
  if(document.activeElement!==$('hit-skin-color'))$('hit-skin-color').value=layout.settings.hit.skinColor;
  $('kick-shrink-row').hidden=action!=='kick';$('kick-shrink').value=layout.settings.kick.kickShrink*100;$('kick-shrink-value').textContent=Math.round(layout.settings.kick.kickShrink*100)+'%';
  $('action-intensity').value=settings.intensity*100; $('intensity-value').textContent=Math.round(settings.intensity*100)+'%';
  $('action-duration').max=action==='pinch'?'15':'5';$('action-duration').value=settings.duration; $('duration-value').textContent=settings.duration.toFixed(1)+' 秒';
  $('action-direction').value=settings.direction||'left';
  $('kick-variant-row').hidden=action!=='kick';$('kick-variant').value=settings.variant||'shoe';
  $('pinch-extra').hidden=action!=='pinch'; $('parameter-value').value=settings.parameterValue;
  renderPinchLook();renderBindings();
}
function renderRules() {
  $('gift-rules').replaceChildren();
  config.rules.forEach((rule,i)=>{
    const row=document.createElement('div');row.className='rule-row';
    const name=document.createElement('input');name.className='rule-name';name.value=rule.name;name.placeholder='输入准确礼物名';name.maxLength=128;name.setAttribute('aria-label','礼物名称 '+(i+1));
    const kind=document.createElement('select');kind.className='rule-action';kind.setAttribute('aria-label','礼物动作 '+(i+1));
    for(const [k,label]of [['hit','打'],['pinch','捏'],['kick-shoe','穿鞋踢'],['kick-barefoot','赤脚踢']])kind.add(new Option(label,k));kind.value=rule.action==='kick'?'kick-'+(rule.variant||'shoe'):rule.action;
    const count=document.createElement('input');count.className='rule-count';count.type='number';count.min=1;count.max=100;count.step=1;count.value=rule.count;count.setAttribute('aria-label','每个礼物触发次数 '+(i+1));
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','删除规则 '+(i+1));
    remove.onclick=()=>{stopAll();syncRules(false);config.rules.splice(i,1);renderRules();};
    for(const el of [name,kind,count])el.addEventListener('input',()=>{if(live)stopAll('规则编辑中，礼物互动已暂停。');});
    row.append(name,kind,count,remove);$('gift-rules').append(row);
  });
  $('rules-empty').hidden=config.rules.length>0;
}
function syncRules(show=true) {
  const rules=[...document.querySelectorAll('.rule-row')].map(row=>{const value=row.querySelector('.rule-action').value,isKick=value.startsWith('kick-');return {name:row.querySelector('.rule-name').value.trim(),action:isKick?'kick':value,count:Number(row.querySelector('.rule-count').value),...(isKick?{variant:value.slice(5)}:{})};});
  const names=rules.filter(r=>r.name).map(r=>r.name);
  if(new Set(names).size!==names.length){if(show)toast('同一个礼物只能绑定一条规则，请合并重复礼物。');return false;}
  const checked=C.validateConfig({...config,rules});
  if(!checked.ok){if(show)toast(checked.error);return false;}
  config.rules=checked.value.rules;return true;
}
function renderAll() {
  $('model-name').textContent=profile().name+(profileID==='demo'?' · 未连接皮套':'');
  $('vts-port').value=config.port; $('volume').value=config.volume*100;$('volume-value').textContent=Math.round(config.volume*100)+'%';
  renderAction();positionMarkers();renderScene();
}
function dirtyCalibration() {layout.calibrated=false;if(live)stopAll('准星已更改，请保存校准后重新启用。');positionMarkers();}
function applyResolution(w,h) {
  if(!C.validateResolution(w,h)){toast('宽高需为320–7680之间的整数。');return;}
  if(w===config.scene.width&&h===config.scene.height){syncResolutionControls();return;}
  stopAll();remember();const oldKey=key();config.scene={width:w,height:h};loadProfile();syncResolutionControls();renderAll();persist();
  toast(oldKey===key()?'已按比例换算，保留当前校准。':(layout.calibrated?'已载入该长宽比的独立校准。':'新的长宽比，请重新调整准星并保存校准。'));
}
function playSound(kind) {
  if(config.volume<=0)return;
  try {
    if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
    const t=audioContext.currentTime,g=audioContext.createGain(),o=audioContext.createOscillator();
    o.type=kind==='pinch'?'sine':'triangle';o.frequency.setValueAtTime(kind==='kick'?150:kind==='hit'?340:620,t);o.frequency.exponentialRampToValueAtTime(kind==='pinch'?850:50,t+.12);
    g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(Math.max(.002,config.volume*.25),t+.008);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+.2);
  }catch(_){}
}
function visualAction(kind,settings,currentLayout,signal) {
  const layers=[$('effects')];if(!$('settings-backdrop').hidden)layers.push($('preview-effects'));
  const soundTimer=setTimeout(()=>{if(!signal?.aborted)playSound(kind);},settings.duration*100);
  const cancelSound=()=>clearTimeout(soundTimer);
  signal?.addEventListener('abort',cancelSound,{once:true});
  return PuppetEffects.play({kind,settings,anchors:currentLayout.anchors,layers,signal}).finally(()=>{clearTimeout(soundTimer);signal?.removeEventListener('abort',cancelSound);});
}
async function runOne(job, externalSignal) {
  busy=true;currentAbort=new AbortController();updateQueue();
  const controller=currentAbort;
  const externalAbort=()=>controller.abort();
  externalSignal?.addEventListener('abort',externalAbort,{once:true});
  if(externalSignal?.aborted)controller.abort();
  let visualPromise;
  try {
    await PuppetEffects.preload();
    if(controller.signal.aborted)return;
    if(job.real){
      if(!client.authenticated||client.model?.modelID!==job.profileID)throw new Error('模型或连接已改变，动作取消。');
      await PuppetVTS.runAction(client,job.action,job.settings,{signal:controller.signal,onImpact(){visualPromise=visualAction(job.action,job.settings,job.layout,controller.signal);}});
      if(visualPromise)await visualPromise;
    }else await visualAction(job.action,job.settings,job.layout,controller.signal);
  }catch(error){if(error.name!=='AbortError'){stopAll();toast('动作停止：'+error.message);}}
  finally{externalSignal?.removeEventListener('abort',externalAbort);if(currentAbort===controller)currentAbort=null;busy=false;updateQueue();}
}
demoController = window.PuppetDemo?.create({
  sequence:['hit-face','hit-head','pinch','kick-shoe','kick-barefoot'],
  ready:()=>client.authenticated&&client.model?.modelID===profileID&&layout.calibrated,
  onCountdown:seconds=>{if(seconds>0)toast('实机演示将在 '+seconds+' 秒后开始。');},
  play:async(step,signal)=>{const kind=step.startsWith('kick-')?'kick':step.startsWith('hit-')?'hit':step,settings=clone(layout.settings[kind]);if(step.startsWith('kick-'))settings.variant=step.slice(5);if(step.startsWith('hit-'))settings.hitTarget=step.slice(4);toast('实机演示：'+(kind==='hit'?(settings.hitTarget==='head'?'打头':'打脸'):labels[kind])+(kind==='kick'?(settings.variant==='barefoot'?'（赤脚）':'（穿鞋）'):(kind==='pinch'?'（肤色捏痕 · '+settings.duration.toFixed(1)+'秒）':'')));await runOne({action:kind,settings,layout:clone(layout),profileID,real:true},signal);},
  onDone:()=>toast('打、捏、穿鞋踢、赤脚踢演示结束。'),
  onError:error=>toast('演示停止：'+error.message)
});
async function pump() {if(busy)return;while(queue.length){const job=queue.shift();await runOne(job);}updateQueue();}
function enqueue(kind,count,real,variant) {
  if(demoController?.running){toast('演示正在进行，请先停止全部再单独测试。');return false;}
  if(!Number.isInteger(count)||count<1||count>100){toast('单批动作需为1–100次，本批未执行。');return false;}
  if(queue.length+count+(busy?1:0)>200){toast('动作队列已满（最多200次），本批未加入。');return false;}
  for(let i=0;i<count;i++)queue.push({action:kind,settings:{...clone(layout.settings[kind]),...(kind==='kick'&&variant?{variant}:{})},layout:clone(layout),profileID,real});
  updateQueue();pump();return true;
}
function receiveGift(raw) {
  if(!live)return;
  const normalized=C.normalizeGift(raw);
  if(!normalized.ok){toast('礼物未执行：'+normalized.error);return;}
  const gift=normalized.value;
  if(gift.eventId){if(seenEvents.has(gift.eventId))return;seenEvents.set(gift.eventId,Date.now());if(seenEvents.size>2000)seenEvents.delete(seenEvents.keys().next().value);}
  const rule=config.rules.find(r=>r.name&&r.name===gift.name);
  if(!rule)return;
  if(!client.authenticated||client.model?.modelID!==profileID||!layout.calibrated){stopAll('模型未连接或尚未校准，礼物互动已暂停。');return;}
  if(enqueue(rule.action,rule.count*gift.count,true,rule.variant))toast(gift.name+' ×'+gift.count+' → '+labels[rule.action]+(rule.action==='kick'?(rule.variant==='barefoot'?'（赤脚）':'（穿鞋）'):'')+' '+rule.count*gift.count+'次');
}
function attachSDK() {
  if(sdkBound)return;
  const sdk=window.SonglanPlugin;
  if(!sdk||typeof sdk.onGift!=='function')return;
  sdkBound=true;giftWanted=false;clearTimeout(giftReconnect);if(giftSocket)giftSocket.close();
  sdk.onGift(receiveGift);$('gift-state').textContent='已接入菘蓝 SDK';$('connect-gifts').hidden=true;
}
function connectGiftSocket() {
  if(sdkBound)return;
  if(giftSocket&&[0,1].includes(giftSocket.readyState))return;
  giftWanted=true;$('gift-state').textContent='礼物通道连接中…';
  try {
    const socket=new WebSocket('ws://127.0.0.1:9910');giftSocket=socket;
    socket.onopen=()=>{if(sdkBound||socket!==giftSocket){socket.close();return;}socket.send(JSON.stringify({action:'identify',module:'自定义插件'}));$('gift-state').textContent='已连接本机礼物通道 9910';};
    socket.onmessage=event=>{if(sdkBound||socket!==giftSocket)return;try{const data=JSON.parse(event.data);if(data.type==='gift')receiveGift(data.data||data);}catch(_){}};
    socket.onerror=()=>{};
    socket.onclose=()=>{if(socket!==giftSocket||sdkBound)return;stopAll('礼物通道已断开，重连后请重新启用互动。');$('gift-state').textContent=giftWanted?'礼物通道断开，等待重连':'礼物通道未连接';if(giftWanted)giftReconnect=setTimeout(connectGiftSocket,3000);};
  }catch(error){$('gift-state').textContent='礼物通道连接失败';toast(error.message);}
}
function closeSettings() { $('settings-backdrop').hidden=true;$('live-markers').hidden=!$('show-markers').checked;$('reopen').hidden=!$('show-markers').checked;$('reopen').textContent='返回设置'; }
function openSettings() { $('settings-backdrop').hidden=false;renderScene();$('close-settings').focus(); }
$('close-settings').onclick=closeSettings;$('hide-settings').onclick=closeSettings;$('reopen').onclick=openSettings;
$('settings-backdrop').addEventListener('click',event=>{if(event.target===$('settings-backdrop'))closeSettings();});
document.addEventListener('dblclick',event=>{if($('settings-backdrop').hidden)openSettings();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('import-dialog').open)closeSettings();});
$('connect-vts').onclick=async()=>{
  const port=Number($('vts-port').value);if(!Number.isInteger(port)||port<1||port>65535){toast('端口需为1–65535之间的整数。');return;}
  config.port=port;$('connect-vts').disabled=true;
  try{await client.connect(port);renderBindings();persist();}catch(error){toast('VTS连接失败：'+error.message);}finally{$('connect-vts').disabled=false;}
};
$('disconnect-vts').onclick=()=>{stopAll();client.disconnect();};
$('refresh-vts').onclick=async()=>{try{await client.refresh();renderBindings();toast('已刷新模型与可用动作。');}catch(error){toast(error.message);}};
$('resolution-select').onchange=()=>{const value=$('resolution-select').value;if(value==='custom'){$('custom-resolution').hidden=false;return;}const[w,h]=value.split('x').map(Number);applyResolution(w,h);};
$('apply-resolution').onclick=()=>applyResolution(Number($('scene-width').value),Number($('scene-height').value));
$('anchor-select').onchange=()=>{anchor=$('anchor-select').value;positionMarkers();};
for(const axis of ['x','y']) {
  const input=$('anchor-'+axis);
  input.oninput=()=>{const value=Number(input.value);if(input.value!==''&&Number.isFinite(value)&&value>=0&&value<=100){layout.anchors[anchor][axis]=value/100;dirtyCalibration();}};
  input.onchange=()=>{const value=Number(input.value);if(input.value===''||!Number.isFinite(value)||value<0||value>100){toast('准星百分比需在0–100之间。');input.value=+(layout.anchors[anchor][axis]*100).toFixed(2);return;}layout.anchors[anchor][axis]=value/100;dirtyCalibration();};
}
let dragging=null;
for(const markerLayer of [$('preview-markers'),$('live-markers')]) {
markerLayer.addEventListener('pointerdown',event=>{
  const target=event.target.closest('[data-anchor]');if(!target)return;
  // Commit the old anchor's numeric edit before switching the drag target.
  if(document.activeElement===$('anchor-x')||document.activeElement===$('anchor-y'))document.activeElement.blur();
  event.preventDefault();anchor=target.dataset.anchor;dragging=anchor;
  markerLayer.setPointerCapture(event.pointerId);positionMarkers();
});
markerLayer.addEventListener('pointermove',event=>{if(!dragging)return;layout.anchors[dragging]=C.clientToNormalized(event.clientX,event.clientY,$(markerLayer.id==='preview-markers'?'preview':'world').getBoundingClientRect());dirtyCalibration();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])markerLayer.addEventListener(event,()=>{dragging=null;});
}
$('preview-markers').addEventListener('keydown',event=>{const target=event.target.closest('[data-anchor]');if(!target||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();anchor=target.dataset.anchor;const p=layout.anchors[anchor],step=event.shiftKey ? .01 : .001;const axis=event.key==='ArrowLeft'||event.key==='ArrowRight'?'x':'y';p[axis]=Math.min(1,Math.max(0,p[axis]+(['ArrowLeft','ArrowUp'].includes(event.key)?-step:step)));dirtyCalibration();});
$('show-markers').onchange=()=>{$('live-markers').hidden=!$('show-markers').checked;};
$('calibrate-live').onclick=()=>{stopAll();$('show-markers').checked=true;closeSettings();};
$('save-layout').onclick=()=>{layout.calibrated=true;remember();positionMarkers();const saved=persist(true);if(!saved)toast(Object.hasOwn(config.profiles,profileID)?'校准在本页已生效，但未保存到浏览器，请导出备份。':'模型配置已满，校准仅在本页有效；常规导出不包含当前临时模型。');};
document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>{action=el.dataset.action;anchor=action==='hit'?(layout.settings.hit.hitTarget==='head'?'hitHead':'hit'):action==='pinch'?'pinchLeft':'kick';positionMarkers();renderAction();});
for(const field of ['size','intensity','duration'])$('action-'+field).oninput=()=>{layout.settings[action][field]=Number($('action-'+field).value)/(field==='duration'?1:100);renderAction();};
$('action-size-number').oninput=()=>{const n=Number($('action-size-number').value);if($('action-size-number').value!==''&&Number.isFinite(n)&&n>=2&&n<=100){layout.settings[action].size=n/100;renderAction();}};
$('action-size-number').onchange=()=>{const n=Number($('action-size-number').value);if(!Number.isFinite(n)||n<2||n>100){toast('手脚大小须在2%–100%之间。');$('action-size-number').value=Math.round(layout.settings[action].size*100);}};
$('action-effect-scale').oninput=()=>{layout.settings[action].effectScale=Number($('action-effect-scale').value)/100;renderAction();};
$('hit-target').onchange=()=>{layout.settings.hit.hitTarget=$('hit-target').value;anchor=layout.settings.hit.hitTarget==='head'?'hitHead':'hit';positionMarkers();renderAction();};
$('hit-contact-scale').oninput=()=>{layout.settings.hit.contactScale=Number($('hit-contact-scale').value)/100;renderAction();};
$('hit-skin-color').onchange=()=>{const color=$('hit-skin-color').value.trim();if(/^#[0-9a-f]{6}$/i.test(color))layout.settings.hit.skinColor=color.toLowerCase();else toast('请填写六位肤色，例如 #F9E1D2。');$('hit-skin-color').value=layout.settings.hit.skinColor;};
$('kick-shrink').oninput=()=>{layout.settings.kick.kickShrink=Number($('kick-shrink').value)/100;renderAction();};
$('save-action-settings').onclick=()=>persist(true);
$('action-hotkey').onchange=()=>{layout.settings[action].hotkeyID=$('action-hotkey').value;};
$('action-direction').onchange=()=>{layout.settings[action].direction=$('action-direction').value;};
$('kick-variant').onchange=()=>{layout.settings.kick.variant=$('kick-variant').value;renderAction();};
document.querySelectorAll('[data-skin-color]').forEach(button=>button.onclick=()=>{layout.settings.pinch.skinColor=button.dataset.skinColor;$('pinch-skin-color').value=button.dataset.skinColor;renderPinchLook();});
$('pinch-skin-color').oninput=()=>{const color=$('pinch-skin-color').value.trim();if(/^#[0-9a-fA-F]{6}$/.test(color)){layout.settings.pinch.skinColor=color.toLowerCase();renderPinchLook();}};
$('pinch-skin-color').onchange=()=>{const color=$('pinch-skin-color').value.trim();if(!/^#[0-9a-fA-F]{6}$/.test(color)){toast('请填写六位肤色，例如 #F9E1D2。');$('pinch-skin-color').value=layout.settings.pinch.skinColor;return;}layout.settings.pinch.skinColor=color.toLowerCase();$('pinch-skin-color').value=layout.settings.pinch.skinColor;renderPinchLook();};
$('pinch-mark-scale').oninput=()=>{layout.settings.pinch.pinchMarkScale=Number($('pinch-mark-scale').value)/100;renderPinchLook();};
$('pinch-mark-opacity').oninput=()=>{layout.settings.pinch.pinchMarkOpacity=Number($('pinch-mark-opacity').value)/100;renderPinchLook();};
$('save-pinch-look').onclick=()=>persist(true);
$('action-parameter').onchange=()=>{layout.settings[action].parameter=$('action-parameter').value;};
$('parameter-value').oninput=()=>{const raw=$('parameter-value').value,value=Number(raw);if(raw!==''&&Number.isFinite(value)&&Math.abs(value)<=1000000)layout.settings[action].parameterValue=value;};
$('parameter-value').onchange=()=>{const value=Number($('parameter-value').value);if($('parameter-value').value===''||!Number.isFinite(value)||Math.abs(value)>1000000){toast('参数叠加量无效。');$('parameter-value').value=layout.settings[action].parameterValue;return;}layout.settings[action].parameterValue=value;};
$('preview-action').onclick=()=>enqueue(action,1,false);
$('test-action').onclick=()=>{if(!client.authenticated||!client.model){toast('请先连接 VTS 并载入模型。');return;}enqueue(action,1,true);};
$('demo-actions').onclick=async()=>{
  if(!client.authenticated||!client.model){toast('请先连接 VTS 并载入模型。');return;}
  if(!layout.calibrated){toast('请先调整准星并保存校准。');return;}
  if(busy||queue.length||demoController?.running){toast('请等待当前动作结束，或先停止全部。');return;}
  stopAll();$('show-markers').checked=false;closeSettings();
  try{await demoController.start();}catch(error){if(error.name!=='AbortError')toast('演示停止：'+error.message);}
};
$('add-rule').onclick=()=>{if(!syncRules())return;if(config.rules.length>=100){toast('最多100条礼物规则。');return;}config.rules.push({name:'',action:'hit',count:1});renderRules();};
$('save-rules').onclick=()=>{if(syncRules())persist(true);};
$('connect-gifts').onclick=connectGiftSocket;
$('enable-live').onchange=()=>{
  if(!$('enable-live').checked){stopAll();return;}
  if(demoController?.running){$('enable-live').checked=false;toast('请先停止演示，再启用礼物互动。');return;}
  if(!client.authenticated||!client.model||profileID==='demo'){stopAll('请先连接 VTS 并载入皮套。');return;}
  if(!layout.calibrated){stopAll('请先保存当前分辨率比例的准星校准。');return;}
  if($('show-markers').checked){stopAll('请先关闭“显示直播准星”，再启用礼物互动。');return;}
  if(!syncRules()||!config.rules.some(rule=>rule.name)){stopAll('请先添加有效礼物规则。');return;}
  if(!sdkBound&&giftSocket?.readyState!==1){stopAll('请先接入菘蓝 SDK，或连接本机礼物通道。');return;}
  live=true;persist();toast('礼物互动已启用。');
};
$('stop-all').onclick=()=>stopAll('已停止全部动作并关闭礼物互动。');
$('volume').oninput=()=>{config.volume=Number($('volume').value)/100;$('volume-value').textContent=Math.round(config.volume*100)+'%';};
$('volume').onchange=()=>persist();
$('export-config').onclick=()=>{if(!syncRules())return;remember();const exported=C.exportConfig(config);if(!exported.ok){toast(exported.error);return;}const url=URL.createObjectURL(new Blob([exported.text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='皮套互动-配置.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);if(!Object.hasOwn(config.profiles,profileID))toast('已导出已有配置；当前临时模型未包含，请勿把它视为该模型的备份。',true);};
$('import-config').onclick=()=>{$('import-file').value='';$('import-file').click();};
$('import-file').onchange=async()=>{
  const file=$('import-file').files[0],generation=++importGeneration;if(!file)return;
  if(!/\.json$/i.test(file.name)||file.size>1048576){toast('请选择不超过1MiB的JSON配置文件。');return;}
  try{const text=await file.text();if(generation!==importGeneration)return;const result=C.importConfig(text);if(!result.ok){toast('无法导入：'+result.error);return;}pendingImport=result.value;$('import-summary').textContent='包含 '+Object.keys(pendingImport.profiles).length+' 套模型、'+pendingImport.rules.length+' 条礼物规则。';$('import-dialog').showModal();}catch(error){toast('读取失败：'+error.message);}
};
$('cancel-import').onclick=()=>{pendingImport=null;++importGeneration;$('import-dialog').close();};
$('import-dialog').addEventListener('cancel',()=>{pendingImport=null;++importGeneration;});
$('confirm-import').onclick=()=>{
  if(!pendingImport)return;
  if(profileID!=='demo'&&!Object.hasOwn(pendingImport.profiles,profileID)&&Object.keys(pendingImport.profiles).length>=100){toast('备份已含100套模型且不含当前模型，请先在VTS卸载模型再导入，或整理备份。');return;}
  stopAll();config=pendingImport;pendingImport=null;temporaryProfiles.clear();storageLocked=false;loadProfile();syncResolutionControls();renderRules();renderAll();persist(true);$('import-dialog').close();
};
window.addEventListener('resize',renderScene);new ResizeObserver(()=>renderScene()).observe($('preview-shell'));
window.addEventListener('pagehide',()=>{stopAll();giftWanted=false;clearTimeout(giftReconnect);if(giftSocket)giftSocket.close();client.disconnect();});
createMarkers();renderRules();syncResolutionControls();renderAll();window.PuppetSelects?.setup($('settings'));attachSDK();setInterval(attachSDK,1000);PuppetEffects.preload().catch(error=>toast(error.message));
})();
