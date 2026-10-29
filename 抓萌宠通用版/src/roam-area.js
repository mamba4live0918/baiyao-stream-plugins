(function(root,factory){const Type=factory(typeof module==='object'&&module.exports?require('./roam-geometry.js'):root.PetRoamGeometry);if(typeof module==='object'&&module.exports)module.exports=Type;else root.PetRoamArea=Type;})(typeof globalThis!=='undefined'?globalThis:this,function(G){
 'use strict';
 class PetRoamArea{
  constructor({getBounds,onChange,onCommit,onEditStart=()=>{},canEdit=()=>true,getDefault=()=>({roamLeft:3,roamRight:97,roamTop:35,roamBottom:84}),document:doc=globalThis.document,window:win=globalThis.window}){
   Object.assign(this,{getBounds,onChange,onCommit,onEditStart,canEdit,getDefault,doc,win});this.frame=doc.getElementById('roam-area');this.surface=doc.getElementById('roam-select');this.toggle=doc.getElementById('show-roam-area');this.visible=false;this.drawing=false;this.drag=null;
   this.toggle.addEventListener('change',()=>this.setVisible(this.toggle.checked));doc.getElementById('hide-roam-area').addEventListener('click',()=>this.setVisible(false));
   doc.getElementById('draw-roam-area').addEventListener('click',()=>this.startSelection());doc.getElementById('reset-roam-area').addEventListener('click',()=>{this.cancel();this.onChange(this.getDefault());this.onCommit();this.render();});
   this.frame.addEventListener('pointerdown',e=>this.begin(e,false));this.surface.addEventListener('pointerdown',e=>this.begin(e,true));
   for(const target of [this.frame,this.surface]){target.addEventListener('pointermove',e=>this.move(e));target.addEventListener('pointerup',e=>this.finish(e));target.addEventListener('pointercancel',()=>this.cancel());target.addEventListener('lostpointercapture',()=>{if(this.drag)this.cancel();});}
   win.addEventListener('blur',()=>this.cancel());win.addEventListener('resize',()=>{this.cancel();this.render();});this.render();
  }
  setVisible(value){this.cancel();this.visible=!!value;this.toggle.checked=this.visible;this.render();}
  startSelection(){if(!this.canEdit())return;this.cancel();this.visible=true;this.toggle.checked=true;this.drawing=true;this.onEditStart();this.surface.hidden=false;this.frame.hidden=true;}
  point(e){return{x:e.clientX/Math.max(1,this.win.innerWidth)*100,y:e.clientY/Math.max(1,this.win.innerHeight)*100};}
  begin(e,draw){
   const handle=e.target.closest('[data-roam-handle]')?.dataset.roamHandle;
   if(this.drag||e.button!==0||e.isPrimary===false||!this.canEdit()||(!draw&&!handle))return;
   e.preventDefault();e.stopPropagation();const p=this.point(e),target=draw?this.surface:this.frame;
   this.drag={id:e.pointerId,draw,handle,start:G.normalize(this.getBounds()),x:p.x,y:p.y,target};
   try{target.setPointerCapture(e.pointerId);}catch{this.cancel();return;}if(draw)this.render(G.select(p.x,p.y,p.x,p.y));
  }
  move(e){
   const d=this.drag;if(!d||e.pointerId!==d.id)return;e.preventDefault();e.stopPropagation();const p=this.point(e),dx=p.x-d.x,dy=p.y-d.y;
   d.moved=d.moved||Math.hypot(dx*this.win.innerWidth/100,dy*this.win.innerHeight/100)>=4;
   d.next=d.draw?G.select(d.x,d.y,p.x,p.y):d.handle==='move'?G.move(d.start,dx,dy):G.resize(d.start,d.handle,dx,dy);
   if(!d.draw)this.onChange(d.next);this.render(d.next);
  }
  release(){const d=this.drag;this.drag=null;if(d)try{if(d.target.hasPointerCapture(d.id))d.target.releasePointerCapture(d.id);}catch{}return d;}
  finish(e){
   if(!this.drag||e.pointerId!==this.drag.id)return;this.move(e);const d=this.release();
   if(d.next&&d.moved){if(d.draw)this.onChange(d.next);this.onCommit();}else if(!d.draw)this.onChange(d.start);this.drawing=false;this.surface.hidden=true;this.render();
  }
  cancel(){const d=this.release();if(d&&!d.draw)this.onChange(d.start);this.drawing=false;this.surface.hidden=true;this.render();}
  render(bounds){
   const b=G.normalize(bounds||this.getBounds()),style=this.frame.style;style.left=b.roamLeft+'%';style.top=b.roamTop+'%';style.width=(b.roamRight-b.roamLeft)+'%';style.height=(b.roamBottom-b.roamTop)+'%';
   style.setProperty('--roam-tools-x',Math.max(4,Math.min(this.win.innerWidth-62,b.roamRight*this.win.innerWidth/100-62))+'px');style.setProperty('--roam-tools-y',Math.max(4,Math.min(this.win.innerHeight-30,b.roamTop*this.win.innerHeight/100+5))+'px');
   this.frame.hidden=!this.visible||this.drawing&&!bounds;this.frame.classList.toggle('small',(b.roamRight-b.roamLeft)*this.win.innerWidth/100<155||(b.roamBottom-b.roamTop)*this.win.innerHeight/100<50);
  }
 }
 return PetRoamArea;
});
