(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const names=['小狐狸','小青蛙','小黄鸡','小猫头鹰','小粉猪','小蓝熊'];
  const game=new MatchGame();
  const pieces=$('#pieces'), nodes=new Map();
  let selected=null, busy=false, paused=false, sound=false, audio=null, epoch=0;
  let display=game.state(), pointer=null, moved=false, playClock=0, lastTime=0, idleSince=0, cooldownUntil=0;
  const waiters=[];
  const timed={fog:0,curse:0};let challenge=null,autoPrank=false,nextPrank=0,lastPrankStatus='';
  const live=makeGameLive('match3',{canRun:()=>!busy&&!paused&&playClock>=cooldownUntil,execute:spec=>receivePrank(spec.kind,spec),onGift:gift=>overtime.onGift(gift)});
  let lastBillRecord=null,lastBillText='';
  const overtime=createOvertimeLink({plugin:'萌宠消消乐',settingsKey:'match3-overtime-settings-v1',roundPrefix:'match3-charge',label:'积分不够',onChange:renderFeeConnection});
  const collector=new PointCollector({getBalance:()=>game.score,setBalance:value=>{game.score=value;},onCharge:collectPoints});
  game.setDifficulty(collector.snapshot().difficulty);
  const difficultyNames={standard:'标准',hard:'困难',hell:'地狱'};
  function renderFeeConnection(state){
    $('#fee-connection').textContent=state.enabled?state.statusText:'联动已关闭';$('#fee-connection').dataset.ready=String(state.enabled&&state.connection==='ready');
    $('#fee-enabled').checked=state.enabled;$('#fee-penalty').textContent=`+${state.minutes} 分钟`;
    $('#fee-connection-settings').hidden=state.mode==='baiyao'||state.target==='local';
    if(document.activeElement!==$('#fee-minutes'))$('#fee-minutes').value=state.minutes;
    if(document.activeElement!==$('#fee-key'))$('#fee-key').value=state.key;
    if(lastBillRecord&&state.last?.roundId===lastBillRecord.roundId){lastBillRecord.status=state.last.status;lastBillRecord.change=state.last.change;}
    if(typeof collector!=='undefined')renderBilling();
  }
  function collectPoints(receipt){
    lastBillRecord=null;
    if(receipt.shortfall){
      lastBillRecord=overtime.onLoss(overtime.beginRound());
      const detail=lastBillRecord.seconds?`加班 +${lastBillRecord.seconds/60} 分钟，送去加班机`:'加班机联动已关闭';
      toast(lastBillRecord.seconds?`积分不够！加班 +${lastBillRecord.seconds/60} 分钟`:'积分不够，未启用加班');
      log(`第 ${receipt.index} 期应交 ${receipt.required} 分，实收 ${receipt.paid} 分；${detail}。`);beep(1,'invalid');
    }else{toast(`交积分 -${receipt.paid.toLocaleString()}`);log(`第 ${receipt.index} 期收走 ${receipt.paid} 分，过关！下一期继续。`);beep(2);}
    draw(game.state());renderBilling();
  }
  function renderBilling(){
    const state=collector.snapshot(),connection=overtime.snapshot();
    const seconds=Math.ceil(state.remainingMs/1000),clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    $('#fee-countdown').textContent=state.started?clock:'未开始';$('#fee-target').textContent=state.amount.toLocaleString();$('.billing-hud').classList.toggle('urgent',state.started&&seconds<=10);
    $('#fee-totals').textContent=`已收 ${state.periods} 期 · 不足 ${state.insufficient} 次 · 已加班 ${connection.sentCount} 次${connection.pendingCount?` · 待发 ${connection.pendingCount} 次`:''}`;
    let text='首个有效消除后开始计时，重置棋盘保留积分和倒计时。';
    if(state.last){const r=state.last;
      text=`第 ${r.index} 期：应交 ${r.required.toLocaleString()}，实收 ${r.paid.toLocaleString()}。`;
      if(r.shortfall)text+=lastBillRecord?.seconds?`加班 +${lastBillRecord.seconds/60} 分钟 · ${lastBillRecord.status!=='sent'?'等连上加班机再加，刷新会清空':lastBillRecord.change==='0'?'加班机已经到点，没再加':'已加到加班机'}`:'积分不足，加班机联动已关闭。';
      else text+='积分够了，这次不用加班。';
    }
    if(text!==lastBillText){lastBillText=text;$('#fee-last').textContent=text;}
  }
  function syncCollectionSettings(){
    const state=collector.snapshot();$('#fee-interval').value=state.intervalSeconds;$('#fee-amount').value=state.amount;$('#fee-difficulty').value=state.difficulty;
    const p=game.profile;$('#fee-difficulty-note').textContent=`${difficultyNames[state.difficulty]}：每只 ${p.base} 分 · 连消${p.cap===Infinity?'倍率不封顶':`最多 ${p.cap} 倍`} · 目标奖励 ${p.reward} 分`;
  }
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration=n=>reduced?Math.min(n,25):n;
  const positions=t=>`--x:${(t.type%3)*50}%;--y:${Math.floor(t.type/3)*100}%;`;
  $('.cells').innerHTML='<div class="cell"></div>'.repeat(64);
  function log(message){$('#activity').lastElementChild.textContent=message;}
  function beep(combo=1,kind='pop'){
    if(!sound) return;
    try{
      if(!audio) audio=new(window.AudioContext||window.webkitAudioContext)();
      if(audio.state==='suspended') audio.resume().catch(()=>{});
      const osc=audio.createOscillator(), gain=audio.createGain();
      osc.connect(gain);gain.connect(audio.destination);osc.type='sine';
      const now=audio.currentTime, frequency=kind==='invalid'?180:430+Math.min(combo,8)*95;
      osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(frequency*(kind==='invalid'?.7:1.4),now+.12);
      gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.045,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.19);
      osc.start(now);osc.stop(now+.2);
    }catch{/* Audio never blocks a turn. */}
  }
  function draw(state){
    display=state;
    const live=new Set(state.board.filter(Boolean).map(t=>t.id));
    for(const[id,node]of nodes) if(!live.has(id)){node.remove();nodes.delete(id);}
    state.board.forEach((t,i)=>{
      if(!t) return;
      let node=nodes.get(t.id), fresh=!node;
      if(fresh){node=document.createElement('button');node.type='button';node.innerHTML='<span class="animal"></span><span class="special-mark"></span><span class="ice-mark">❄</span>';pieces.append(node);nodes.set(t.id,node);}
      node.className=`piece${t.ice?' frozen':''}${t.chain?' chained':''}${t.special?' special-'+t.special:''}${selected===i?' selected':''}${fresh?' spawn':''}`;
      node.dataset.index=i;node.dataset.type=t.type;node.dataset.special=t.special;node.dataset.ice=t.ice;node.dataset.chain=t.chain||0;
      node.style.left=`${(i%8)*12.5}%`;node.style.top=`${Math.floor(i/8)*12.5}%`;
      node.firstElementChild.style.cssText=positions(t);
      node.setAttribute('aria-label',`第${Math.floor(i/8)+1}行第${i%8+1}列 ${t.special==='rainbow'?'彩虹球':names[t.type]}${t.ice?' 已冻结':''}${t.chain?' 已上锁链':''}${t.special==='row'?' 横扫特效':t.special==='col'?' 竖扫特效':''}`);
      node.setAttribute('aria-pressed',String(selected===i));
      node.tabIndex=paused?-1:0;
    });
    $('#score').textContent=state.score.toLocaleString('en-US');
    $('#moves').textContent=state.moves;
    $('#combo').textContent=state.bestCombo?`${state.bestCombo} 连`:'—';
    $('#round').textContent=`第 ${String(state.stage).padStart(2,'0')} 轮`;
    $('.goal-caption').textContent=`完成奖励 ${state.goalReward.toLocaleString()} 分，接着玩下一轮`;
    const counts=state.goalTypes.map(t=>Math.min(state.target,state.collected[t]-state.baseline[t]));
    const progress=counts.reduce((a,b)=>a+b,0)/(state.target*2);
    $('#progress-fill').style.width=`${progress*100}%`;
    $('#progress-text').textContent=`${counts.reduce((a,b)=>a+b,0)} / ${state.target*2}`;
    document.querySelectorAll('.star').forEach((node,i)=>node.classList.toggle('lit',progress>=[.25,.65,1][i]));
    $('#goals').innerHTML=state.goalTypes.map((type,j)=>`<div class="goal-item${counts[j]>=state.target?' complete':''}"><span class="animal" style="--x:${type%3*50}%;--y:${Math.floor(type/3)*100}%" role="img" aria-label="${names[type]}"></span><span class="goal-count"><b>${counts[j]}</b> / ${state.target}</span></div>`).join('');
  }
  function toast(text){const el=$('#combo-toast');el.classList.remove('show');void el.offsetWidth;el.textContent=text;el.classList.add('show');}
  function clearSelection(){selected=null;pieces.querySelectorAll('.selected,.hinted').forEach(n=>{n.classList.remove('selected','hinted');n.setAttribute('aria-pressed','false');});}
  function wait(ms,token){return new Promise(resolve=>waiters.push({end:playClock+duration(ms),token,resolve}));}
  function frame(time){
    const dt=lastTime?Math.min(50,time-lastTime):0;lastTime=time;
    if(!paused){playClock+=dt;if(busy&&challenge)challenge.end+=dt;}
    for(let i=waiters.length-1;i>=0;i--) if(waiters[i].token!==epoch || playClock>=waiters[i].end){const[w]=waiters.splice(i,1);w.resolve(w.token===epoch);}
    if(!busy&&!paused){
      if(challenge){
        const count=game.collected.reduce((a,b)=>a+b,0)-challenge.start;
        if(count>=12){challenge=null;game.score+=300;draw(game.state());toast('扛住了！+300');log('10 秒催命任务完成，奖励 300 分！');}
        else if(playClock>=challenge.end){challenge=null;game.score=Math.max(0,game.score-500);log('没来得及！扣 500 分，还被补上了一轮冰块');toast('催命失败！-500');animate(game.effect('ice'),'penalty');}
      }
      if(!busy&&autoPrank&&playClock>=nextPrank&&playClock>=cooldownUntil){nextPrank=playClock+9000;live.simulateEffect(['ice','chain','fog','chaos','curse','challenge'][Math.floor(Math.random()*6)],'auto');}
      if(!busy&&collector.difficulty==='standard'&&playClock-idleSince>10000){showHint(true);idleSince=playClock;}
    }
    collector.tick(dt,{paused,canSettle:!busy});renderBilling();
    renderPrankStatus();live.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  async function animate(result,kind='move'){
    if(!result)return;
    if(result.frames.some(step=>step.kind==='clear')){collector.start();overtime.local.autoStart();}
    busy=true;clearSelection();updateControls();
    const token=epoch,oldStage=display.stage;
    for(const step of result.frames){
      if(token!==epoch)return;
      draw(step.state);
      if(step.kind==='clear'){
        for(const id of step.ids)nodes.get(id)?.classList.add('pop');
        beep(step.combo);
        if(step.combo>=2)toast(`${step.combo} 连消！${step.combo>=4?'太棒啦':'好耶'}`);
        if(!await wait(230,token))return;
      }else if(step.kind==='swap'||step.kind==='invalid'){
        if(step.kind==='invalid')beep(1,'invalid');
        if(!await wait(200,token))return;
      }else{
        if(step.kind==='shuffle')log('没有可交换的组合，已经帮你自动洗牌');
        if(!await wait(280,token))return;
      }
    }
    if(token!==epoch)return;
    draw(game.state());
    if(game.stage>oldStage){toast(`目标达成！+${game.profile.reward}`);log(`第 ${oldStage} 轮完成！奖励 ${game.profile.reward} 分，新目标已就位`);beep(4);}
    else if(kind==='move'){
      if(result.valid)log(result.combo>1?`太棒了！触发 ${result.combo} 连消，继续收集小动物吧`:'消除成功！四连、五连还能生成特别棋子');
      else if(result.reason==='no-match'&&timed.curse>playClock){game.score=Math.max(0,game.score-100);draw(game.state());log('手滑诅咒触发！无效交换扣 100 分');toast('手滑！-100');}
      else log(result.reason==='frozen'?'这只小动物被锁住了，消除旁边的小动物来解锁':'这次没有凑成三只，换一对试试看');
    }
    busy=false;idleSince=playClock;updateControls();
  }
  function swap(a,b){
    if(busy||paused)return;
    if(!game.adjacent(a,b)){selected=b;draw(display);return;}
    animate(game.swap(a,b));
  }
  function choose(index){
    if(busy||paused)return;
    idleSince=playClock;
    if(game.board[index].ice||game.board[index].chain){beep(1,'invalid');log(game.board[index].chain?'锁链需 2 次相邻消除打断，最多持续 6 次有效交换':'冰块会在相邻消除后破碎，也会在 3 次有效交换内融化');return;}
    pieces.querySelectorAll('.hinted').forEach(n=>n.classList.remove('hinted'));
    if(selected===null){selected=index;draw(display);}
    else if(selected===index){clearSelection();}
    else swap(selected,index);
  }
  pieces.addEventListener('click',e=>{const target=e.target.closest('.piece');if(moved){moved=false;return;}if(!target)return;choose(Number(target.dataset.index));});
  pieces.addEventListener('pointerdown',e=>{
    const node=e.target.closest('.piece');if(!node||busy||paused)return;
    pointer={id:e.pointerId,index:Number(node.dataset.index),x:e.clientX,y:e.clientY};moved=false;
    node.setPointerCapture?.(e.pointerId);
  });
  pieces.addEventListener('pointerup',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(Math.hypot(dx,dy)>18){
      moved=true;const from=pointer.index;
      const to=Math.abs(dx)>Math.abs(dy)?from+(dx>0?1:-1):from+(dy>0?8:-8);
      if(game.adjacent(from,to))swap(from,to);
    }
    pointer=null;
  });
  pieces.addEventListener('pointercancel',()=>{pointer=null;moved=false;});
  pieces.addEventListener('keydown',e=>{
    const node=e.target.closest('.piece');if(!node||busy||paused)return;
    const i=Number(node.dataset.index),key={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}[e.key];
    if(!key)return;e.preventDefault();const to=i+key;
    if(game.adjacent(i,to)){if(e.shiftKey)swap(i,to);else nodes.get(game.board[to].id)?.focus();}
  });
  function showHint(auto=false){
    if(busy||paused)return;
    clearSelection();const move=game.possibleMoves()[0];
    if(!move)return;
    move.forEach(i=>nodes.get(game.board[i].id)?.classList.add('hinted'));
    if(!auto)log('发光的两只小动物可以交换，试试看吧');
    idleSince=playClock;
  }
  function updateControls(){
    $('#hint').disabled=$('#shuffle').disabled=busy||paused;
    document.querySelectorAll('[data-effect]').forEach(n=>n.disabled=busy||paused||playClock<cooldownUntil);
  }
  $('#hint').onclick=()=>showHint();
  $('#shuffle').onclick=()=>{
    if(busy||paused)return;clearSelection();game.shuffle();draw(game.state());beep(1);log('小动物们换好位置啦！洗牌不扣分');idleSince=playClock;
  };
  $('#restart').onclick=()=>{
    live.clearQueue('重置棋盘，旧礼物候场已清理');
    epoch++;selected=null;busy=false;pointer=null;moved=false;cooldownUntil=0;idleSince=playClock;
    timed.fog=0;timed.curse=0;challenge=null;nextPrank=playClock+9000;lastPrankStatus='';
    paused=false;pieces.inert=false;$('#pause-overlay').hidden=true;$('#pause').setAttribute('aria-label','暂停游戏');$('#combo-toast').classList.remove('show');
    const balance=game.score;game.reset();game.score=balance;draw(game.state());log('棋盘重置了，积分和收分倒计时保留，继续冲分');updateControls();
  };
  function setPaused(value){
    paused=value;pointer=null;moved=false;clearSelection();$('#pause-overlay').hidden=!paused;
    $('#pause').setAttribute('aria-label',paused?'继续游戏':'暂停游戏');pieces.inert=paused;
    updateControls();if(!paused)idleSince=playClock;
  }
  $('#pause').onclick=()=>setPaused(!paused);$('#resume').onclick=()=>setPaused(false);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setPaused(true);});
  window.addEventListener('blur',()=>{pointer=null;moved=false;});
  document.addEventListener('keydown',e=>{
    if(e.target.closest('input,textarea,select,summary'))return;
    if(e.code==='Space'&&!/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)){e.preventDefault();setPaused(!paused);}
    if(e.key==='Escape')clearSelection();
    if(e.key==='F2'){e.preventDefault();$('#transparent').click();}
  });
  $('#sound').onclick=()=>{
    sound=!sound;$('#sound').classList.toggle('sound-on',sound);$('#sound').setAttribute('aria-pressed',String(sound));
    $('#sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('#sound').title=sound?'关闭音效':'开启音效';if(sound)beep();
  };
  function transparent(value){document.body.classList.toggle('transparent',value);$('#transparent').setAttribute('aria-pressed',String(value));$('#transparent').setAttribute('aria-label',value?'返回试玩模式':'透明直播模式');$('#transparent').title=value?'返回试玩模式':'透明直播模式';}
  $('#transparent').onclick=()=>transparent(!document.body.classList.contains('transparent'));
  const params=new URLSearchParams(location.search);
  transparent(params.get('preview')!=='1'&&params.get('overlay')!=='0');
  function renderPrankStatus(){
    pieces.classList.toggle('fogged',timed.fog>playClock);
    const status=[];const frozen=game.board.filter(t=>t.ice).length,chained=game.board.filter(t=>t.chain).length;
    if(frozen)status.push(`冰冻 ${frozen} 只`);if(chained)status.push(`锁链 ${chained} 只`);
    if(timed.fog>playClock)status.push(`迷雾 ${Math.ceil((timed.fog-playClock)/1000)} 秒`);
    if(timed.curse>playClock)status.push(`手滑诅咒 ${Math.ceil((timed.curse-playClock)/1000)} 秒`);
    if(challenge)status.push(`催命 ${Math.max(0,12-(game.collected.reduce((a,b)=>a+b,0)-challenge.start))} 只 / ${Math.max(0,Math.ceil((challenge.end-playClock)/1000))} 秒`);
    if(autoPrank)status.push(`下次整活 ${Math.max(0,Math.ceil((nextPrank-playClock)/1000))} 秒`);
    const text=status.join(' · ')||'观众暂时很乖';
    if(text!==lastPrankStatus){lastPrankStatus=text;$('#prank-status').textContent=text;$('#prank-status').classList.toggle('under-attack',status.length>0);}
  }
  $('#pranks').onclick=()=>{const value=document.body.classList.toggle('pranks-open');$('#pranks').setAttribute('aria-expanded',String(value));$('#billing-settings-toggle').setAttribute('aria-expanded',String(value));};
  $('#billing-settings-toggle').onclick=()=>{document.body.classList.add('pranks-open');$('#pranks').setAttribute('aria-expanded','true');$('#billing-settings-toggle').setAttribute('aria-expanded','true');if(innerWidth<=700)$('.billing-settings').scrollIntoView({behavior:'smooth',block:'start'});};
  for(const[id,key]of[['fee-interval','intervalSeconds'],['fee-amount','amount'],['fee-difficulty','difficulty']]){
    $('#'+id).onchange=e=>{
      if(!collector.configure({[key]:e.target.value}))$('#fee-test-result').textContent='周期为 10～3,600 秒，每次积分为 1～1,000,000 分。';
      game.setDifficulty(collector.difficulty);syncCollectionSettings();renderBilling();
    };
  }
  $('#fee-minutes').onchange=e=>{if(!overtime.setMinutes(e.target.value)){e.target.value=overtime.snapshot().minutes;$('#fee-test-result').textContent='加班时长请输入 1～180 的整数分钟。';}};
  $('#fee-enabled').onchange=e=>overtime.setEnabled(e.target.checked);
  const useKey=()=>{if(overtime.setKey($('#fee-key').value))return true;$('#fee-test-result').textContent='连接码是 8 位，比如 ABCD-2345，在白曜「加班机 → 加班设置 → 插件连接」里。';$('#fee-key').value=overtime.snapshot().key;return false;};
  $('#fee-connect').onclick=()=>{if(useKey()&&!overtime.connect())$('#fee-test-result').textContent='先打开「积分不够就加班」。';};
  $('#fee-test').onclick=async()=>{
    // 只拿输入框里的码试一下：不保存、不碰正在用的连接，攒着的加班不会被送出去；点「连接」才用上
    const typed=BaiyaoOvertimeClient.normalizeKey($('#fee-key').value),now=overtime.snapshot(),inUse=typed===now.key&&now.connection==='ready';
    $('#fee-test').disabled=true;$('#fee-test-result').textContent='正在测试连接，不改加班时间…';
    const result=await overtime.testConnection(typed);
    $('#fee-test-result').textContent=!result.ok?`连接失败：${result.error}`:!result.trusted?`连上白曜了，但${result.error}，现在只能看时间。`:inUse?'连接正常，连接码也对；测试没有加时间。':'连接码对，测试没有加时间；点「连接」才开始加。';$('#fee-test').disabled=false;
  };
  window.addEventListener('pagehide',()=>overtime.stop());window.addEventListener('pageshow',e=>{if(e.persisted&&overtime.snapshot().enabled)overtime.connect();});
  $('#auto-prank').onclick=()=>{autoPrank=!autoPrank;nextPrank=playClock+9000;$('#auto-prank').setAttribute('aria-checked',String(autoPrank));$('#auto-prank').textContent=autoPrank?'自动折磨：开':'自动折磨：关';};
  async function receivePrank(type,origin=null){
    if(busy||paused||playClock<cooldownUntil)return false;
    const token=epoch;
    cooldownUntil=playClock+900;
    const text={ice:'冰块捣乱：5 只小动物冻住啦',bomb:'炸弹助攻：帮你炸开一大片',rainbow:'彩虹助攻：与邻居交换可消除同色',chain:'锁链伺候：6 只小动物被锁，需要 2 次相邻消除来解锁',fog:'迷雾蒙眼：小动物藏起来了！10 秒后恢复',chaos:'全盘乱序：记好的位置全换了，冰块和锁链也跟着搬家',curse:'手滑诅咒：12 秒内无效交换扣 100 分',challenge:'10 秒消掉 12 只小动物！否则扣 500 分再补冰块',cleanse:'饶你一命：所有冰块、锁链、迷雾、诅咒与催命任务已解除'}[type];
    if(type==='fog')timed.fog=playClock+10000;
    if(type==='curse')timed.curse=playClock+12000;
    if(type==='challenge')challenge={start:game.collected.reduce((a,b)=>a+b,0),end:playClock+10000};
    if(type==='cleanse'){timed.fog=0;timed.curse=0;challenge=null;}
    const result=game.effect(type);log(text);toast(({chain:'锁链伺候！',fog:'眼前一片雾',chaos:'位置全换啦！',curse:'别手滑！',challenge:'10 秒，消 12 只！',cleanse:'暂时放过你'}[type])||'观众来整活啦');beep(2);await animate(result,type);
    if(token!==epoch)return true;
    if(display.stage===result.state.stage)log(origin&&origin.source!=='manual'&&origin.source!=='auto'?`@${origin.actor} · ${text}`:text);
    await wait(Math.max(0,cooldownUntil-playClock),token);if(token===epoch)updateControls();return true;
  }
  document.querySelectorAll('[data-effect]').forEach(button=>button.onclick=()=>live.simulateEffect(button.dataset.effect));
  draw(game.state());syncCollectionSettings();renderFeeConnection(overtime.snapshot());updateControls();if(overtime.snapshot().enabled)overtime.connect();
  setupBroadcastUI({kind:'match3',isPaused:()=>paused,setPaused,live});live.start();
  mountLocalOvertime({link:overtime,anchor:$('.billing-settings'),stage:$('#broadcast-stage')});
  window.addEventListener('pagehide',()=>live.stop());window.addEventListener('pageshow',e=>{if(e.persisted)live.start();});
})();
