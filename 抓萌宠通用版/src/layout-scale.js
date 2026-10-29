(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PetLayout=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
 'use strict';
 const KEY='pet-catch-layout-v2',CUSTOM_FIELDS=['penX','penY','penWidth','roamLeft','roamRight','roamTop','roamBottom','showX','showY'];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),clone=o=>JSON.parse(JSON.stringify(o));
 function metrics(w,h){w=Number.isFinite(w)&&w>0?w:1;h=Number.isFinite(h)&&h>0?h:1;const stageScale=Math.min(1,Math.min(w,h)/1080);return{w,h,stageScale,textScale:Math.max(stageScale,.65),orientation:w/h<.9?'portrait':'landscape'};}
 function defaults(orientation){const p=orientation==='portrait';return{pen:{x:p?80:83,y:p?70:67,width:p?300:330},roam:{left:p?5:3,right:p?95:97,top:p?46:35,bottom:p?80:84},show:{x:50,y:34},hud:{stats:{x:p?74:78,y:p?10:8,scale:100},waiting:{x:p?22:14,y:p?22:80,scale:100}},panel:{x:p?24:20,y:p?10:18}};}
 const range=(n,a,b,d)=>Number.isFinite(n)&&n>=a&&n<=b?n:d;
 function validate(raw,orientation){const d=defaults(orientation),r=raw||{},out=clone(d);for(const group of ['pen','show','panel'])for(const key of Object.keys(d[group]))out[group][key]=range(r[group]?.[key],key==='width'?120:0,key==='width'?800:100,d[group][key]);for(const k of Object.keys(d.roam))out.roam[k]=range(r.roam?.[k],0,100,d.roam[k]);if(out.roam.right-out.roam.left<5||out.roam.bottom-out.roam.top<5)out.roam=clone(d.roam);for(const group of ['stats','waiting'])for(const k of ['x','y','scale'])out.hud[group][k]=range(r.hud?.[group]?.[k],k==='scale'?50:0,k==='scale'?250:100,d.hud[group][k]);return out;}
 function fromLegacy(c={},h={},e={}){return validate({pen:{x:c.penX,y:c.penY,width:c.penWidth},roam:{left:c.roamLeft,right:c.roamRight,top:c.roamTop,bottom:c.roamBottom},show:{x:c.showX,y:c.showY},hud:h,panel:{x:e.panelX,y:e.panelY}},'landscape');}
 function migrate(c,h,e){const landscape=fromLegacy(c,h,e),portrait=clone(landscape),land=defaults('landscape'),port=defaults('portrait');for(const k of ['pen','roam','show','panel'])if(JSON.stringify(landscape[k])===JSON.stringify(land[k]))portrait[k]=clone(port[k]);for(const k of ['stats','waiting'])if(JSON.stringify(landscape.hud[k])===JSON.stringify(land.hud[k]))portrait.hud[k]=clone(port.hud[k]);return{version:2,landscape,portrait};}
 function frozen(data,original,keys){const out={...data};for(const k of keys)if(Object.hasOwn(original,k))out[k]=clone(original[k]);else delete out[k];return out;}
 class Store{
  constructor(storage,w,h,{toast=()=>{}}={}){this.storage=storage;this.toast=toast;this.metrics=metrics(w,h);this.orientation=this.metrics.orientation;const read=k=>{try{const s=storage.getItem(k);return{exists:s!==null,value:s===null?null:JSON.parse(s)};}catch{return{exists:true,value:null};}};this.originalCustom=read('pet-catch-v1-custom').value||{};this.originalEffects=read('pet-catch-effects-v1').value||{};const saved=read(KEY),hud=saved.exists?{}:read('pet-catch-hud-v1').value||{},raw=saved.value?.version===2?saved.value:null;this.state=saved.exists?{version:2,landscape:validate(raw?.landscape,'landscape'),portrait:validate(raw?.portrait,'portrait')}:migrate(this.originalCustom,hud,this.originalEffects);this.persist();}
  get current(){return this.state[this.orientation];}
  get defaults(){return defaults(this.orientation);}
  persist(){const text=JSON.stringify(this.state);if(text===this.saved)return;try{this.storage.setItem(KEY,text);this.saved=text;}catch{this.toast('画面布局本页已应用，浏览器未能保存');}}
  switchTo(w,h){const m=metrics(w,h),changed=m.orientation!==this.orientation;this.metrics=m;this.orientation=m.orientation;return changed;}
  applyCustom(c){const a=this.current;Object.assign(c,{penX:a.pen.x,penY:a.pen.y,penWidth:a.pen.width,roamLeft:a.roam.left,roamRight:a.roam.right,roamTop:a.roam.top,roamBottom:a.roam.bottom,showX:a.show.x,showY:a.show.y});}
  applyHud(c){for(const k of ['stats','waiting'])Object.assign(c[k],this.current.hud[k]);}
  applyPanel(c){Object.assign(c,{panelX:this.current.panel.x,panelY:this.current.panel.y});}
  captureCustom(c){const next={...this.current,pen:{x:c.penX,y:c.penY,width:c.penWidth},roam:{left:c.roamLeft,right:c.roamRight,top:c.roamTop,bottom:c.roamBottom},show:{x:c.showX,y:c.showY}};this.state[this.orientation]=validate(next,this.orientation);this.persist();}
  captureHud(h){this.state[this.orientation]=validate({...this.current,hud:clone(h)},this.orientation);this.persist();}
  capturePanel(c){this.state[this.orientation]=validate({...this.current,panel:{x:c.panelX,y:c.panelY}},this.orientation);this.persist();}
  freezeCustom(c){return frozen(c,this.originalCustom,CUSTOM_FIELDS);}
  freezeEffects(c){return frozen(c,this.originalEffects,['panelX','panelY']);}
 }
 function overlap(a,b,gap=0){const epsilon=1e-7;return!!a&&!!b&&a.x+a.w/2>b.x-gap+epsilon&&a.x-a.w/2<b.x+b.w+gap-epsilon&&a.y+a.h/2>b.y-gap+epsilon&&a.y-a.h/2<b.y+b.h+gap-epsilon;}
 function inside(r,w,h){return{...r,x:clamp(r.x,8+r.w/2,w-8-r.w/2),y:clamp(r.y,8+r.h/2,h-8-r.h/2)};}
 function avoidHud(requested,gear,pen,w,h){let r=inside(requested,w,h);if(overlap(r,gear,8))r=inside({...r,y:gear.y+gear.h+8+r.h/2},w,h);if(overlap(r,pen,8)){const candidates=[{...r,y:pen.y-8-r.h/2},{...r,y:pen.y+pen.h+8+r.h/2},{...r,x:pen.x-8-r.w/2},{...r,x:pen.x+pen.w+8+r.w/2}].map(c=>inside(c,w,h));const clear=candidates.find(c=>!overlap(c,pen,8)&&!overlap(c,gear,8));if(clear)r=clear;}return r;}
 function avoidBox(requested,pen,w,h){const original=inside({...requested,scale:1},w,h);if(!overlap(original,pen,12))return original;for(const scale of [1,.85,.7]){const r=inside({...requested,w:requested.w*scale,h:requested.h*scale,scale},w,h),left={start:8,end:pen.x-12},right={start:pen.x+pen.w+12,end:w-8},side=left.end-left.start>=right.end-right.start?left:right;if(side.end-side.start>=r.w){const next={...r,x:(side.start+side.end)/2};if(!overlap(next,pen,12))return next;}const above={...r,y:pen.y-12-r.h/2};if(above.y-r.h/2>=8&&!overlap(above,pen,12))return inside(above,w,h);}return{...inside({...requested,w:requested.w*.7,h:requested.h*.7,scale:.7},w,h),abovePen:true};}
 function mapPoint(p,from,to){return{x:to.left+clamp((p.x-from.left)/Math.max(1,from.width),0,1)*to.width,y:to.top+clamp((p.y-from.top)/Math.max(1,from.height),0,1)*to.height};}
 // Airborne paths can extend above the activity area; map the whole parabola without clipping.
 function mapAirPoint(p,from,to){return{x:to.left+(p.x-from.left)/Math.max(1,from.width)*to.width,y:to.top+(p.y-from.top)/Math.max(1,from.height)*to.height};}
 function mapFlight(f,from,to){const start=mapAirPoint({x:f.x0,y:f.y0},from,to),target=mapAirPoint({x:f.targetX,y:f.targetY},from,to),sx=to.width/Math.max(1,from.width),sy=to.height/Math.max(1,from.height);return{...f,x0:start.x,y0:start.y,targetX:target.x,targetY:target.y,vx:f.vx*sx,vy:f.vy*sy,gravity:f.gravity*sy};}
 return{KEY,CUSTOM_FIELDS,metrics,defaults,validate,migrate,Store,overlap,inside,avoidHud,avoidBox,mapPoint,mapAirPoint,mapFlight};
});
