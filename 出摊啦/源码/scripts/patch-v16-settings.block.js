  /* V1.6 加班机：加班记到哪（自动 / 插件自带 / 白曜）；自带的在这里配（预设时长、开始暂停重置、手动加减、礼物加减时间）；
   * 白曜的：在白曜里不用设，不在白曜里填连接码。测试连接不改时间。 */
  overtimeBlock(){
    const o=this.app.overtime,route=o.route();
    const parts=[el('h4',{text:'加班机'}),
      this.field('加班记到',choose(o.target(),[['auto','自动（推荐）'],['local','插件自带的加班机'],['baiyao','白曜加班机']],v=>{o.setTarget(v);this.otDraft=null;this.render();},'加班记到')),
      el('p',{id:'ct-overtime-route',class:'ct-note',text:this.routeText()})];
    if(route==='local')parts.push(...this.localOvertimeBlock(o.local));
    parts.push(...this.baiyaoBlock(o,route));
    return parts;
  }
  routeText(){
    const o=this.app.overtime,route=o.route(),target=o.target();
    if(route==='local')return target==='auto'?'现在记到：插件自带的加班机（没在白曜里、也没填连接码，所以自动用这个）。':'现在记到：插件自带的加班机。';
    return o.snapshot().mode==='baiyao'?'现在记到：白曜加班机（在白曜里自动接上）。礼物加减时间在白曜「加班机 → 加班设置」里配。':'现在记到：白曜加班机。在下面填连接码再点「连接」；礼物加减时间在白曜里配。';
  }
  localOvertimeBlock(local){
    const L=globalThis.LocalOvertime,s=local.snapshot(),msg=el('p',{class:'ct-note',role:'status'});
    const face=el('div',{class:'ct-ot-face'},el('small',{id:'ct-ot-label',text:'距离下播'}),el('b',{id:'ct-ot-time',text:s.clockText}),el('small',{id:'ct-ot-net',text:s.netText}));
    const start=el('button',{type:'button',id:'ct-ot-start',text:s.running?'暂停':s.fresh?'开始':'继续',onclick:()=>{if(local.snapshot().running)local.pause();else local.start();this.refreshOvertimeClock();}});
    const preset=el('input',{type:'number',min:'1',max:'99999',step:'1',value:String(s.presetMinutes),'aria-label':'预设时长（分钟）',onchange:e=>{if(!local.setPreset(e.target.value)){msg.textContent='预设时长请填 1～99999 的整数分钟。';e.target.value=String(local.snapshot().presetMinutes);}this.refreshOvertimeClock();}});
    const manual=el('input',{type:'number',min:'1',max:'99999',step:'1',value:'10','aria-label':'手动加减（分钟）'});
    const shiftBy=sign=>{const n=Number(manual.value);if(!Number.isInteger(n)||n<1||n>99999){msg.textContent='手动加减请填 1～99999 的整数分钟。';return;}local.shift(sign*n*60,'手动');};
    if(!this.otDraft)this.otDraft=s.gifts.map(g=>({...g}));
    const rows=el('div',{id:'ct-ot-gifts'});
    const save=()=>{const named=this.otDraft.filter(r=>String(r.name||'').trim());const res=local.setGifts(named.map(r=>({name:r.name,mode:r.mode,min:Number(r.min),max:Number(r.max)})));msg.textContent=res.ok?(named.length<this.otDraft.length?'没填礼物名的行不会生效。':'已保存，马上生效。'):res.error;};
    const draw=()=>rows.replaceChildren(...(this.otDraft.length?this.otDraft.map((r,i)=>{
      const sync=()=>{this.otDraft[i]={name:name.value,mode:mode.value,min:min.value,max:max.value};save();};
      const name=el('input',{type:'text',maxlength:'20',placeholder:'礼物名',value:r.name,'aria-label':`第 ${i+1} 行礼物名`,onchange:()=>sync()});
      const mode=choose(r.mode,[['add','加时'],['sub','减时']],()=>sync(),`第 ${i+1} 行加时还是减时`);
      const min=el('input',{type:'number',min:'0',max:'99999',step:'1',value:String(r.min),'aria-label':`第 ${i+1} 行最少分钟`,onchange:()=>sync()});
      const max=el('input',{type:'number',min:'0',max:'99999',step:'1',value:String(r.max),'aria-label':`第 ${i+1} 行最多分钟`,onchange:()=>sync()});
      return el('div',{class:'ct-ot-row'},name,mode,min,el('span',{text:'～'}),max,el('span',{text:'分钟'}),
        el('button',{type:'button',text:'▶',title:'试一下：真的加减一次','aria-label':`试一下第 ${i+1} 行`,onclick:()=>{sync();const t=local.applyGift({name:name.value,count:1});msg.textContent=t?`试了一下：${t>0?'+':'−'}${L.spokenDuration(t)}`:'先填好礼物名再试';}}),
        el('button',{type:'button',text:'删除','aria-label':`删除第 ${i+1} 行`,onclick:()=>{this.otDraft.splice(i,1);save();draw();}}));
    }):[note('还没有礼物。点「＋ 添加礼物」，比如：玫瑰 → 加时 5 分钟。')]));
    draw();
    return [face,el('div',{class:'ct-row'},start,this.confirmButton('重置','再点一次重置',()=>{local.reset();this.render();})),
      this.field('预设时长',preset,'分钟'),
      this.field('手动加减',el('span',{class:'ct-ot-inline'},manual,el('span',{text:'分钟'}),el('button',{type:'button',text:'加',onclick:()=>shiftBy(1)}),el('button',{type:'button',text:'减',onclick:()=>shiftBy(-1)}))),
      el('label',{class:'ct-switch'},el('input',{type:'checkbox',checked:s.show,onchange:e=>local.setShow(e.target.checked)}),el('span',{},el('b',{text:'画面上显示倒计时'}),el('em',{text:'交租牌下面多一条「距离下播」'}))),
      el('h4',{text:'礼物加减时间'}),rows,
      el('div',{class:'ct-row'},el('button',{type:'button',text:'＋ 添加礼物',id:'ct-ot-gift-add',onclick:()=>{this.otDraft.push({name:'',mode:'add',min:1,max:1});draw();rows.querySelector('.ct-ot-row:last-child input')?.focus();}})),
      msg,
      note('礼物名要和直播间里的一模一样。两个分钟数一样就是固定加减，不一样就在这个范围里随机；送几个算几次。▶ 会真的加减一次，试完可以点「重置」。'),
      note('交租差额、白曜规则动作「overtime」也记到这里。每次开播前点两下「重置」；「开新的一场」也会把自带加班机重置。')];
  }
  /* 白曜加班机：在白曜里不用设；不在白曜里（菘蓝、直接放进 OBS）填白曜给的连接码。测试连接不改时间。 */
  baiyaoBlock(o,route){
    const status=el('p',{id:'ct-overtime-status',class:'ct-note',role:'status',text:this.overtimeText()});
    if(o.snapshot().mode==='baiyao')return route==='baiyao'?[status]:[];
    if(o.target()==='local')return [];
    const key=el('input',{value:o.snapshot().key,maxlength:12,placeholder:'ABCD-2345',autocomplete:'off',spellcheck:'false','aria-label':'白曜加班机连接码'});
    const result=el('p',{class:'ct-note',role:'status'});
    const useKey=()=>{if(o.setKey(key.value)){key.value=o.snapshot().key;return true;}result.textContent='连接码是 8 位，比如 ABCD-2345，在白曜「加班机 → 加班设置 → 插件连接」里。';return false;};
    const test=async e=>{
      // 只拿输入框里的码试一下：不保存、不碰正在用的连接，攒着的加班不会被送出去；点「连接」才用上
      const now=o.snapshot(),typed=key.value;e.target.disabled=true;result.textContent='正在测试连接，不改加班时间…';
      const t=await o.test(typed);
      result.textContent=!t.ok?'测试失败：'+t.error:!t.trusted?'连上白曜了，但'+t.error+'，现在只能看时间。':o.normalizeKey(typed)===now.key&&now.state==='ready'?'连接正常，连接码也对；测试没有加时间。':'连接码对，测试没有加时间；点「连接」才开始加。';e.target.disabled=false;
    };
    return [el('h4',{text:'白曜加班机（不在白曜里用：填连接码）'}),status,this.field('连接码',key),
      el('div',{class:'ct-row'},el('button',{type:'button',text:'连接',onclick:()=>{if(useKey()){o.connect();this.render();}}}),el('button',{type:'button',text:'测试连接',onclick:test})),
      result,note('在白曜里用（白曜的插件窗口、白曜给的 OBS 网址）不用填。菘蓝里、直接把出摊啦放进 OBS 时，填白曜「加班机 → 加班设置 → 插件连接」里的连接码，再点「连接」；「加班记到」是「自动」时，填了连接码就改记到白曜加班机。测试连接只试不存，不改时间。')];
  }
  /* 每秒刷新：自带加班机的倒计时文字（只在面板开着、文字变了时动 DOM） */
  refreshOvertimeClock(){
    const local=this.app.overtime.local.snapshot(),set=(id,text)=>{const n=this.root?.querySelector('#'+id);if(n&&n.textContent!==text)n.textContent=text;};
    set('ct-ot-time',local.clockText);set('ct-ot-net',local.netText);set('ct-ot-label',local.finished&&!local.fresh?'下播时间到':'距离下播');
    set('ct-ot-start',local.running?'暂停':local.fresh?'开始':'继续');set('ct-overtime-route',this.routeText());
  }
