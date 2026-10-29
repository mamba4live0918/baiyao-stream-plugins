(()=>{
  'use strict';
  const $=s=>document.querySelector(s),game=new BlockGame();
  const canvas=$('#board'),ctx=canvas.getContext('2d'),holdCanvas=$('#hold'),nextCanvas=$('#next');
  const colors=['','#86cdc7','#efc968','#b9a1d8','#a9c77f','#eba19a','#90b9d9','#ecb17c','#a1ae98'];
  const label={garbage:'塞两行',reverse:'左右反转',rush:'突然加速',fog:'眼前一黑',seal:'封印旋转',challenge:'限时催命',bomb:'救命炸弹',cleanse:'放主播一马'};
  const messages={garbage:'观众给你塞了两行垃圾！找好洞口再下手。',reverse:'左右已经反了！别靠肌肉记忆，12 秒后恢复。',rush:'四倍速来了！趁落地前把位置想好。',fog:'已落方块暂时隐身，预落点也隐藏了。记住堆积位置，9 秒后恢复。',seal:'旋转被封印了！8 秒内只能平移硬扛。',challenge:'15 秒内清掉 2 行，否则从底部顶上来 3 行！',bomb:'救命炸弹挖掉底部 3 行，喘口气吧。',cleanse:'观众心软了：临时折磨和限时任务全部解除。'};
  let last=0,paused=false,sound=false,audio=null,storm=false,nextStorm=0,cooldown=0,lastStatus='',lastMini='',inputClock=0,lastTime=0;
  const held=new Map();
  const live=makeGameLive('blocks',{canRun:()=>game.status==='playing'&&!paused&&game.clock>=cooldown,execute:spec=>receive(spec.kind,spec),onGift:gift=>overtime.onGift(gift)});
  let overtimeRound=null,overtimeLoss=null;
  const overtime=createOvertimeLink({plugin:'俄罗斯方块',settingsKey:'tetris-overtime-settings-v1',roundPrefix:'block-loss',label:'输了一局',onChange:renderOvertime});
  function lossCopy(){
    const result=`本局 ${game.score.toLocaleString()} 分 · 消掉 ${game.lines} 行`;
    if(!overtimeLoss?.seconds)return result;
    // 幕布在直播画面上：只写「加班机」，不带名字
    const where=overtimeLoss.status!=='sent'?'，等连上加班机再加':overtimeLoss.change==='0'?'，加班机已经到点，没再加':'，已加到加班机';
    return`${result}\n加班 +${overtimeLoss.seconds/60} 分钟${where}`;
  }
  function renderOvertime(state){
    $('#overtime-status').textContent=state.enabled?state.statusText:'失败加班已关闭';
    $('.overtime-card').dataset.connected=String(state.enabled&&state.connection==='ready');
    $('#overtime-summary').textContent=`本页已加 ${state.sentCount} 局 · 待发 ${state.pendingCount} 局${state.pendingCount?'（连上自动补发，刷新清空）':''}`;
    $('#overtime-enabled').checked=state.enabled;
    $('#overtime-link').hidden=state.mode==='baiyao'||state.target==='local';
    if(document.activeElement!==$('#overtime-minutes'))$('#overtime-minutes').value=state.minutes;
    if(document.activeElement!==$('#overtime-key'))$('#overtime-key').value=state.key;
    if(overtimeLoss&&state.last?.roundId===overtimeLoss.roundId){overtimeLoss.status=state.last.status;overtimeLoss.change=state.last.change;if(game.status==='over')$('#curtain-copy').textContent=lossCopy();}
  }
  function resize(){
    const dpr=Math.min(2,window.devicePixelRatio||1);
    for(const[c,w,h]of[[canvas,320,640],[holdCanvas,80,80],[nextCanvas,80,224]]){
      c.width=w*dpr;c.height=h*dpr;c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
    }
    lastMini='';render();
  }
  function tile(context,x,y,color,size=32,ghost=false){
    const gap=size*.065,px=x+gap,py=y+gap,s=size-gap*2,r=size*.11;
    context.save();context.beginPath();context.roundRect(px,py,s,s,r);
    if(ghost){context.strokeStyle=color;context.globalAlpha=.4;context.lineWidth=1.7;context.stroke();context.restore();return;}
    context.fillStyle=color;context.fill();
    context.beginPath();context.roundRect(px+2,py+2,s-4,s*.28,Math.max(1,r-1));context.fillStyle='#ffffff3a';context.fill();
    context.fillStyle='#00000012';context.fillRect(px+3,py+s-4,s-6,2);
    context.strokeStyle='#ffffff33';context.lineWidth=1;context.strokeRect(px+2.5,py+2.5,s-5,s-5);context.restore();
  }
  function drawMini(context,type,y,size=17){
    const shape=BlockShapes[type];if(!shape)return;const cells=[];shape.forEach((r,yy)=>r.forEach((v,x)=>{if(v)cells.push([x,yy]);}));
    const minX=Math.min(...cells.map(c=>c[0])),maxX=Math.max(...cells.map(c=>c[0]));
    const minY=Math.min(...cells.map(c=>c[1])),maxY=Math.max(...cells.map(c=>c[1]));
    const offsetX=(80-(maxX-minX+1)*size)/2,offsetY=y+(64-(maxY-minY+1)*size)/2;
    for(const[x,yy]of cells)tile(context,offsetX+(x-minX)*size,offsetY+(yy-minY)*size,colors[BlockTypes.indexOf(type)+1],size);
  }
  function render(){
    ctx.clearRect(0,0,320,640);
    ctx.fillStyle='#dfE8d0';ctx.fillRect(0,0,320,640);
    ctx.strokeStyle='#b7c8a044';ctx.lineWidth=.65;
    for(let x=1;x<10;x++){ctx.beginPath();ctx.moveTo(x*32,0);ctx.lineTo(x*32,640);ctx.stroke();}
    for(let y=1;y<20;y++){ctx.beginPath();ctx.moveTo(0,y*32);ctx.lineTo(320,y*32);ctx.stroke();}
    const fog=game.activeEffect('fog');
    if(!fog)for(let y=0;y<20;y++)for(let x=0;x<10;x++)if(game.board[y][x])tile(ctx,x*32,y*32,colors[game.board[y][x]]);
    if(game.active&&game.status!=='ready'){
      const color=colors[BlockTypes.indexOf(game.active.type)+1];
      if(!fog&&game.status==='playing'){
        const ghost={...game.active,y:game.ghostY()};for(const[x,y]of game.cells(ghost))if(y>=0)tile(ctx,x*32,y*32,color,32,true);
      }
      for(const[x,y]of game.cells())if(y>=0)tile(ctx,x*32,y*32,color);
    }
    if(fog){ctx.save();ctx.fillStyle='#64845933';ctx.font='12px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('堆积暂时隐身',160,360);ctx.restore();}
    $('.board-frame').classList.toggle('danger-zone',game.board.slice(0,5).some(r=>r.some(Boolean)));
    $('.board-frame').classList.toggle('reversed',game.activeEffect('reverse'));
    $('#score').textContent=game.score.toLocaleString('en-US');$('#lines').textContent=game.lines;$('#level').textContent=String(game.level).padStart(2,'0');
    $('#piece-count').textContent=`${game.pieces} 块已落地`;$('#speed-label').textContent=game.activeEffect('rush')?'4× 加速':'1×';
    $('#hold-note').textContent=game.holdUsed?'本次已经换过':'每次落地后可换';
    const mini=game.held+'|'+game.next.slice(0,3).join(',')+'|'+(innerWidth<=440);
    if(mini!==lastMini){
      holdCanvas.getContext('2d').clearRect(0,0,80,80);nextCanvas.getContext('2d').clearRect(0,0,80,224);
      if(game.held)drawMini(holdCanvas.getContext('2d'),game.held,8);
      if(innerWidth<=440){
        // Canvas CSS uses a horizontal strip on narrow screens; keep its logical
        // aspect ratio aligned so block shapes never stretch.
        const dpr=Math.min(2,devicePixelRatio||1);nextCanvas.width=180*dpr;nextCanvas.height=75*dpr;const c=nextCanvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
        game.next.slice(0,3).forEach((t,i)=>{c.save();c.translate(i*59-10,5);drawMini(c,t,0,12);c.restore();});
      }else{
        const dpr=Math.min(2,devicePixelRatio||1);nextCanvas.width=80*dpr;nextCanvas.height=224*dpr;const c=nextCanvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
        game.next.slice(0,3).forEach((t,i)=>drawMini(c,t,i*73+3,16));
      }
      lastMini=mini;
    }
    renderStatus();
  }
  function renderStatus(){
    const active=Object.entries(game.effects).filter(([,until])=>until>game.clock);
    const parts=active.map(([kind,until])=>({name:label[kind],suffix:`${Math.ceil((until-game.clock)/1000)} 秒`,kind}));
    if(game.challenge)parts.push({name:`催命：${Math.max(0,2-(game.lines-game.challenge.start))} 行未清`,suffix:`${Math.ceil((game.challenge.end-game.clock)/1000)} 秒`,kind:'challenge'});
    const key=JSON.stringify(parts);
    if(key!==lastStatus){lastStatus=key;$('#effect-count').textContent=`${parts.length} 项`;$('#active-effects').innerHTML=parts.length?parts.map(p=>`<div class="effect-status ${p.kind}"><span>${p.name}</span><b>${p.suffix}</b></div>`).join(''):'<p class="quiet">暂时风平浪静</p>';}
    $('#storm-note').textContent=storm?(game.status==='playing'?`下一次整活：${Math.max(0,Math.ceil((nextStorm-game.clock)/1000))} 秒`:'开始后每 9 秒随机整活'):'开启后每 9 秒随机整活';
    document.querySelectorAll('[data-effect]').forEach(n=>n.disabled=game.status!=='playing'||paused||game.clock<cooldown);
  }
  function log(text){$('#activity').textContent=text;}
  function toast(text){const n=$('#toast');n.classList.remove('show');void n.offsetWidth;n.textContent=text;n.classList.add('show');}
  function beep(kind='lock'){
    if(!sound)return;try{
      if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});
      const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.type='sine';
      const now=audio.currentTime,f={lock:200,clear:700,effect:320,over:140}[kind]||400;
      o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(f*(kind==='over'?.6:1.3),now+.14);
      g.gain.setValueAtTime(.025,now);g.gain.exponentialRampToValueAtTime(.0001,now+.16);o.start();o.stop(now+.18);
    }catch{}
  }
  function processEvents(){
    for(const e of game.drain()){
      if(e.type==='clear'){
        toast(e.count===4?'四行全消！':`${e.count} 行消除！+${e.points}`);beep('clear');
        const n=$('#line-flash');n.classList.remove('show');void n.offsetWidth;n.classList.add('show');log(`消掉 ${e.count} 行，拿下 ${e.points} 分${e.combo>0?`，连续消行 ${e.combo+1} 次！`:'。'}`);
      }else if(e.type==='effect'){
        log(messages[e.kind]);toast(e.kind==='garbage'?'垃圾行 +2':label[e.kind]);beep('effect');
        if(!['bomb','cleanse'].includes(e.kind)){const n=$('.board-frame');n.classList.remove('attacked');void n.offsetWidth;n.classList.add('attacked');}
      }else if(e.type==='challenge-win'){toast('催命任务完成！+500');log('15 秒催命任务完成！奖励 500 分，观众没得逞。');}
      else if(e.type==='challenge-fail'){toast('没来得及！垃圾行 +3');log('催命倒计时结束，3 行垃圾已经顶上来了！');}
      else if(e.type==='expired')log(`「${label[e.kind]}」结束了，操作恢复，喘口气。`);
      else if(e.type==='lock')beep('lock');
      else if(e.type==='over'){
        live.clearQueue('本局结束，旧礼物候场已清理');
        held.clear();beep('over');const result=overtime.onLoss(overtimeRound);if(result.seconds)overtimeLoss=result;
        showCurtain('被拿捏了，再来一局',lossCopy(),'再来一局');
        if(overtimeLoss?.seconds)log(`本局失败，加班 +${overtimeLoss.seconds/60} 分钟，送去加班机。`);
      }
    }
  }
  function showCurtain(title,copy,button){$('#curtain').hidden=false;$('#curtain-title').textContent=title;$('#curtain-copy').textContent=copy;$('#start').textContent=button;}
  function begin(){if(game.status!=='ready')live.clearQueue('重开，旧礼物候场已清理');overtime.local.autoStart();overtimeRound=overtime.beginRound();overtimeLoss=null;game.reset();game.start();paused=false;held.clear();cooldown=0;nextStorm=9000;lastMini='';lastStatus='';$('#curtain').hidden=true;$('#toast').classList.remove('show');$('#line-flash').classList.remove('show');$('.board-frame').classList.remove('attacked');$('#pause').innerHTML='暂停 <kbd>P</kbd>';log('挑战开始！先把地基铺好，观众随时会来添乱。');render();canvas.focus({preventScroll:true});}
  function pause(value){
    if(game.status!=='playing')return;paused=value;held.clear();
    if(paused)showCurtain('暂停一下，喘口气','整活倒计时也停住了。','继续挑战');else $('#curtain').hidden=true;
    $('#pause').innerHTML=paused?'继续 <kbd>P</kbd>':'暂停 <kbd>P</kbd>';renderStatus();
  }
  function action(key){
    if(game.status!=='playing'||paused)return;
    if(key==='left')game.move(-1);else if(key==='right')game.move(1);else if(key==='down')game.softDrop();else if(key==='rotate')game.rotate();else if(key==='ccw')game.rotate(-1);else if(key==='drop')game.hardDrop();else if(key==='hold')game.hold();
    processEvents();render();
  }
  const repeatKeys=new Set(['left','right','down']);
  const keys={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',ArrowUp:'rotate',KeyX:'rotate',KeyZ:'ccw',Space:'drop',KeyC:'hold',ShiftLeft:'hold',ShiftRight:'hold'};
  document.addEventListener('keydown',e=>{
    if(e.target.closest('input,textarea,select,summary'))return;
    if(['KeyP','Escape'].includes(e.code)){e.preventDefault();if(!e.repeat)pause(!paused);return;}
    if(e.code==='F2'){e.preventDefault();if(!e.repeat)$('#panel-toggle').click();return;}
    const key=keys[e.code];if(!key)return;
    if(e.target.tagName==='BUTTON'&&(game.status!=='playing'||paused))return;
    e.preventDefault();if(e.repeat)return;action(key);if(repeatKeys.has(key)&&!paused&&game.status==='playing')held.set(key,inputClock+(key==='down'?45:150));
  });
  document.addEventListener('keyup',e=>{const key=keys[e.code];if(key)held.delete(key);});
  document.querySelectorAll('[data-input]').forEach(n=>{
    n.addEventListener('pointerdown',e=>{e.preventDefault();const key=n.dataset.input;action(key);if(repeatKeys.has(key))held.set(key,inputClock+(key==='down'?45:150));n.setPointerCapture?.(e.pointerId);});
    n.addEventListener('pointerup',()=>held.delete(n.dataset.input));n.addEventListener('pointercancel',()=>held.delete(n.dataset.input));
  });
  window.addEventListener('pointerup',()=>held.clear());window.addEventListener('blur',()=>{held.clear();if(game.status==='playing')pause(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
  $('#start').onclick=()=>{if(paused&&game.status==='playing')pause(false);else begin();};$('#restart').onclick=begin;$('#pause').onclick=()=>pause(!paused);
  $('#sound').onclick=()=>{sound=!sound;$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');if(sound)beep('clear');};
  $('#preview').onclick=()=>{const value=document.body.classList.toggle('with-preview');$('#preview').setAttribute('aria-pressed',String(value));};
  $('#panel-toggle').onclick=()=>{const hidden=document.body.classList.toggle('panel-hidden');$('#panel-toggle').setAttribute('aria-expanded',String(!hidden));$('#panel-toggle').setAttribute('aria-label',hidden?'展开互动面板':'收起互动面板');};
  $('#storm').onclick=()=>{storm=!storm;nextStorm=game.clock+9000;$('#storm').setAttribute('aria-checked',String(storm));renderStatus();};
  $('#overtime-enabled').onchange=e=>overtime.setEnabled(e.target.checked);
  $('#overtime-minutes').onchange=e=>{if(!overtime.setMinutes(e.target.value)){$('#overtime-test-result').textContent='加班时长请输入 1～180 的整数分钟。';e.target.value=overtime.snapshot().minutes;}};
  const keyHelp='连接码是 8 位，比如 ABCD-2345，在白曜「加班机 → 加班设置 → 插件连接」里。';
  const useKey=()=>{if(overtime.setKey($('#overtime-key').value))return true;$('#overtime-test-result').textContent=keyHelp;$('#overtime-key').value=overtime.snapshot().key;return false;};
  $('#overtime-connect').onclick=()=>{if(useKey()&&!overtime.connect())$('#overtime-test-result').textContent='先打开「输了就加班」。';};
  $('#overtime-test').onclick=async()=>{
    // 只拿输入框里的码试一下：不保存、不碰正在用的连接，攒着的加班不会被送出去；点「连接」才用上
    const typed=BaiyaoOvertimeClient.normalizeKey($('#overtime-key').value),now=overtime.snapshot(),inUse=typed===now.key&&now.connection==='ready';
    $('#overtime-test').disabled=true;$('#overtime-test-result').textContent='正在测试连接，不改加班时间…';
    const result=await overtime.testConnection(typed);
    $('#overtime-test-result').textContent=!result.ok?`测试失败：${result.error}`:!result.trusted?`连上白曜了，但${result.error}，现在只能看时间。`:inUse?'连接正常，连接码也对；测试没有加时间。':'连接码对，测试没有加时间；点「连接」才开始加。';$('#overtime-test').disabled=false;
  };
  window.addEventListener('pagehide',()=>overtime.stop());window.addEventListener('pageshow',e=>{if(e.persisted&&overtime.snapshot().enabled)overtime.connect();});
  function receive(kind,origin=null){if(paused||game.clock<cooldown||game.status!=='playing')return false;cooldown=game.clock+650;game.effect(kind);processEvents();if(origin&&game.status==='playing'&&origin.source!=='manual'&&origin.source!=='auto')log(`@${origin.actor} · ${messages[kind]}`);render();return true;}
  document.querySelectorAll('[data-effect]').forEach(n=>n.onclick=()=>live.simulateEffect(n.dataset.effect));
  function frame(time){
    const dt=last?Math.min(50,time-last):0;last=time;
    if(game.status==='playing'&&!paused){
      inputClock+=dt;
      for(const[key,next]of held)if(inputClock>=next){action(key);held.set(key,inputClock+45);}
      game.tick(dt);
      if(storm&&game.status==='playing'&&game.clock>=nextStorm){
        const choices=['garbage','reverse','rush','fog','seal','challenge'];
        const choicesFree=choices.filter(k=>!game.activeEffect(k)&&(k!=='challenge'||!game.challenge));
        const kind=(choicesFree.length?choicesFree:choices)[Math.floor(Math.random()*(choicesFree.length||choices.length))];
        live.simulateEffect(kind,'auto');nextStorm=game.clock+9000;
      }
      processEvents();render();
    }
    live.tick();requestAnimationFrame(frame);
  }
  const params=new URLSearchParams(location.search);if(params.get('preview')==='1')$('#preview').click();if(params.get('panel')==='0')$('#panel-toggle').click();
  window.addEventListener('resize',resize);resize();renderOvertime(overtime.snapshot());if(overtime.snapshot().enabled)overtime.connect();requestAnimationFrame(frame);
  setupBroadcastUI({kind:'blocks',isPaused:()=>paused,setPaused:pause,nextType:()=>game.next[0],start:()=>{if(game.status==='playing'){pause(false);canvas.focus();}else begin();},live});live.start();
  mountLocalOvertime({link:overtime,anchor:$('.overtime-card'),stage:$('#broadcast-stage')});
  window.addEventListener('pagehide',()=>live.stop());window.addEventListener('pageshow',e=>{if(e.persisted)live.start();});
})();
