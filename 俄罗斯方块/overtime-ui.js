(function(root){
  'use strict';
  /* 插件自带加班机的界面（俄罗斯方块和萌宠消消乐用同一份）：
   * 1. 设置②里的「加班机」：加班记到哪、倒计时、开始 / 暂停 / 重置、预设时长、手动加减、礼物加减时间表、画面上显不显示。
   * 2. 直播画面上棋盘上方的倒计时牌：只在记到插件自带的加班机、并且勾了「画面上显示」时出现；加减时间时冒一下「+10 分钟」。
   * 画面上只写「距离下播」「已加班」，不写宿主的名字。 */
  root.mountLocalOvertime=function({link,anchor,stage}){
    const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
    const button=(text,cls)=>{const b=make('button',cls||'',text);b.type='button';return b;};
    const L=root.LocalOvertime,local=link.local;
    /* ---------- 设置面板 ---------- */
    const box=make('div','lot');box.id='lot-settings';
    box.append(make('h4','lot-title','加班机'));
    const targetRow=make('label','broadcast-field');targetRow.append(make('span','','加班记到'));
    const target=make('select');target.id='lot-target';target.setAttribute('aria-label','加班记到');
    for(const[v,t]of[['auto','自动（推荐）'],['local','插件自带的加班机'],['baiyao','白曜加班机']]){const o=make('option','',t);o.value=v;target.append(o);}
    targetRow.append(target);box.append(targetRow);
    const routeNote=make('p','broadcast-note lot-route');box.append(routeNote);
    const body=make('div','lot-body');body.id='lot-local';box.append(body);
    const face=make('div','lot-face'),faceLabel=make('small','','距离下播'),faceTime=make('b','lot-time'),faceNet=make('small','lot-net');
    face.append(faceLabel,faceTime,faceNet);body.append(face);
    const controls=make('div','broadcast-row'),startBtn=button('开始','broadcast-primary'),resetBtn=button('重置');startBtn.id='lot-start';resetBtn.id='lot-reset';
    controls.append(startBtn,resetBtn);body.append(controls);
    const field=(label,...children)=>{const r=make('div','broadcast-field');r.append(make('span','',label));const c=make('span','lot-inline');c.append(...children);r.append(c);body.append(r);return r;};
    const presetInput=make('input');presetInput.type='number';presetInput.min='1';presetInput.max='99999';presetInput.step='1';presetInput.id='lot-preset';presetInput.setAttribute('aria-label','预设时长（分钟）');
    field('预设时长',presetInput,make('span','','分钟'));
    const manualInput=make('input');manualInput.type='number';manualInput.min='1';manualInput.max='99999';manualInput.step='1';manualInput.value='10';manualInput.id='lot-manual';manualInput.setAttribute('aria-label','手动加减（分钟）');
    const addBtn=button('加');addBtn.id='lot-add';const subBtn=button('减');subBtn.id='lot-sub';
    field('手动加减',manualInput,make('span','','分钟'),addBtn,subBtn);
    const showBox=make('input');showBox.type='checkbox';showBox.id='lot-show';
    const showLabel=make('label','lot-check');showLabel.append(showBox,make('span','','画面上显示倒计时'));
    field('直播画面',showLabel);
    body.append(make('h5','lot-sub','礼物加减时间'));
    const table=make('div','lot-gifts');table.id='lot-gifts';body.append(table);
    const giftActions=make('div','broadcast-row'),giftAdd=button('＋ 添加礼物');giftAdd.id='lot-gift-add';giftActions.append(giftAdd);body.append(giftActions);
    const giftMsg=make('p','broadcast-note lot-msg');giftMsg.setAttribute('role','status');body.append(giftMsg);
    body.append(make('p','broadcast-note','礼物名要和直播间里的一模一样。两个分钟数一样就是固定加减，不一样就在这个范围里随机；送几个算几次。▶ 会真的加减一次倒计时，试完可以点「重置」。'));
    anchor.after(box);

    let draft=local.snapshot().gifts,resetArmed=0;
    function renderGifts(){
      table.replaceChildren();
      if(!draft.length)table.append(make('p','broadcast-note lot-empty','还没有礼物。点「＋ 添加礼物」，比如：玫瑰 → 加时 5 分钟。'));
      draft.forEach((row,i)=>{
        const r=make('div','lot-row');r.dataset.row=String(i);
        const name=make('input');name.type='text';name.maxLength=20;name.placeholder='礼物名';name.value=row.name;name.setAttribute('aria-label',`第 ${i+1} 行礼物名`);
        const mode=make('select');for(const[v,t]of[['add','加时'],['sub','减时']]){const o=make('option','',t);o.value=v;mode.append(o);}mode.value=row.mode;mode.setAttribute('aria-label',`第 ${i+1} 行加时还是减时`);
        const num=(v,label)=>{const n=make('input');n.type='number';n.min='0';n.max='99999';n.step='1';n.value=String(v);n.setAttribute('aria-label',label);return n;};
        const min=num(row.min,`第 ${i+1} 行最少分钟`),max=num(row.max,`第 ${i+1} 行最多分钟`);
        const tryBtn=button('▶');tryBtn.title='试一下：真的加减一次';tryBtn.setAttribute('aria-label',`试一下第 ${i+1} 行`);
        const del=button('删除');del.setAttribute('aria-label',`删除第 ${i+1} 行`);
        const sync=()=>{draft[i]={name:name.value,mode:mode.value,min:min.value,max:max.value};save();};
        for(const el of[name,mode,min,max])el.addEventListener('change',sync);
        tryBtn.onclick=()=>{sync();const s=local.applyGift({name:name.value,count:1});giftMsg.textContent=s?`试了一下：${s>0?'+':'−'}${L.spokenDuration(s)}`:'先填好礼物名再试';};
        del.onclick=()=>{draft.splice(i,1);save();renderGifts();};
        r.append(name,mode,min,make('span','','～'),max,make('span','','分钟'),tryBtn,del);table.append(r);
      });
    }
    function save(){
      const rows=draft.filter(r=>String(r.name||'').trim());
      const result=local.setGifts(rows.map(r=>({name:r.name,mode:r.mode,min:Number(r.min),max:Number(r.max)})));
      giftMsg.textContent=result.ok?(rows.length<draft.length?'没填礼物名的行不会生效。':'已保存，马上生效。'):result.error;
    }
    target.onchange=()=>{link.setTarget(target.value);update();};
    startBtn.onclick=()=>{if(local.snapshot().running)local.pause();else local.start();update();};
    resetBtn.onclick=()=>{
      if(Date.now()<resetArmed){resetArmed=0;local.reset();resetBtn.textContent='重置';update();return;}
      resetArmed=Date.now()+3000;resetBtn.textContent='再点一次重置';
      setTimeout(()=>{if(resetArmed&&Date.now()>=resetArmed){resetArmed=0;resetBtn.textContent='重置';}},3100);
    };
    presetInput.onchange=()=>{if(!local.setPreset(presetInput.value)){giftMsg.textContent='预设时长请填 1～99999 的整数分钟。';presetInput.value=local.snapshot().presetMinutes;}};
    const manual=sign=>{const n=Number(manualInput.value);if(!Number.isInteger(n)||n<1||n>99999){giftMsg.textContent='手动加减请填 1～99999 的整数分钟。';return;}local.shift(sign*n*60,'手动');};
    addBtn.onclick=()=>manual(1);subBtn.onclick=()=>manual(-1);
    showBox.onchange=()=>local.setShow(showBox.checked);
    giftAdd.onclick=()=>{draft.push({name:'',mode:'add',min:1,max:1});renderGifts();table.querySelector('.lot-row:last-child input')?.focus();};

    /* ---------- 直播画面上的倒计时牌 ---------- */
    const plate=make('div','lot-plate');plate.id='lot-plate';plate.hidden=true;plate.setAttribute('aria-live','polite');
    const plateLabel=make('small','lot-plate-label','距离下播'),plateTime=make('b','lot-plate-time'),plateNet=make('small','lot-plate-net');
    plate.append(plateLabel,plateTime,plateNet);
    const hud=stage.querySelector('.broadcast-hud');(hud||stage.firstChild)?.after?.(plate);
    /* 加减时间时：牌子右边那段「已加班」临时换成高亮的「+10 分钟」，2 秒后恢复（不叠在别的字上） */
    let flashUntil=0,flashTimer=null;
    function pop(seconds){
      flashUntil=Date.now()+2000;plateNet.classList.remove('flash','sub');void plateNet.offsetWidth;
      plateNet.classList.add('flash');plateNet.classList.toggle('sub',seconds<0);
      plateNet.textContent=(seconds<0?'−':'+')+L.spokenDuration(seconds);
      clearTimeout(flashTimer);flashTimer=setTimeout(()=>{flashUntil=0;plateNet.classList.remove('flash','sub');update();},2050);
    }

    function setText(el,value){if(el.textContent!==value)el.textContent=value;}
    function update(event){
      const s=link.snapshot(),l=local.snapshot(),route=s.route;
      if(document.activeElement!==target)target.value=s.target;
      if(document.activeElement!==presetInput)presetInput.value=String(l.presetMinutes);
      showBox.checked=l.show;
      body.hidden=route!=='local';
      setText(routeNote,route==='local'
        ?(s.target==='auto'?'现在记到：插件自带的加班机（没在白曜里、也没填连接码，所以自动用这个）。':'现在记到：插件自带的加班机。')
        :s.mode==='baiyao'?'现在记到：白曜加班机（在白曜里自动接上）。礼物加减时间在白曜「加班机 → 加班设置」里配。'
        :'现在记到：白曜加班机。在上面「不在白曜里用：填连接码」填连接码再点「连接」；礼物加减时间在白曜里配。');
      setText(faceTime,l.clockText);setText(faceNet,l.netText);setText(faceLabel,l.finished&&!l.fresh?'下播时间到':'距离下播');
      setText(startBtn,l.running?'暂停':l.fresh?'开始':'继续');
      // 画面上的牌子
      const visible=route==='local'&&l.show;
      if(plate.hidden===visible){plate.hidden=!visible;dispatchEvent(new Event('resize'));}
      plate.dataset.done=String(l.finished&&!l.fresh);
      setText(plateLabel,l.finished&&!l.fresh?'下播时间到':'距离下播');setText(plateTime,l.clockText);if(Date.now()>=flashUntil)setText(plateNet,l.netSeconds?l.netText:'');
      if(event&&visible&&event.seconds)pop(event.seconds);
    }
    local.subscribe((snapshot,event)=>update(event));
    renderGifts();update();setInterval(()=>update(),1000);
    return{update,box,plate};
  };
})(typeof window!=='undefined'?window:globalThis);
