(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafFx=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// 动画层：只管「看起来怎样」。叶堆里有没有某片叶子由 EffectEngine 决定——落叶在 t1 才落地生效，被吹走、扫走的叶子触发时已离开叶堆。
// 叶片、木桶、针、星光走 WebGL（与叶堆同一套精灵）；风线、龙卷风柱、霜面、阳光、文字画在叠在上面的透明 2D 画布上。
const TAU=Math.PI*2,FLY_MS=550,SPARK_MS=420,W=1440,H=810,UV=[0,1,1,0],FUNNEL_H=380,CRACK_MAX=40;
const clamp01=v=>v<0?0:v>1?1:v,smooth=t=>t*t*(3-2*t),easeIn=t=>t*t;
const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const ARC={gust:40,burst:260,tornado:180};
const SKY={drift:{amp:26,fall:0.65},rain:{amp:12,fall:1},bury:{amp:6,fall:1}};
// 引擎给的中心点可能是 {x,y} 或 [x,y]
const pt=c=>Array.isArray(c)?{x:c[0],y:c[1]}:{x:c.x,y:c.y};
const COLD='255,255,255',WARM='255,200,128',FONT='"Microsoft YaHei UI","PingFang SC",sans-serif';
function pathLength(p){let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return L;}
function pathAt(p,s,len){
  if(!p.length)return[0,0];let d=clamp01(s)*len;
  for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<=l||i===p.length-1){const k=l>0?Math.min(1,d/l):0;return[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k];}d-=l;}
  return[p[0][0],p[0][1]];
}
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function shadowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,31);
  r.addColorStop(0,'rgba(48,26,10,.6)');r.addColorStop(0.55,'rgba(48,26,10,.28)');r.addColorStop(1,'rgba(48,26,10,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);return c;
}
class Fx{
  constructor({cam,uvs,sheet=null,SpriteBatch,bucket=[600,-20,0],bucketH=170,broomUV=null,broomAspect=0.4}){
    Object.assign(this,{cam,uvs,sheet,bucket,bucketH,broomUV,broomAspect});this.hits=[];
    this.items=[];this.tornadoes=new Map();this.waves=[];this.suns=[];this.bursts=[];this.tosses=[];this.texts=[];this.shards=[];this.sweeps=[];this.sparks=[];this.rings=[];
    this.frostIn=0;this.crackAt=0;this.quickStart=0;this.quickUntil=0;this.frostGeom=null;
    this.pointer=null;this.solid=null;this.drawn2d=false;this.seq=0;
    this.leafBatch=new SpriteBatch(512);this.shadowBatch=new SpriteBatch(256);this.needleBatch=new SpriteBatch(4);this.starBatch=new SpriteBatch(64);
  }
  mouth(){const U=this.cam.up,B=this.bucket,h=this.bucketH*0.85;return[B[0]+U[0]*h,B[1]+U[1]*h,B[2]+U[2]*h];}
  item(e,from=null){const n=++this.seq;return{e,from,seed:n*1.7,spin:(hash(n)>0.5?1:-1)*(3+hash(n*3.3)*5)};}
  // 主播自己捡的叶子：沿用小样的弧线飞进木桶；快手一次捡多片时错开起飞
  pick(leaf,now,i=0){const t0=now+i*70;this.items.push(this.item({type:'fly',leaf,from:[leaf.x,leaf.y,leaf.z],t0,t1:t0+FLY_MS,into:'bucket'}));}
  add(evs,now){
    for(const e of evs||[])switch(e.type){
      case 'fall':this.items.push(this.item(e,e.kind==='tornado'?this.takeOrbit(now):null));break;
      case 'fly':this.items.push(this.item(e));if(e.into==='away')this.noteWave(e);else if(e.into==='bucket')this.noteSweep(e);break;
      case 'tornado':this.tornadoes.set(e.id,{e,len:pathLength(e.path),orbit:[]});break;
      case 'gust':this.waves.push({t0:e.t0,t1:e.t1,dir:e.dir||1,center:pt(e.center),color:COLD,seed:hash(e.t0)});break;
      case 'burst':this.bursts.push(e);break;
      case 'sun':this.suns.push(e);break;
      case 'needleToss':this.tosses.push(e);break;
      case 'frost':this.frostIn=now;break;
      case 'frostCrack':if(e.decay)this.hits.pop();else this.crackAt=now;break;
      case 'frostLayer':case 'frostBreak':this.hits=[];this.shatter(now,e.type==='frostBreak');break;
      case 'quick':if(!(this.quickUntil>now))this.quickStart=now;this.quickUntil=e.until;this.rings.push({t0:now});break;
      case 'time':this.texts.push({text:'+'+e.seconds+' 秒',t0:now});break;
    }
  }
  // 顺风：把同方向、时间接得上的飞走叶子合成一阵暖色风线
  noteWave(e){
    const dir=Math.sign(e.to[0]-e.from[0])||1,w=this.waves.find(w=>w.color===WARM&&w.dir===dir&&w.t1>=e.t0-300);
    if(w){w.t1=Math.max(w.t1,e.t1);return;}
    this.waves.push({t0:e.t0-150,t1:e.t1,dir,center:{x:e.from[0],y:e.from[1]},color:WARM,seed:hash(e.t0)});
  }
  noteSweep(e){
    const s=this.sweeps.find(s=>s.t1>=e.t0-300);
    if(s){s.t1=Math.max(s.t1,e.t1);s.n++;s.x+=(e.from[0]-s.x)/s.n;s.y+=(e.from[1]-s.y)/s.n;return;}
    this.sweeps.push({t0:e.t0-250,t1:e.t1,x:e.from[0],y:e.from[1],n:1});
  }
  // 龙卷风结束时撒出的叶子从正在转的那片叶子的位置出发，画面上是连续的
  takeOrbit(now){for(const t of this.tornadoes.values())if(t.orbit.length){const p=this.orbitPose(t,t.orbit.pop(),now);return[p.x,p.y,p.z];}return null;}
  // 结霜时主播点在哪里，裂纹就从哪里炸开（舞台坐标）
  frostHit(x,y){this.hits.push({x,y,seed:hash(x*0.37+y*1.13+this.hits.length)*1000});if(this.hits.length>CRACK_MAX)this.hits.shift();}
  tossing(now){return this.tosses.some(e=>now<e.t1);}
  busy(now){return this.items.length>0||this.tornadoes.size>0||this.tosses.length>0||this.bursts.some(e=>now<e.t1+300);}
  update(now,pile){
    this.items=this.items.filter(it=>{
      const e=it.e;if(now<e.t1)return true;
      if(e.type==='fly'&&e.into==='tornado'){const t=this.tornadoes.get(e.tornado);if(t&&now<t.e.t1)t.orbit.push({leaf:e.leaf,phase:hash(it.seed)*TAU,h:50+hash(it.seed*2.1)*210,joined:now});}
      return false;
    });
    for(const [id,t]of this.tornadoes)if(now>t.e.t1+300)this.tornadoes.delete(id);
    const live=(list,ms)=>list.filter(x=>now<(x.t1??x.t0)+ms);
    this.waves=live(this.waves,300);this.suns=live(this.suns,0);this.bursts=live(this.bursts,600);this.sweeps=live(this.sweeps,300);this.tosses=live(this.tosses,0);
    this.texts=this.texts.filter(x=>now<x.t0+1600);this.shards=this.shards.filter(x=>now<x.t0+900);this.rings=this.rings.filter(x=>now<x.t0+420);this.sparks=this.sparks.filter(s=>now<s.t0+SPARK_MS);
    for(const e of this.tosses)if(now>=e.t0&&Math.random()<0.7){const p=this.tossPose(e,now,pile);this.sparks.push({x:p.x+(Math.random()-0.5)*50,y:p.y+(Math.random()-0.5)*50,z:p.z,t0:now,size:12+Math.random()*14});}
  }
  funnelAt(t,now){return pathAt(t.e.path,(now-t.e.t0)/Math.max(1,t.e.t1-t.e.t0),t.len);}
  orbitPose(t,o,now){
    const [cx,cy]=this.funnelAt(t,now),age=(now-o.joined)/1000,r=26+o.h*0.4,a=o.phase+age*(6-o.h*0.012);
    return{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r*0.8,z:o.h+Math.sin(age*3+o.phase)*14,yaw:o.leaf.yaw+age*4,flip:Math.sin(a)*0.9,size:o.leaf.size*0.7,a:1,ang:a};
  }
  pose(it,now,pile){
    const e=it.e;if(now<e.t0)return null;
    const t=clamp01((now-e.t0)/Math.max(1,e.t1-e.t0)),l=e.leaf,from=e.kind==='burst'?this.mouth():it.from||e.from;
    if(e.type==='fly'){
      let to=e.to;
      if(e.into==='bucket')to=this.mouth();
      else if(e.into==='tornado'){const tn=this.tornadoes.get(e.tornado);if(tn){const [x,y]=this.funnelAt(tn,now);to=[x,y,120];}}
      to=to||from;const k=smooth(t),lift=e.into==='away'?90:e.into==='tornado'?40:140;
      let size=l.size,a=1;
      if(e.into==='bucket'){size*=1-0.45*k;a=1-clamp01((t-0.85)/0.15);}else if(e.into==='away')a=1-clamp01((t-0.7)/0.3);
      return{x:from[0]+(to[0]-from[0])*k,y:from[1]+(to[1]-from[1])*k,z:from[2]+(to[2]-from[2])*k+Math.sin(Math.PI*t)*lift,yaw:l.yaw+t*it.spin,flip:t*Math.PI*1.2,size,a};
    }
    const tx=e.to[0],ty=e.to[1],tz=pile?pile.heightAt(tx,ty)+pile.thickness:e.to[2],sky=SKY[e.kind];
    let x,y,z,a=1;
    if(sky){
      const k=smooth(t),w=(1-t)*sky.amp;
      x=from[0]+(tx-from[0])*k+Math.sin(t*TAU*1.4+it.seed)*w;y=from[1]+(ty-from[1])*k+Math.cos(t*TAU*1.1+it.seed)*w*0.6;
      z=from[2]+(tz-from[2])*(sky.fall*easeIn(t)+(1-sky.fall)*t);a=clamp01(t/0.08);
    }else{x=from[0]+(tx-from[0])*t;y=from[1]+(ty-from[1])*t;z=from[2]+(tz-from[2])*t+Math.sin(Math.PI*t)*(ARC[e.kind]||60);}
    // 落地那一刻正好平躺、朝向等于叶片自身 yaw，和叶堆里那片接得上
    return{x,y,z,yaw:l.yaw+(1-t)*it.spin,flip:(1-t)*Math.sin(t*TAU*1.5+it.seed)*1.1,size:l.size,a};
  }
  tossPose(e,now,pile){
    const t=clamp01((now-e.t0)/Math.max(1,e.t1-e.t0)),n=pile&&pile.needle;
    return{x:e.from[0]+(e.to[0]-e.from[0])*t,y:e.from[1]+(e.to[1]-e.from[1])*t,z:e.from[2]+(e.to[2]-e.from[2])*t+Math.sin(Math.PI*t)*260,yaw:(n?n.yaw:0)+(1-t)*TAU*1.5,len:n?n.length:150,size:40,a:1};
  }
  // 护脸圈是透明实体：空中的叶子投影碰到圈，就在当前深度沿镜头 right/up 推到圈边，看起来是绕着圈滑开
  deflect(p){
    const f=this.solid;if(!f)return p;
    const s=this.cam.project([p.x,p.y,p.z]);if(!(s.depth>0))return p;
    const dx=s.x-f.x,dy=s.y-f.y,d=Math.hypot(dx,dy),need=f.r+p.size*0.5*s.scale;if(d>=need)return p;
    const ux=d>1e-3?dx/d:0,uy=d>1e-3?dy/d:1,k=(need-d)/s.scale,R=this.cam.right,U=this.cam.up;
    p.x+=(R[0]*ux-U[0]*uy)*k;p.y+=(R[1]*ux-U[1]*uy)*k;p.z+=(R[2]*ux-U[2]*uy)*k;return p;
  }
  leaf(L,p,type){const c=Math.cos(p.yaw)*p.size,s=Math.sin(p.yaw)*p.size,cf=Math.cos(p.flip),sf=Math.sin(p.flip);L.push([p.x,p.y,p.z],[c,s,0],[-s*cf,c*cf,p.size*sf],this.uvs[type],[1,1,1,p.a]);}
  shadow(S,p,pile){const g=pile?pile.heightAt(p.x,p.y):0,h=p.z-g;if(h<8)return;const k=clamp01(1-h/650);S.flat(p.x,p.y,g+0.5,0,p.size*(1.1-0.35*k),UV,[1,1,1,0.5*k*p.a]);}
  broom(L,s,now,pile){
    const life=clamp01((now-s.t0)/Math.max(1,s.t1-s.t0)),a=Math.min(1,life/0.15,(1-life)/0.15);if(a<=0)return;
    const h=120,w=h*this.broomAspect,x=s.x+Math.sin(now*0.016)*55,y=s.y-30,z=(pile?pile.heightAt(x,y):0)+6,roll=Math.sin(now*0.016+1.2)*0.4;
    const R=this.cam.right,U=this.cam.up,cr=Math.cos(roll),sr=Math.sin(roll),u=[0,1,2].map(i=>(R[i]*cr+U[i]*sr)*w),v=[0,1,2].map(i=>(U[i]*cr-R[i]*sr)*h);
    L.push([x+v[0]/2,y+v[1]/2,z+v[2]/2],u,v,this.broomUV,[1,1,1,a]);
  }
  bucketPose(now){
    let sx=1,sy=1,dx=0;
    for(const e of this.bursts){
      if(now<e.t0)continue;
      if(now<e.t1){const k=clamp01((now-e.t0)/Math.max(1,e.t1-e.t0));sx=1+0.14*k;sy=1+0.1*k;dx=Math.sin(now*0.09)*7*k;}
      else{const k=clamp01((now-e.t1)/280),o=Math.sin(k*Math.PI)*(1-k);sx=1+0.3*o;sy=1-0.12*o;}
    }
    return{sx,sy,dx};
  }
  drawGL(r,now,pile){
    const L=this.leafBatch.clear(),S=this.shadowBatch.clear(),N=this.needleBatch.clear(),T=this.starBatch.clear();
    for(const it of this.items){const p=this.pose(it,now,pile);if(!p)continue;this.deflect(p);this.shadow(S,p,pile);this.leaf(L,p,it.e.leaf.type);}
    if(this.broomUV)for(const s of this.sweeps)this.broom(L,s,now,pile);
    for(const e of this.tosses){if(now<e.t0)continue;const p=this.deflect(this.tossPose(e,now,pile)),c=Math.cos(p.yaw),s=Math.sin(p.yaw);N.push([p.x,p.y,p.z],[c*p.len,s*p.len,0],[-s*14,c*14,0],UV,[1,1,1,1]);}
    for(const s of this.sparks){const k=clamp01((now-s.t0)/SPARK_MS),a=Math.sin(Math.PI*k),z=s.size*(0.4+0.6*a);T.billboard([s.x,s.y,s.z],z,z,this.cam,UV,[1,1,1,a]);}
    r.draw('shadow',S);r.draw('atlas',L);r.draw('needle',N);r.draw('star',T);
  }
  // 2D 层：调用前由 app 把变换设成舞台坐标（1440×810）。没东西画时只在结束那一帧清一次
  draw2d(g,now,pile,eng){
    const st=eng&&eng.state,frost=!!(st&&st.frost&&st.frost.layers>0),quick=!!(st&&st.quick&&st.quick.until>now&&this.pointer);
    const busy=frost||quick||this.waves.length>0||this.suns.length>0||this.tornadoes.size>0||this.shards.length>0||this.texts.length>0||this.bursts.length>0||this.rings.length>0;
    if(!busy&&!this.drawn2d)return;
    g.clearRect(0,0,W,H);this.drawn2d=busy;if(!busy)return;
    for(const e of this.suns)this.drawSun(g,e,now,pile);
    if(frost)this.drawFrost(g,st.frost,now);
    this.drawShards(g,now);
    for(const t of this.tornadoes.values())this.drawFunnel(g,t,now);
    for(const w of this.waves)this.drawWave(g,w,now,pile);
    for(const e of this.bursts)this.drawPop(g,e,now);
    if(quick)this.drawQuick(g,st.quick,now);
    this.drawTexts(g,now);
  }
  drawSun(g,e,now,pile){
    if(now<e.t0)return;
    const dur=Math.max(1,e.t1-e.t0),t=now-e.t0,{x:cx,y:cy}=pt(e.center),h=pile?pile.heightAt(cx,cy):0;
    const c=this.cam.project([cx,cy,h]),px=this.cam.project([cx+e.radius,cy,h]),f=this.cam.project([cx,cy-e.radius,h]),b=this.cam.project([cx,cy+e.radius,h]);
    const rx=Math.abs(px.x-c.x),ry=Math.abs(f.y-b.y)/2,y=(f.y+b.y)/2;
    if(t<900){
      const k=t/900;g.save();g.translate(c.x-720+1440*k,y);g.rotate(-0.45);
      const gr=g.createLinearGradient(-110,0,110,0);gr.addColorStop(0,'rgba(255,226,150,0)');gr.addColorStop(0.5,`rgba(255,238,175,${0.5*Math.sin(Math.PI*k)})`);gr.addColorStop(1,'rgba(255,226,150,0)');
      g.fillStyle=gr;g.fillRect(-110,-700,220,1400);g.restore();
    }
    const a=clamp01((t-450)/450)*(1-clamp01((t-dur*0.65)/(dur*0.35)));if(a<=0)return;
    g.save();g.translate(c.x,y);g.scale(1,ry/rx);
    const gr=g.createRadialGradient(0,0,0,0,0,rx);gr.addColorStop(0,`rgba(255,244,196,${0.36*a})`);gr.addColorStop(0.72,`rgba(255,226,150,${0.24*a})`);gr.addColorStop(1,'rgba(255,214,120,0)');
    g.fillStyle=gr;g.beginPath();g.arc(0,0,rx,0,TAU);g.fill();g.restore();
    g.save();g.setLineDash([10,8]);g.lineDashOffset=-now*0.02;g.lineWidth=2;g.strokeStyle=`rgba(255,236,170,${0.8*a})`;g.shadowColor='rgba(255,210,110,.9)';g.shadowBlur=10;
    g.beginPath();g.ellipse(c.x,y,rx*0.98,ry*0.98,0,0,TAU);g.stroke();g.restore();
  }
  frostGeometry(){
    const z=40,c=this.cam.project([0,0,z]),px=this.cam.project([560,0,z]),f=this.cam.project([0,-260,z]),b=this.cam.project([0,260,z]);
    return this.frostGeom={x:c.x,y:(f.y+b.y)/2,rx:Math.abs(px.x-c.x),ry:Math.abs(f.y-b.y)/2};
  }
  drawFrost(g,f,now){
    const {x,y,rx,ry}=this.frostGeometry(),k=this.frostIn?smooth(clamp01((now-this.frostIn)/450)):1,flash=clamp01(1-(now-this.crackAt)/160),ex=rx*k,ey=ry*k;
    g.save();g.translate(x,y);
    g.beginPath();g.ellipse(0,0,ex,ey,0,0,TAU);
    const gr=g.createRadialGradient(0,-ey*0.3,ex*0.1,0,0,ex);gr.addColorStop(0,'rgba(236,248,255,.36)');gr.addColorStop(0.7,'rgba(204,234,252,.48)');gr.addColorStop(1,'rgba(172,216,246,.62)');
    g.fillStyle=gr;g.fill();
    g.save();g.clip();
    g.fillStyle='rgba(255,255,255,.8)';
    for(let i=0;i<40;i++){const a=hash(i*5.1)*TAU,d=Math.sqrt(hash(i*9.7)),px=Math.cos(a)*d*ex,py=Math.sin(a)*d*ey,s=2+hash(i*2.3)*3.5;g.beginPath();g.moveTo(px,py-s);g.lineTo(px+s*0.3,py);g.lineTo(px,py+s);g.lineTo(px-s*0.3,py);g.closePath();g.fill();}
    const sheen=g.createLinearGradient(-ex,-ey,ex,ey);sheen.addColorStop(0.3,'rgba(255,255,255,0)');sheen.addColorStop(0.42,'rgba(255,255,255,.22)');sheen.addColorStop(0.5,'rgba(255,255,255,0)');
    g.fillStyle=sheen;g.fillRect(-ex,-ey,ex*2,ey*2);
    g.lineJoin='round';g.lineCap='round';
    const shown=this.hits.slice(-Math.max(0,f.progress));
    shown.forEach((h,i)=>this.crackStar(g,h.x-x,h.y-y,h.seed,i===shown.length-1?clamp01((now-this.crackAt)/120):1));
    g.restore();
    g.lineWidth=2.5+flash*2;g.strokeStyle=`rgba(255,255,255,${0.75+0.25*flash})`;g.shadowColor='rgba(150,210,255,.9)';g.shadowBlur=12;
    g.beginPath();g.ellipse(0,0,ex,ey,0,0,TAU);g.stroke();g.restore();
    this.frostLabel(g,f,x,y-ey-34);
  }
  crackStar(g,cx,cy,seed,grow){
    let s=seed>>>0;const r=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296,rays=5+Math.floor(r()*3);
    for(let i=0;i<rays;i++){
      let a=i/rays*TAU+r()*0.6,x=cx,y=cy;const len=(26+r()*48)*grow;g.beginPath();g.moveTo(x,y);
      for(let k=0;k<4;k++){a+=(r()-0.5)*0.7;x+=Math.cos(a)*len/4;y+=Math.sin(a)*len/4*0.6;g.lineTo(x,y);}
      g.strokeStyle='rgba(96,150,200,.55)';g.lineWidth=3.2;g.stroke();g.strokeStyle='rgba(255,255,255,.95)';g.lineWidth=1.3;g.stroke();
    }
    g.fillStyle='rgba(255,255,255,.9)';g.beginPath();g.ellipse(cx,cy,5*grow,3*grow,0,0,TAU);g.fill();
  }
  frostLabel(g,f,x,y){
    const w=184,h=46,k=clamp01(f.progress/Math.max(1,f.need));
    g.save();g.translate(x-w/2,y-h/2);rr(g,0,0,w,h,16);g.fillStyle='rgba(241,250,255,.95)';g.shadowColor='rgba(40,90,140,.25)';g.shadowBlur=10;g.fill();g.shadowBlur=0;
    g.strokeStyle='rgba(118,178,224,.95)';g.lineWidth=1.5;g.stroke();
    g.font='700 15px '+FONT;g.textBaseline='middle';g.textAlign='left';g.fillStyle='#2b5b84';g.fillText('🧊 连点破冰'+(f.layers>1?'  ×'+f.layers:''),12,15);
    g.textAlign='right';g.font='600 12px '+FONT;g.fillText(f.progress+'/'+f.need,w-12,15);
    rr(g,12,29,w-24,8,4);g.fillStyle='rgba(118,170,212,.25)';g.fill();
    if(k>0){rr(g,12,29,Math.max(8,(w-24)*k),8,4);g.fillStyle='#58a6e0';g.fill();}
    g.restore();
  }
  shatter(now,final){
    const f=this.frostGeom;if(!f)return;
    for(let i=0;i<(final?34:20);i++){const a=Math.random()*TAU,d=Math.sqrt(Math.random());this.shards.push({t0:now,x:f.x+Math.cos(a)*d*f.rx,y:f.y+Math.sin(a)*d*f.ry,vx:Math.cos(a)*(120+Math.random()*260),vy:Math.sin(a)*(80+Math.random()*120)-200,rot:Math.random()*TAU,vr:(Math.random()-0.5)*10,s:6+Math.random()*12});}
  }
  drawShards(g,now){
    for(const p of this.shards){
      const t=(now-p.t0)/1000,a=1-clamp01(t/0.9);if(a<=0)continue;
      g.save();g.translate(p.x+p.vx*t,p.y+p.vy*t+420*t*t);g.rotate(p.rot+p.vr*t);g.globalAlpha=a;
      g.beginPath();g.moveTo(0,-p.s);g.lineTo(p.s*0.7,p.s*0.5);g.lineTo(-p.s*0.6,p.s*0.6);g.closePath();
      g.fillStyle='rgba(225,245,255,.85)';g.fill();g.strokeStyle='rgba(255,255,255,.95)';g.lineWidth=1;g.stroke();g.restore();
    }
  }
  // 龙卷风整根画在 2D 层，按前后分层：后半圈风线 → 后面的叶子 → 漏斗身 → 前面的叶子 → 前半圈风线。
  // 卷起的叶子若画在 WebGL 里会和下面的叶堆混成一片，看不出是飞起来的。
  drawFunnel(g,t,now){
    const e=t.e;if(now<e.t0)return;
    const life=clamp01((now-e.t0)/Math.max(1,e.t1-e.t0)),env=Math.min(1,life/0.08,(1-life)/0.08+0.02),[x,y]=this.funnelAt(t,now);
    const base=this.cam.project([x,y,0]),top=this.cam.project([x,y,FUNNEL_H]),hgt=base.y-top.y,wb=e.radius*0.2*base.scale,wt=e.radius*1.25*base.scale;
    const ring=k=>{const rx=wb+(wt-wb)*k*k;return{x:base.x+(top.x-base.x)*k+Math.sin(now*0.004+k*5)*12*k,y:base.y-hgt*k,rx,ry:rx*0.3};};
    const items=t.orbit.map(o=>{const p=this.orbitPose(t,o,now),s=this.cam.project([p.x,p.y,p.z]);return{o,p,s,back:Math.sin(p.ang)>0};}).sort((a,b)=>a.s.depth-b.s.depth);
    g.save();g.globalAlpha=env;
    const sh=g.createRadialGradient(base.x,base.y,0,base.x,base.y,wb*3.2);sh.addColorStop(0,'rgba(60,40,24,.35)');sh.addColorStop(1,'rgba(60,40,24,0)');
    g.fillStyle=sh;g.beginPath();g.ellipse(base.x,base.y,wb*3.2,wb*1.1,0,0,TAU);g.fill();
    this.funnelRings(g,ring,now,true);
    for(const it of items)if(it.back)this.orbitLeaf(g,it,0.75);
    g.beginPath();g.moveTo(base.x-wb,base.y);g.quadraticCurveTo(base.x-wb*1.4,top.y+hgt*0.45,top.x-wt,top.y);
    g.ellipse(top.x,top.y,wt,wt*0.3,0,Math.PI,0,true);g.quadraticCurveTo(base.x+wb*1.4,top.y+hgt*0.45,base.x+wb,base.y);g.closePath();
    const body=g.createLinearGradient(top.x-wt,0,top.x+wt,0);
    body.addColorStop(0,'rgba(104,80,58,.46)');body.addColorStop(0.3,'rgba(206,188,160,.26)');body.addColorStop(0.5,'rgba(244,236,218,.18)');body.addColorStop(0.7,'rgba(206,188,160,.26)');body.addColorStop(1,'rgba(104,80,58,.46)');
    g.fillStyle=body;g.fill();
    const fade=g.createLinearGradient(0,top.y,0,base.y);fade.addColorStop(0,'rgba(150,120,90,0)');fade.addColorStop(1,'rgba(120,92,66,.28)');g.fillStyle=fade;g.fill();
    for(const it of items)if(!it.back)this.orbitLeaf(g,it,1);
    this.funnelRings(g,ring,now,false);
    g.restore();
  }
  funnelRings(g,ring,now,back){
    g.lineCap='round';
    for(let i=0;i<14;i++){
      const k=i/13,r=ring(k),a0=back?Math.PI:0,dash=Math.max(6,r.rx*0.55);
      g.setLineDash([dash,dash*0.6]);g.lineDashOffset=-now*0.28*(1.6-k)-i*13;
      g.beginPath();g.ellipse(r.x,r.y,r.rx,r.ry,0,a0,a0+Math.PI);
      g.strokeStyle=`rgba(70,50,32,${back?0.18:0.32})`;g.lineWidth=(back?2.4:3.6)-1.2*k;g.stroke();
      g.strokeStyle=`rgba(255,250,238,${back?0.35:0.9-0.3*k})`;g.lineWidth=(back?1.2:2)-0.6*k;g.stroke();
    }
    g.setLineDash([]);
    // 地面打转的碎屑
    for(let i=0;i<24;i++){
      const r=ring(0),a=hash(i*4.7)*TAU+now*0.007*(1+hash(i)),d=1.3+hash(i*2.9)*1.8,s=Math.sin(a);if((s<0)!==back)continue;
      g.fillStyle=back?'rgba(120,90,60,.35)':'rgba(120,90,60,.7)';g.beginPath();g.arc(r.x+Math.cos(a)*r.rx*d,r.y+s*r.ry*d-hash(i*8.1)*18,1.6+hash(i*3.3)*2,0,TAU);g.fill();
    }
  }
  orbitLeaf(g,it,light){
    const uv=this.uvs[it.o.leaf.type];if(!this.sheet||!uv)return;
    const S=this.sheet,sx=uv[0]*S.width,sy=uv[3]*S.height,sw=(uv[2]-uv[0])*S.width,shh=(uv[1]-uv[3])*S.height,z=it.p.size*it.s.scale;
    g.save();g.translate(it.s.x,it.s.y);g.rotate(it.p.yaw);g.scale(1,0.25+0.75*Math.abs(Math.cos(it.p.flip)));
    if(light<1)g.globalAlpha*=light;
    g.drawImage(S,sx,sy,sw,shh,-z/2,-z/2,z,z);g.restore();
  }
  drawWave(g,w,now,pile){
    if(now<w.t0)return;
    const life=clamp01((now-w.t0)/Math.max(1,w.t1-w.t0)),env=Math.sin(Math.PI*life),c=this.cam.project([w.center.x,w.center.y,pile?pile.heightAt(w.center.x,w.center.y):0]);
    g.save();g.lineCap='round';g.lineJoin='round';
    for(let i=0;i<12;i++){
      const o=hash(i*3.1+w.seed),y0=c.y-140+hash(i*7.3+w.seed)*240,len=150+hash(i*5.7)*170,ph=(life*1.25+o)%1,head=c.x+w.dir*(-760+1520*ph);
      g.beginPath();for(let s=0;s<=10;s++){const q=s/10,px=head-w.dir*len*q,py=y0+Math.sin(q*TAU+now*0.008+i)*7;s?g.lineTo(px,py):g.moveTo(px,py);}
      g.strokeStyle=`rgba(${w.color},${0.55*env})`;g.lineWidth=2.6;g.stroke();
    }
    g.restore();
  }
  drawPop(g,e,now){
    if(now<e.t1)return;const k=clamp01((now-e.t1)/420);if(k>=1)return;
    const m=this.cam.project(this.mouth());
    g.save();g.globalAlpha=1-k;g.strokeStyle='rgba(255,236,190,.95)';g.lineWidth=4*(1-k)+1;g.beginPath();g.arc(m.x,m.y,30+110*k,0,TAU);g.stroke();
    g.font='900 34px '+FONT;g.textAlign='center';g.textBaseline='middle';g.lineWidth=6;g.strokeStyle='rgba(91,58,36,.85)';g.fillStyle='#ffd36b';
    g.strokeText('砰！',m.x+40,m.y-60-30*k);g.fillText('砰！',m.x+40,m.y-60-30*k);g.restore();
  }
  drawQuick(g,q,now){
    const {x,y}=this.pointer,rem=clamp01((q.until-now)/Math.max(1,q.until-this.quickStart));
    g.save();g.lineCap='round';g.lineWidth=4;g.strokeStyle='rgba(255,214,102,.35)';g.beginPath();g.arc(x,y,24,0,TAU);g.stroke();
    g.strokeStyle='rgba(255,192,56,.95)';g.shadowColor='rgba(255,190,60,.85)';g.shadowBlur=10;g.beginPath();g.arc(x,y,24,-Math.PI/2,-Math.PI/2+TAU*rem);g.stroke();
    for(const r of this.rings){const k=clamp01((now-r.t0)/420);g.globalAlpha=1-k;g.lineWidth=3;g.beginPath();g.arc(x,y,24+30*k,0,TAU);g.stroke();}
    g.globalAlpha=1;g.shadowBlur=0;g.font='800 13px '+FONT;g.textAlign='center';g.textBaseline='middle';g.lineWidth=4;g.strokeStyle='rgba(255,248,236,.95)';g.fillStyle='#8a4b00';
    g.strokeText('连捡 ×'+q.layers,x,y+42);g.fillText('连捡 ×'+q.layers,x,y+42);g.restore();
  }
  drawTexts(g,now){
    for(const s of this.texts){
      const k=clamp01((now-s.t0)/1600),a=k<0.15?k/0.15:1-clamp01((k-0.6)/0.4),y=170-40*smooth(k),sc=1+0.25*Math.max(0,1-k/0.15);
      g.save();g.globalAlpha=a;g.translate(720,y);g.scale(sc,sc);g.font='900 40px '+FONT;g.textAlign='center';g.textBaseline='middle';
      g.lineWidth=7;g.strokeStyle='rgba(91,58,36,.85)';g.fillStyle='#ffe08a';g.strokeText('⏱ '+s.text,0,0);g.fillText('⏱ '+s.text,0,0);g.restore();
    }
  }
}
return{Fx,shadowTexture,pathAt,pathLength,FLY_MS};
});
