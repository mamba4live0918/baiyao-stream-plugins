(function () {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('game-canvas'),ctx=canvas.getContext('2d');
  let choiceControls;
  const DEFINITIONS=GelatoTricks.DEFINITIONS;
  const ACTIONS=Object.fromEntries(Object.entries(DEFINITIONS).map(([id,d])=>[id,[d.name,d.unit,d.value,d.duration]]));
  function read(key,fallback){try{const value=JSON.parse(localStorage.getItem('gelato.catch.v1.'+key));return value===null?fallback:value;}catch{return fallback;}}
  function save(key,value){try{localStorage.setItem('gelato.catch.v1.'+key,JSON.stringify(value));return true;}catch{return false;}}
  function readV4(key,fallback){try{const value=JSON.parse(localStorage.getItem('gelato.catch.v4.'+key));return value===null?fallback:value;}catch{return fallback;}}
  function saveV4(key,value){try{localStorage.setItem('gelato.catch.v4.'+key,JSON.stringify(value));return true;}catch{return false;}}
  const copiedProfile=GelatoCopyProfile.copyOnce();
  let levels=GelatoLevels.read(),editorIndex=0,editorDirty=false;
  const savedPhysics=readV4('physics',{});
  let physicsProfile={mode:GelatoRigidPhysics.mode(savedPhysics?.mode),adhesion:GelatoRigidPhysics.strength(savedPhysics?.adhesion??.65)};
  const game=new GelatoEngine.Game({levels,level:1,physicsMode:physicsProfile.mode,adhesion:physicsProfile.adhesion});
  $('g-r41').textContent='BYSL';
  const previousCleared=readV4('completed',null),oldCleared=read('clearedLevels',[]);
  const clearedIds=new Set(Array.isArray(previousCleared)?previousCleared.filter(id=>levels.some(l=>l.id===id)):Array.isArray(oldCleared)?oldCleared.map(n=>levels[n-1]?.id).filter(Boolean):[]);
  let appearance=GelatoAppearance.read(),activeSkins=GelatoAppearance.available(appearance),skinBusy=false,spaceHeld=false;
  const skinImages=new Map(),builtinPreviews=new Map();
  const savedRules=read('rules',GelatoGifts.DEFAULT_RULES);
  let rules=GelatoGifts.upgradeTrickRules(savedRules);
  if(JSON.stringify(rules)!==JSON.stringify(savedRules))save('rules',rules);
  const oldPrefs=read('prefs',{});
  let prefs=Object.assign({transparent:true,sound:oldPrefs?.sound!==false,feed:false,hudSize:26,hudColor:'#ffffff',hudOpacity:28,background:'#20252b'},readV4('display',{}));
  let hudPosition=readV4('hud-position',{x:.025,y:.04}),dragState=null,dragMovedAt=-Infinity;
  let screen={w:0,h:0,scale:1,ox:0,oy:0},lastTime=0,visualTime=0,toastUntil=0,shake=0,open=false,resumeAfterSettings=false,previousStatus='',audioCtx,roundStartedAt=null;
  const particles=[],popups=[],bites=[],feedItems=[],landingTimes=new Map(),motionSamples=new Map(),contactRings=[],releaseRings=[],blastWaves=[],bowlImpacts=new Map();
  const heldDirections=new Set();
  let controlDrag=null,controlPosition=readV4('control-position',null);
  const atlas=new Image();atlas.src=GELATO_ASSETS.atlas||'';
  const extraAtlas=new Image();extraAtlas.src=GELATO_ASSETS.extraAtlas||'';
  const crops=GELATO_ASSETS.crops||{},palette=['#f9a6b0','#b9dca0','#ffe5a2','#c8b4e9','#f9a6b0','#b9dca0'];
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  let windPosition=readV4('wind-position',{x:.76,y:.04});
  const effectHud=new GelatoEffectHud.Display($('effect-status'),readV4('effect-hud',{}),{save:p=>saveV4('effect-hud',p),canDrag:()=>!open,onDrag:finished=>{stopMovement();if(finished){dragMovedAt=performance.now();refreshLayoutEditor();}}});
  function placeWind(){const n=$('wind-indicator'),r=n.getBoundingClientRect();n.style.left=clamp((Number(windPosition?.x)||0)*innerWidth,4,Math.max(4,innerWidth-r.width-4))+'px';n.style.top=clamp((Number(windPosition?.y)||0)*innerHeight,4,Math.max(4,innerHeight-r.height-4))+'px';}
  const formatHeight=value=>(Math.floor((Math.max(0,Number(value)||0)+1e-7)*100)/100).toLocaleString('en-US',{maximumFractionDigits:2});
  function builtinSource(key){return key==='bowl'?{image:atlas,crop:crops.bowl}:key<4?{image:atlas,crop:crops.scoops?.[key]}:{image:extraAtlas,crop:GELATO_ASSETS.extraCrops?.scoops?.[key-4]};}
  function placeControls(){const node=$('game-controls'),r=node.getBoundingClientRect();node.style.left=clamp((Number.isFinite(Number(controlPosition?.x))?Number(controlPosition.x):.025)*innerWidth,4,Math.max(4,innerWidth-r.width-4))+'px';node.style.top=clamp((Number.isFinite(Number(controlPosition?.y))?Number(controlPosition.y)*innerHeight:$('score-board').getBoundingClientRect().bottom+12),4,Math.max(4,innerHeight-r.height-4))+'px';}
  const formatTime=t=>String(Math.floor(Math.ceil(t)/60)).padStart(2,'0')+':'+String(Math.ceil(t)%60).padStart(2,'0');
  function placeHud(){const board=$('score-board'),r=board.getBoundingClientRect();const x=Number(hudPosition?.x),y=Number(hudPosition?.y);board.style.left=clamp((Number.isFinite(x)?x:.025)*innerWidth,4,Math.max(4,innerWidth-r.width-4))+'px';board.style.top=clamp((Number.isFinite(y)?y:.04)*innerHeight,4,Math.max(4,innerHeight-r.height-4))+'px';}
  function resize(){
    const dpr=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const span=w<580?720:1000;game.viewLeft=(1000-span)/2;game.viewRight=(1000+span)/2;
    screen={w,h,dpr,scale:Math.min((w-24)/span,(h-18)/820),ox:0,oy:0};screen.ox=(w-1000*screen.scale)/2;
    const reserve=appearance.bowl.dataUrl?Math.max(50,...game.bowls.map(b=>customBowlGeometry(b).below)):50;
    screen.oy=h-24-(game.bowlY+reserve)*screen.scale;
    const preferred=(clamp(h*.08,54,84)-screen.oy)/screen.scale;
    game.spawnY=Math.min(preferred,game.bowlY-Math.max(140,game.rowRadius*3.8));
    game.fallClearance=Math.max(150,h*.48)/screen.scale;
    game.viewTop=-screen.oy/screen.scale;game.viewBottom=(h-screen.oy)/screen.scale;
    placeHud();placeControls();placeWind();effectHud.render(game.tricks.snapshot(),game.status);
  }
  addEventListener('resize',resize);
  function sound(kind){if(!prefs.sound)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const now=audioCtx.currentTime;
    if(kind==='land'){
      const buffer=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*.09),audioCtx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*7);
      const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=650;gain.gain.value=.16;source.connect(filter).connect(gain).connect(audioCtx.destination);source.start(now);return;
    }
    const notes=kind==='win'?[523,659,784]:kind==='blast'?[110,70]:kind==='eat'?[460,220]:[680,490];notes.forEach((freq,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=kind==='blast'?'triangle':'sine';o.frequency.setValueAtTime(freq,now+i*.085);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.7),now+i*.085+.13);g.gain.setValueAtTime(.0001,now+i*.085);g.gain.exponentialRampToValueAtTime(.055,now+i*.085+.012);g.gain.exponentialRampToValueAtTime(.0001,now+i*.085+.2);o.connect(g).connect(audioCtx.destination);o.start(now+i*.085);o.stop(now+i*.085+.22);});}catch{}}
  function toast(text){$('toast').textContent=text;toastUntil=performance.now()+5000;}
  function feed(text,gift){if(!prefs.feed)return;const node=document.createElement('div');node.className='feed-item';const small=document.createElement('small');small.textContent=gift?`${gift.name} × ${gift.count}`:'效果测试';const strong=document.createElement('strong');strong.textContent=text;node.append(small,strong);$('feed').prepend(node);feedItems.unshift({node,expires:performance.now()+8000});while(feedItems.length>2)feedItems.pop().node.remove();}
  function burst(x,y,color,count=16,force=1){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=(55+Math.random()*190)*force;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-50,r:3+Math.random()*4,life:.7+Math.random()*.7,max:1.4,color,star:i%3===0,angle:Math.random()*7});}if(particles.length>380)particles.splice(0,particles.length-380);}
  function effectText(action,amount,options={}){const d=DEFINITIONS[action];return action==='blast'?'范围爆炸 · 半径 '+amount:d.name+' '+amount+d.unit+(d.duration?' · '+(options.duration||d.duration)+' 秒':'');}
  function applyEffect(action,amount,gift,options={}){
    if(['won','lost'].includes(game.status)){toast('关卡已结束，效果未应用。');return false;}
    const result=game.effect(action,amount,options);let text=effectText(action,amount,options);
    if(action==='blast')text+='，命中 '+result+' 个冰球';feed(text,gift);toast(text);updateHud();return result;
  }
  function receiveGift(gift){return GelatoGifts.dispatch(gift,rules,applyEffect);}
  const disconnect=GelatoGifts.connect({onGift:receiveGift,onStatus:status=>{$('connection').textContent=status;$('connection-detail').textContent='沿用扫叶子通道：SonglanPlugin.onGift 优先；未检测到时连接 ws://localhost:10030。连接状态与实际礼物数量请在整蛊机中核对。';}});
  addEventListener('pagehide',disconnect,{once:true});
  function skinAt(batch,index){return activeSkins[(batch+index)%activeSkins.length];}

  function startGame(){if(open||(game.status==='ready'&&game.dropStatus==='empty'))return;finishHudPreview();if(game.status==='won')return advanceLevel();if(game.status==='lost')return resetRound();if(game.status==='paused')game.resume();if(game.status==='ready')game.start();if(game.status==='playing'&&roundStartedAt===null)roundStartedAt=game.elapsed;updateHud();canvas.focus();}
  function togglePause(){finishHudPreview();if(game.status==='ready')return startGame();game.pause();updateHud();}
  function completedIndices(){return new Set(levels.map((l,i)=>clearedIds.has(l.id)?i+1:null).filter(Boolean));}
  function resetRound(index=game.level-1){stopMovement();hideWinPopup(false);roundStartedAt=null;game.reset({levels,level:clamp(index+1,1,levels.length),physicsMode:physicsProfile.mode,adhesion:physicsProfile.adhesion});particles.length=0;popups.length=0;bites.length=0;landingTimes.clear();motionSamples.clear();contactRings.length=0;releaseRings.length=0;blastWaves.length=0;bowlImpacts.clear();feedItems.forEach(i=>i.node.remove());feedItems.length=0;previousStatus='';shake=0;resize();if(open){game.pause();resumeAfterSettings=true;}updateHud();if(!open)canvas.focus();}
  function advanceLevel(){if(game.status!=='won')return;const next=GelatoCampaign.nextStep(game.level,completedIndices(),levels.length);if(next.action==='restart'){clearedIds.clear();saveV4('completed',[]);}resetRound(next.level-1);}
  function hideWinPopup(restoreFocus=true){$('win-overlay').hidden=true;if(restoreFocus&&!open)canvas.focus();}
  function showWinPopup(){
    const next=GelatoCampaign.nextStep(game.level,completedIndices(),levels.length);
    $('win-title').textContent=next.allClear?'全部关卡已通过':'关卡通过';
    $('win-level').textContent=`第 ${game.level} / ${levels.length} 关 · ${game.config.name}`;
    $('win-layers').textContent=formatHeight(game.progressHeight);$('win-height-goal').textContent='目标 '+formatHeight(game.goal);
    $('win-time').textContent=formatTime(Math.floor(roundStartedAt===null?0:Math.max(0,game.elapsed-roundStartedAt)));
    $('win-drops').textContent=`${game.caught} / ${game.dropped}`;
    $('win-bowls').hidden=game.config.mode!=='twin';
    $('win-bowls').textContent=game.config.mode==='twin'?`左容器 ${formatHeight(game.bowlHeights[0])}　右容器 ${formatHeight(game.bowlHeights[1])}`:'';
    $('win-progress').textContent=`已完成 ${completedIndices().size} / ${levels.length} 关`;
    $('win-next').textContent=next.allClear?'重新开始全部关卡':next.action==='missing'?'继续未完成关卡':'下一关';
    $('win-next-description').textContent=next.allClear?'':`接下来：第 ${next.level} 关 · ${levels[next.level-1].name}`;
    $('win-overlay').hidden=false;$('win-next').focus();
  }
  $('win-close').onclick=()=>hideWinPopup();
  $('win-next').onclick=()=>advanceLevel();
  $('win-retry').onclick=()=>resetRound();
  $('win-overlay').addEventListener('dblclick',e=>e.stopPropagation());
  $('win-overlay').addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const nodes=[...$('win-overlay').querySelectorAll('button')].filter(n=>!n.disabled),first=nodes[0],last=nodes[nodes.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  $('start-game').onclick=startGame;$('pause-game').onclick=()=>{if(game.status==='playing')togglePause();canvas.focus();};$('open-settings').onclick=openSettings;
  function pointerTarget(e){if(open||effectHud.preview||!$('win-overlay').hidden||!['ready','playing'].includes(game.status))return;if(e.pointerType==='touch'&&!e.isPrimary)return;heldDirections.clear();game.setPointerTarget((e.clientX-screen.ox)/screen.scale);}
  function stopMovement(){heldDirections.clear();game.setMoveDirection(0);}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||open)return;canvas.focus();pointerTarget(e);if(e.pointerType!=='mouse')canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',pointerTarget);
  canvas.addEventListener('pointercancel',stopMovement);
  // Keep travelling to the last pointer target when the cursor leaves the canvas;
  // pause, pointer cancellation and window blur still stop or freeze movement.
  document.addEventListener('dblclick',e=>{if(e.target.closest('#drawer, #win-overlay, #game-controls')||performance.now()-dragMovedAt<300)return;if(open)closeSettings();else openSettings();});
  document.addEventListener('keydown',e=>{
    if(!$('win-overlay').hidden){if(e.key==='Escape'){e.preventDefault();hideWinPopup();}else if(e.code==='Space'&&e.repeat)e.preventDefault();else if(e.code==='KeyR'&&!e.repeat){e.preventDefault();resetRound();}else if(e.code==='Enter'&&!e.repeat&&!e.target.closest('button')){e.preventDefault();advanceLevel();}return;}
    if(e.key==='Escape'&&open){closeSettings();return;}if(open||e.target.closest('input,select,textarea'))return;
    if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){e.preventDefault();if(effectHud.preview)return;heldDirections.add(e.code);const left=heldDirections.has('ArrowLeft')||heldDirections.has('KeyA'),right=heldDirections.has('ArrowRight')||heldDirections.has('KeyD');game.setMoveDirection(Number(right)-Number(left));return;}
    if(e.code==='Space'){if(e.target.closest('button'))return;e.preventDefault();if(e.repeat||spaceHeld)return;spaceHeld=true;togglePause();}
    else if(!e.repeat&&e.code==='KeyP'){e.preventDefault();togglePause();}
    else if(!e.repeat&&e.code==='Enter'&&!e.target.closest('button')){e.preventDefault();advanceLevel();}
    else if(!e.repeat&&e.code==='KeyR'){e.preventDefault();resetRound();}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space')spaceHeld=false;if(heldDirections.delete(e.code)){const left=heldDirections.has('ArrowLeft')||heldDirections.has('KeyA'),right=heldDirections.has('ArrowRight')||heldDirections.has('KeyD');game.setMoveDirection(Number(right)-Number(left));}});
  addEventListener('blur',()=>{spaceHeld=false;stopMovement();});
  const board=$('score-board');
  board.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button')||open)return;const r=board.getBoundingClientRect();dragState={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};board.setPointerCapture(e.pointerId);});
  board.addEventListener('pointermove',e=>{if(!dragState||dragState.id!==e.pointerId)return;const dx=e.clientX-dragState.x,dy=e.clientY-dragState.y;if(Math.hypot(dx,dy)>3)dragState.moved=true;if(!dragState.moved)return;const r=board.getBoundingClientRect();board.style.left=clamp(dragState.left+dx,4,Math.max(4,innerWidth-r.width-4))+'px';board.style.top=clamp(dragState.top+dy,4,Math.max(4,innerHeight-r.height-4))+'px';});
  function finishDrag(e){if(!dragState||e.pointerId!==dragState.id)return;if(dragState.moved){const r=board.getBoundingClientRect();hudPosition={x:r.left/innerWidth,y:r.top/innerHeight};saveV4('hud-position',hudPosition);dragMovedAt=performance.now();}dragState=null;}
  board.addEventListener('pointerup',finishDrag);board.addEventListener('pointercancel',finishDrag);
  const controls=$('game-controls');
  $('control-handle').addEventListener('pointerdown',e=>{if(e.button!==0||open)return;const r=controls.getBoundingClientRect();controlDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};e.currentTarget.setPointerCapture(e.pointerId);});
  $('control-handle').addEventListener('pointermove',e=>{if(!controlDrag||e.pointerId!==controlDrag.id)return;const r=controls.getBoundingClientRect();controls.style.left=clamp(controlDrag.left+e.clientX-controlDrag.x,4,Math.max(4,innerWidth-r.width-4))+'px';controls.style.top=clamp(controlDrag.top+e.clientY-controlDrag.y,4,Math.max(4,innerHeight-r.height-4))+'px';});
  function finishControlDrag(e){if(!controlDrag||controlDrag.id!==e.pointerId)return;const r=controls.getBoundingClientRect();controlPosition={x:r.left/innerWidth,y:r.top/innerHeight};saveV4('control-position',controlPosition);controlDrag=null;dragMovedAt=performance.now();}
  $('control-handle').addEventListener('pointerup',finishControlDrag);$('control-handle').addEventListener('pointercancel',finishControlDrag);
  $('reset-control-position').onclick=()=>{controlPosition=null;saveV4('control-position',controlPosition);placeControls();};
  function selectTab(name){if(name==='display')refreshLayoutEditor();document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===name));document.querySelectorAll('[data-pane]').forEach(n=>n.hidden=n.dataset.pane!==name);}
  const PHYSICS_NAMES={arcade:'稳定接球',realistic:'真实物理',sticky:'粘性物理'};
  function refreshPhysicsControls(){
    document.querySelectorAll('[data-physics]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.physics===game.physicsMode)));$('physics-active').textContent='当前生效：'+PHYSICS_NAMES[game.physicsMode];$('adhesion').value=Math.round(physicsProfile.adhesion*100);$('adhesion-value').textContent=Math.round(physicsProfile.adhesion*100)+'%';$('adhesion-control').hidden=physicsProfile.mode!=='sticky';$('catch-overlap-field').hidden=physicsProfile.mode!=='arcade';
    $('physics-help').textContent={arcade:'接住后固定，冰淇淋塔跟随盘子移动。适合稳定堆高。',realistic:'落下轻微压扁，接触面能承托，不作弹性回跳；保留惯性、滑动和滚落。横移有起步和刹车，落点按可达范围生成。',sticky:'轻压后稳稳贴合，正常移动可以连续堆高；快速甩动、明显错位或失去支撑仍会散落。分开即脱落，不拉丝、不弹回。0% 不产生粘连。'}[physicsProfile.mode];
    document.body.dataset.physicsMode=physicsProfile.mode;
  }
  function changePhysics(requested=physicsProfile.mode){const next={mode:GelatoRigidPhysics.mode(requested),adhesion:GelatoRigidPhysics.strength(Number($('adhesion').value)/100)};if(next.mode===physicsProfile.mode&&next.adhesion===physicsProfile.adhesion)return;if(!saveDraft()){refreshPhysicsControls();$('physics-status').textContent='未切换：请先修正关卡参数。';$('physics-status').classList.toggle('error',true);return;}const saved=saveV4('physics',next);physicsProfile=next;resetRound();refreshPhysicsControls();const message='已启用'+PHYSICS_NAMES[game.physicsMode]+'，本关已重开。'+(saved?'':'当前页面可以使用，但浏览器无法保存设置，重新打开后需再次选择。');$('physics-status').textContent=message;$('physics-status').classList.toggle('error',!saved);toast(message);}
  document.querySelectorAll('[data-physics]').forEach(b=>b.onclick=()=>changePhysics(b.dataset.physics));$('adhesion').oninput=()=>{$('adhesion-value').textContent=$('adhesion').value+'%';};$('adhesion').onchange=()=>changePhysics();
  $('difficulty-preset').onchange=()=>{$('difficulty-help').textContent={standard:'标准：宽盘、普通下坠与充裕时间，适合熟悉操作。',hard:'困难：更窄的盘子、更快的下坠、更密的掉落与更高目标。',expert:'极限：窄盘、快速下坠、高目标和紧凑时限，需要更快反应。'}[$('difficulty-preset').value]+' 点击应用后修改本关并重开；名称、关卡类型、素材与其他关卡不变。';};
  $('apply-difficulty').onclick=()=>{if(!saveDraft())return;const selected=$('difficulty-preset').value,next=levels.map(l=>({...l}));Object.assign(next[editorIndex],GelatoLevels.difficultyPreset(selected,next[editorIndex].mode));commitLevels(next,editorIndex,'已应用'+GelatoLevels.DIFFICULTIES[selected].name+'难度并重开本关。',next[editorIndex].id);};
  function openSettings(){if(open)return;finishHudPreview();stopMovement();refreshLayoutEditor();open=true;resumeAfterSettings=['ready','playing'].includes(game.status);if(resumeAfterSettings)game.pause();editorIndex=game.level-1;renderLevelEditor();renderRules();renderAppearance();$('drawer').hidden=false;$('drawer-backdrop').hidden=false;$('close-settings').focus();updateHud();if(copiedProfile.warning)toast(copiedProfile.warning);}
  function closeSettings(){if(!open)return true;choiceControls?.close(false);if(!saveDraft())return false;open=false;$('drawer').hidden=true;$('drawer-backdrop').hidden=true;if(resumeAfterSettings)game.resume();resumeAfterSettings=false;canvas.focus();updateHud();return true;}
  $('close-settings').onclick=closeSettings;$('close-panel').onclick=closeSettings;$('drawer-backdrop').onclick=closeSettings;
  document.querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>selectTab(n.dataset.tab));
  $('drawer').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const nodes=[...$('drawer').querySelectorAll('button,input,select')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
  $('drop').onclick=()=>{if(!closeSettings())return;startGame();};$('pause').onclick=()=>{if(open){resumeAfterSettings=!resumeAfterSettings;toast(resumeAfterSettings?'关闭设置后继续运行。':'关闭设置后保持暂停。');}else togglePause();updateHud();};$('restart').onclick=()=>{if(saveDraft())resetRound();};$('next-level').onclick=()=>{if(!saveDraft())return;advanceLevel();if(open)renderLevelEditor();};
  function applyPrefs(){prefs.controlScale=clamp(Number(prefs.controlScale)||100,50,200);prefs.windSize=clamp(Number(prefs.windSize)||14,12,64);document.documentElement.style.setProperty('--control-scale',prefs.controlScale/100);document.documentElement.style.setProperty('--wind-size',prefs.windSize+'px');prefs.hudSize=clamp(Number(prefs.hudSize)||26,16,64);prefs.hudOpacity=clamp(Number(prefs.hudOpacity)||0,0,100);if(!/^#[0-9a-f]{6}$/i.test(prefs.hudColor))prefs.hudColor='#ffffff';if(!/^#[0-9a-f]{6}$/i.test(prefs.background))prefs.background='#20252b';document.body.classList.toggle('transparent',!!prefs.transparent);document.documentElement.style.setProperty('--hud-size',prefs.hudSize+'px');document.documentElement.style.setProperty('--hud-color',prefs.hudColor);document.documentElement.style.setProperty('--hud-bg',prefs.hudOpacity/100);document.documentElement.style.setProperty('--page-bg',prefs.background);$('transparent').checked=!!prefs.transparent;$('sound').checked=!!prefs.sound;$('show-feed').checked=!!prefs.feed;$('feed').hidden=!prefs.feed;$('hud-size').value=prefs.hudSize;$('hud-color').value=prefs.hudColor;$('hud-opacity').value=prefs.hudOpacity;$('background-color').value=prefs.background;saveV4('display',prefs);placeHud();placeControls();placeWind();}
  for(const [id,key] of [['transparent','transparent'],['sound','sound'],['show-feed','feed']])$(id).onchange=e=>{prefs[key]=e.target.checked;applyPrefs();};
  for(const [id,key] of [['hud-size','hudSize'],['hud-color','hudColor'],['hud-opacity','hudOpacity'],['background-color','background']])$(id).onchange=e=>{prefs[key]=e.target.value;applyPrefs();};
  $('reset-hud-position').onclick=()=>{hudPosition={x:.025,y:.04};saveV4('hud-position',hudPosition);placeHud();};
  for(const action of GelatoEffectHud.ACTIONS){const option=document.createElement('option');option.value=action;option.textContent=DEFINITIONS[action].name+' HUD';$('layout-target').append(option);}
  $('layout-target').value='reverse';
  function layoutSelection(){
    const key=$('layout-target').value,isEffect=GelatoEffectHud.ACTIONS.includes(key);
    const node=isEffect?effectHud.nodes.get(key).card:$(key==='info'?'score-board':key==='controls'?'game-controls':'wind-indicator');
    const card=isEffect?effectHud.prefs.cards[key]:null;
    let position=isEffect?card:key==='info'?hudPosition:key==='controls'?controlPosition:windPosition;
    if(!position||position.x==null){const r=node.getBoundingClientRect();position=r.width&&r.height?{x:r.left/innerWidth,y:r.top/innerHeight}:isEffect?{x:GelatoEffectHud.layout([key],effectHud.prefs,innerWidth,innerHeight)[0].x/innerWidth,y:.24}:{x:.025,y:.22};}
    return {key,isEffect,node,position,card,size:isEffect?card.size:key==='info'?prefs.hudSize:key==='controls'?prefs.controlScale||100:prefs.windSize||14};
  }
  function refreshLayoutEditor(){
    const s=layoutSelection();$('layout-size-label').textContent=s.key==='controls'?'控制区缩放（%）':'字号';$('layout-size').min=s.key==='controls'?50:s.key==='info'?16:12;$('layout-size').max=s.key==='controls'?200:64;$('layout-size').value=s.size;
    $('layout-placement').disabled=!s.isEffect;$('layout-placement').value=s.isEffect&&s.card.x===null?'auto':'manual';
    for(const axis of ['x','y']){$('layout-'+axis).value=(s.position[axis]*100).toFixed(1);$('layout-'+axis).disabled=s.isEffect&&s.card.x===null;}
    $('effects-visible').checked=effectHud.prefs.enabled;$('effects-color').value=effectHud.prefs.color;$('effects-opacity').value=effectHud.prefs.opacity;
  }
  function saveEffectHud(){effectHud.prefs=GelatoEffectHud.normalize(effectHud.prefs);saveV4('effect-hud',effectHud.prefs);effectHud.render(game.tricks.snapshot(),game.status);}
  $('layout-target').onchange=refreshLayoutEditor;
  $('layout-size').oninput=e=>{if(e.target.value===''||!e.target.validity.valid)return;const s=layoutSelection(),value=Number(e.target.value);if(s.isEffect){s.card.size=value;saveEffectHud();}else{prefs[s.key==='info'?'hudSize':s.key==='controls'?'controlScale':'windSize']=value;applyPrefs();}};
  $('layout-size').onchange=refreshLayoutEditor;
  $('layout-placement').onchange=e=>{const s=layoutSelection();if(!s.isEffect)return;Object.assign(s.card,e.target.value==='auto'?{x:null,y:null}:s.position);saveEffectHud();refreshLayoutEditor();};
  for(const axis of ['x','y'])$('layout-'+axis).oninput=e=>{
    if(e.target.value===''||!e.target.validity.valid)return;const s=layoutSelection(),pos={x:s.position.x,y:s.position.y,[axis]:Number(e.target.value)/100};
    if(s.isEffect){Object.assign(s.card,pos);saveEffectHud();}else if(s.key==='info'){hudPosition=pos;saveV4('hud-position',pos);placeHud();}else if(s.key==='controls'){controlPosition=pos;saveV4('control-position',pos);placeControls();}else{windPosition=pos;saveV4('wind-position',pos);placeWind();}
  };
  $('effects-visible').onchange=e=>{effectHud.prefs.enabled=e.target.checked;saveEffectHud();};
  $('effects-color').oninput=e=>{effectHud.prefs.color=e.target.value;saveEffectHud();};
  $('effects-opacity').oninput=e=>{effectHud.prefs.opacity=Number(e.target.value);saveEffectHud();};
  function finishHudPreview(){effectHud.preview=false;$('hud-edit-banner').hidden=true;effectHud.render(game.tricks.snapshot(),game.status);}
  $('preview-effect-hud').onclick=()=>{if(!saveDraft())return;resumeAfterSettings=false;if(!closeSettings())return;if(['ready','playing'].includes(game.status))game.pause();stopMovement();effectHud.preview=true;$('hud-edit-banner').hidden=false;updateHud();};
  $('finish-hud-preview').onclick=()=>{finishHudPreview();canvas.focus();};
  $('reset-selected-hud').onclick=()=>{
    const s=layoutSelection();if(s.isEffect){effectHud.prefs.cards[s.key]={size:20,x:null,y:null};saveEffectHud();}else if(s.key==='info'){prefs.hudSize=26;hudPosition={x:.025,y:.04};saveV4('hud-position',hudPosition);applyPrefs();}else if(s.key==='controls'){prefs.controlScale=100;controlPosition=null;saveV4('control-position',null);applyPrefs();}else{prefs.windSize=14;windPosition={x:.76,y:.04};saveV4('wind-position',windPosition);applyPrefs();}refreshLayoutEditor();
  };
  $('reset-effects-hud').onclick=()=>{effectHud.prefs.cards=GelatoEffectHud.normalize().cards;saveEffectHud();refreshLayoutEditor();};
  function editorMessage(text,error=false){$('editor-status').textContent=text;$('editor-status').classList.toggle('error',error);}
  const fieldKeys=Object.keys(GelatoLevels.LIMITS);
  for(const key of fieldKeys)$('level-'+key).step=GelatoLevels.LIMITS[key].integer?'1':'any';
  function formValue(){const base={...levels[editorIndex],name:$('level-name').value,mode:$('level-mode').value,attemptMode:$('level-attemptMode').value};for(const key of fieldKeys)base[key]=Number($('level-'+key).value);return base;}
  function refreshDifficultyInfo(){const value=formValue(),match=Object.keys(GelatoLevels.DIFFICULTIES).find(id=>Object.entries(GelatoLevels.difficultyPreset(id,value.mode)).every(([key,n])=>Math.abs(value[key]-n)<1e-6));$('difficulty-current').textContent='当前参数：'+(match?GelatoLevels.DIFFICULTIES[match].name:'自定义');}
  function updateModeFields(){const mode=$('level-mode').value;$('mode-description').textContent=GelatoLevels.MODES.find(m=>m.id===mode).description;document.querySelectorAll('[data-modes]').forEach(label=>{label.hidden=!label.dataset.modes.split(' ').includes(mode);label.querySelector('input').disabled=label.hidden;});$('attempts-field').hidden=$('level-attemptMode').value==='unlimited';$('level-attempts').disabled=$('attempts-field').hidden;$('level-gustDuration').max=Math.max(.2,Number($('level-windPeriod').value)-.2);}
  function fillLevelForm(level){$('level-name').value=level.name;$('level-mode').value=level.mode;$('level-attemptMode').value=level.attemptMode;for(const key of fieldKeys)$('level-'+key).value=level[key];updateModeFields();refreshDifficultyInfo();}
  function renderLevelEditor(){editorIndex=clamp(editorIndex,0,levels.length-1);$('editor-level').replaceChildren();levels.forEach((l,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1}. ${l.name} · ${GelatoLevels.MODES.find(m=>m.id===l.mode).name}`;$('editor-level').append(option);});$('editor-level').value=editorIndex;fillLevelForm(levels[editorIndex]);$('move-level-up').disabled=editorIndex===0;$('move-level-down').disabled=editorIndex===levels.length-1;$('delete-level').disabled=levels.length===1;$('add-level').disabled=levels.length>=GelatoLevels.MAX_LEVELS;$('copy-level').disabled=levels.length>=GelatoLevels.MAX_LEVELS;editorDirty=false;}
  for(const mode of GelatoLevels.MODES){const option=document.createElement('option');option.value=mode.id;option.textContent=mode.name;$('level-mode').append(option);}
  $('editor-level').onchange=()=>{const target=Number($('editor-level').value);if(!saveDraft()){$('editor-level').value=editorIndex;return;}editorIndex=target;renderLevelEditor();editorMessage('');};
  $('level-form').addEventListener('input',()=>{editorDirty=true;editorMessage('参数未保存。');refreshDifficultyInfo();});
  $('level-mode').onchange=()=>{const current=formValue(),preset=GelatoLevels.create(current.mode,editorIndex);for(const key of ['bowlWidth','windForce','windPeriod','gustDuration','largeScale','smallScale'])current[key]=preset[key];fillLevelForm(current);editorDirty=true;editorMessage('已载入模式参数，保存后生效。');};
  for(const id of ['level-attemptMode','level-bowlWidth','level-windPeriod'])$(id).addEventListener('input',updateModeFields);
  function commitLevels(next,index,message,changedId){try{const previous=new Map(levels.map(l=>[l.id,JSON.stringify(l)])),saved=GelatoLevels.write(next);levels=saved;for(const id of [...clearedIds]){const current=levels.find(l=>l.id===id);if(!current||id===changedId||previous.get(id)!==JSON.stringify(current))clearedIds.delete(id);}saveV4('completed',[...clearedIds]);editorIndex=clamp(index,0,levels.length-1);resetRound(editorIndex);renderLevelEditor();editorMessage(message);return true;}catch(error){editorMessage(error.message,true);return false;}}
  function saveDraft(){if(!editorDirty)return true;if(!$('level-form').checkValidity()){selectTab('levels');$('level-form').reportValidity();editorMessage('请修正超出范围或未填写的参数。',true);return false;}const next=levels.map(l=>({...l}));next[editorIndex]=formValue();return commitLevels(next,editorIndex,'参数已自动保存并加载。',next[editorIndex].id);}
  $('level-form').onsubmit=e=>{e.preventDefault();if(!$('level-form').reportValidity())return;const next=levels.map(l=>({...l}));next[editorIndex]=formValue();commitLevels(next,editorIndex,'关卡已保存并加载。',next[editorIndex].id);};
  $('load-level').onclick=()=>{resetRound(editorIndex);renderLevelEditor();editorMessage('已加载保存的关卡参数。');};
  $('add-level').onclick=()=>{if(!saveDraft())return;const next=levels.map(l=>({...l}));next.push(GelatoLevels.create('classic',next.length));commitLevels(next,next.length-1,'已新增关卡。');};
  $('copy-level').onclick=()=>{if(!saveDraft())return;const next=levels.map(l=>({...l})),copy={...levels[editorIndex],id:GelatoLevels.create().id,name:'关卡 '+(levels.length+1)};next.splice(editorIndex+1,0,copy);commitLevels(next,editorIndex+1,'已复制关卡。');};
  function moveLevel(delta){if(!saveDraft())return;const target=editorIndex+delta;if(target<0||target>=levels.length)return;const next=levels.map(l=>({...l}));[next[editorIndex],next[target]]=[next[target],next[editorIndex]];commitLevels(next,target,'已更新关卡顺序。');}
  $('move-level-up').onclick=()=>moveLevel(-1);$('move-level-down').onclick=()=>moveLevel(1);
  $('delete-level').onclick=()=>{if(levels.length===1)return;const next=levels.filter((_,i)=>i!==editorIndex);commitLevels(next,Math.min(editorIndex,next.length-1),'已删除关卡。');};
  $('export-levels').onclick=()=>{if(!saveDraft())return;const url=URL.createObjectURL(new Blob([JSON.stringify({version:4,levels},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='冰淇淋接球版-关卡配置.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);editorMessage('已导出关卡配置。');};
  $('import-levels').onclick=()=>{$('levels-file').value='';$('levels-file').click();};
  $('levels-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2*1024*1024)throw new Error('关卡配置超过 2 MB。');let data;try{data=JSON.parse(await file.text());}catch{throw new Error('关卡配置不是有效 JSON。');}if(data?.version!==4||!Array.isArray(data.levels))throw new Error('请选择本插件导出的关卡配置。');commitLevels(data.levels,0,'已导入关卡配置。');}catch(error){editorMessage(error.message,true);}};

  function skinImage(dataUrl){
    if(!skinImages.has(dataUrl)){const image=new Image();skinImages.set(dataUrl,image);image.onload=()=>{if(dataUrl===appearance.bowl.dataUrl)resize();};image.src=dataUrl;}
    return skinImages.get(dataUrl);
  }
  function customBowlGeometry(bowl){
    const image=skinImage(appearance.bowl.dataUrl),ratio=image.naturalWidth?image.naturalHeight/image.naturalWidth:.5;
    const height=Math.min(160,Math.max(35,bowl.width*ratio)),above=appearance.bowl.rim*height;
    return {height,above,below:height-above};
  }
  function builtinPreview(key){
    if(builtinPreviews.has(key))return builtinPreviews.get(key);
    if(key==='ice'){const preview=document.createElement('canvas');preview.width=192;preview.height=192;drawIceBall(96,96,86,0,1,preview.getContext('2d'),false);const data=preview.toDataURL('image/png');builtinPreviews.set(key,data);return data;}
    if(key==='bowl'){const preview=document.createElement('canvas');preview.width=280;preview.height=70;const pctx=preview.getContext('2d');drawPlateShape(pctx,140,14,250,false);drawPlateShape(pctx,140,14,250,true);const data=preview.toDataURL('image/png');builtinPreviews.set(key,data);return data;}
    const {image,crop}=builtinSource(key);if(!image.complete||!image.naturalWidth||!crop)return '';
    const preview=document.createElement('canvas'),factor=Math.min(1,280/crop[2],140/crop[3]);preview.width=Math.round(crop[2]*factor);preview.height=Math.round(crop[3]*factor);
    preview.getContext('2d').drawImage(image,...crop,0,0,preview.width,preview.height);const data=preview.toDataURL('image/png');builtinPreviews.set(key,data);return data;
  }
  function appearanceMessage(message,error=false){$('appearance-result').textContent=message;$('appearance-result').classList.toggle('error',error);}
  function cloneAppearance(){return {...appearance,scoops:appearance.scoops.map(s=>({...s})),bowl:{...appearance.bowl},ice:{...appearance.ice}};}
  function commitAppearance(next,message){
    try{const saved=GelatoAppearance.write(next);appearance=saved;activeSkins=GelatoAppearance.available(saved);appearance.scoops.filter(s=>s.dataUrl).forEach(s=>skinImage(s.dataUrl));if(saved.bowl.dataUrl)skinImage(saved.bowl.dataUrl);if(saved.ice.dataUrl)skinImage(saved.ice.dataUrl);renderAppearance();resize();appearanceMessage(message||'素材已保存在当前浏览器。');return true;}
    catch(error){appearanceMessage(error.message,true);renderAppearance();return false;}
  }
  function renderAppearance(){
    $('skin-summary').textContent=`已启用 ${activeSkins.length} 种冰淇淋；每次随机掉落一个。`;
    const root=$('scoop-skins');root.replaceChildren();
    appearance.scoops.forEach(skin=>{
      const box=document.createElement('div');box.className='skin-option'+(skin.enabled?'':' off');
      const image=document.createElement('img');image.alt=skin.name;image.src=skin.dataUrl||builtinPreview(skin.builtin);
      const controls=document.createElement('div'),label=document.createElement('label'),check=document.createElement('input'),name=document.createElement('input');
      check.type='checkbox';check.checked=skin.enabled;check.setAttribute('aria-label',`启用 ${skin.name}`);const text=document.createElement('span');text.textContent=skin.dataUrl?'自定义':'内置';label.append(check,text);
      check.onchange=()=>{if(!check.checked&&activeSkins.length===1){appearanceMessage('至少保留一种冰淇淋。',true);renderAppearance();return;}const next=cloneAppearance();next.scoops.find(s=>s.id===skin.id).enabled=check.checked;commitAppearance(next);};
      name.type='text';name.value=skin.name;name.maxLength=40;name.setAttribute('aria-label',`素材名称 ${skin.name}`);name.onchange=()=>{const next=cloneAppearance();next.scoops.find(s=>s.id===skin.id).name=name.value.trim()||skin.name;commitAppearance(next);};controls.append(label,name);
      if(skin.dataUrl){const remove=document.createElement('button');remove.textContent='删除图片';remove.setAttribute('aria-label',`删除素材 ${skin.name}`);remove.onclick=()=>{const next=cloneAppearance();next.scoops=next.scoops.filter(s=>s.id!==skin.id);commitAppearance(next,'图片已移出素材库；场上旧球保持原样。');};controls.append(remove);}
      box.append(image,controls);root.append(box);
    });
    $('ice-skin-preview').src=appearance.ice.dataUrl||builtinPreview('ice');$('ice-image-name').textContent=appearance.ice.name;
    $('bowl-skin-preview').src=appearance.bowl.dataUrl||builtinPreview('bowl');$('bowl-image-name').textContent=appearance.bowl.name;
    $('bowl-rim').value=Math.round(appearance.bowl.rim*100);$('bowl-rim-value').value=Math.round(appearance.bowl.rim*100)+'%';$('bowl-rim').disabled=!appearance.bowl.dataUrl;$('rim-preview-line').style.top=Math.round(appearance.bowl.rim*100)+'%';
    ['add-scoop-image','replace-ice-image','reset-ice-image','replace-bowl-image','import-appearance','reset-appearance','reset-bowl-image'].forEach(id=>$(id).disabled=skinBusy);
  }
  atlas.onload=extraAtlas.onload=()=>{builtinPreviews.clear();if(open)renderAppearance();};
  async function importImages(files,kind){
    if(skinBusy||!files.length)return;skinBusy=true;renderAppearance();appearanceMessage('正在本地处理图片…');
    try{
      const added=[];for(const file of files)added.push(await GelatoAppearance.importFile(file,kind));
      const next=cloneAppearance();
      if(kind==='ice')next.ice={dataUrl:added[0].dataUrl,name:added[0].name};
      else if(kind==='bowl')next.bowl={dataUrl:added[0].dataUrl,name:added[0].name,rim:.08};
      else added.forEach(asset=>next.scoops.push({id:'custom-'+(window.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),name:asset.name,enabled:true,dataUrl:asset.dataUrl}));
      commitAppearance(next,kind==='ice'?'冰球图片已更换；场上和新掉落的硬冰球立即使用。':kind==='bowl'?'盘子已更换，请把接球虚线对准图片的盘面。':`已添加 ${added.length} 款冰淇淋，新掉落时生效。`);
    }catch(error){appearanceMessage(error.message,true);}finally{skinBusy=false;renderAppearance();}
  }
  $('add-scoop-image').onclick=()=>{$('scoop-file').value='';$('scoop-file').click();};$('scoop-file').onchange=e=>importImages([...e.target.files],'scoop');
  $('replace-ice-image').onclick=()=>{$('ice-file').value='';$('ice-file').click();};$('ice-file').onchange=e=>importImages([...e.target.files].slice(0,1),'ice');
  $('reset-ice-image').onclick=()=>{const next=cloneAppearance();next.ice={...GelatoAppearance.DEFAULTS.ice};commitAppearance(next,'已恢复默认冰球图片。');};
  $('replace-bowl-image').onclick=()=>{$('bowl-file').value='';$('bowl-file').click();};$('bowl-file').onchange=e=>importImages([...e.target.files].slice(0,1),'bowl');
  $('bowl-rim').oninput=e=>{$('bowl-rim-value').value=e.target.value+'%';$('rim-preview-line').style.top=e.target.value+'%';};
  $('bowl-rim').onchange=e=>{const next=cloneAppearance();next.bowl.rim=Number(e.target.value)/100;commitAppearance(next,'接球线位置已保存。');};
  $('reset-bowl-image').onclick=()=>{const next=cloneAppearance();next.bowl={...GelatoAppearance.DEFAULTS.bowl};commitAppearance(next,'已恢复默认盘子。');};
  $('reset-appearance').onclick=()=>commitAppearance(GelatoAppearance.DEFAULTS,'已恢复默认冰淇淋、冰球和盘子素材。');
  $('export-appearance').onclick=()=>{const file=new Blob([JSON.stringify(appearance,null,2)],{type:'application/json'}),url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download='冰淇淋接球版-素材配置.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);appearanceMessage('已导出素材配置，包含图片；可在另一台电脑导入。');};
  $('import-appearance').onclick=()=>{$('appearance-file').value='';$('appearance-file').click();};
  $('appearance-file').onchange=async e=>{
    const file=e.target.files[0];if(!file||skinBusy)return;skinBusy=true;renderAppearance();appearanceMessage('正在检查素材配置…');
    try{
      if(file.size>4*1024*1024)throw new Error('素材配置超过 4 MB，请精简图片后再导入。');
      let candidate;try{candidate=JSON.parse(await file.text());}catch{throw new Error('无法读取素材配置，请选择导出的 JSON 文件。');}
      if(![1,2].includes(candidate?.version)||!Array.isArray(candidate.scoops)||!candidate.bowl)throw new Error('这不是有效的冰淇淋素材配置。');
      // Validate structure/limits without changing persistent or visible state.
      const checked=GelatoAppearance.write(candidate,{setItem(){}});
      for(const data of [...checked.scoops.map(s=>s.dataUrl),checked.bowl.dataUrl].filter(Boolean)){
        const image=new Image();image.src=data;try{await image.decode();if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>32000000)throw new Error();}catch{throw new Error('配置中有损坏或尺寸过大的图片，未修改原素材。');}
      }
      commitAppearance(checked,'素材配置已导入并保存在本机。');
    }catch(error){appearanceMessage(error.message,true);}finally{skinBusy=false;renderAppearance();}
  };

  function renderRules(){
    const root=$('rules');root.replaceChildren();
    rules.forEach((rule,index)=>{
      const spec=DEFINITIONS[rule.action],row=document.createElement('div');row.className='rule';
      const main=document.createElement('div');main.className='rule-main';
      const name=document.createElement('input');name.type='text';name.value=rule.name;name.maxLength=80;name.setAttribute('aria-label','第'+(index+1)+'条礼物名称');name.oninput=()=>{rule.name=name.value.trim();save('rules',rules);};
      const select=document.createElement('select');select.setAttribute('aria-label','第'+(index+1)+'条礼物效果');
      Object.entries(DEFINITIONS).forEach(([id,d])=>{const option=document.createElement('option');option.value=id;option.textContent=d.name;select.append(option);});select.value=rule.action;
      select.onchange=()=>{const def=DEFINITIONS[select.value];rule.action=select.value;rule.value=def.value;if(def.duration)rule.duration=def.duration;else delete rule.duration;if(rule.action==='blast')rule.blastUnit='radius';save('rules',rules);renderRules();};main.append(name,select);
      const value=document.createElement('div');value.className='rule-value';const input=document.createElement('input');input.type='number';input.min='0';input.max=spec.max;input.step='.1';input.value=rule.value;input.setAttribute('aria-label','第'+(index+1)+'条效果数值');
      input.oninput=()=>{if(input.value!==''&&input.validity.valid){rule.value=Number(input.value);save('rules',rules);}};input.onchange=()=>{rule.value=clamp(Number(input.value)||0,0,spec.max);input.value=rule.value;save('rules',rules);};const unit=document.createElement('small');unit.textContent=spec.unit==='半径'?'爆炸半径':spec.unit;value.append(input,unit);
      const duration=document.createElement('div');duration.className='rule-duration';duration.hidden=!spec.duration;
      if(spec.duration){const seconds=document.createElement('input');seconds.type='number';seconds.min='.1';seconds.max='600';seconds.step='.1';seconds.value=rule.duration??spec.duration;seconds.setAttribute('aria-label','第'+(index+1)+'条持续秒数');seconds.oninput=()=>{if(seconds.value!==''&&seconds.validity.valid){rule.duration=Number(seconds.value);save('rules',rules);}};seconds.onchange=()=>{rule.duration=clamp(Number(seconds.value)||spec.duration,.1,600);seconds.value=rule.duration;save('rules',rules);};const label=document.createElement('small');label.textContent='持续秒数';duration.append(seconds,label);}
      const del=document.createElement('button');del.className='rule-delete';del.textContent='×';del.setAttribute('aria-label','删除第'+(index+1)+'条规则');del.onclick=()=>{rules.splice(index,1);save('rules',rules);renderRules();};
      row.append(main,value,duration,del);root.append(row);
    });
  }
  $('add-rule').onclick=()=>{if(rules.length>=100){toast('最多添加100条规则');return;}rules.push({name:'新礼物',action:'reverse',value:5});save('rules',rules);renderRules();$('rules').lastElementChild.scrollIntoView({block:'end',behavior:'smooth'});};
  $('reset-rules').onclick=()=>{rules=GelatoGifts.DEFAULT_RULES.map(r=>({...r}));save('rules',rules);renderRules();};
  Object.entries(DEFINITIONS).forEach(([action,d])=>{const btn=document.createElement('button');btn.dataset.effect=action;btn.textContent=d.name;const small=document.createElement('small');small.textContent=action==='blast'?'半径 '+d.value:d.value+d.unit+(d.duration?' · '+d.duration+'秒':'');btn.append(small);btn.onclick=()=>{const options=d.duration?{duration:d.duration}:{};const result=applyEffect(action,d.value,null,options);$('test-result').textContent=result===false?'关卡已结束，效果未应用。':'已执行：'+effectText(action,d.value,options)+(action==='blast'?'，命中 '+result+' 个冰球':'')+'。关闭设置并继续后，时长开始消耗。';};$('test-buttons').append(btn);});
  $('test-gift').onclick=()=>{const name=$('test-gift-name').value.trim(),num=$('test-gift-count');if(!num.checkValidity()){num.reportValidity();return;}const gift=GelatoGifts.normalizeGift({giftName:name,count:Number(num.value)},true);if(!gift){$('test-result').textContent='请填写有效礼物名称与数量。';return;}const count=receiveGift(gift);$('test-result').textContent=['won','lost'].includes(game.status)?'关卡已结束，效果未应用。':count?`模拟 ${name} × ${gift.count}，触发 ${count} 条规则。`:'没有匹配规则，请在「礼物规则」中设置相同礼物名。';};

  function updateHud(){
    choiceControls?.sync();
    const changed=previousStatus!==game.status;
    if(changed&&game.status==='won'){clearedIds.add(game.config.id);saveV4('completed',[...clearedIds]);}
    previousStatus=game.status;
    $('level-title').textContent=`关卡 ${game.level} / ${levels.length} · ${game.config.name}`;$('level-title').title=game.config.name;
    $('timer').textContent=formatTime(game.timeLeft);$('timer').classList.toggle('urgent',game.timeLeft<=15);
    $('layers').textContent=formatHeight(game.progressHeight);$('goal').textContent=formatHeight(game.goal);$('goal-label').textContent=game.config.mode==='twin'?'每容器高度 / 目标':'高度 / 目标';$('height-fill').style.width=clamp(game.progressHeight/game.goal*100,0,100)+'%';
    $('throws-left').textContent=game.unlimitedAttempts?'无限':game.attemptsLeft;
    $('wind-indicator').hidden=game.config.mode!=='wind'&&!game.tricks.gust;
    if(game.config.mode==='wind'||game.tricks.gust)$('wind-indicator').textContent=!game.tricks.gust&&game.config.windForce<=0?'阵风已关闭':game.status==='ready'||game.status==='paused'&&game._resumeStatus==='ready'?'阵风准备 · 开始后生效':game.wind.direction&&game.wind.strength>.01?(game.wind.direction>0?'→ 向右阵风':'← 向左阵风')+'\n风力 '+Math.round(game.wind.strength*100)+'% · '+(game.wind.force??game.config.windForce).toFixed(1)+'倍':'风停 · '+Math.max(0,game.wind.nextIn).toFixed(1)+' 秒后再起风';
    effectHud.render(game.tricks.snapshot(),game.status);placeWind();
    $('bowl-progress').hidden=game.config.mode!=='twin';$('bowl-progress').textContent=game.config.mode==='twin'?`左：${formatHeight(game.bowlHeights[0])}　右：${formatHeight(game.bowlHeights[1])}`:'';
    let state=game.status==='paused'?'已暂停':game.status==='ready'?(game.dropStatus==='empty'?'等待补充冰球':'未开始'):game.dropStatus==='waiting'?'等待下一球':'接球中';
    if(game.status==='lost')state=game.lossReason==='attempts'?'冰球已用完':'时间结束';
    if(game.status==='won')state=completedIndices().size===levels.length?'全部通过':'已通过';
    $('run-state').textContent=state;
    $('start-game').textContent=game.status==='ready'?'开始':game.status==='paused'?'继续':game.status==='lost'?'重玩本关':game.status==='won'?(completedIndices().size===levels.length?'重新开始':'下一关'):'已开始';
    $('start-game').disabled=open||game.status==='playing'||(game.status==='ready'&&game.dropStatus==='empty');$('pause-game').disabled=open||game.status!=='playing';$('open-settings').disabled=open;
    $('drop').disabled=['won','lost'].includes(game.status);$('pause').disabled=['won','lost'].includes(game.status);$('pause').textContent=open?(resumeAfterSettings?'关闭后暂停':'关闭后继续'):(game.status==='paused'?'继续':'暂停');$('next-level').disabled=game.status!=='won';
    const unit=game.unlimitedAttempts?'无限':`${game.attemptsLeft} 个`;
    $('test-state').textContent=`模式：${GelatoLevels.MODES.find(m=>m.id===game.config.mode).name}；盘宽 ${Math.round(game.bowls[0].width)}；每次 1 球；盘子速度 ${Math.round(game.params.move)}；下坠 ${game.params.fall.toFixed(2)} 倍；新球尺寸 ${(game.rowRadius/game.baseRadius).toFixed(2)} 倍；间隔 ${game.config.spawnInterval} 秒；计时 ${game.params.timeRate.toFixed(2)} 倍；剩余掉落 ${unit}；已接住 ${game.caught} 个，漏接 ${game.missed} 个。`;
    if(open)$('skin-summary').textContent=`已启用 ${activeSkins.length} 种图片；每次随机掉落一个。`;
    if(changed){placeHud();placeControls();if(game.status==='won')showWinPopup();}
  }

  function sprite(crop,x,y,w,h,image=atlas){if(!crop||!image.complete||!image.naturalWidth)return false;ctx.drawImage(image,crop[0],crop[1],crop[2],crop[3],x,y,w,h);return true;}
  function drawIceBall(x,y,r,angle,alpha,paint=ctx,useCustom=true){
    paint.save();paint.translate(x,y);paint.rotate(angle);paint.globalAlpha=alpha;
    const custom=useCustom&&appearance.ice.dataUrl?skinImage(appearance.ice.dataUrl):null;if(custom?.complete&&custom.naturalWidth){const scale=Math.min(r*2/custom.naturalWidth,r*2/custom.naturalHeight),w=custom.naturalWidth*scale,h=custom.naturalHeight*scale;paint.drawImage(custom,-w/2,-h/2,w,h);paint.restore();return;}
    const gradient=paint.createRadialGradient(-r*.3,-r*.45,r*.08,0,0,r);gradient.addColorStop(0,'#f2fdff');gradient.addColorStop(.4,'#b9eaff');gradient.addColorStop(1,'#5099cd');
    paint.fillStyle=gradient;paint.strokeStyle='#3677a8';paint.lineWidth=Math.max(1.5,r*.075);paint.beginPath();paint.arc(0,0,r,0,Math.PI*2);paint.fill();paint.stroke();
    paint.strokeStyle='#efffff99';paint.lineWidth=Math.max(1,r*.04);paint.beginPath();paint.moveTo(-r*.65,-r*.4);paint.lineTo(-r*.12,-r*.66);paint.lineTo(r*.45,-r*.27);paint.lineTo(r*.6,r*.4);paint.moveTo(-r*.12,-r*.66);paint.lineTo(-r*.28,r*.3);paint.lineTo(r*.6,r*.4);paint.stroke();
    paint.fillStyle='#24567b';for(const side of [-1,1]){paint.beginPath();paint.arc(side*r*.28,0,r*.06,0,Math.PI*2);paint.fill();}paint.strokeStyle='#24567b';paint.beginPath();paint.arc(0,r*.11,r*.12,0,Math.PI);paint.stroke();paint.restore();
  }
  function drawScoop(x,y,r,skin,angle=0,squash=0,alpha=1,hardIce=false){
    if(hardIce){drawIceBall(x,y,r,angle,alpha);return;}
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.translate(0,r*.89);ctx.scale(1+squash*.28,1-squash*.24);ctx.translate(0,-r*.89);ctx.globalAlpha=alpha;
    const flavor=skin?.builtin||0,{crop,image}=builtinSource(flavor);
    const custom=skin?.dataUrl?skinImage(skin.dataUrl):null;
    let drawn=false;
    if(custom?.complete&&custom.naturalWidth){const scale=Math.min(r*2.16/custom.naturalWidth,r*2/custom.naturalHeight),w=custom.naturalWidth*scale,h=custom.naturalHeight*scale;ctx.drawImage(custom,-w/2,r*.89-h,w,h);drawn=true;}
    if(!drawn&&!skin?.dataUrl)drawn=sprite(crop,-r*1.12,-r*1.1,r*2.24,r*2.04,image);
    if(!drawn){
      // Code-native fallback keeps local playback usable if a browser rejects an image.
      ctx.fillStyle=palette[flavor%6];ctx.strokeStyle='#74533e';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(-r*.9,r*.58);ctx.bezierCurveTo(-r*1.25,-r*.2,-r*.6,-r*1.12,0,-r);ctx.bezierCurveTo(r*.85,-r*1.1,r*1.15,-r*.2,r*.9,r*.6);ctx.quadraticCurveTo(r*.6,r,r*.32,r*.74);ctx.quadraticCurveTo(0,r,-r*.28,r*.74);ctx.quadraticCurveTo(-r*.7,r,-r*.9,r*.58);ctx.fill();ctx.stroke();ctx.fillStyle='#644737';ctx.beginPath();ctx.arc(-r*.29,0,r*.06,0,Math.PI*2);ctx.arc(r*.29,0,r*.06,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,r*.08,r*.13,0,Math.PI);ctx.stroke();ctx.fillStyle='#fff8ed90';ctx.beginPath();ctx.ellipse(-r*.26,-r*.58,r*.2,r*.1,-.4,0,7);ctx.fill();
    }
    ctx.restore();
  }
  function star(x,y,r,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr=i%2?r*.43:r;if(i===0)ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);else ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.restore();}
  function drawPlateShape(context,x,y,bw,front){
    context.save();context.lineWidth=3;context.strokeStyle='#547c70';
    if(!front){context.fillStyle='#9bcfbb';context.beginPath();context.ellipse(x,y+9,bw*.53,19,0,0,Math.PI*2);context.fill();context.stroke();context.fillStyle='#f4fff7';context.beginPath();context.ellipse(x,y+5,bw*.46,12,0,0,Math.PI*2);context.fill();}
    else{context.fillStyle='#84baa6';context.beginPath();context.moveTo(x-bw*.53,y+9);context.bezierCurveTo(x-bw*.41,y+35,x+bw*.41,y+35,x+bw*.53,y+9);context.bezierCurveTo(x+bw*.36,y+24,x-bw*.36,y+24,x-bw*.53,y+9);context.closePath();context.fill();context.stroke();context.strokeStyle='#e2f9e9';context.lineWidth=2;context.beginPath();context.ellipse(x,y+6,bw*.49,15,0,0,Math.PI);context.stroke();}
    context.restore();
  }
  function drawBowl(bowl,front=false){
    const {x,width:bw,y}=bowl;
    if(!front&&!prefs.transparent){ctx.fillStyle='#151c2140';ctx.beginPath();ctx.ellipse(x,y+37,bw*.57,8,0,0,Math.PI*2);ctx.fill();}
    if(appearance.bowl.dataUrl){if(front){const custom=skinImage(appearance.bowl.dataUrl),geometry=customBowlGeometry(bowl);if(custom.complete&&custom.naturalWidth)ctx.drawImage(custom,x-bw/2,y-geometry.above,bw,geometry.height);}return;}
    drawPlateShape(ctx,x,y,bw,front);
  }
  function drawEnvironment(){
    const spec=game.levelSpec;
    if(game.wind.direction&&game.wind.strength>0){
      const dir=game.wind.direction;ctx.save();ctx.strokeStyle=spec.theme.mint;ctx.lineWidth=2.6;ctx.globalAlpha=.3+game.wind.strength*.4;
      for(let i=0;i<11;i++){const x=game.viewLeft+30+((visualTime*210*dir+i*113)%(game.viewRight-game.viewLeft)+(game.viewRight-game.viewLeft))%(game.viewRight-game.viewLeft),y=game.rowY+72+(i%4)*76;ctx.beginPath();ctx.moveTo(x-dir*86,y);ctx.quadraticCurveTo(x-dir*37,y-10,x,y);ctx.lineTo(x-dir*11,y-7);ctx.moveTo(x,y);ctx.lineTo(x-dir*11,y+7);ctx.stroke();}
      ctx.restore();
    }
  }
  // These deformations are visual only; contact geometry and measured height stay in the engine.
  function drawAnimatedScoop(s){
    const {x,y}=s.body.position,r=s.r,screenY=(y+game.cameraY)*screen.scale+screen.oy;
    if(screenY < -r*screen.scale*3 || screenY > screen.h+r*screen.scale*3)return;
    const previous=motionSamples.get(s.body.id),dt=previous?visualTime-previous.time:0;
    const speed=dt>0?clamp((y-previous.y)/dt,-1800,1800):(previous?.speed||0);
    if(dt>0||!previous)motionSamples.set(s.body.id,{y,time:visualTime,speed});
    const contact=landingTimes.get(s.body.id),age=contact?visualTime-contact.time:10;
    const airborne=!s.supportLayer&&!s.locked;
    const squash=s.hardIce?0:GelatoRigidPhysics.compression(age,contact?.strength||0,!airborne);
    const alpha=clamp(1-(y-game.bowlY-100)/160,0,1)*(s.opacity??1);
    if(airborne&&speed>160&&age>.12){
      ctx.save();ctx.strokeStyle='#fff9e0';ctx.lineWidth=2.2;ctx.lineCap='round';ctx.globalAlpha=clamp(speed/1600,.05,.3)*alpha;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(x+side*r*.78,y-r*.35);ctx.lineTo(x+side*r*.78,y-r*(1.1+clamp(speed/1000,0,1)));ctx.stroke();}ctx.restore();
    }
    drawScoop(x,y,r,s.skin||skinAt(0,s.flavor),s.body.angle,squash,alpha,s.hardIce);
  }
  function drawHeightGuide(){
    const y=game.bowlY-game.goal,sy=(y+game.cameraY)*screen.scale+screen.oy;
    if(sy<85||sy>screen.h-50)return;
    const left=Math.max(game.viewLeft+18,Math.min(...game.bowls.map(b=>b.x-b.width*.6))),right=Math.min(game.viewRight-18,Math.max(...game.bowls.map(b=>b.x+b.width*.6)));
    ctx.save();ctx.strokeStyle=game.levelSpec.theme.mint;ctx.fillStyle=game.levelSpec.theme.mint;ctx.globalAlpha=.7;ctx.lineWidth=1.5;ctx.setLineDash([5,8]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);ctx.font='600 13px "Microsoft YaHei"';ctx.textAlign='right';ctx.fillText('目标 '+formatHeight(game.goal),right,y-10);ctx.restore();
  }
  function drawContactEffects(){
    for(const ring of contactRings){const t=(visualTime-ring.time)/.24;if(t<0||t>1)continue;ctx.save();ctx.globalAlpha=(1-t)*.22;ctx.fillStyle='#fff0da';ctx.beginPath();ctx.ellipse(ring.x,ring.y,ring.r*(.55+t*.18),2*(1-t)+1,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(const ring of releaseRings){const t=(visualTime-ring.time)/.28;if(t<0||t>1)continue;ctx.save();ctx.globalAlpha=(1-t)*.45;ctx.strokeStyle='#fff5dc';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(ring.x,ring.y,ring.r*(.8+t*.5),ring.r*.28*(1-t)+1,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
  }
  function drawBlastEffects(){
    for(const wave of blastWaves){
      const t=clamp((visualTime-wave.time)/.85,0,1);if(t>=1)continue;
      const r=wave.radius,grow=1-Math.pow(1-clamp(t/.42,0,1),3);
      ctx.save();
      // The outer boundary matches the same radius used for damage, including while paused.
      const glow=ctx.createRadialGradient(wave.x,wave.y,0,wave.x,wave.y,r);
      glow.addColorStop(0,'rgba(255,216,128,'+(1-t)*.3+')');glow.addColorStop(.55,'rgba(255,166,84,'+(1-t)*.14+')');glow.addColorStop(1,'rgba(255,149,67,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(wave.x,wave.y,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#ffc176';ctx.lineWidth=2;ctx.globalAlpha=(1-t)*.65;ctx.setLineDash([6,7]);ctx.beginPath();ctx.arc(wave.x,wave.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=(1-t)*.95;ctx.strokeStyle='#ffe5a6';ctx.lineWidth=4*(1-t)+1;ctx.beginPath();ctx.arc(wave.x,wave.y,Math.max(1,r*grow),0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#fff3cb';for(let i=0;i<10;i++){const a=i*Math.PI/5;star(wave.x+Math.cos(a)*r*grow,wave.y+Math.sin(a)*r*grow,Math.min(9,r*.07)*(1-t),a+t);}
      ctx.restore();
    }
  }
  function draw(){
    const {w,h,scale,ox,oy,dpr}=screen;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    ctx.save();ctx.translate(ox+Math.sin(visualTime*97)*shake*.5,oy+Math.cos(visualTime*113)*shake*.5);ctx.scale(scale,scale);ctx.translate(0,game.cameraY);
    const bowlY=game.bowlY;
    drawEnvironment();drawHeightGuide();drawBlastEffects();game.bowls.forEach(bowl=>drawBowl(bowl));
    for(const s of game.scoops)drawAnimatedScoop(s);
    game.bowls.forEach((bowl,index)=>drawBowl(bowl,true,index));drawContactEffects();
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.45,0,1);ctx.fillStyle=p.color;if(p.star)star(p.x,p.y,p.r*1.4,p.angle);else{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();}}ctx.globalAlpha=1;
    for(const b of bites){ctx.save();ctx.globalAlpha=b.life/.45;ctx.translate(b.x,b.y);ctx.strokeStyle='#b68558';ctx.lineWidth=3;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(0,0,b.r,Math.PI*.35,Math.PI*1.7);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b27851';ctx.font='bold 18px "Microsoft YaHei"';ctx.textAlign='center';ctx.restore();}
    for(const p of popups){ctx.globalAlpha=clamp(p.life/.4,0,1);ctx.fillStyle=p.color;ctx.font='bold 19px "Microsoft YaHei"';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y);}ctx.globalAlpha=1;
    ctx.restore();
  }
  function handleEvents(){
    for(const event of game.events.splice(0)){
      if(event.type==='drop'){
        const scoop=game.scoops.find(s=>s.body.id===event.bodyId);if(scoop){scoop.skin={...skinAt(event.batch??game.dropped-1,0)};scoop.visualBorn=visualTime;releaseRings.push({x:event.x,y:event.y,r:scoop.r,time:visualTime});}sound('drop');
      }
      else if(event.type==='land'){
        const s=game.scoops.find(s=>s.body.id===event.bodyId)||game.scoops.find(s=>Math.hypot(s.body.position.x-event.x,s.body.position.y-event.y)<s.r*.7);
        if(s){landingTimes.set(s.body.id,{time:visualTime,strength:clamp((event.speed||400)/700,.45,1)});contactRings.push({x:s.body.position.x,y:s.body.bounds.max.y,r:s.r,time:visualTime});for(const bowl of game.bowls)if(Math.abs(s.body.bounds.max.y-bowl.y)<18)bowlImpacts.set(bowl.id,visualTime);}
        if(contactRings.length>80)contactRings.splice(0,contactRings.length-80);sound('land');
      }
      else if(event.type==='blast'){
        const x=event.x??game.bowls[0].x,y=event.y??game.bowlY-game.height,radius=event.radius||100;
        blastWaves.push({x,y,radius,time:visualTime});if(blastWaves.length>6)blastWaves.shift();
        shake=Math.max(shake,clamp(3+radius/40,3,9));sound('blast');burst(x,y,'#ffd681',Math.min(48,24+(event.count||0)*2),1.1);
      }
      else if(event.type==='eat'){sound('eat');}
      else if(event.type==='win'){sound('win');for(let i=0;i<5;i++)burst(300+i*100,game.bowlY-game.height-50,palette[i],20,2);}
    }
  }
  let hudAt=0;
  function loop(now){const dt=Math.min((now-(lastTime||now))/1000,.1);lastTime=now;if(game.status!=='paused')visualTime+=dt;game.step(dt);handleEvents();
    if(game.status!=='paused'){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=340*dt;p.angle+=dt*3;if(p.life<=0)particles.splice(i,1);}for(let i=bites.length-1;i>=0;i--){bites[i].life-=dt;if(bites[i].life<=0)bites.splice(i,1);}for(let i=popups.length-1;i>=0;i--){popups[i].life-=dt;popups[i].y-=dt*35;if(popups[i].life<=0)popups.splice(i,1);}shake=Math.max(0,shake-dt*24);}
    for(const list of [contactRings,releaseRings,blastWaves])while(list.length&&visualTime-list[0].time>1)list.shift();
    if(now-hudAt>90){const ids=new Set(game.scoops.map(s=>s.body.id));for(const map of [landingTimes,motionSamples])for(const id of map.keys())if(!ids.has(id))map.delete(id);}
    for(let i=feedItems.length-1;i>=0;i--)if(now>feedItems[i].expires){feedItems[i].node.remove();feedItems.splice(i,1);}
    if(now>toastUntil)$('toast').textContent='';if(now-hudAt>90){updateHud();hudAt=now;}draw();requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange',()=>{lastTime=0;});
  applyPrefs();resize();renderLevelEditor();refreshPhysicsControls();choiceControls=new GelatoButtonChoices.Controls($('drawer'));updateHud();requestAnimationFrame(loop);
})();
