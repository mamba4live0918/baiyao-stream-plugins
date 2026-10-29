(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReviewMotion=api;})(globalThis,function(){
 'use strict';
 function allowed(mode,reduced){return mode==='on'||(mode==='system'&&!reduced);}
 function plan(before,after){const old=new Map(before.map((p,i)=>[p.id,{...p,index:i}])),next=new Set(after.map(p=>p.id));return {entering:after.filter(p=>!old.has(p.id)).slice(0,21).map(p=>p.id),moving:after.filter((p,i)=>old.has(p.id)&&old.get(p.id).index!==i).slice(0,21).map(p=>p.id),removed:before.filter(p=>!next.has(p.id)).map(p=>p.id),current:after.find(p=>p.current&&!old.get(p.id)?.current)?.id||null};}
 function create(stage,cards){
  const running=new Set();
  function cancel(){for(const a of [...running])a.cancel();running.clear();}
  function animate(node,frames,options,finish){if(typeof node.animate!=='function'){finish?.();return;}const a=node.animate(frames,options);running.add(a);let done=false;const complete=()=>{if(done)return;done=true;running.delete(a);finish?.();};a.onfinish=()=>{complete();a.cancel();};a.oncancel=complete;}
  function capture(){return [...cards.querySelectorAll('[data-entry]')].map(node=>({id:node.dataset.entry,current:node.classList.contains('current'),rect:node.getBoundingClientRect()}));}
  function play(before){const after=capture(),changes=plan(before,after),old=new Map(before.map(p=>[p.id,p])),entering=new Set(changes.entering);const scale=stage.getBoundingClientRect().width/stage.offsetWidth||1;
   for(const node of [...cards.querySelectorAll('[data-entry]')].slice(0,21)){const id=node.dataset.entry,r=node.getBoundingClientRect(),prior=old.get(id);let frames=null,kind='';
    if(entering.has(id)){kind='enter';frames=[{opacity:0,transform:'translateY(14px) scale(.98)'},{opacity:1,transform:'none'}];}
    else if(prior){const x=(prior.rect.x-r.x)/scale,y=(prior.rect.y-r.y)/scale;if(Math.abs(x)+Math.abs(y)>1){kind='reorder';frames=[{transform:`translate(${x}px,${y}px)`},{transform:'none'}];}}
    if(frames){node.dataset.motionEvent=kind;animate(node,frames,{duration:340,easing:'cubic-bezier(.2,.75,.2,1)',fill:'both'},()=>delete node.dataset.motionEvent);}
    if(id===changes.current){const ring=document.createElement('div');ring.className='queue-current-ring';ring.setAttribute('aria-hidden','true');node.append(ring);animate(ring,[{opacity:.9},{opacity:0}],{duration:650,easing:'ease-out',fill:'both'},()=>ring.remove());}
   }
  }
  function preview(){cancel();for(const node of [...cards.querySelectorAll('.review-card')].slice(0,21))animate(node,[{opacity:.45,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:420,easing:'ease-out',fill:'both'});}
  return {cancel,capture,play,preview};
 }
 return {allowed,plan,create};
});
