(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafPile=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const HASH=64,HCELL=8,REG_PAD=8,STEP=8,HANG_UV=[-0.3,0,0.3],SLIDE_STEP=0.35;
// 默认范围盖住 45°–75° 镜头下整个可见地面（45° 时约 x ±1080、y −363…1061），溢出的叶子也能点到
const BOUNDS={x0:-1200,y0:-450,w:2400,h:1600};
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const above=(p,q)=>p.z>q.z||(p.z===q.z&&p.id>q.id);
class Pile{
  constructor({masks,seed=1,count=1200,thickness=4,a=520,b=220,sizeMin=84,sizeMax=112,bounds=BOUNDS}){
    Object.assign(this,{masks,seed,count,thickness,a,b,sizeMin,sizeMax});
    this.x0=bounds.x0;this.y0=bounds.y0;this.w=bounds.w;this.h=bounds.h;
    this.cols=Math.ceil(this.w/HASH);this.rows=Math.ceil(this.h/HASH);
    this.hcols=Math.ceil(this.w/HCELL);this.hrows=Math.ceil(this.h/HCELL);
    this.reset();
  }
  reset(){
    this.random=rng(this.seed);this.fxRandom=rng((this.seed^0x9e3779b9)>>>0);
    this.leaves=[];this.nextId=1;this.cells=Array.from({length:this.cols*this.rows},()=>[]);
    this.height=new Float32Array(this.hcols*this.hrows);this.baseHeight=null;this.landing=this.landing||null;this.needle=null;this.maxZ=0;this.version=(this.version||0)+1;this.glintCenter=null;this.exposureCache=null;
  }
  maskAt(l,x,y){
    const dx=x-l.x,dy=y-l.y,u=(dx*l.cos+dy*l.sin)/l.size,v=(-dx*l.sin+dy*l.cos)/l.size;
    if(u<=-0.5||u>=0.5||v<=-0.5||v>=0.5)return false;
    const m=this.masks[l.type],M=m.size;return m.data[Math.min(M-1,Math.floor((0.5-v)*M))*M+Math.min(M-1,Math.floor((u+0.5)*M))]>0;
  }
  cellIndex(x,y){const c=Math.floor((x-this.x0)/HASH),r=Math.floor((y-this.y0)/HASH);return c<0||r<0||c>=this.cols||r>=this.rows?-1:r*this.cols+c;}
  leavesNear(x,y){const i=this.cellIndex(x,y);return i<0?[]:this.cells[i];}
  eachCell(l,fn){
    const rad=l.size*0.71+REG_PAD,c0=Math.max(0,Math.floor((l.x-rad-this.x0)/HASH)),c1=Math.min(this.cols-1,Math.floor((l.x+rad-this.x0)/HASH)),r0=Math.max(0,Math.floor((l.y-rad-this.y0)/HASH)),r1=Math.min(this.rows-1,Math.floor((l.y+rad-this.y0)/HASH));
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)fn(this.cells[r*this.cols+c]);
  }
  forHeightCells(l,fn){
    const rad=l.size*0.71,c0=Math.max(0,Math.floor((l.x-rad-this.x0)/HCELL)),c1=Math.min(this.hcols-1,Math.floor((l.x+rad-this.x0)/HCELL)),r0=Math.max(0,Math.floor((l.y-rad-this.y0)/HCELL)),r1=Math.min(this.hrows-1,Math.floor((l.y+rad-this.y0)/HCELL));
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)fn(r*this.hcols+c,this.x0+(c+0.5)*HCELL,this.y0+(r+0.5)*HCELL);
  }
  hIndex(x,y){const c=Math.floor((x-this.x0)/HCELL),r=Math.floor((y-this.y0)/HCELL);return c<0||r<0||c>=this.hcols||r>=this.hrows?-1:r*this.hcols+c;}
  heightAt(x,y){const i=this.hIndex(x,y);return i<0?0:this.height[i];}
  topAt(x,y){let h=0;for(const o of this.leavesNear(x,y))if(o.z>h&&this.maskAt(o,x,y))h=o.z;return h;}
  layersAt(x,y){let k=0;for(const o of this.leavesNear(x,y))if(this.maskAt(o,x,y))k++;return k;}
  stampHeight(l){this.forHeightCells(l,(i,x,y)=>{if(this.height[i]<l.z&&this.maskAt(l,x,y))this.height[i]=l.z;});}
  recomputeHeight(l){this.forHeightCells(l,(i,x,y)=>{this.height[i]=this.topAt(x,y);});}
  newLeaf({x,y,yaw,size,type}){return{id:this.nextId++,x,y,yaw,cos:Math.cos(yaw),sin:Math.sin(yaw),size,type,z:0,shade:1,depth:0};}
  insert(l){this.leaves.push(l);this.eachCell(l,cell=>cell.push(l));this.stampHeight(l);if(l.z>this.maxZ)this.maxZ=l.z;this.version++;return l;}
  addLeaf(o){const l=this.newLeaf(o);l.z=(this.layersAt(l.x,l.y)+1)*this.thickness;return this.insert(l);}
  // 效果落叶：贴着中心点下方最高的那片叶子落下（和开局铺叶一样是软叶子，边缘可以压在更高的邻叶下面）。
  // 按整个脚印取最高点会让叶子搭在坑沿上填不进坑，还会越堆越尖（实测大档效果连放几次就高出几十层）。
  // 盖到未拔出的针时，针也算支撑（针在 (k+½)·t，叶子落到 (k+1)·t），保证落在针上的叶子一定盖住针。
  supportOf(l){
    let s=0;const n=this.needle,t=this.thickness;
    for(const o of this.leavesNear(l.x,l.y))if(o.z>s&&this.maskAt(o,l.x,l.y))s=o.z;
    if(n&&!n.pulled&&n.z-t/2>s&&this.needleSamples(n).some(([x,y])=>this.maskAt(l,x,y)))s=n.z-t/2;
    return s;
  }
  // landing(叶, 真实落点 z) 返回 {x,y} 表示要挪开（护脸圈是硬规则，任何落叶入口都经过这里），返回 null 表示可以落。
  // 落进坑里的新叶也按「比原始表面低多少」变暗，和周围坑壁一致。
  dropLeaf(o){
    const l=this.newLeaf(o);
    for(let k=0;k<12&&this.landing;k++){const q=this.landing(l,this.supportOf(l)+this.thickness);if(!q)break;l.x=q.x;l.y=q.y;}
    l.z=this.supportOf(l)+this.thickness;this.setDepth(l);
    return this.insert(l);
  }
  // 深度算法同开局：叶片盖到的高度格里，取「原始表面 − z」的最小值
  setDepth(l){
    if(!this.baseHeight)return;
    let d=Infinity;this.forHeightCells(l,(i,x,y)=>{if(d>0&&this.maskAt(l,x,y)){const g=this.baseHeight[i]-l.z;if(g<d)d=g;}});
    l.depth=d===Infinity?0:Math.max(0,d);l.shade=this.shadeOf(l);
  }
  // 压实：按「盖住中心的叶子数」铺出来的叶堆里约四成叶片悬空 1–2 层。从低到高让每片落到中心点下方最高那片之上，
  // 只降不升（不会叠出高塔）；之后捡叶引起的塌落就都是「因为被捡」才动，不会一捡就满屏抽动。
  compact(){
    const t=this.thickness;
    for(const l of this.leaves.slice().sort((a,b)=>a.z-b.z||a.id-b.id)){const z=this.topBelow(l.x,l.y,l,l.z)+t;if(z<l.z)l.z=z;}
    this.height.fill(0);for(const l of this.leaves)this.stampHeight(l);
    this.maxZ=this.leaves.reduce((m,o)=>o.z>m?o.z:m,0);this.version++;
  }
  // —— 捡叶后的塌落 ——
  topBelow(x,y,skip=null,below=Infinity){let h=0;for(const o of this.leavesNear(x,y))if(o!==skip&&o.z<below&&o.z>h&&this.maskAt(o,x,y))h=o.z;return h;}
  needleUnder(l,x,y,below=Infinity){
    const n=this.needle;if(!n||n.pulled||n.z>=below)return 0;
    const p={x,y,cos:l.cos,sin:l.sin,size:l.size,type:l.type};return this.needleSamples(n).some(([nx,ny])=>this.maskAt(p,nx,ny))?n.z-this.thickness/2:0;
  }
  // 叶片 l 放到 (x,y) 会停在的高度（不算它自己）；below 只算比它低的东西（原地下沉用）
  restZ(l,x,y,below=Infinity){return Math.max(this.topBelow(x,y,l,below),this.needleUnder(l,x,y,below))+this.thickness;}
  // 挪动一片叶子：先从哈希格和高度格里拿出来，改位置后放回；id 不变
  moveLeaf(l,x,y,z){
    this.eachCell(l,c=>{const i=c.indexOf(l);if(i>=0)c.splice(i,1);});
    this.recomputeHeight(l);
    l.x=x;l.y=y;l.z=z;
    this.eachCell(l,c=>c.push(l));this.stampHeight(l);this.setDepth(l);
    this.maxZ=this.leaves.reduce((m,o)=>o.z>m?o.z:m,0);this.version++;this.exposureCache=null;
    return l;
  }
  // 表层叶片悬在「挖出来的坑」上的部分超过 overhang，且朝某个方向挪 0.35 个叶宽能低 slide 层以上时，返回滑到的位置；中心被压着的不滑。
  // 只认坑（比开局原始表面低 2 层以上）：叶堆两侧天然的陡坡不算，免得第一下一碰就成片塌方。
  slideOf(l,slide,overhang){
    const t=this.thickness,B=this.baseHeight;
    for(const o of this.leavesNear(l.x,l.y))if(o!==l&&above(o,l)&&this.maskAt(o,l.x,l.y))return null;
    let hang=0,n=0;
    for(const u of HANG_UV)for(const v of HANG_UV){
      const x=l.x+(u*l.cos-v*l.sin)*l.size,y=l.y+(u*l.sin+v*l.cos)*l.size;if(!this.maskAt(l,x,y))continue;
      n++;const h=this.topBelow(x,y,l,l.z),i=this.hIndex(x,y);
      if(h<l.z-2*t&&(!B||i<0||h<B[i]-2*t))hang++;
    }
    if(!n||hang<overhang*n)return null;
    let best=null;
    for(let k=0;k<8;k++){
      const a=k*Math.PI/4,x=l.x+Math.cos(a)*l.size*SLIDE_STEP,y=l.y+Math.sin(a)*l.size*SLIDE_STEP,z=this.restZ(l,x,y);
      if(this.landing&&this.landing({...l,x,y},z))continue;
      if(!best||z<best.z)best={x,y,z};
    }
    return best&&best.z<=l.z-slide*t?best:null;
  }
  // 捡走叶片后：中心失去支撑的叶片往下沉，悬在坑上一半以上的表层叶片顺坡滑进去，上面压着的跟着连锁。
  // 逻辑立即生效；返回 [{leaf,from:[x,y,z]}] 给画面补间。maxMoves 限制一次最多动几片，免得一捡塌一大片。
  settle(removed,{maxMoves=8,slide=3,overhang=0.5}={}){
    const t=this.thickness,moved=new Map();let queue=new Set();
    const touch=(p,zMin)=>this.eachCell(p,c=>{for(const o of c)if(o.z>zMin)queue.add(o);});
    for(const r of removed)touch(r,r.z-t/2);
    for(let round=0;round<8&&queue.size;round++){
      const list=[...queue].sort((a,b)=>a.z-b.z||a.id-b.id);queue=new Set();
      for(const l of list){
        if(!moved.has(l)&&moved.size>=maxMoves)continue;
        const s=this.slideOf(l,slide,overhang);let x=l.x,y=l.y,z=this.restZ(l,l.x,l.y,l.z);
        if(s&&s.z<z){x=s.x;y=s.y;z=s.z;}
        if(z>l.z-t/2)continue;
        const old={x:l.x,y:l.y,size:l.size};
        if(!moved.has(l))moved.set(l,[l.x,l.y,l.z]);
        this.moveLeaf(l,x,y,z);touch(old,z);touch(l,z);queue.add(l);
      }
    }
    return[...moved].map(([leaf,from])=>({leaf,from}));
  }
  // reject(候选叶, 它会落到的 z) 返回 true 时重抽（护脸圈用），最多 12 次；不传时与原来逐片抽样完全一致
  generate(reject=null){
    this.reset();
    for(let i=0;i<this.count;i++)for(let k=0;k<12;k++){
      const ang=this.random()*Math.PI*2,rad=Math.sqrt(1-Math.sqrt(1-this.random()));
      const o={x:this.a*rad*Math.cos(ang),y:this.b*rad*Math.sin(ang),yaw:this.random()*Math.PI*2,size:this.sizeMin+this.random()*(this.sizeMax-this.sizeMin),type:Math.floor(this.random()*this.masks.length)};
      if(reject&&reject(o,(this.layersAt(o.x,o.y)+1)*this.thickness))continue;
      this.addLeaf(o);break;
    }
    this.compact();
    this.baseHeight=this.height.slice();
    for(const l of this.leaves){let d=Infinity;this.forHeightCells(l,(i,x,y)=>{if(d>0&&this.maskAt(l,x,y)){const g=this.baseHeight[i]-l.z;if(g<d)d=g;}});l.depth=d===Infinity?0:Math.max(0,d);}
    return this;
  }
  pick(ray){
    const O=ray.origin,D=ray.dir;if(!(D[2]<0))return null;
    let tTop=Math.max(0,(this.maxZ+1-O[2])/D[2]),tGround=-O[2]/D[2];
    for(let k=0;k<2;k++){const lo=k?this.y0:this.x0,hi=lo+(k?this.rows:this.cols)*HASH;if(D[k]===0){if(O[k]<lo||O[k]>=hi)return null;continue;}const a=(lo-O[k])/D[k],b=(hi-O[k])/D[k];tTop=Math.max(tTop,Math.min(a,b));tGround=Math.min(tGround,Math.max(a,b));}
    if(!(tTop<=tGround))return null;const len=Math.hypot(D[0],D[1])*(tGround-tTop);
    const steps=Math.max(1,Math.ceil(len/STEP)),seen=new Set();let best=null;
    for(let s=0;s<=steps;s++){
      const t=tTop+(tGround-tTop)*s/steps,x=O[0]+D[0]*t,y=O[1]+D[1]*t;
      for(const l of this.leavesNear(x,y)){
        if(seen.has(l))continue;seen.add(l);
        if(best&&!above(l,best))continue;
        const tl=(l.z-O[2])/D[2];
        if(this.maskAt(l,O[0]+D[0]*tl,O[1]+D[1]*tl))best=l;
      }
    }
    return best;
  }
  remove(l){
    const idx=this.leaves.indexOf(l);if(idx<0)return null;
    this.leaves.splice(idx,1);this.eachCell(l,cell=>{const i=cell.indexOf(l);if(i>=0)cell.splice(i,1);});
    this.recomputeHeight(l);
    this.maxZ=this.leaves.reduce((m,o)=>o.z>m?o.z:m,0);this.version++;this.exposureCache=null;
    return{leaf:l};
  }
  // 批量移除：叶表、哈希格各过滤一次；高度格只重算并集里可能变的格（被移除叶片 z ≥ 该格高度），version 只加 1
  removeMany(list){
    const gone=new Set(list),out=[];let k=0;
    for(const l of this.leaves)if(gone.has(l))out.push(l);else this.leaves[k++]=l;
    this.leaves.length=k;if(!out.length)return 0;
    const cells=new Set(),mark=new Uint8Array(this.height.length),pts=[];
    for(const l of out){
      this.eachCell(l,cell=>cells.add(cell));
      const z=Math.fround(l.z);this.forHeightCells(l,(i,x,y)=>{if(!mark[i]&&z>=this.height[i]){mark[i]=1;pts.push(i,x,y);}});
    }
    for(const cell of cells){let j=0;for(const o of cell)if(!gone.has(o))cell[j++]=o;cell.length=j;}
    for(let p=0;p<pts.length;p+=3)this.height[pts[p]]=this.topAt(pts[p+1],pts[p+2]);
    this.maxZ=this.leaves.reduce((m,o)=>o.z>m?o.z:m,0);this.version++;this.exposureCache=null;
    return out.length;
  }
  // 表层叶片：中心在 (x,y) 半径 r 内、中心点没被任何 (z,id) 更高的叶片盖住；按 (z,id) 从高到低，最多 n 片。
  // 可选 skip（Set）里的叶片视为已移除：反复调用并把结果加进 skip，就能一层层剥到够数，最后 removeMany 一次。
  surfaceLeaves(x,y,r,n=Infinity,skip=null){
    const out=[],r2=r*r;
    for(const l of this.leaves){
      const dx=l.x-x,dy=l.y-y;if(dx*dx+dy*dy>r2||(skip&&skip.has(l)))continue;
      let top=true;for(const o of this.leavesNear(l.x,l.y))if(above(o,l)&&!(skip&&skip.has(o))&&this.maskAt(o,l.x,l.y)){top=false;break;}
      if(top)out.push(l);
    }
    return out.sort((p,q)=>q.z-p.z||q.id-p.id).slice(0,Math.max(0,n));
  }
  isPit(x,y){const i=this.hIndex(x,y);return!!this.baseHeight&&i>=0&&this.height[i]<this.baseHeight[i]-2*this.thickness;}
  needleSamples(n=this.needle,count=24){
    const pts=[];if(!n)return pts;
    for(let i=0;i<count;i++){const s=(i/(count-1)-0.5)*(n.length-4);pts.push([n.x+s*n.cos,n.y+s*n.sin,n.z]);}
    return pts;
  }
  coverAt(x,y,z){let c=0;for(const l of this.leavesNear(x,y))if(l.z>z+1e-6&&this.maskAt(l,x,y))c++;return c;}
  columnZ(x,y){const zs=[];for(const l of this.leavesNear(x,y))if(this.maskAt(l,x,y))zs.push(l.z);return zs.sort((p,q)=>q-p);}
  minCover(){const n=this.needle;if(!n||n.pulled)return 0;let m=Infinity;for(const [x,y,z]of this.needleSamples())m=Math.min(m,this.coverAt(x,y,z));return m;}
  placeNeedle({minCover=9,maxCover=20,length=150,cameraPos=null,maxTries=400}={}){
    for(let i=0;i<maxTries;i++){
      const ang=this.random()*Math.PI*2,rad=Math.sqrt(this.random())*0.6,yaw=this.random()*Math.PI;
      const n={x:this.a*rad*Math.cos(ang),y:this.b*rad*Math.sin(ang),yaw,cos:Math.cos(yaw),sin:Math.sin(yaw),length,z:0,pulled:false};
      const cols=this.needleSamples(n).map(([x,y])=>this.columnZ(x,y));
      if(cols.some(c=>c.length<minCover+1))continue;
      const hi=Math.min(...cols.map(c=>c[minCover-1])),lo=Math.max(...cols.map(c=>c[c.length-1])),t=this.thickness;
      const kMin=Math.floor(lo/t-0.5)+1,kMax=Math.ceil(hi/t-0.5)-1;
      if(kMin>kMax)continue;
      n.z=(kMax-Math.floor(this.random()*Math.min(kMax-kMin+1,Math.max(1,maxCover-minCover+1)))+0.5)*t;
      this.needle=n;this.version++;this.exposureCache=null;this.glintCenter=null;
      if(cameraPos&&this.exposure(cameraPos).ratio>0){this.needle=null;continue;}
      return n;
    }
    this.needle=null;return null;
  }
  // 把针放在当前表面上（龙卷风卷针用）：z = 针身 24 个采样点处 heightAt 的最大值 + 半层，长度沿用原针（默认 150）
  placeNeedleAt(x,y,yaw){
    const n={x,y,yaw,cos:Math.cos(yaw),sin:Math.sin(yaw),length:this.needle?this.needle.length:150,z:0,pulled:false};
    n.z=Math.max(...this.needleSamples(n).map(([px,py])=>this.heightAt(px,py)))+this.thickness/2;
    this.needle=n;this.version++;this.exposureCache=null;this.glintCenter=null;return n;
  }
  blockerOf(p,C){
    const dz=C[2]-p[2];if(dz<=0)return null;
    const sMax=Math.min(1,(this.maxZ+1-p[2])/dz);if(sMax<=0)return null;
    const len=Math.hypot(C[0]-p[0],C[1]-p[1])*sMax,steps=Math.max(1,Math.ceil(len/STEP)),seen=new Set();
    let best=null,bestS=-Infinity;
    for(let k=0;k<=steps;k++){
      const s=sMax*k/steps,x=p[0]+(C[0]-p[0])*s,y=p[1]+(C[1]-p[1])*s;
      for(const l of this.leavesNear(x,y)){
        if(seen.has(l)||l.z<=p[2]+1e-6)continue;seen.add(l);
        const sl=(l.z-p[2])/dz;
        if((sl>bestS||(sl===bestS&&l.id>best.id))&&this.maskAt(l,p[0]+(C[0]-p[0])*sl,p[1]+(C[1]-p[1])*sl)){best=l;bestS=sl;}
      }
    }
    return best;
  }
  exposure(cameraPos){
    const n=this.needle;if(!n||n.pulled)return{ratio:0,visible:[],blockers:[],points:[]};
    const key=cameraPos.join(',');
    if(this.exposureCache&&this.exposureCache.version===this.version&&this.exposureCache.key===key)return this.exposureCache.result;
    const points=this.needleSamples(),visible=[],blockers=[];
    for(const p of points){const b=this.blockerOf(p,cameraPos);visible.push(!b);blockers.push(b);}
    const result={ratio:visible.filter(Boolean).length/points.length,visible,blockers,points};
    this.exposureCache={version:this.version,key,result};return result;
  }
  needleHit(ray,radius=12){
    const n=this.needle;if(!n||n.pulled)return -1;
    const ex=this.exposure(ray.origin),O=ray.origin,D=ray.dir;let best=-1,bestD=radius;
    ex.points.forEach((p,i)=>{
      if(!ex.visible[i])return;
      const v=[p[0]-O[0],p[1]-O[1],p[2]-O[2]],t=v[0]*D[0]+v[1]*D[1]+v[2]*D[2],d=Math.hypot(v[0]-D[0]*t,v[1]-D[1]*t,v[2]-D[2]*t);
      if(d<bestD){bestD=d;best=i;}
    });
    return best;
  }
  glint({threshold=8,radius=120}={}){
    const n=this.needle;if(!n||n.pulled){this.glintCenter=null;return{active:false,minCover:0};}
    const mc=this.minCover();
    if(mc>threshold){this.glintCenter=null;return{active:false,minCover:mc};}
    if(!this.glintCenter){const ang=this.fxRandom()*Math.PI*2,r=Math.sqrt(this.fxRandom())*0.6*radius;this.glintCenter={x:n.x+r*Math.cos(ang),y:n.y+r*Math.sin(ang)};}
    const interval=threshold<=1?0.6:0.6+1.9*Math.max(0,Math.min(1,(mc-1)/(threshold-1)));
    return{active:true,minCover:mc,center:this.glintCenter,radius,interval};
  }
  debugExpose(cameraPos,maxRemovals=400){
    let removed=0;
    while(removed<maxRemovals){const b=this.exposure(cameraPos).blockers.find(Boolean);if(!b)break;this.remove(b);removed++;}
    return removed;
  }
  shadeLeaves({layers=8,strength=0.55}={}){this.shadeOpts={layers,strength};for(const l of this.leaves)l.shade=this.shadeOf(l);}
  shadeOf(l){const o=this.shadeOpts||{layers:8,strength:0.55};return 1-o.strength*Math.min(1,(l.depth||0)/(o.layers*this.thickness));}
  // —— Task 4、Task 5 的方法追加在这一行之上 ——
}
return{Pile,rng,above,HASH,HCELL,STEP};
});
