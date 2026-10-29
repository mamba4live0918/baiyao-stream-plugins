(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PetRoamGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEFAULTS=Object.freeze({roamLeft:3,roamRight:97,roamTop:35,roamBottom:84});
  const MIN_SPAN=5;
  const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

  function normalize(cfg){
    const next={};
    for(const key of Object.keys(DEFAULTS)){
      const value=cfg&&cfg[key]!==undefined?cfg[key]:DEFAULTS[key];
      if(!Number.isFinite(value)||value<0||value>100)return {...DEFAULTS};
      next[key]=value;
    }
    if(next.roamRight-next.roamLeft<MIN_SPAN-1e-9||next.roamBottom-next.roamTop<MIN_SPAN-1e-9)return {...DEFAULTS};
    return next;
  }

  function pixels(cfg,W,H){
    const c=normalize(cfg),width=Math.max(1,finite(W,1)),height=Math.max(1,finite(H,1));
    const left=width*c.roamLeft/100,right=width*c.roamRight/100,top=height*c.roamTop/100,bottom=height*c.roamBottom/100;
    return {left,right,top,bottom,width:right-left,height:bottom-top};
  }

  function move(start,dxPercent,dyPercent){
    const c=normalize(start),dx=clamp(finite(dxPercent,0),-c.roamLeft,100-c.roamRight),dy=clamp(finite(dyPercent,0),-c.roamTop,100-c.roamBottom);
    return {roamLeft:c.roamLeft+dx,roamRight:c.roamRight+dx,roamTop:c.roamTop+dy,roamBottom:c.roamBottom+dy};
  }

  function resize(start,handle,dxPercent,dyPercent){
    const c=normalize(start),dx=finite(dxPercent,0),dy=finite(dyPercent,0);
    if(!['n','s','e','w','nw','ne','sw','se'].includes(handle))return c;
    if(handle.includes('w'))c.roamLeft=clamp(c.roamLeft+dx,0,c.roamRight-MIN_SPAN);
    if(handle.includes('e'))c.roamRight=clamp(c.roamRight+dx,c.roamLeft+MIN_SPAN,100);
    if(handle.includes('n'))c.roamTop=clamp(c.roamTop+dy,0,c.roamBottom-MIN_SPAN);
    if(handle.includes('s'))c.roamBottom=clamp(c.roamBottom+dy,c.roamTop+MIN_SPAN,100);
    return c;
  }

  function selectionAxis(start,end){
    start=clamp(start,0,100);end=clamp(end,0,100);
    if(Math.abs(end-start)>=MIN_SPAN)return [Math.min(start,end),Math.max(start,end)];
    if(end<start){const high=Math.max(MIN_SPAN,start);return [high-MIN_SPAN,high];}
    const low=Math.min(100-MIN_SPAN,start);return [low,low+MIN_SPAN];
  }

  function select(x1,y1,x2,y2){
    if(![x1,y1,x2,y2].every(Number.isFinite))return {...DEFAULTS};
    const x=selectionAxis(x1,x2),y=selectionAxis(y1,y2);
    return {roamLeft:x[0],roamRight:x[1],roamTop:y[0],roamBottom:y[1]};
  }

  function safeRect(rect){
    const r=rect||{},x1=finite(r.left,0),y1=finite(r.top,0),x2=finite(r.right,x1+Math.max(0,finite(r.width,1))),y2=finite(r.bottom,y1+Math.max(0,finite(r.height,1)));
    const left=Math.min(x1,x2),right=Math.max(x1,x2),top=Math.min(y1,y2),bottom=Math.max(y1,y2);
    return {left,right,top,bottom,width:right-left,height:bottom-top};
  }

  function fitSize(requested,rect){
    const r=safeRect(rect),size=Number.isFinite(requested)&&requested>0?requested:85;
    return Math.max(.01,Math.min(size,Math.min(r.width,r.height)/1.5));
  }

  function limits(rect,size){
    const r=safeRect(rect),padding=(Number.isFinite(size)&&size>0?size:85)*.7+1;
    const midX=(r.left+r.right)/2,midY=(r.top+r.bottom)/2;
    return {left:Math.min(r.left+padding,midX),right:Math.max(r.right-padding,midX),top:Math.min(r.top+padding,midY),bottom:Math.max(r.bottom-padding,midY)};
  }

  function point(rect,size,random=Math.random){
    const b=limits(rect,size);
    const sample=()=>{let value;try{value=typeof random==='function'?random():random;}catch{value=.5;}return clamp(finite(value,.5),0,1);};
    const between=(low,high)=>{const t=sample();return t===1?high:clamp(low+(high-low)*t,low,high);};
    return {x:between(b.left,b.right),y:between(b.top,b.bottom)};
  }

  function constrain(p,rect,options={}){
    if(!p||p.held||p.dead||p.windActive)return p;
    const b=limits(rect,p.size),midX=(b.left+b.right)/2,midY=(b.top+b.bottom)/2;
    p.x=clamp(finite(p.x,midX),b.left,b.right);
    p.y=finite(p.y,midY);
    p.targetY=clamp(finite(p.targetY,p.y),b.top,b.bottom);
    p.hopLift=finite(p.hopLift,0);
    if(p.ballEmerging){p.y=p.targetY;p.hopLift=0;return p;}
    if(p.airborne){
      p.y=options.allowEntry===false?clamp(p.y,b.top,b.bottom):Math.min(p.y,b.bottom);
      p.hopLift=0;return p;
    }
    p.y=clamp(p.y,b.top,b.bottom);
    // Clip the visual lift instead of moving its baseline on every floating cycle.
    p.hopLift=options.reduced?0:clamp(p.hopLift,b.top-p.y,b.bottom-p.y);
    return p;
  }

  return {DEFAULTS,MIN_SPAN,normalize,pixels,move,resize,select,fitSize,point,constrain};
});
