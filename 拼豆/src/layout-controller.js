const NAMES={board:'豆板',tray:'整组豆盒',tweezers:'停放镊子',iron:'熨斗与底垫',card:'参考图',dock:'状态条',feed:'礼物播报'};
const DOM_PARTS=['card','dock','feed'];
const WORLD_PARTS=['board','tray','tweezers','iron'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function normalizeLayout(value={}) {
 const result={};for(const part of Object.keys(NAMES)){const p=value?.[part]||{};result[part]={x:Number.isFinite(p.x)?clamp(p.x,WORLD_PARTS.includes(part)?-45:-2,WORLD_PARTS.includes(part)?45:2):0,y:Number.isFinite(p.y)?clamp(p.y,-2,2):0,z:Number.isFinite(p.z)?clamp(p.z,-30,30):0,scale:Number.isFinite(p.scale)?clamp(p.scale,.3,2.5):1,locked:p.locked!==false};}return result;
}
export function createLayoutController({getView,elements,saved,onChange,onMenu,onToast}) {
 const state=normalizeLayout(saved),overlays=new Map();let drag=null,wheelTimer;
 const isWorld=part=>WORLD_PARTS.includes(part);
 function apply(){const view=getView();for(const part of WORLD_PARTS)view?.setPartTransform?.(part,state[part]);for(const part of DOM_PARTS){const el=elements[part];if(!el)continue;el.style.translate=`${state[part].x*innerWidth}px ${state[part].y*innerHeight}px`;el.style.scale=String(state[part].scale);}update();}
 function save(){onChange?.(state);}
 function toggle(part){getView()?.cancelClick?.();state[part].locked=!state[part].locked;apply();save();onToast?.(`${NAMES[part]}${state[part].locked?'已锁定，可正常操作':'已解锁：拖动移动，拖角或滚轮缩放，再双击锁定'}`);}
 function rectangle(part){if(isWorld(part))return getView()?.boundsFor?.(part);const r=elements[part].getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}
 function translate(part,base,dx,dy){if(isWorld(part)){const delta=getView()?.screenDelta?.(dx,dy)||{x:0,z:0};state[part].x=base.x+delta.x;state[part].z=base.z+delta.z;}else{state[part].x=base.x+dx/innerWidth;state[part].y=base.y+dy/innerHeight;}}
 for(const part of Object.keys(NAMES).filter(p=>WORLD_PARTS.includes(p)||elements[p])){
  const overlay=document.createElement('div');overlay.className='layout-edit-box';overlay.dataset.part=part;overlay.innerHTML=`<span class="layout-edit-label">${NAMES[part]} · 双击锁定</span><i class="layout-resize-corner" aria-label="拖动缩放"></i>`;document.body.appendChild(overlay);overlays.set(part,overlay);
  overlay.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();toggle(part);});
  overlay.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const rect=rectangle(part);if(!rect)return;drag={part,startX:e.clientX,startY:e.clientY,base:{...state[part]},rect,resize:!!e.target.closest('.layout-resize-corner')};overlay.setPointerCapture(e.pointerId);getView()?.cancelClick?.();});
  overlay.addEventListener('pointermove',e=>{if(!drag||drag.part!==part)return;const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(drag.resize){const factor=Math.max(.15,Math.max((drag.rect.width+dx)/drag.rect.width,(drag.rect.height+dy)/drag.rect.height));state[part].scale=clamp(drag.base.scale*factor,.3,2.5);const actual=state[part].scale/drag.base.scale;translate(part,drag.base,drag.rect.width*(actual-1)/2,drag.rect.height*(actual-1)/2);}else translate(part,drag.base,clamp(dx,80-drag.rect.x-drag.rect.width,innerWidth-80-drag.rect.x),clamp(dy,50-drag.rect.y-drag.rect.height,innerHeight-50-drag.rect.y));apply();});
  overlay.addEventListener('pointerup',e=>{if(drag?.part===part){drag=null;save();try{overlay.releasePointerCapture(e.pointerId);}catch{}}});
  overlay.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();state[part].scale=clamp(state[part].scale*(e.deltaY<0?1.07:.935),.3,2.5);apply();clearTimeout(wheelTimer);wheelTimer=setTimeout(save,180);},{passive:false});
 }
 function onDouble(event){if(event.target.closest('.overlay,.confirm-layer,.layout-edit-box,button,input,select,textarea'))return;let part=null;for(const key of DOM_PARTS)if(elements[key]?.contains(event.target)){part=key;break;}if(!part&&event.target.closest('#scene'))part=getView()?.partAt?.(event.clientX,event.clientY);getView()?.cancelClick?.();if(part)toggle(part);else onMenu?.();event.preventDefault();}
 document.addEventListener('dblclick',onDouble);
 window.addEventListener('resize',apply);
 function update(){const covered=!!document.querySelector('.overlay.open');for(const[part,overlay]of overlays){const rect=rectangle(part),visible=!covered&&!state[part].locked&&rect;overlay.style.display=visible?'block':'none';if(visible){overlay.style.left=`${rect.x}px`;overlay.style.top=`${rect.y}px`;overlay.style.width=`${rect.width}px`;overlay.style.height=`${rect.height}px`;}}}
 function reset(){Object.assign(state,normalizeLayout());apply();save();}
 apply();return{state,apply,update,reset,isLocked:part=>state[part].locked,toggle,destroy(){document.removeEventListener('dblclick',onDouble);window.removeEventListener('resize',apply);for(const o of overlays.values())o.remove();clearTimeout(wheelTimer);}};
}
