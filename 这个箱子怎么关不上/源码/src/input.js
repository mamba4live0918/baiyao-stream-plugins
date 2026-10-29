import {clamp,insidePolygon,itemSize} from './layout.js';
const within=(p,b)=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;
export function bindInput(canvas,vm,actions,hit){
  const pos=e=>{const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)/vm.L.u,y:(e.clientY-b.top)/vm.L.u};};
  const col=p=>clamp(Math.floor((p.x-vm.L.x)/vm.L.colWidth),0,31);
  const touch=p=>{vm.hand.x=p.x;vm.hand.y=p.y;vm.hand.visible=true;vm.hand.alpha=1;vm.hand.movedAt=performance.now()/1000;actions.wake();};
  function find(p){
    if(insidePolygon(p.x,p.y,vm.L.face)&&!vm.editFace)return null;
    for(const [kind,list] of [['label',hit.labels],['cat',hit.cats],['helper',hit.helpers],['strap',hit.straps]])for(const v of [...list].reverse())if(within(p,v))return {kind,v};
    if(hit.zip&&within(p,hit.zip))return {kind:'zip'};
    for(const v of [...hit.packed].reverse())if(within(p,v))return {kind:'packed',v};
    const c=col(p),ly=vm.L.seam-vm.state.gap[c]-vm.openAmount*(c>=vm.state.zipCol?c/32*105:0);
    if(p.x>=vm.L.x&&p.x<=vm.L.x+vm.L.L&&p.y>=ly-112&&p.y<=ly+7)return {kind:'press'};
    for(const v of [...hit.waiting].reverse())if(within(p,{x:v.x-v.w/2,y:v.y-v.h/2,w:v.w,h:v.h}))return {kind:'waiting',v};
    return null;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;const p=pos(e);touch(p);actions.sync();
    if(vm.editFace){const i=vm.L.face.findIndex(v=>Math.hypot(v[0]-p.x,v[1]-p.y)<22);if(i>=0){vm.drag={kind:'face',index:i};canvas.setPointerCapture(e.pointerId);}return;}
    if(vm.shipping)return;const h=find(p);if(!h)return;
    if(h.kind==='label'){actions.card(h.v.item);return;}
    if(h.kind==='cat'){actions.tapCat(h.v.id);return;}
    canvas.setPointerCapture(e.pointerId);vm.hand.downAt=vm.now;
    if(h.kind==='waiting'||h.kind==='packed'){
      const item=h.v.item,[w,hh]=itemSize(item),v=vm.visuals.get(item.id);
      const scale=h.kind==='waiting'?.8:1,centerX=h.kind==='waiting'?h.v.x:v.x+v.width/2,centerY=h.kind==='waiting'?h.v.y:h.v.y+h.v.h/2;
      const grabX=clamp((p.x-centerX)/scale,-w/2,w/2),grabY=clamp((p.y-centerY)/scale,-hh/2,hh/2);
      actions.take(item,h.kind==='packed');
      const raw=(Math.PI/2-Math.atan2(-grabY,-grabX))*180/Math.PI;
      const target=Math.hypot(grabX,grabY)<w*.13?0:clamp(((raw+540)%360)-180,-90,90);
      vm.drag={kind:'item',item,x:p.x,y:p.y,grabX,grabY,angle:item.angle||0,target,velocity:0};
      vm.overBox=h.kind==='packed';
    }else if(h.kind==='helper'||h.kind==='strap'){vm.drag={kind:h.kind,id:h.v.id};if(h.kind==='helper')actions.liftHelper(h.v.id);}
    else vm.drag={kind:h.kind};
    if(h.kind==='press')actions.press(col(p));
    canvas.style.cursor='grabbing';actions.wake();
  });
  canvas.addEventListener('pointermove',e=>{
    const p=pos(e);touch(p);const d=vm.drag;
    if(d){
      if(d.kind==='face'){vm.L.face[d.index]=[p.x,p.y];actions.face(vm.L.face);}
      if(d.kind==='item'){d.velocity+=clamp(p.x-d.x,-30,30)*1.2;d.x=p.x;d.y=p.y;vm.overBox=p.x>vm.L.x-30&&p.x<vm.L.x+vm.L.L+30&&p.y>vm.L.seam-500&&p.y<vm.L.seam+90;}
      if(d.kind==='press')actions.press(col(p));
      if(d.kind==='zip')actions.zip(clamp((p.x-vm.L.x)/vm.L.L,0,1));
      if(d.kind==='helper')actions.moveHelper(d.id,col(p));
      if(d.kind==='strap')actions.moveStrap(d.id,col(p));
    }else {const h=find(p);canvas.style.cursor=h?(h.kind==='press'?'pointer':'grab'):'';}
  });
  function end(e){
    const d=vm.drag;if(!d)return;actions.sync();
    if(d.kind==='press')actions.release();
    if(d.kind==='helper')actions.sitHelper(d.id);
    if(d.kind==='item'){
      const r=d.angle*Math.PI/180,cx=d.x-d.grabX*Math.cos(r)+d.grabY*Math.sin(r);
      actions.drop(d.item,vm.overBox,cx,d.angle);
    }
    vm.drag=null;vm.overBox=false;canvas.style.cursor='';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);actions.wake();
  }
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('pointerleave',()=>{if(!vm.drag){vm.hand.visible=false;actions.wake();}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  return {find};
}
