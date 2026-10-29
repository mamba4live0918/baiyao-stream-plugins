(function(root){
'use strict';
class PetControls{
 constructor(hooks){
  Object.assign(this,hooks);this.doc=root.document;this.P=root.PetNamedPets;this.actor=null;this.nameplates=new WeakMap();this.measureRevision=0;this.endArmed=null;this.deleteArmed=null;
  this.$=id=>this.doc.getElementById(id);this.panel=this.$('pet-panel');
  this.$('pet-close').onclick=()=>this.close();
  this.$('pet-size').oninput=()=>{this.scaleDirty=true;this.$('pet-size-range').value=this.$('pet-size').value;this.previewSize();};
  this.$('pet-size-range').oninput=()=>{this.scaleDirty=true;this.$('pet-size').value=this.$('pet-size-range').value;this.previewSize();};
  this.$('pet-name').oninput=()=>{if(this.actor&&!this.actor.residentId&&!this.scaleDirty){const value=this.$('pet-name').value.trim()?this.P.firstNameScale(this.actor.individualScale??100).value:this.actor.individualScale??100;this.setScale(value);this.autoScale=value;}this.previewSize();};
  this.$('pet-size-save').onclick=()=>{if(!this.current())return;this.perform(()=>this.onSaveSize(this.actor,this.readScale()),()=>this.close());};
  this.$('pet-name-save').onclick=()=>{
   if(!this.current())return;
   this.perform(()=>{const a=this.actor,name=this.P.validateText(this.$('pet-name').value,30);let scale=this.readScale();if(a.residentId)return this.onEditResident(a,name,scale);if(!this.scaleDirty&&scale===this.autoScale){const preset=this.P.firstNameScale(a.individualScale??100);scale=preset.value;this.setScale(scale);if(preset.clamped)this.message('已达到单只比例上限1000%',true);}return this.onPromote(a,name,scale);},()=>{this.close();this.refresh();});
  };
  this.panel.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'&&!e.isComposing){e.preventDefault();this.close();}});
  this.panel.addEventListener('pointerdown',e=>e.stopPropagation());this.panel.addEventListener('dblclick',e=>e.stopPropagation());
  this.$('end-session').onclick=()=>{const id=this.getSessionId();if(this.endArmed!==id){this.endArmed=id;this.$('end-session').textContent='确认结束并清空';this.$('end-session-cancel').hidden=false;this.message('确认清除全部本场宠物、名字和待开盲盒？素材与设置保留。');return;}this.perform(()=>this.onEndSession(),()=>{this.disarmEnd();this.close();this.refresh();});};
  this.$('end-session-cancel').onclick=()=>this.disarmEnd();
  this.$('pet-delete').onclick=()=>this.requestDelete(this.actor?.residentId);
  this.$('pet-delete-cancel').onclick=()=>{this.deleteArmed=null;this.refresh();this.message('',true);};
  this.doc.addEventListener('pointerdown',e=>{if(this.actor&&!this.panel.contains(e.target)&&!e.target.closest?.('.calf')&&!this.isPet?.(e))this.close();});
  if(!this.layout)root.addEventListener?.('resize',()=>{this.measureRevision++;if(this.actor)this.positionPanel();});
  this.refresh();
 }
 message(t,local=false){const node=this.$(local?'pet-feedback':'named-feedback');node.textContent=t;if(local&&this.actor&&!this.panel.hidden)this.positionPanel();}
 perform(fn,success){try{if(fn()===false){this.message('操作未完成，请检查保存提示',!!this.actor);return false;}success?.();return true;}catch(e){this.message(e.message,!!this.actor);this.toast(e.message);return false;}}
 refresh(){
  const n=this.getNaming(),list=this.$('named-pet-list');list.replaceChildren();this.measureRevision++;
  if(this.deleteArmed&&(this.deleteArmed.session!==this.getSessionId()||!n.residents.some(r=>r.id===this.deleteArmed.id)))this.deleteArmed=null;
  this.$('named-count').textContent=n.residents.length+' 只本场专属';
  if(n.quarantine)this.message('有取名记录待核对，原记录已保留；结束本场可清除。');
  for(const resident of n.residents){
   const row=this.doc.createElement('div');row.className='named-pet-row';const label=this.doc.createElement('span');label.textContent=resident.name;row.append(label);
   const actions=this.doc.createElement('div');actions.className='named-pet-actions';
   if(this.onOpenResident){const edit=this.doc.createElement('button');edit.type='button';edit.textContent='修改';edit.onclick=()=>this.onOpenResident(resident.id);actions.append(edit);}
   if(this.onDeleteResident){const armed=this.deleteArmed?.id===resident.id,remove=this.doc.createElement('button');remove.type='button';remove.dataset.action='delete-resident';remove.className='pet-delete-button';remove.textContent=armed?'确认删除':'删除';remove.setAttribute('aria-label',(armed?'确认删除':'删除')+'宠物 '+resident.name);remove.onclick=()=>this.requestDelete(resident.id);actions.append(remove);if(armed){const cancel=this.doc.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.onclick=()=>{this.deleteArmed=null;this.refresh();this.message('');};actions.append(cancel);}}
   row.append(actions);
   list.append(row);
  }
  this.$('named-empty').hidden=n.residents.length>0;
  if(this.actor&&!this.current())this.close();
  this.syncDeleteControls();
 }
 syncDeleteControls(){const id=this.actor?.residentId,armed=!!id&&this.deleteArmed?.id===id&&this.deleteArmed.session===this.getSessionId();this.$('pet-delete-actions').hidden=!id||!this.onDeleteResident;this.$('pet-delete').textContent=armed?'确认删除此宠物':'删除此宠物';this.$('pet-delete-cancel').hidden=!armed;}
 requestDelete(id){
  const r=this.getNaming().residents.find(r=>r.id===id);if(!r||!this.onDeleteResident)return false;
  const local=this.actor?.residentId===id;
  if(this.deleteArmed?.id!==id||this.deleteArmed.session!==this.getSessionId()){this.deleteArmed={id,session:this.getSessionId()};this.refresh();this.message('确认删除「'+r.name+'」？只删除这一只，不会送回小窝。',local);return false;}
  return this.perform(()=>this.onDeleteResident(id),()=>{this.deleteArmed=null;if(this.actor?.residentId===id)this.close();this.refresh();this.message('已删除「'+r.name+'」');});
 }
 current(){return!!this.actor&&this.menuSession===this.getSessionId()&&this.canEdit(this.actor);}
 open(actor){
  if(!this.canEdit(actor))return false;this.deleteArmed=null;this.actor=actor;this.menuSession=this.getSessionId();this.scaleDirty=false;this.autoScale=actor.individualScale??100;this.$('pet-feedback').textContent='';this.$('pet-name').value=actor.petName||'';this.setScale(this.autoScale);this.$('pet-name-save').textContent=actor.residentId?'保存名字':'确认取名';this.panel.hidden=false;this.$('pet-panel-title').textContent=actor.residentId?'专属宠物':'单只宠物';this.previewSize();this.refresh();this.positionPanel();this.$('pet-name').focus({preventScroll:true});return true;
 }
 close(){const a=this.actor,armed=!!this.deleteArmed;this.actor=null;this.deleteArmed=null;this.panel.hidden=true;this.syncDeleteControls();if(armed)this.refresh();if(a?.el?.isConnected)a.el.focus({preventScroll:true});}
 positionPanel(){const w=Math.min(300,root.innerWidth-16),h=this.panel.getBoundingClientRect().height||280,x=this.actor?.x??16,y=this.actor?.y??16;this.panel.style.left=Math.max(8,Math.min(root.innerWidth-w-8,x))+'px';this.panel.style.top=Math.max(8,Math.min(root.innerHeight-h-8,y))+'px';}
 setScale(value){this.$('pet-size').value=value;this.$('pet-size-range').value=value;}
 readScale(){const raw=this.$('pet-size').value;if(!raw.trim()||!this.P.validScale(Number(raw)))throw Error('单只大小须为25–1000%，最多两位小数');return Number(raw);}
 previewSize(){if(this.actor)this.$('pet-actual-size').textContent='当前实际 '+Math.round(this.actor.size||0)+' px';}
 disarmEnd(){this.endArmed=null;this.$('end-session').textContent='结束本场并清空';this.$('end-session-cancel').hidden=true;this.$('named-feedback').textContent='';}
 syncNameplate(actor,{w,h,lift=0}){
  const textScale=this.layout?.metrics.textScale||1;if(this.textScale!==textScale){this.textScale=textScale;this.measureRevision++;}
  if(!actor.residentId||!actor.petName||actor.dead){this.removeNameplate(actor);return;}
  let saved=this.nameplates.get(actor);
  if(!saved){const node=this.doc.createElement('div');node.className='pet-nameplate';node.style.pointerEvents='none';node.style.transform='translate(-50%,-100%)';(this.$('field')||this.doc.body).append(node);saved={node};this.nameplates.set(actor,saved);}
  const p=saved.node;
  if(saved.text!==actor.petName||saved.viewport!==w||saved.revision!==this.measureRevision){p.textContent=actor.petName;p.style.fontSize=(14*textScale)+'px';p.style.maxWidth=Math.max(1,Math.min(220*textScale,w-16))+'px';const r=p.getBoundingClientRect();saved.width=Math.min(Math.max(1,w-16),r.width||220*textScale);saved.height=r.height||28*textScale;saved.text=actor.petName;saved.viewport=w;saved.revision=this.measureRevision;}
  const left=Math.max(saved.width/2+8,Math.min(w-saved.width/2-8,actor.x))+'px',top=Math.max(Math.min(h-8,saved.height+8),Math.min(h-8,actor.y+lift-actor.size/2-8))+'px';
  if(saved.left!==left){p.style.left=left;saved.left=left;}if(saved.top!==top){p.style.top=top;saved.top=top;}
 }
 removeNameplate(actor){this.nameplates.get(actor)?.node.remove();this.nameplates.delete(actor);}
}
if(typeof module!=='undefined'&&module.exports)module.exports=PetControls;else root.PetControls=PetControls;
})(typeof window==='undefined'?globalThis:window);
