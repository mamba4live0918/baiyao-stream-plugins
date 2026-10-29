export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const KIND_NAMES = { pillow: '抱枕', jacket: '羽绒服', bread: '法棍', pan: '平底锅', bear: '玩偶熊', cat: '猫' };
export const NOMINAL = { pillow: [240,150], jacket: [250,160], bread: [400,74], pan: [400,165], bear: [260,300], cat: [200,120] };
export const itemSize = item => item.kind==='bread'&&item.broken?[item.length||200,74]:NOMINAL[item.kind];
export function layout(width, height, length = 760, face = null, capacity = 210) {
  const u = Math.min(width,height)/1080, W=width/u, H=height/u;
  const poly = face || [[W/2-140,H-825],[W/2+140,H-825],[W/2+165,H-610],[W/2+95,H-460],[W/2-95,H-460],[W/2-165,H-610]];
  const cx=poly.reduce((a,p)=>a+p[0],0)/poly.length;
  const L = Math.min(length,W-70), x=clamp(cx-L/2,35,W-35-L),baseHeight=Math.max(20,capacity-60),seam=H-90-baseHeight;
  return {u,W,H,x,L,seam,baseHeight,floor:seam+capacity-80,face:poly,colWidth:L/32};
}
export function insidePolygon(x,y,points) {
  let yes=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) yes=!yes;
  }
  return yes;
}
export function faceClip(g,L) {
  g.beginPath();g.rect(-L.W*3,-L.H*3,L.W*7,L.H*7);
  L.face.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.clip('evenodd');
}
// 文字整体避开脸框，不能只依靠裁剪留下半张名字牌。
export function avoidFaceRect(L,x,y,w,h,margin=12){
  const left=Math.min(...L.face.map(p=>p[0]))-margin,right=Math.max(...L.face.map(p=>p[0]))+margin;
  const top=Math.min(...L.face.map(p=>p[1]))-margin,bottom=Math.max(...L.face.map(p=>p[1]))+margin;
  const pad=10,cx=clamp(x,w/2+pad,L.W-w/2-pad),cy=clamp(y,h/2+pad,L.H-h/2-pad);
  const fits=(px,py)=>px-w/2>=pad&&px+w/2<=L.W-pad&&py-h/2>=pad&&py+h/2<=L.H-pad;
  const clear=(px,py)=>px+w/2<=left||px-w/2>=right||py+h/2<=top||py-h/2>=bottom;
  const candidates=[[cx,cy],[cx,bottom+h/2],[left-w/2,cy],[right+w/2,cy],[cx,top-h/2]];
  const found=candidates.find(p=>fits(...p)&&clear(...p));
  if(found)return {x:found[0]-w/2,y:found[1]-h/2,w,h,moved:found[0]!==x||found[1]!==y};
  // 自定义大脸框时，改放可用空间最多的一侧并整体缩放。
  const regions=[{x:pad,y:bottom,w:L.W-2*pad,h:L.H-pad-bottom},{x:pad,y:pad,w:left-pad,h:L.H-2*pad},{x:right,y:pad,w:L.W-pad-right,h:L.H-2*pad},{x:pad,y:pad,w:L.W-2*pad,h:top-pad}].filter(r=>r.w>0&&r.h>0);
  const region=regions.sort((a,b)=>Math.min(b.w/w,b.h/h)-Math.min(a.w/w,a.h/h))[0];
  if(region){const scale=Math.min(1,region.w/w,region.h/h);return {x:clamp(cx-w*scale/2,region.x,region.x+region.w-w*scale),y:clamp(cy-h*scale/2,region.y,region.y+region.h-h*scale),w:w*scale,h:h*scale,scale,moved:true};}
  return {x:cx-w/2,y:cy-h/2,w,h,moved:false};
}
export function waitingSlots(items,L) {
  const left=L.x-24, right=L.W-L.x-L.L-24;
  return items.map((item,i)=>{
    const side=i%2, lane=Math.floor(i/2)%2, group=Math.floor(i/4), available=side?right:left;
    const scale=.8, [nw,nh]=itemSize(item), w=nw*scale,h=nh*scale;
    const outside=available>180;
    let x=outside?(side?L.x+L.L+18+w/2+lane*24:L.x-18-w/2-lane*24):(side?L.W-w/2-20:w/2+20);
    let bottom=L.H-35-(outside?lane*120:290+lane*150)-group*24;
    x=clamp(x,w/2+8,L.W-w/2-8);
    return {item,x,y:bottom-h/2,w,h,scale,angle:0};
  });
}
