(function(root,factory){const Type=factory();if(typeof module==='object'&&module.exports)module.exports=Type;else root.PetBoxSettings=Type;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function quantity(value){
  const text=String(value).trim(),number=Number(text);
  if(!/^\d+$/.test(text)||!Number.isSafeInteger(number)||number<1||number>100000)throw Error('数量须为1–100000的整数');
  return number;
 }
 class PetBoxSettings{
  constructor({container,summary,blindBox,getTiers,onApply,onPreview=()=>{},onGiftTest=null,toast=()=>{}}){
   if(!container?.ownerDocument||!summary||!blindBox||typeof getTiers!=='function'||typeof onApply!=='function')throw new TypeError('Missing blind-box settings dependencies');
   Object.assign(this,{container,summary,blindBox,getTiers,onApply,onPreview,onGiftTest,toast});this.doc=container.ownerDocument;this.serial=0;
   this.actions=this.doc.createElement('div');this.actions.className='box-settings-actions';
   this.actions.append(this.button('新增档位','add',()=>this.add()),this.button('应用档位','apply',()=>this.apply()),this.button('重新载入','reload',()=>this.reset()));
   this.feedback=this.doc.createElement('div');this.feedback.className='feedback';this.feedback.setAttribute('role','alert');
   this.rows=this.doc.createElement('div');this.rows.className='box-tier-list';container.replaceChildren(this.actions,this.feedback,this.rows);summary.setAttribute('role','status');this.reset();
  }
  button(text,action,handler){const button=this.doc.createElement('button');button.type='button';button.textContent=text;button.dataset.boxAction=action;button.addEventListener('click',handler);return button;}
  asDraft(rows){return rows.map(row=>({...row,count:String(row.count),min:String(row.min),max:String(row.max)}));}
  reset(){
   const rows=this.blindBox.validateTiers(this.getTiers());this.liveSignature=JSON.stringify(rows);this.draft=this.asDraft(rows);this.initialDraft=JSON.stringify(this.draft);this.stale=false;this.feedback.textContent='';this.render();return true;
  }
  isDirty(){return JSON.stringify(this.draft)!==this.initialDraft;}
  sync(){
   if(JSON.stringify(this.getTiers())!==this.liveSignature){if(!this.isDirty())return this.reset();this.stale=true;this.feedback.textContent='正式档位已更新，请重新载入后再应用';}
   this.updateSummary();
  }
  parseDraft(){
   return this.draft.map(row=>{
    if(!['fixed','random'].includes(row.mode))throw Error('请选择固定数量或随机范围');
    const count=row.mode==='fixed'?quantity(row.count):quantity(row.min),min=row.mode==='fixed'?count:quantity(row.min),max=row.mode==='fixed'?count:quantity(row.max);
    return{id:row.id,name:row.name,gift:row.gift,mode:row.mode,count,min,max,enabled:row.enabled};
   });
  }
  fail(error){const message=error?.message||String(error);this.feedback.textContent=message;this.toast(message);this.updateSummary();return false;}
  add(){
   let id;do{id='box-'+Date.now().toString(36)+'-'+(++this.serial).toString(36);}while(this.draft.some(row=>row.id===id));
   this.draft.push({id,name:'新盲盒',gift:'',mode:'fixed',count:'1',min:'1',max:'1',enabled:true});this.feedback.textContent='';this.render();return true;
  }
  remove(id){const index=this.draft.findIndex(row=>row.id===id);if(index<0)return false;this.draft.splice(index,1);this.feedback.textContent='';this.render();return true;}
  apply(){
   try{
    if(JSON.stringify(this.getTiers())!==this.liveSignature)throw Error('正式档位已更新，请重新载入后再应用');
    const rows=this.blindBox.validateTiers(this.parseDraft());if(this.onApply(rows)===false)throw Error('档位尚未应用，草稿已保留');this.reset();return true;
   }catch(error){return this.fail(error);}
  }
  appliedTier(id){
   if(this.isDirty()||JSON.stringify(this.getTiers())!==this.liveSignature){this.fail(Error('请先应用档位，再试开或模拟礼物'));return null;}
   return this.getTiers().find(row=>row.id===id&&row.enabled)||null;
  }
  testTier(id){if(!this.appliedTier(id))return false;this.onPreview(id);return true;}
  testGift(id){const row=this.appliedTier(id);if(!row?.gift||!this.onGiftTest)return false;this.onGiftTest({giftName:row.gift,count:1});return true;}
  field(row,key,label,type){
   const wrapper=this.doc.createElement('label');wrapper.className='box-tier-field box-tier-'+key;const text=this.doc.createElement('span');text.textContent=label;
   const input=this.doc.createElement(type==='select'?'select':'input');if(type!=='select')input.type=type;input.id='box-tier-'+row.id+'-'+key;input.dataset.boxTier=row.id;input.dataset.boxField=key;input.setAttribute('aria-label',label);
   if(key==='mode')for(const[value,name]of[['fixed','固定数量'],['random','随机范围']]){const option=this.doc.createElement('option');option.value=value;option.textContent=name;input.append(option);}
   if(key==='enabled')input.checked=row.enabled;else input.value=row[key];
   if(key==='name')input.maxLength=80;
   if(key==='gift'){input.maxLength=200;input.placeholder='留空仅手动试开';}
   if(['count','min','max'].includes(key)){input.min='1';input.max='100000';input.step='1';input.inputMode='numeric';}
   input.addEventListener(key==='enabled'||key==='mode'?'change':'input',()=>{row[key]=key==='enabled'?input.checked:input.value;this.feedback.textContent='';if(key==='mode'){this.render();this.doc.getElementById(input.id)?.focus?.();}else this.updateSummary();});
   wrapper.append(text,input);return wrapper;
  }
  render(){
   this.rows.replaceChildren();this.testButtons=[];
   for(const row of this.draft){
    const el=this.doc.createElement('div');el.className='box-tier-row';el.dataset.tier=row.id;
    el.append(this.field(row,'enabled','启用','checkbox'),this.field(row,'name','盲盒名称','text'),this.field(row,'gift','绑定礼物','text'),this.field(row,'mode','数量方式','select'));
    if(row.mode==='random')el.append(this.field(row,'min','最少数量','number'),this.field(row,'max','最多数量','number'));else el.append(this.field(row,'count','固定数量','number'));
    const actions=this.doc.createElement('div');actions.className='box-tier-actions';const test=this.button('真实试开','test',()=>this.testTier(row.id));test.setAttribute('aria-label','真实试开 '+row.name);this.testButtons.push({id:row.id,button:test});
    const gift=this.button('模拟礼物','gift',()=>this.testGift(row.id));gift.setAttribute('aria-label','模拟礼物 '+(row.gift||row.name));this.testButtons.push({id:row.id,button:gift,gift:true});
    const remove=this.button('删除','remove',()=>this.remove(row.id));remove.setAttribute('aria-label','删除 '+row.name);actions.append(test,gift,remove);el.append(actions);this.rows.append(el);
   }
   this.updateSummary();
  }
  updateSummary(){
   const enabled=this.draft.filter(row=>row.enabled),bound=enabled.filter(row=>String(row.gift||'').trim()).length,dirty=this.isDirty();
   this.summary.textContent=`共 ${this.draft.length} 档，启用 ${enabled.length} 档，绑定礼物 ${bound} 档${dirty?' · 未应用':''}。礼物留空可手动试开；在外总量仍受100000只容量保护。`;
   const applied=new Map(this.getTiers().map(row=>[row.id,row]));
   for(const item of this.testButtons||[]){const row=applied.get(item.id);item.button.disabled=dirty||this.stale||!row?.enabled||!!item.gift&&(!row.gift||!this.onGiftTest);}
  }
 }
 return PetBoxSettings;
});
