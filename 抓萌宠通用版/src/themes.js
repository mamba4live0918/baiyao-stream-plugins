(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PetThemes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const THEMES=Object.freeze({cream:{name:'奶油乐园',category:'all',barn:'nest-6'},aquarium:{name:'Q版水族馆',category:'aquarium',barn:'aquarium-pod'},yajiji:{name:'鸭吉吉',category:'yajiji',barn:'yajiji-nest'}});
 function valid(key){return Object.prototype.hasOwnProperty.call(THEMES,key);}
 function memory(raw,assets){
  const result={},categories=new Set(['all','custom',...(assets.categories||[]).map(c=>c.id)]);
  for(const[key,theme]of Object.entries(THEMES)){
   const row=raw?.[key]||{},preferred=assets.barns.findIndex(b=>b.id===theme.barn),barn=preferred<0?0:preferred;
   const cast=v=>Number.isInteger(v)&&(v===-1||v>=0&&(assets.cows.some((p,i)=>(p.kind??i)===v)||v>=100&&v<=999999))?v:-1;
   result[key]={activeCategory:categories.has(row.activeCategory)?row.activeCategory:theme.category,barn:Number.isInteger(row.barn)&&!!assets.barns[row.barn]?row.barn:barn,castA:cast(row.castA),castB:cast(row.castB)};
  }return result;
 }
 function transition(cfg,next,assets){
  if(!valid(next))return null;const current=valid(cfg.theme)?cfg.theme:'cream',prior=memory(cfg.themeMemory,assets);
  prior[current]={activeCategory:cfg.activeCategory,barn:cfg.barn,castA:cfg.castA,castB:cfg.castB};
  const stored=memory(prior,assets);return{theme:next,themeMemory:stored,...stored[next]};
 }
 function apply(theme,doc=globalThis.document){
  const aqua=theme==='aquarium',duck=theme==='yajiji';doc.body.dataset.theme=valid(theme)?theme:'cream';
  const text={
   'outside-label':duck?'在外鸭鸭':aqua?'游动中':'在外','home-label':duck?'已进鸭窝':aqua?'已入馆':'已回家',
   'pen-hint':duck?'拖到鸭窝 · 松手回家':aqua?'拖到水族舱 · 松手入馆':'拖到小窝图片 · 松手回家'
  };
  for(const[id,value]of Object.entries(text)){const el=doc.getElementById(id);if(el)el.textContent=value;}
  const img=doc.getElementById('pen-img');if(img)img.setAttribute('alt',duck?'炫彩星糖鸭窝':aqua?'海盐玻璃水族收集舱':'铺着软垫的萌宠窝');
 }
 return{THEMES,valid,memory,transition,apply};
});
