// Forgiving gesture recognition in CSS-pixel coordinates; no DOM or real clock.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const point=p=>p&&finite(p.x)&&finite(p.y)?{x:p.x,y:p.y}:null;
const clamp=n=>Math.max(0,Math.min(1,n));
export function createGesture(kind,start,{unit=1,center}={}){
 if(!['spread','shake'].includes(kind))throw new RangeError('未知动作');
 const p=point(start);if(!p)throw new TypeError('动作起点必须是有效坐标');
 return{kind,unit:finite(unit)&&unit>0?unit:1,center:point(center)||{...p},last:p,angleAnchor:{...p},angle:null,direction:0,directionDebt:0,
  minX:p.x,maxX:p.x,minY:p.y,maxY:p.y,distance:0,totalX:0,turnRadians:0,reversals:0};
}
export function moveGesture(previous,input){
 const p=point(input);if(!p)return previous;
 const dx=p.x-previous.last.x,dy=p.y-previous.last.y,distance=Math.hypot(dx,dy);if(!distance)return previous;
 const next={...previous,last:p,minX:Math.min(previous.minX,p.x),maxX:Math.max(previous.maxX,p.x),minY:Math.min(previous.minY,p.y),maxY:Math.max(previous.maxY,p.y),distance:previous.distance+distance,totalX:previous.totalX+Math.abs(dx)};
 const ax=p.x-previous.angleAnchor.x,ay=p.y-previous.angleAnchor.y;
 if(Math.hypot(ax,ay)>=5*previous.unit){
  const angle=Math.atan2(ay,ax);
  if(previous.angle!==null){const turn=Math.abs(Math.atan2(Math.sin(angle-previous.angle),Math.cos(angle-previous.angle)));next.turnRadians+=Math.min(turn,Math.PI-turn);}
  next.angle=angle;next.angleAnchor={...p};
 }
 next.directionDebt+=dx;
 if(Math.abs(next.directionDebt)>=5*previous.unit){const direction=Math.sign(next.directionDebt);if(previous.direction&&direction!==previous.direction)next.reversals++;next.direction=direction;next.directionDebt=0;}
 return next;
}
export function gestureResult(state){
 if(!state)return{accepted:false,progress:0};
 const u=state.unit,spanX=state.maxX-state.minX,spanY=state.maxY-state.minY;
 const progress=state.kind==='spread'?Math.min(state.distance/(100*u),spanX/(40*u),spanY/(40*u),state.turnRadians/1.2):Math.min(state.totalX/(120*u),spanX/(40*u),state.reversals);
 return{accepted:progress>=1,progress:clamp(progress)};
}
