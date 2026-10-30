/* 三张礼物表：③ 加进度条礼物 / 加次数礼物（跟着玩法换）④ 捣乱礼物 ⑤ 帮忙礼物。
   一行 = 礼物名 → 送 1 个会怎样 → ▶ 试一下 / ✕ 删掉。每行只做一件事，数字的意思不会跟着下拉框变。
   存的还是原来的规则数组（kind、valueMin…一个字段都不改），老版本照样读得懂。 */
const LockGiftTables=(()=>{
  'use strict';
  const MAX_RULES=50,MAX_COUNT=Number.MAX_SAFE_INTEGER;
  // 说法跟着「玩法」（进度条 / 次数）和「画面」（锁链按、牢笼拍）走
  function words(play,scene){
    const count=play==='count',cage=scene==='cage',press=cage?'拍':'按';
    return {
      lockTitle:count?'③ 加次数礼物':'③ 加进度条礼物',
      lockSay:count?'观众送一个，就把要'+press+'的次数往上加。只有一个总数，不会多出一条；'+press+'一下少一次，到 0 '+(cage?'门就开':'就出来')+'，停手不会往回掉。'
        :'观众送一个，就给你加进度条（每条要'+press+'几下在这里填）。'+press+'满一条破一条，全部'+press+'完'+(cage?'门才开':'才出来')+'；停手会往回掉，多快在 ① 里调。',
      lockAdd:count?'＋ 添加一个加次数礼物':'＋ 添加一个加进度条礼物',
      unit:count?'次':'条',each:'每条',press,
      relief:count?'帮你减掉':'帮你'+press+'掉',reliefSay:count?'帮减掉几次':'帮'+press+'掉几下',reliefUnit:count?'次':'下',reliefAdd:count?'＋ 减次数礼物':'＋ 帮'+press+'礼物',
      clear:cage?'马上开门':count?'次数直接清零':'马上全部解开',clearAdd:cage?'＋ 开门礼物':count?'＋ 清零礼物':'＋ 全部解开礼物',
      remain:count?'剩下的次数':'剩下要'+press+'的'
    };
  }
  const fold=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase(); // 和收礼时认礼物名的规则一样
  const fit=input=>{input.style.width='calc('+Math.max(4,String(input.value).length)+'ch + 22px)';}; // 数字框按位数变宽，大数不会被切掉
  const short=(lo,hi)=>lo===hi?String(lo):lo+'～'+hi;

  function el(tag,props={},...kids){
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(props)){
      if(value===undefined||value===null||value===false)continue;
      if(key==='text')node.textContent=value;else if(key==='class')node.className=value;
      else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else node.setAttribute(key,value===true?'':String(value));
    }
    for(const kid of kids.flat())if(kid!==null&&kid!==undefined&&kid!==false)node.append(kid);
    return node;
  }

  /* 一行礼物用一句话说清楚，导入预览也用这句 */
  function describe(rule,play,scene){
    const w=words(play,scene),count=play==='count',extra=rule.multiplierMin!==1||rule.multiplierMax!==1?'，再 ×'+short(rule.multiplierMin,rule.multiplierMax):'';
    if(rule.kind==='lock'){
      if(count)return '加 '+short(rule.valueMin,rule.valueMax)+' '+w.unit+extra;
      return '加 '+short(rule.valueMin,rule.valueMax)+' '+w.unit+'，'+w.each+w.press+(rule.targetMode==='blindbox'?'几下按旧版概率抽':' '+short(rule.targetMin,rule.targetMax)+' 下')+extra;
    }
    if(rule.kind==='multiply')return w.remain+' ×'+short(rule.multiplierMin,rule.multiplierMax)+(rule.valueMin!==1||rule.valueMax!==1?'，连乘 '+short(rule.valueMin,rule.valueMax)+' 次':'');
    if(rule.kind==='divide')return w.remain+' ÷'+short(rule.multiplierMin,rule.multiplierMax)+(rule.valueMin!==1||rule.valueMax!==1?'，连除 '+short(rule.valueMin,rule.valueMax)+' 次':'');
    if(rule.kind==='freeze')return '按键失灵 '+short(rule.valueMin,rule.valueMax)+' 秒';
    if(rule.kind==='relief')return w.relief+' '+short(rule.valueMin,rule.valueMax)+' '+w.reliefUnit;
    return w.clear;
  }

  /* api: rules() 当前玩法那张礼物表；save(list) 校验并保存，成功返回 true；clean(rule) 规范一条规则，不合法返回 null；
     play() 玩法 bar/count；scene() 画面 lock/cage；test(rule) 当作送了 1 个；toast(text) 提示。 */
  function create({holders,api}){
    let focusIndex=-1;
    const counted=()=>api.play()==='count',current=()=>words(api.play(),api.scene());
    const defaults=kind=>({lock:counted()?{value:60}:{value:1,target:60},multiply:{value:1,multiplier:2},divide:{value:1,multiplier:2},freeze:{value:10},relief:{value:60},clear:{value:1}})[kind];
    const limits=kind=>{const count=counted();return {lock:count?MAX_COUNT:20000,relief:count?MAX_COUNT:10000000,freeze:3600,multiply:99,divide:99,clear:1}[kind];};

    /* 存一行：规范 → 保存 → 把这行的数字刷成存下来的样子（不重画整张表，正在点的按钮不会丢） */
    function commit(index,next,row){
      const cleaned=api.clean(next);
      if(!cleaned){api.toast('没保存：这个数字不行');sync(row,api.rules()[index]);return false;}
      if(!api.save(api.rules().map((item,i)=>i===index?cleaned:item))){api.toast('浏览器没能保存，还用原来的设置');sync(row,api.rules()[index]);return false;}
      sync(row,cleaned);return true;
    }
    function sync(row,rule){
      if(!row||!rule)return;
      for(const input of row.querySelectorAll('input[data-field]')){input.value=String(rule[input.dataset.field]);fit(input);}
      const name=row.querySelector('.gift-name');if(name&&document.activeElement!==name)name.value=rule.name;
    }
    /* [最少]～[最多]：改了一头，另一头跟着走，不会倒过来 */
    function range(index,row,prefix,max,label){
      const rule=api.rules()[index],input=side=>{
        const field=prefix+side,node=el('input',{type:'number',min:1,max,step:1,inputmode:'numeric',class:'gift-num','data-field':field,'aria-label':rule.name+' '+label+(side==='Min'?'（最少）':'（最多）')});
        node.value=String(rule[field]);fit(node);
        node.addEventListener('input',()=>fit(node));
        node.addEventListener('change',()=>{
          const current=api.rules()[index],n=Number(node.value);if(!current)return;
          if(String(node.value).trim()===''||!Number.isSafeInteger(n)||n<1||n>max){node.value=String(current[field]);fit(node);api.toast(label+'要填 1～'+max.toLocaleString()+' 的整数');return;}
          const next={...current,[field]:n};
          if(side==='Min'&&next[prefix+'Max']<n)next[prefix+'Max']=n;
          if(side==='Max'&&next[prefix+'Min']>n)next[prefix+'Min']=n;
          commit(index,next,row);
        });
        return node;
      };
      return el('span',{class:'gift-range'},input('Min'),el('i',{text:'～'}),input('Max'));
    }
    function does(index,row){
      const rule=api.rules()[index],w=current(),count=counted(),r=(prefix,max,label)=>range(index,row,prefix,max,label);
      const chunk=(...kids)=>el('span',{class:'gift-chunk'},...kids),parts=[]; // 一个短语不拆行，换行只在短语之间
      if(rule.kind==='lock'){
        if(count)parts.push(chunk('加',r('value',limits('lock'),'加几次'),'次'));
        else{
          parts.push(chunk('加',r('value',limits('lock'),'加几'+w.unit),w.unit+'，'));
          if(rule.targetMode==='blindbox'){
            const tiers=(rule.targetPool||[]).filter(tier=>tier.enabled).map(tier=>tier.name+' '+short(tier.min,tier.max)+' 下 '+tier.percent+'%').join('、');
            parts.push(el('span',{class:'gift-chunk gift-chunk-wrap'},w.each+w.press+'几下按旧版概率抽'+(tiers?'（'+tiers+'）':''),el('button',{type:'button',class:'secondary small gift-legacy',text:'改成普通范围',title:'改成在最少～最多之间随机，原来的几档概率不再用','aria-label':rule.name+' 改成普通范围',onclick:()=>toSimple(index)})));
          }
          else parts.push(chunk(w.each+w.press,r('target',99999,w.each+w.press+'几下'),'下'));
        }
        // 老版本留下的"再乘几倍"：不是 1 才显示，新加的礼物用不到
        if(rule.multiplierMin!==1||rule.multiplierMax!==1)parts.push(chunk('，再 ×',r('multiplier',1000,'再乘几倍')));
      }else if(rule.kind==='multiply'){
        parts.push(chunk(w.remain+' ×',r('multiplier',1000,'乘几倍')));
        if(rule.valueMin!==1||rule.valueMax!==1)parts.push(chunk('，连乘',r('value',limits('multiply'),'连乘几次'),'次'));
      }else if(rule.kind==='divide'){
        parts.push(chunk(w.remain+' ÷',r('multiplier',1000,'除以几')));
        if(rule.valueMin!==1||rule.valueMax!==1)parts.push(chunk('，连除',r('value',limits('divide'),'连除几次'),'次'));
      }else if(rule.kind==='freeze')parts.push(chunk('按键失灵',r('value',limits('freeze'),'失灵几秒'),'秒'));
      else if(rule.kind==='relief')parts.push(chunk(w.relief,r('value',limits('relief'),w.reliefSay),w.reliefUnit));
      else parts.push(chunk(el('b',{text:w.clear})));
      return el('span',{class:'gift-does'},el('span',{class:'gift-send',text:'送 1 个 →'}),...parts);
    }
    function toSimple(index){
      const rule=api.rules()[index];if(!rule)return;
      const next={...rule};delete next.targetMode;delete next.targetPool;
      const cleaned=api.clean(next);
      if(!cleaned||!api.save(api.rules().map((item,i)=>i===index?cleaned:item))){api.toast('没改成：浏览器没能保存');return;}
      render();
    }
    function rename(index,input){
      const rule=api.rules()[index];if(!rule)return;
      const value=input.value.trim();
      if(!value||value.length>80||/[\u0000-\u001f\u007f]/.test(value)){input.value=rule.name;api.toast(value?'礼物名太长了（最多 80 个字）':'礼物名不能空着');return;}
      if(api.rules().some((item,i)=>i!==index&&fold(item.name)===fold(value))){input.value=rule.name;api.toast('「'+value+'」已经在表里了，同一个礼物只能填一行');return;}
      if(commit(index,{...rule,name:value},input.closest('.gift-row'))){input.value=value;markDuplicates();}
    }
    function remove(index,event){
      if(event.detail>1)return; // 双击不连删两行
      const list=api.rules();if(!list[index])return;
      if(!api.save(list.filter((_,i)=>i!==index))){api.toast('没删掉：浏览器没能保存');return;}
      render();
    }
    function add(kind){
      const list=api.rules();
      if(list.length>=MAX_RULES){api.toast('最多 '+MAX_RULES+' 个礼物，先删掉不用的');return;}
      const names=new Set(list.map(item=>fold(item.name)));let n=1;while(names.has(fold('新礼物'+n)))n++;
      const fresh=api.clean({name:'新礼物'+n,kind,...defaults(kind)});
      if(!fresh||!api.save([...list,fresh])){api.toast('没加上：浏览器没能保存');return;}
      focusIndex=list.length;render();
    }
    function rowFor(rule,index){
      const row=el('div',{class:'gift-row','data-kind':rule.kind,'data-index':index});
      const name=el('input',{class:'gift-name',maxlength:80,'aria-label':'礼物名',placeholder:'礼物名'});name.value=rule.name;
      name.addEventListener('change',()=>rename(index,name));
      row.append(name,does(index,row),
        el('span',{class:'gift-tools'},
          el('button',{type:'button',class:'gift-try',text:'▶',title:'试一下：当作有人送了 1 个','aria-label':'试一下 '+rule.name,onclick:()=>{const current=api.rules()[index];if(current)api.test(current);}}),
          el('button',{type:'button',class:'gift-del',text:'✕',title:'删掉这一行','aria-label':'删掉 '+rule.name,onclick:event=>remove(index,event)})),
        el('p',{class:'gift-warn',hidden:true,text:'上面已经有这个礼物了，这一行不会生效。改个名字或者删掉。'}));
      return row;
    }
    function rows(kinds,empty){
      const list=api.rules().map((rule,index)=>[rule,index]).filter(([rule])=>kinds.includes(rule.kind));
      return list.length?list.map(([rule,index])=>rowFor(rule,index)):[el('p',{class:'gift-empty',text:empty})];
    }
    // 同一个礼物填了两行时，只有排在前面的那行会生效（收礼时按顺序找第一个）。三张表按效果分开，所以要说清楚是哪张表的那一行
    const tableOf=kind=>kind==='lock'?'lock':kind==='multiply'||kind==='freeze'?'mess':'help'; // 帮按、减半、全部解开在 ④
    const tableTitle=table=>table==='lock'?current().lockTitle:table==='mess'?'④ 捣乱礼物':'⑤ 帮忙礼物';
    function markDuplicates(){
      const list=api.rules(),first=new Map();
      list.forEach((rule,index)=>{const key=fold(rule.name);if(!first.has(key))first.set(key,index);});
      for(const holder of Object.values(holders))for(const row of holder.querySelectorAll('.gift-row')){
        const index=Number(row.dataset.index),rule=list[index],winner=rule?first.get(fold(rule.name)):index,dup=winner!==index,warn=row.querySelector('.gift-warn');
        row.classList.toggle('dup',dup);warn.hidden=!dup;
        if(dup){const there=tableOf(list[winner].kind);warn.textContent=(there===tableOf(rule.kind)?'上面已经有这个礼物了':'「'+tableTitle(there)+'」里已经有这个礼物了，那一行生效')+'，这一行不会生效。改个名字或者删掉。';}
      }
    }
    const addRow=buttons=>el('div',{class:'gift-adds'},buttons.map(([kind,text])=>el('button',{type:'button',class:'secondary gift-add','data-add':kind,text,onclick:()=>add(kind)})));
    const note=text=>el('p',{class:'note',text});

    function render(){
      const w=current();
      for(const holder of Object.values(holders))holder.dataset.mode=counted()?'count':api.scene();
      holders.lock.replaceChildren(el('h3',{text:w.lockTitle}),el('p',{class:'say',text:w.lockSay}),
        ...rows(['lock'],'还没有。观众送礼不会加锁，点下面的按钮添加。'),addRow([['lock',w.lockAdd]]),
        note('两个数一样就是固定数，不一样就每次在中间随机。观众一次送 3 个，就算 3 份。'));
      holders.mess.replaceChildren(el('h3',{text:'④ 捣乱礼物'}),
        el('p',{class:'say',text:'让你更难：'+w.remain+'翻几倍，或者按键失灵几秒（失灵的时候按了不算）。翻倍只对正在玩的挑战有用。'}),
        ...rows(['multiply','freeze'],'还没有。'),addRow([['multiply','＋ 翻倍礼物'],['freeze','＋ 按键失灵礼物']]));
      holders.help.replaceChildren(el('h3',{text:'⑤ 帮忙礼物'}),
        el('p',{class:'say',text:'帮你：'+w.reliefSay+'；'+w.remain+'减半（÷ 几都行，至少留 1 下）；或者'+w.clear+'（按键失灵也一起解除）。'}),
        ...rows(['relief','divide','clear'],'还没有。'),addRow([['relief',w.reliefAdd],['divide','＋ 减半礼物'],['clear',w.clearAdd]]),
        note('三张表里都没有的礼物，送了没反应。同一个礼物只能填一行。点 ▶ 就当有人送了 1 个，会真的加上去；试完点下面的「清空现在的挑战」。'));
      markDuplicates();
      if(focusIndex>=0){
        const input=Object.values(holders).map(holder=>holder.querySelector(`.gift-row[data-index="${focusIndex}"] .gift-name`)).find(Boolean);
        focusIndex=-1;if(input){input.focus();input.select();input.scrollIntoView({block:'nearest'});}
      }
    }
    return Object.freeze({render});
  }
  return Object.freeze({create,describe,words});
})();
if(typeof module==='object'&&module.exports)module.exports=LockGiftTables;
