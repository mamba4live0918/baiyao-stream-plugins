(function(root){
 'use strict';
 root.makeGameLive=function(kind,handlers){
  const gifts=kind==='match3'?{ice:'玫瑰',chain:'棒棒糖',fog:'墨汁炸弹',chaos:'亲吻',curse:'口红示爱',challenge:'大厨煎蛋',bomb:'小心心',rainbow:'为你撑伞',cleanse:'热气球'}:{garbage:'玫瑰',reverse:'棒棒糖',rush:'抖音',fog:'墨汁炸弹',seal:'口红示爱',challenge:'大厨煎蛋',bomb:'小心心',cleanse:'为你撑伞'};
  return new GameLiveInput({key:kind+'-live-gifts-v1',name:kind==='match3'?'萌宠消消乐':'俄罗斯方块',effects:[...document.querySelectorAll('[data-effect]')].map(n=>({id:n.dataset.effect,label:n.querySelector('strong').textContent,gift:gifts[n.dataset.effect]||''})),...handlers});
 };
 function mountMessageTest(parent,live,make){
  const box=make('details','live-message-test');box.id='live-message-test';box.append(make('summary','','宿主消息解析测试'));parent.append(box);
  box.append(make('p','broadcast-note','模拟收到菘蓝或白曜端口的消息，使用正式接收逻辑检查。本地测试不会向真实端口广播；通过测试不代表真实端口已经连接。'));
  const sourceLabel=make('label','live-test-source'),source=make('select');source.id='live-test-source';
  for(const[value,title]of[['songlan-port','菘蓝端口 · 礼物消息'],['baiyao-port','白曜端口 · 礼物消息'],['baiyao-sdk','白曜 SDK · 礼物回调'],['baiyao-action','白曜规则 · 动作回调']]){const o=make('option','',title);o.value=value;source.append(o);}
  sourceLabel.append(make('span','','模拟来源'),source);box.append(sourceLabel);
  const rawLabel=make('label','live-test-raw-label','消息原文（JSON，可粘贴）');rawLabel.htmlFor='live-test-raw';const raw=make('textarea','live-test-raw');raw.id='live-test-raw';raw.maxLength=65536;raw.spellcheck=false;raw.wrap='soft';raw.rows=9;box.append(rawLabel,raw);
  const samples=make('div','live-test-tools'),sample=make('button','','载入新样例'),clear=make('button','','清空测试记录');sample.type=clear.type='button';sample.id='live-test-sample';clear.id='live-test-clear';samples.append(sample,clear);box.append(samples);
  const hint=make('p','broadcast-note');hint.id='live-test-hint';box.append(hint);
  const triggerLabel=make('label','live-test-trigger'),trigger=make('input');trigger.type='checkbox';trigger.id='live-test-trigger';triggerLabel.append(trigger,make('span','','同时触发棋盘效果'));box.append(triggerLabel);
  box.append(make('p','broadcast-note','默认只检查。勾选后点击「模拟收到」才会加入当前棋盘队列，并按本局原有规则结算加班。'));
  const actions=make('div','live-test-tools'),check=make('button','','解析检查'),receive=make('button','broadcast-primary','模拟收到');check.type=receive.type='button';check.id='live-test-check';receive.id='live-test-receive';actions.append(check,receive);box.append(actions);
  const result=make('div','live-test-result');result.id='live-test-result';result.setAttribute('role','status');result.setAttribute('aria-live','polite');box.append(result);
  const reasons={json:'JSON 格式不正确，请检查引号、逗号和括号。','too-large':'消息超过 65,536 个字符。','not-object':'消息必须是一个 JSON 对象。','not-gift':'这不是礼物消息；端口消息需要 type: "gift"（也支持现有的 gift 类型标记）。','missing-name':'没有找到礼物名称 giftName 或 gift.name。','invalid-count':'数量必须是 1～1,000,000 的整数；动作的 value × repeat 也需在此范围。','no-increment':'本条没有新增数量，或累计数未超过已测试的数量。','combo-end':'这是连击结束消息，没有新增数量，不再触发。','missing-combo-id':'累计消息缺少 comboId，无法可靠计算增量。',unmatched:'已识别礼物，但没有匹配下方的礼物绑定。',duplicate:'相同消息 ID 已模拟接收过，已拦截重复触发。',disabled:'接收开关已关闭；开启「接收真实礼物 / 动作」后再测。',mode:'当前规则来源与测试消息不一致。礼物消息选「插件内礼物绑定」，动作回调选「白曜重工规则动作」。',stopped:'接收器当前未运行。',capacity:'当前候场队列已达上限，部分或全部效果未接纳。','unknown-action':'动作 ID 未匹配本插件效果，请查看下方的白曜动作 ID。',channel:'未知测试来源。'};
  let sequence=0;
  const idle=message=>{result.dataset.status='idle';result.replaceChildren(make('p','',message));};
  function loadSample(){
   const rule=live.rules.find(r=>r.gift)||live.rules[0],id='local-test-'+Date.now()+'-'+(++sequence),white=source.value!=='songlan-port';
   const payload=source.value==='baiyao-action'?{action:rule.effect,value:1,repeat:2,actionId:id,event:{user:{nickname:'白曜测试观众'}}}:{type:'gift',eventId:id,nickName:white?'白曜测试观众':'菘蓝测试观众',userId:'local-test-viewer',giftName:rule.gift||'玫瑰',count:2};
   raw.value=JSON.stringify(payload,null,2);idle('样例已载入。可以直接测试，也可以粘贴自己的原始消息。');
   hint.textContent=source.value==='baiyao-action'?'动作样例：value × repeat 为执行次数。请把规则来源切到「白曜重工规则动作」。':(white?'白曜兼容礼物消息中的 count 已是本次新增数量。':'菘蓝端口样例按本次新增数量 count 解析。')+' 连点「模拟收到」可检查去重；「载入新样例」会生成新 ID。';
  }
  function run(receive){
   const report=live.diagnoseMessage(raw.value,source.value,{receive,trigger:trigger.checked}),gift=report.normalized;
   result.dataset.status=report.status;result.dataset.reason=report.reason;result.replaceChildren();
   const title=report.status==='accepted'?(receive?'模拟接收成功':'可以识别并匹配'):report.status==='partial'?'已识别，队列只能接纳部分效果':report.status==='duplicate'?'已忽略：重复消息':'本条消息未触发效果';
   result.append(make('strong','live-test-title',title));
   if(report.reason)result.append(make('p','',reasons[report.reason]||report.reason));
   if(gift){
    const fields=make('dl','live-test-fields'),add=(name,value)=>fields.append(make('dt','',name),make('dd','',String(value)));
    add(gift.action?'动作 ID':'礼物名称',gift.action||gift.name);add('观众',gift.actor);add('消息 ID',gift.id||'未提供（无法按 ID 去重）');
    add('解析数量',gift.action?`${gift.value} × ${gift.repeat} = ${gift.count}`:`${gift.count}（${gift.cumulative?'累计数量':'本次增量'}）`);add('本次新增',report.increment);add('匹配效果',live.effects.find(e=>e.id===report.effect)?.label||'—');
    if(!gift.action&&report.multiplier)add('每件触发',report.multiplier+' 次');
    add('应触发',report.executions+' 次');add('棋盘入队',report.queued+' 次');result.append(fields);
   }
   result.append(make('p','live-test-foot',receive?(trigger.checked?'已按当前设置尝试加入棋盘；暂停或候场时等待游戏继续。':'仅更新测试去重和连击记录，棋盘未变。'):'只读检查，不保存测试记录，也不触发棋盘。'));
  }
  sample.onclick=loadSample;source.onchange=loadSample;check.onclick=()=>run(false);receive.onclick=()=>run(true);clear.onclick=()=>{live.clearMessageTests();idle('测试去重与连击记录已清空，可以重新测试同一条消息。已入队效果和真实礼物记录不受影响。');};
  raw.addEventListener('input',()=>idle('消息已修改，重新解析后查看结果。'));loadSample();
 }
 root.mountLiveSettings=function(parent,live){
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const section=make('div','live-settings');section.id='live-settings';parent.append(section);
  const label=(caption,input)=>{const n=make('label','broadcast-field');n.append(make('span','',caption),input);section.append(n);return input;};
  const receive=make('input');receive.type='checkbox';receive.id='live-receive';label('接收真实礼物 / 动作',receive);receive.onchange=()=>live.configure({enabled:receive.checked});
  const mode=make('select');mode.id='live-mode';for(const[v,t]of[['gifts','插件内礼物绑定'],['actions','白曜重工规则动作']]){const o=make('option','',t);o.value=v;mode.append(o);}label('规则来源',mode);mode.onchange=()=>live.configure({mode:mode.value});
  section.append(make('p','broadcast-note','菘蓝和白曜都可直接使用「插件内礼物绑定」，与抓萌宠一样接收宿主礼物；不用另外配置白曜规则。两种来源互斥，避免重复触发。'));
  const status=make('p','live-connection');status.id='live-status';status.setAttribute('role','status');const summary=make('p','broadcast-note');summary.id='live-counts';const latest=make('p','live-latest');latest.id='live-latest';latest.setAttribute('role','status');section.append(status,summary,latest);
  mountMessageTest(section,live,make);
  const rules=make('div','live-bindings');rules.id='live-bindings';section.append(rules);
  const head=make('div','live-binding-heading');head.append(make('span','','效果'),make('span','','礼物名称（留空关闭）'),make('span','','每个次数'),make('span','','测试'));rules.append(head);
  const feedback=make('p','live-feedback');feedback.id='live-feedback';feedback.setAttribute('role','status');
  const inputs=new Map();
  for(const effect of live.effects){
   const line=make('div','live-binding-row');line.dataset.binding=effect.id;const name=make('strong','',effect.label);const gift=make('input');gift.type='text';gift.maxLength=80;gift.placeholder='填写礼物名称';gift.setAttribute('aria-label',effect.label+'绑定礼物');
   const times=make('input');times.type='number';times.min=1;times.max=20;times.step=1;times.setAttribute('aria-label',effect.label+'每个礼物触发次数');
   const test=make('button','live-try','▶');test.type='button';test.setAttribute('aria-label','模拟绑定礼物触发'+effect.label);
   const commit=()=>{const result=live.setRule(effect.id,{gift:gift.value,times:times.value});gift.setAttribute('aria-invalid',String(!result.ok));times.setAttribute('aria-invalid',String(!result.ok));feedback.textContent=result.ok?'礼物绑定已保存。':result.error;return result.ok;};
   gift.onchange=commit;times.onchange=commit;test.onclick=()=>{if(commit())feedback.textContent=live.simulateGift(effect.id)?'模拟礼物已按绑定规则加入队列。':'先为这个效果填写礼物名称。';};
   line.append(name,gift,times,test);rules.append(line);inputs.set(effect.id,{gift,times,test});
  }
  section.append(feedback);
  const connection=make('details','live-connection-settings');connection.append(make('summary','','接入方式、本机转发与白曜动作 ID'));section.append(connection);
  connection.append(make('p','broadcast-note','与抓萌宠 V1.0.41 一致：优先订阅 SonglanPlugin.onGift（白曜也提供这个兼容接口），缺少时再使用 BaiyaoPlugin.onGift。导入宿主后自动接入；单独打开网页或作为 OBS 本地文件时，再手动开启本机礼物转发。'));
  const wsLabel=make('label','broadcast-field');const forwarding=make('input');forwarding.type='checkbox';forwarding.id='live-forwarding';wsLabel.append(make('span','','启用本机礼物转发'),forwarding);connection.append(wsLabel);forwarding.onchange=()=>live.configure({forwarding:forwarding.checked});
  const portLabel=make('label','broadcast-field'),port=make('input');port.id='live-port';port.type='number';port.min=1;port.max=65535;portLabel.append(make('span','','礼物转发端口'),port);connection.append(portLabel);
  const retry=make('button','','重新尝试接入');retry.type='button';port.onchange=()=>{if(!live.configure({port:port.value})){feedback.textContent='礼物端口需为 1～65535 的整数。';port.value=live.snapshot().port;}};retry.onclick=()=>{if(live.configure({port:port.value})){live.closeSocket();live.nextConnect=0;live.tryBind();}};connection.append(retry);
  connection.append(make('p','broadcast-note','当前宿主默认使用 9910，旧版可用 10030；按宿主实际设置填写。这个端口只接礼物；加班走白曜加班机，不用这里设。SDK 出现后会关闭转发连接，只保留一条礼物通道。'));
  connection.append(make('p','broadcast-note','白曜规则模式：在白曜为此 HTML 插件配置规则，插件动作填下列 ID；动作数值 × repeat 为执行次数。插件内礼物绑定模式下不会再执行白曜规则动作。'));
  const ids=make('dl','live-action-ids');for(const e of live.effects)ids.append(make('dt','',e.label),make('dd','',e.id));connection.append(ids);
  connection.append(make('p','broadcast-note','暂停、消除结算和等待开始时先候场，最多排队 2,000 次、100 条；超过 120 秒未执行的候场会过期并计数。重开清理旧候场，刷新不重放。超出容量会明确显示未接纳次数。'));
  const clear=make('button','','清空礼物候场');clear.type='button';clear.onclick=()=>live.clearQueue('手动清空礼物候场');connection.append(clear);
  live.subscribe(state=>{
   receive.checked=state.enabled;mode.value=state.mode;forwarding.checked=state.forwarding;if(document.activeElement!==port)port.value=state.port;
   const channel={none:'未检测到礼物 SDK',connecting:`连接本机礼物转发 ${state.port}…`,waiting:`等待本机礼物转发 ${state.port}`,forwarder:`本机礼物转发已连接（${state.port}）`,songlan:'菘蓝礼物 SDK 已绑定',baiyao:'白曜礼物 SDK 已绑定'}[state.channel]||'等待接入';
   status.textContent=!state.enabled?'真实礼物接收已关闭':state.mode==='actions'?(state.actionBound?'白曜规则动作已订阅':'等待白曜规则动作接口'):channel;status.dataset.connected=String(state.enabled&&(state.mode==='actions'?state.actionBound:state.giftBound||state.channel==='forwarder'));
   summary.textContent=`${state.mode==='actions'?`收到动作 ${state.stats.actions} 次`:`收到礼物 ${state.stats.received} 件`} · 已执行 ${state.stats.executed} 次 · 候场 ${state.queued} 次${state.inFlight?' · 执行中':''}${state.stats.unmatched?` · 未绑定 ${state.stats.unmatched} 件`:''}${state.stats.rejected?` · 未接纳 ${state.stats.rejected} 次`:''}${state.stats.expired?` · 已过期 ${state.stats.expired} 次`:''}${state.stats.cleared?` · 已清理 ${state.stats.cleared} 次`:''}${state.stats.failed?` · 执行异常 ${state.stats.failed} 次`:''}`;
   latest.textContent=state.last;
   rules.classList.toggle('inactive',state.mode==='actions');for(const rule of state.rules){const x=inputs.get(rule.effect);if(document.activeElement!==x.gift&&x.gift.getAttribute('aria-invalid')!=='true')x.gift.value=rule.gift;if(document.activeElement!==x.times&&x.times.getAttribute('aria-invalid')!=='true')x.times.value=rule.times;}
  });
 };
})(window);
