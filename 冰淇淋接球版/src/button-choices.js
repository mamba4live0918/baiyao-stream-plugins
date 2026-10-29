(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GelatoButtonChoices=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LABELS={'difficulty-preset':'难度预设','editor-level':'选择关卡','level-mode':'关卡模式','level-attemptMode':'掉落总数模式','layout-target':'HUD 调整对象','layout-placement':'排列方式'};
  const INLINE=new Set(['difficulty-preset','level-mode','level-attemptMode','layout-placement']);
  function pick(select,value){
    const option=Array.from(select.options).find(o=>o.value===String(value));
    if(select.disabled||!option||option.disabled||select.value===String(value))return false;
    select.value=String(value);const EventType=select.ownerDocument.defaultView.Event;
    select.dispatchEvent(new EventType('input',{bubbles:true}));select.dispatchEvent(new EventType('change',{bubbles:true}));return true;
  }
  class Controls{
    constructor(root=document){
      this.root=root;this.records=new Map();this.active=null;
      this.overlay=document.createElement('div');this.overlay.id='choice-panel';this.overlay.hidden=true;this.overlay.setAttribute('role','dialog');this.overlay.setAttribute('aria-modal','true');this.overlay.setAttribute('aria-labelledby','choice-title');
      this.overlay.innerHTML='<div class="choice-window"><div class="choice-heading"><h2 id="choice-title">选择选项</h2><button type="button" id="choice-close" aria-label="关闭选择面板">×</button></div><input id="choice-search" type="search" placeholder="输入名称或编号筛选" aria-label="筛选选项"><div id="choice-options"></div><p id="choice-empty" hidden>没有匹配选项</p></div>';
      document.body.append(this.overlay);this.title=this.overlay.querySelector('#choice-title');this.search=this.overlay.querySelector('#choice-search');this.options=this.overlay.querySelector('#choice-options');
      this.overlay.querySelector('#choice-close').onclick=()=>this.close();this.overlay.onclick=e=>{if(e.target===this.overlay)this.close();};this.search.oninput=()=>this.renderPanel();
      this.overlay.addEventListener('dblclick',e=>e.stopPropagation());
      document.addEventListener('keydown',e=>{
        if(this.overlay.hidden)return;
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.close();return;}
        if(e.key==='Tab'){e.stopImmediatePropagation();const nodes=Array.from(this.overlay.querySelectorAll('button,input')).filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
      },true);
      this.sync();
    }
    key(select){return select.id||select.getAttribute('aria-label')||'选项';}
    add(select){
      const label=LABELS[select.id]||select.getAttribute('aria-label')||'选择选项',inline=INLINE.has(select.id),box=document.createElement('div');
      box.className='button-choice'+(inline?' choice-inline':'');box.setAttribute('role','group');box.setAttribute('aria-label',label);box.dataset.choiceFor=this.key(select);
      select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.insertAdjacentElement('afterend',box);
      const record={select,label,inline,box,signature:'',trigger:null};this.records.set(select,record);return record;
    }
    sync(){
      for(const [select,r] of this.records)if(!select.isConnected){r.box.remove();this.records.delete(select);}
      for(const select of this.root.querySelectorAll('select')){
        const r=this.records.get(select)||this.add(select),opts=Array.from(select.options);
        const signature=JSON.stringify([select.value,select.disabled,opts.map(o=>[o.value,o.textContent,o.disabled])]);if(signature===r.signature)continue;r.signature=signature;
        if(r.inline){
          // Keep existing buttons stable while their selected state changes.
          if(r.box.children.length!==opts.length||opts.some((o,i)=>r.box.children[i]?.dataset.value!==o.value)){
            r.box.replaceChildren();for(const o of opts){const b=document.createElement('button');b.type='button';b.dataset.value=o.value;b.onclick=()=>{pick(select,o.value);this.sync();};r.box.append(b);}
          }
          opts.forEach((o,i)=>{const b=r.box.children[i];b.textContent=o.textContent;b.disabled=select.disabled||o.disabled;b.setAttribute('aria-pressed',String(select.value===o.value));});
        }else{
          if(!r.trigger){r.trigger=document.createElement('button');r.trigger.type='button';r.trigger.className='choice-open';r.trigger.setAttribute('aria-haspopup','dialog');r.trigger.onclick=()=>this.open(r);r.box.append(r.trigger);}
          const chosen=opts.find(o=>o.value===select.value);r.trigger.textContent=(chosen?.textContent||'未选择')+' · 更换';r.trigger.disabled=select.disabled||!opts.length;r.trigger.setAttribute('aria-label',r.label+'：'+(chosen?.textContent||'未选择')+'，点击更换');
        }
      }
      if(this.active&&(!this.active.select.isConnected||this.active.select.disabled))this.close();
    }
    open(record){this.active=record;this.title.textContent=record.label;this.search.value='';this.search.hidden=record.select.options.length<=8;this.overlay.hidden=false;this.renderPanel();(this.search.hidden?this.options.querySelector('button')||this.overlay.querySelector('#choice-close'):this.search).focus();}
    renderPanel(){
      if(!this.active)return;const r=this.active,query=this.search.value.trim().toLocaleLowerCase();this.options.replaceChildren();
      for(const o of r.select.options){if(query&&!o.textContent.toLocaleLowerCase().includes(query))continue;const b=document.createElement('button');b.type='button';b.textContent=o.textContent;b.disabled=o.disabled;b.setAttribute('aria-pressed',String(o.value===r.select.value));b.onclick=()=>{const key=this.key(r.select);this.close(false);pick(r.select,o.value);this.sync();const current=Array.from(this.records.values()).find(n=>this.key(n.select)===key);current?.trigger?.focus();};this.options.append(b);}
      this.overlay.querySelector('#choice-empty').hidden=!!this.options.children.length;
    }
    close(restore=true){const active=this.active;this.active=null;this.overlay.hidden=true;if(restore&&active?.trigger?.isConnected)active.trigger.focus();}
  }
  return {pick,Controls};
});
