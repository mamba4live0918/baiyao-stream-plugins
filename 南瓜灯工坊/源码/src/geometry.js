// 刻痕使用贴图的 0..1 坐标，保存时量化到 0..1023。
export const FACE={cx:.5,cy:.57,rx:.33,ry:.29};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
export const insideFace=([x,y],epsilon=0)=>((x-FACE.cx)/(FACE.rx+epsilon))**2+((y-FACE.cy)/(FACE.ry+epsilon))**2<=1+1e-9;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function simplify(p,tol=.004){
 if(p.length<3)return p;
 const a=p[0],b=p.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;let max=0,index=0;
 for(let i=1;i<p.length-1;i++){const t=d?Math.max(0,Math.min(1,((p[i][0]-a[0])*dx+(p[i][1]-a[1])*dy)/d)):0,v=dist(p[i],[a[0]+dx*t,a[1]+dy*t]);if(v>max){max=v;index=i;}}
 return max>tol?[...simplify(p.slice(0,index+1),tol).slice(0,-1),...simplify(p.slice(index),tol)]:[a,b];
}
function intersection(a,b,c,d){
 const r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]],den=r[0]*s[1]-r[1]*s[0];
 if(Math.abs(den)<1e-10)return null;
 const q=[c[0]-a[0],c[1]-a[1]],t=(q[0]*s[1]-q[1]*s[0])/den,u=(q[0]*r[1]-q[1]*r[0])/den;
 return t>1e-7&&t<=1&&u>=0&&u<1-1e-7?[a[0]+r[0]*t,a[1]+r[1]*t]:null;
}
// 一笔里自己交叉很多次（乱涂、来回划）时，找圈的组合数会爆炸：每次判定给一个工作量上限，超了就只用已经找到的圈。
const WORK_LIMIT=400000;
let work=0;
const add=(out,list)=>{for(const x of list)out.push(x);return out;};
function loops(p,depth=0){
 if(depth>32||work>WORK_LIMIT)return [];
 for(let i=0;i<p.length-1;i++)for(let j=i+2;j<p.length-1;j++){
  if(++work>WORK_LIMIT)return [];
  const hit=intersection(p[i],p[i+1],p[j],p[j+1]);if(!hit)continue;
  const ring=[hit,...p.slice(i+1,j+1),hit],rest=[...p.slice(0,i+1),hit,...p.slice(j+1)];
  return add(loops(ring,depth+1),findLoops(rest,depth+1));
 }
 return p.length>=4&&dist(p[0],p.at(-1))<1e-6?[p.slice(0,-1)]:[];
}
function findLoops(p,depth=0){
 if(depth>32||work>WORK_LIMIT)return [];
 const out=[];
 for(let i=0;i<p.length-2;i++)for(let j=i+3;j<p.length;j++){if(++work>WORK_LIMIT)return out;if(dist(p[i],p[j])<1e-7)add(out,loops(p.slice(i,j+1),depth+1));}
 for(let i=0;i<p.length-1;i++)for(let j=i+2;j<p.length-1;j++){if(++work>WORK_LIMIT)return out;const h=intersection(p[i],p[i+1],p[j],p[j+1]);if(h)add(out,loops([h,...p.slice(i+1,j+1),h],depth+1));}
 return out;
}
export function clipPolygon(input){
 let out=input;
 const ring=Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2;return[FACE.cx+Math.cos(a)*FACE.rx,FACE.cy+Math.sin(a)*FACE.ry];});
 for(let i=0;i<ring.length&&out.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],p=out;out=[];
  for(let k=0;k<p.length;k++){const c=p[k],d=p[(k+1)%p.length],ic=cross(a,b,c)>=-1e-10,id=cross(a,b,d)>=-1e-10;
   if(ic)out.push(c);if(ic!==id){const v=cross(a,b,c),w=cross(a,b,d),t=v/(v-w);out.push([c[0]+(d[0]-c[0])*t,c[1]+(d[1]-c[1])*t]);}}
 }return out;
}
function clipLine(p){
 const paths=[];let current=[];
 for(let i=0;i<p.length-1;i++){
  const a=p[i],b=p[i+1],x=(a[0]-FACE.cx)/FACE.rx,y=(a[1]-FACE.cy)/FACE.ry,dx=(b[0]-a[0])/FACE.rx,dy=(b[1]-a[1])/FACE.ry,A=dx*dx+dy*dy,B=2*(x*dx+y*dy),C=x*x+y*y-1,D=B*B-4*A*C;
  if(A<1e-12||D<0){if(current.length>1)paths.push(current);current=[];continue;}
  const t0=Math.max(0,(-B-Math.sqrt(D))/(2*A)),t1=Math.min(1,(-B+Math.sqrt(D))/(2*A));
  if(t0>t1){if(current.length>1)paths.push(current);current=[];continue;}
  const q=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],s=q(t0),e=q(t1);
  if(!current.length||dist(current.at(-1),s)>.0001){if(current.length>1)paths.push(current);current=[s];}current.push(e);
  if(t1<1){paths.push(current);current=[];}
 }if(current.length>1)paths.push(current);return paths;
}
export function classifyStroke(input,{width=400}={}){
 const none={kind:'none',paths:[]};
 work=0;
 if(!Array.isArray(input)||input.length<2)return none;
 const raw=input.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));if(raw.length<2)return none;
 if(Math.max(...raw.map(p=>dist(raw[0],p)))*width<6)return none;
 const smooth=[raw[0]];for(let i=1;i<raw.length;i++)smooth.push(i===raw.length-1?raw[i]:raw[i].map((v,k)=>v*.72+smooth.at(-1)[k]*.28));
 const candidates=findLoops(raw);
 if(dist(raw[0],raw.at(-1))<.08)candidates.push(...loops([...smooth,smooth[0]]));
 const largest=candidates.sort((a,b)=>area(b)-area(a))[0],polygon=largest?clipPolygon(largest):[];
 const hole=polygon.length>=3&&area(polygon)>=Math.PI*FACE.rx*FACE.ry*.002;
 const paths=hole?[simplify([...polygon,polygon[0]]).slice(0,-1)]:clipLine(smooth).map(p=>simplify(p));
 const quantized=paths.filter(p=>p.length>1).map(p=>p.map(v=>v.map(n=>Math.max(0,Math.min(1023,Math.round(n*1023))))));
 return quantized.length?{kind:hole?'hole':'slit',paths:quantized}:none;
}
