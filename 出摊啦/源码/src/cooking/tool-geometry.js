import tools from '../../assets/tool-meta.mjs';
import shops from '../../assets/shops-meta.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const inside=(p,r)=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;

/** Source pixels pass through the same rectangle and centre rotation as paint. */
export function sourcePoint(point,size,rect,angle=0){
 const x=(point.x/size.width-.5)*rect.width,y=(point.y/size.height-.5)*rect.height,c=Math.cos(angle),s=Math.sin(angle);
 return{x:rect.x+rect.width/2+x*c-y*s,y:rect.y+rect.height/2+x*s+y*c};
}
const heldRect=(p,m,width,height)=>({x:p.x-m.anchor.x/m.sourceSize.width*width,y:p.y-m.anchor.y/m.sourceSize.height*height,width,height});
const circle=(point,radius,m,rect,angle=0)=>({...sourcePoint(point,m.sourceSize,rect,angle),radius:radius*Math.min(rect.width/m.sourceSize.width,rect.height/m.sourceSize.height)});

export function cookingToolGeometry(kind,p,regions,u=regions.unit||1){
 if(kind==='scoop'||kind==='scoopTea'){
  // 奶茶店用同一把漏勺捞珍珠：画空漏勺，珍珠由场景画在网兜里。
  const asset=kind==='scoopTea'?'strainer':'strainer_noodles',m=tools[asset],rect=heldRect(p,m,110*u,70*u),basket=m.anchors.find(a=>a.name==='basket-center');
  return{asset,rect,angle:0,workingEnd:circle(basket,43,m,rect)};
 }
 if(kind==='lift'){
  const m=shops.spatula,rect=heldRect(p,m,regions.spatula.width,regions.spatula.height);
  // The approved 320×130 sprite has no blade anchor. These source pixels trace
  // its broad metal blade, excluding the neck and wooden grip.
  const points=[[16,49],[186,55],[205,72],[188,95],[12,90]].map(([x,y])=>sourcePoint({x,y},m.sourceSize,rect));
  return{asset:'spatula',rect,angle:0,workingEnd:{...circle({x:108,y:74},25,m,rect),points}};
 }
 if(kind==='pour'){
  const m=shops.shaker,rect={...regions.shaker,x:p.x-regions.shaker.width*.5,y:p.y-regions.shaker.height*.3},angle=.55;
  return{asset:'shaker',rect,angle,workingEnd:circle(m.anchors.find(a=>a.name==='mouth-center'),38,m,rect,angle)};
 }
 return null;
}

export function extinguisherGeometry(p,regions){
 const r=regions.extinguisher,rect={...r,x:p.x-r.width/2,y:p.y-r.height*.35};
 // Manifest source is 100×280, without a nozzle anchor. The open end of the
 // black hose is at (88,161), visible on the approved unchanged sprite.
 return{asset:'extinguisher',rect,angle:0,workingEnd:{...sourcePoint({x:88,y:161},{width:100,height:280},rect),radius:7*Math.min(r.width/100,r.height/280)}};
}
function segmentHitsRect(a,b,r){
 let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
 for(const[p,q]of [[-dx,a.x-r.x],[dx,r.x+r.width-a.x],[-dy,a.y-r.y],[dy,r.y+r.height-a.y]]){
  if(p===0){if(q<0)return false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;
 }
 return true;
}
export function workingEndTouchesRect(end,rect){
 if(!end||!rect)return false;
 if(end.points){
  const pts=end.points;if(pts.some(p=>inside(p,rect)))return true;
  for(let i=0;i<pts.length;i++)if(segmentHitsRect(pts[i],pts[(i+1)%pts.length],rect))return true;
  // A small target may sit entirely inside the convex blade.
  const p={x:rect.x+rect.width/2,y:rect.y+rect.height/2};let sign=0;
  for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],cross=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);if(cross){if(sign&&Math.sign(cross)!==sign)return false;sign=Math.sign(cross);}}
  return true;
 }
 const x=clamp(end.x,rect.x,rect.x+rect.width),y=clamp(end.y,rect.y,rect.y+rect.height);
 return (end.x-x)**2+(end.y-y)**2<=end.radius**2;
}
