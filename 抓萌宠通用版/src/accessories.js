(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PetAccessories=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const backgrounds=new WeakMap();

 function derive(kind,custom,assets,showAvatar=false){
  if(showAvatar||!Number.isInteger(kind)||kind<0||!custom?.hasCowKind(kind)||custom.cowRecord?.(kind))return null;
  const asset=assets?.accessories?.[kind];
  return asset&&typeof asset.src==='string'&&asset.src?asset:null;
 }

 // Per-frame images come from shared stylesheet classes (see walk-frames.js); swap only our own class.
 function setFrameClass(layer,cls){
  const prev=layer._petFrameClass||null;
  if(prev===cls&&(!cls||layer.classList.contains(cls)))return;
  if(prev)layer.classList.remove(prev);
  if(cls)layer.classList.add(cls);
  layer._petFrameClass=cls||null;
 }

 function clear(layer){
  if(!layer)return;
  backgrounds.delete(layer);
  if(layer._petFrameClass)setFrameClass(layer,null);
  if(!layer.hidden)layer.hidden=true;
  if(layer.style.backgroundImage)layer.style.backgroundImage='';
  if(layer.style.backgroundSize)layer.style.backgroundSize='';
  if(layer.style.backgroundPosition)layer.style.backgroundPosition='';if(layer.style.transform)layer.style.transform='';
 }

 function sync(c,custom,assets,showAvatar=false){
  const asset=derive(c.visualKind,custom,assets,showAvatar);
  c.accessoryAsset=asset;
  if(!asset){clear(c.accessory);return;}
  if(!c.accessory){
   const doc=c.el.ownerDocument||(typeof document!=='undefined'?document:null);
   if(!doc)return;
   const layer=doc.createElement('span');layer.className='pet-accessory';layer.setAttribute('aria-hidden','true');
   layer.style.pointerEvents='none';layer.style.transformOrigin='50% 91%';
   c.el.append(layer);c.accessory=layer;
  }
  render(c,{frame:0,standing:true,pose:c.im.style.transform||''});
 }

 // framesFor(strip,frames,pet) may return per-frame class names; the strip is used until they are ready.
 function render(c,{frame=0,standing=true,pose='',framesFor=null}={}){
  const layer=c.accessory,asset=c.accessoryAsset;
  if(!layer)return;
  if(!asset){clear(layer);return;}
  const animated=!standing&&c.articulated&&c.walkMode==='default'&&asset.walk&&asset.frames===c.walkFrames;
  const index=Number.isFinite(frame)?Math.max(0,Math.min(asset.frames-1,frame)):0;
  const split=animated&&typeof framesFor==='function'?framesFor(asset.walk,asset.frames,c):null,perFrame=Array.isArray(split)&&split.length===asset.frames;
  const source=perFrame?'':animated?asset.walk:asset.src,size=animated&&!perFrame?asset.frames*100+'% 100%':'100% 100%',cached=backgrounds.get(layer);
  if(layer.hidden)layer.hidden=false;
  setFrameClass(layer,perFrame?split[index]:null);
  if(!cached||cached.source!==source)layer.style.backgroundImage=source?'url('+JSON.stringify(source)+')':'';
  if(!cached||cached.size!==size)layer.style.backgroundSize=size;
  const next=cached||{};next.source=source;next.size=size;
  const position=animated&&!perFrame?index/(asset.frames-1)*100+'% 0':'0% 0';
  if(next.position!==position||layer.style.backgroundPosition!==next.actualPosition){layer.style.backgroundPosition=position;next.position=position;next.actualPosition=layer.style.backgroundPosition;}
  if(next.pose!==pose||layer.style.transform!==next.actualPose){layer.style.transform=pose;next.pose=pose;next.actualPose=layer.style.transform;}
  backgrounds.set(layer,next);
 }

 return{derive,sync,render};
});
