import ASSETS, { META } from '../assets/inline.mjs';
import {clamp,faceClip,waitingSlots,KIND_NAMES,NOMINAL,itemSize,insidePolygon,avoidFaceRect} from './layout.js';
import {safeName} from './text.js';

const aliases={case_lid:'lid',case_handle:'handle',case_wheel:'wheel',case_wheel_mount:'wheel_mount',case_lining_tile:'lining_tile'};
const images={}, profiles=new Map();
const keyOf=k=>ASSETS[k]?k:(aliases[k]&&ASSETS[aliases[k]]?aliases[k]:k);
export async function loadImages(){
  await Promise.all(Object.entries(ASSETS).map(([k,src])=>new Promise(resolve=>{const i=new Image();i.onload=()=>{images[k]=i;resolve();};i.onerror=()=>resolve();i.src=src;})));
}
export function imageOf(k){return images[keyOf(k)];}
export function assetFor(item){
  if(item.asset)return item.asset;
  return {pillow:'pillow_pink',jacket:'jacket_yellow',bread:'baguette',pan:'pan',bear:'bear',cat:'cat_sleep'}[item.kind];
}
export function sprite(g,key,x,y,w,h,angle=0){
  const im=imageOf(key);g.save();g.translate(x,y);g.rotate(angle);
  if(im)g.drawImage(im,-w/2,-h/2,w,h);
  else {g.fillStyle='#b8bbb9';g.fillRect(-w/2,-h/2,w,h);}
  g.restore();
}
function itemSprite(g,item,x,y,w,h,angle=0){
  sprite(g,assetFor(item),x,y,w,h,angle);
  if(item.kind==='pillow')sprite(g,'pillow_face_happy',x,y,w*140/240,h*70/150,angle);
  if(item.kind==='bear')sprite(g,'bear_face_happy',x,y-h*.22,w*120/260,h*80/300,angle);
}
// 旋转后的不透明像素决定每列的真实高度，不使用面积代理。
export function profileFor(item,angle=0){
  const quant=Math.round(clamp(angle,-90,90)/15)*15, key=assetFor(item)+':'+quant;
  if(profiles.has(key))return profiles.get(key);
  const im=imageOf(assetFor(item)), dims=item.broken?itemSize(item):(META[keyOf(assetFor(item))]?.display||NOMINAL[item.kind]);
  const [w,h]=dims, r=quant*Math.PI/180, bw=Math.ceil(Math.abs(w*Math.cos(r))+Math.abs(h*Math.sin(r))), bh=Math.ceil(Math.abs(w*Math.sin(r))+Math.abs(h*Math.cos(r)));
  const canvas=document.createElement('canvas');canvas.width=bw;canvas.height=bh;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.translate(bw/2,bh/2);c.rotate(r);
  if(im)c.drawImage(im,-w/2,-h/2,w,h);else {c.fillStyle='#bbb';c.fillRect(-w/2,-h/2,w,h);}
  const px=c.getImageData(0,0,bw,bh).data,top=[],bottom=[],height=[];
  for(let x=0;x<bw;x++){let a=bh,b=-1;for(let y=0;y<bh;y++)if(px[(y*bw+x)*4+3]>32){a=Math.min(a,y);b=y;}
    // 以共同基线计占高，保留斜放硬物下方空隙，不能逐列落地摆平。
    top[x]=a;bottom[x]=b+1;height[x]=b>=a?bh-a:0;}
  const p={canvas,width:bw,height:bh,top,bottom,heights:height,angle:quant};profiles.set(key,p);return p;
}
export function placeProfile(item,center,L,angle=0){
  const p=profileFor(item,angle), x=clamp(center-p.width/2,L.x,L.x+L.L-p.width), heights=Array(32).fill(0);
  for(let c=0;c<32;c++){
    const a=Math.max(0,Math.floor(L.x+c*L.colWidth-x)),b=Math.min(p.width,Math.ceil(L.x+(c+1)*L.colWidth-x));
    if(b>a){let sum=0;for(let j=a;j<b;j++)sum+=p.heights[j];heights[c]=sum/(b-a);}
  }
  return {x,width:p.width,profile:p,heights,angle:p.angle};
}
function pill(g,text,x,y,{color='#4a3426',fill='#fff7e5',size=20}={}){
  g.font=`700 ${size}px "Microsoft YaHei",sans-serif`;const w=g.measureText(text).width+30,h=size+17;
  g.fillStyle=fill;g.strokeStyle=color;g.lineWidth=3;g.beginPath();g.roundRect(x-w/2,y-h/2,w,h,h/2);g.fill();g.stroke();g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';g.fillText(text,x,y);
  return {x:x-w/2,y:y-h/2,w,h,text};
}
function safePill(g,L,text,x,y,options={}){
  const size=options.size||20;g.font=`700 ${size}px "Microsoft YaHei",sans-serif`;
  const w=g.measureText(text).width+30,h=size+17,r=avoidFaceRect(L,x,y,w,h),scale=r.scale||1;
  g.save();g.translate(r.x,r.y);g.scale(scale,scale);pill(g,text,w/2,h/2,options);g.restore();
  return {...r,text};
}
export function makeRenderer(canvas){
  const g=canvas.getContext('2d'),hit={waiting:[],packed:[],labels:[],helpers:[],straps:[],cats:[]};let renders=0,waitCache=null,waitKey='';
  function draw(vm){
    const {L,state:s}=vm,dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(L.W*L.u*dpr)||canvas.height!==Math.round(L.H*L.u*dpr)){canvas.width=Math.round(L.W*L.u*dpr);canvas.height=Math.round(L.H*L.u*dpr);}
    g.setTransform(dpr*L.u,0,0,dpr*L.u,0,0);g.clearRect(0,0,L.W,L.H);renders++;
    Object.keys(hit).forEach(k=>hit[k]=[]);
    g.save();faceClip(g,L);
    const slots=waitingSlots(vm.waiting,L);hit.waiting=slots;
    const cacheKey=vm.waiting.map(i=>i.id).join('|')+':'+L.W+':'+L.H+':'+L.L;
    if(cacheKey!==waitKey){
      waitKey=cacheKey;waitCache=document.createElement('canvas');waitCache.width=Math.ceil(L.W);waitCache.height=Math.ceil(L.H);const q=waitCache.getContext('2d');
      for(const v of slots)itemSprite(q,v.item,v.x,v.y,v.w,v.h);
    }
    g.drawImage(waitCache,0,0);
    const hiddenWaiting=slots.filter(v=>{const x=v.x-v.w/2,y=v.y-v.h/2;return x+v.w<0||x>L.W||y+v.h<0||y>L.H||[[x,y],[x+v.w,y],[x,y+v.h],[x+v.w,y+v.h]].every(p=>insidePolygon(...p,L.face));}).length;
    if(hiddenWaiting)pill(g,'还有 '+hiddenWaiting+' 件没地方放',L.W/2,L.H-20,{size:15,fill:'#fff8e5'});
    for(const v of slots.slice(-6)){
      const tag=pill(g,safeName(v.item.owner.name)+'的'+KIND_NAMES[v.item.kind],v.x,v.y-v.h/2-16,{size:17});hit.labels.push({...tag,item:v.item});
    }
    // 待装区已缓存。箱子始终在它前面。
    const tx=vm.shipping?easeShipping(vm.shipping,vm.now,L.W):0;
    g.save();g.translate(tx,0);
    const gap=c=>{const f=clamp(c,0,31),a=Math.floor(f),b=Math.min(31,a+1);return (s.gap[a]||0)*(1-(f-a))+(s.gap[b]||0)*(f-a);};
    const lift=c=>vm.openAmount*(c>=s.zipCol?(c/32)*105:0);
    const lidY=c=>L.seam-gap(c)-lift(c);
    const maxGap=Math.max(...s.gap,0)+vm.openAmount*105;
    const lining=imageOf('case_lining_tile');
    if(lining&&maxGap>0){g.save();g.beginPath();g.moveTo(L.x,L.seam);for(let c=0;c<=64;c++)g.lineTo(L.x+c*L.L/64,lidY(c/2));g.lineTo(L.x+L.L,L.seam);g.closePath();g.clip();for(let x=L.x;x<L.x+L.L;x+=256)g.drawImage(lining,x,L.seam-maxGap,256,maxGap+20);g.restore();}
    const stack=Array(32).fill(0), outlines=new Map();
    for(const item of s.items){
      const v=vm.visuals.get(item.id);if(!v)continue;
      if(item.cat&&['lid','waiting'].includes(item.cat.phase))continue;
      const p=v.profile, points=[],bottoms=[];let minY=Infinity,maxY=-Infinity;
      for(let c=0;c<32;c++){
        const hh=item.heights[c];if(hh<=0)continue;
        const q=item.q[c],h=hh*q*item.volumeScale*(item.cat?.phase==='head'?1.6:1),xx=L.x+c*L.colWidth,bot=L.floor-stack[c],top=bot-h;
        let a=clamp(xx-v.x,0,p.width),b=clamp(xx+L.colWidth-v.x,0,p.width);
        const sy=sample(p.top,(a+b)/2), sh=Math.max(1,p.height-sy),sx=1/Math.sqrt(Math.max(.25,q));
        const opaqueBottom=top+h*(sample(p.bottom,(a+b)/2)-sy)/sh;
        if(b>a)g.drawImage(p.canvas,a,sy,b-a,sh,xx-(sx-1)*L.colWidth/2,top,L.colWidth*sx+.8,h);
        stack[c]+=h;points.push([xx,top],[xx+L.colWidth,top]);bottoms.unshift([xx+L.colWidth,opaqueBottom],[xx,opaqueBottom]);minY=Math.min(minY,top);maxY=Math.max(maxY,opaqueBottom);
        const exposedTop=Math.max(top,lidY(c)+3),exposedBottom=Math.min(opaqueBottom,L.seam-3);
        if(exposedBottom>exposedTop)hit.packed.push({item,x:xx,y:exposedTop,w:L.colWidth,h:exposedBottom-exposedTop});
      }
      outlines.set(item.id,{points:[...points,...bottoms],minY,maxY,v,item});
      if(points.length&&(item.kind==='pillow'||item.kind==='bear')){
        const active=item.q.filter((_,c)=>item.heights[c]>0),q=active.reduce((a,b)=>a+b,0)/(active.length||1);
        const face=item.kind==='bear'?'bear_face_':'pillow_face_',mood=q<.85?'squish':(item.volumeScale>1.1?'puff':'happy');
        const fw=item.kind==='bear'?120:140,fh=item.kind==='bear'?80:70;
        sprite(g,face+mood,v.x+v.width/2,minY+(maxY-minY)*(item.kind==='bear'?.27:.53),fw,fh*Math.min(1.2,q));
      }
    }
    for(const dx of [60,L.L-60]){sprite(g,'case_wheel_mount',L.x+dx,L.seam+L.baseHeight+2,70,34);sprite(g,'case_wheel',L.x+dx,L.seam+L.baseHeight+25,50,50,tx/25);}
    sprite(g,'case_base',L.x+L.L/2,L.seam+L.baseHeight/2,L.L,L.baseHeight);
    sprite(g,'case_handle',L.x+L.L+7,L.seam+L.baseHeight/2,40,70);
    const lid=imageOf('case_lid');
    for(let c=0;c<64;c++){
      const x=L.x+c*L.L/64, y=lidY(c/2),sw=lid?lid.width/64:1;
      if(lid){const width=L.L/64,slope=(lidY((c+1)/2)-y)/width;g.save();g.transform(1,slope,0,1,x,y);g.drawImage(lid,c*sw,0,sw+.5,lid.height,0,-108,width+.8,108);g.restore();}
      else {g.fillStyle='#aaa';g.fillRect(x,y-108,L.L/64+1,108);}
    }
    for(const strap of s.straps){const x=L.x+(strap.col+.5)*L.colWidth,y=lidY(strap.col)-108;
      g.fillStyle='#e99c3f';g.strokeStyle='#59392a';g.lineWidth=3;g.beginPath();g.roundRect(x-18,y,36,L.seam+L.baseHeight-15-y,12);g.fill();g.stroke();g.strokeStyle='#ffe6b0';g.lineWidth=3;g.strokeRect(x-11,y+6,22,L.seam+L.baseHeight-27-y);
      g.fillStyle='#f7d468';g.fillRect(x-25,L.seam+23,50,31);g.strokeStyle='#5b3d26';g.strokeRect(x-25,L.seam+23,50,31);
      hit.straps.push({id:strap.id,x:x-22,y,w:44,h:L.seam+L.baseHeight-10-y});
    }
    for(const helper of s.helpers){const x=L.x+(helper.col+.5)*L.colWidth,y=lidY(helper.col)-108;
      const key=vm.drag?.id===helper.id?'helper_lifted':'helper_sit_push',meta=META[keyOf(key)],seat=meta?.anchors?.seat||[130,308],size=meta?.size||[260,340],top=y-seat[1]/size[1]*170;
      sprite(g,key,x,top+85,130,170);
      const av=meta?.anchors?.avatarCenter||[130,54],ax=x-65+av[0]/size[0]*130,ay=top+av[1]/size[1]*170;
      g.fillStyle='#e9f5d9';g.strokeStyle='#366c45';g.lineWidth=2;g.beginPath();g.arc(ax,ay,11,0,Math.PI*2);g.fill();g.stroke();g.fillStyle='#366c45';g.font='bold 13px "Microsoft YaHei"';g.textAlign='center';g.textBaseline='middle';g.fillText(safeName(helper.owner?.name||'阿桃')[0],ax,ay);
      hit.helpers.push({id:helper.id,x:x-65,y:y-160,w:130,h:170});
      const tag=pill(g,safeName(helper.owner?.name||'阿桃')+' 帮忙按住',x,y-180,{fill:'#e0f6df',color:'#327855',size:18});hit.labels.push({...tag,item:{owner:helper.owner,kind:'helper'}});
    }
    // 上下两排牙随接缝开合，咬住的一段保持在箱沿。
    for(let n=0;n<=Math.floor(L.L/10);n++){
      const x=L.x+n*10,c=(x-L.x)/L.colWidth,closed=c<s.zipCol;
      g.fillStyle='#f4c542';g.strokeStyle='#795626';g.lineWidth=1.5;
      const dy=closed?0:lidY(c)-L.seam;g.fillRect(x-3,L.seam-4,6,8);g.strokeRect(x-3,L.seam-4,6,8);
      if(!closed){g.fillRect(x-3,L.seam+dy-5,6,8);g.strokeRect(x-3,L.seam+dy-5,6,8);}
    }
    const zx=L.x+s.z*L.L,zy=L.seam-gap(Math.min(s.zipCol,31))*.2;
    const shake=s.blockedCol!=null&&vm.drag?.kind==='zip'?Math.sin(vm.now*48)*3:0;
    sprite(g,'zip_slider',zx+shake,zy,50,36);sprite(g,'zip_pull',zx+13+shake,zy+39,28,58,Math.sin(vm.now*12)*vm.pullSwing*.25);
    hit.zip={x:zx-30,y:zy-22,w:65,h:88};
    for(const item of s.items){
      if(item.kind==='jacket'&&outlines.has(item.id)){
        const o=outlines.get(item.id),x=clamp(o.v.x+o.v.width*.82,L.x+30,L.x+L.L-30),c=(x-L.x)/L.colWidth;
        if(gap(c)>10)sprite(g,(assetFor(item).replace('jacket_','jacket_sleeve_')),x,L.seam+30,150,50,Math.PI/2-.12);
      }
      if(item.kind==='cat'){
        const mode=item.cat?.mode||item.cat?.state||item.cat?.phase;
        const v=vm.visuals.get(item.id);if(!v)continue;const cx=v.x+v.width/2,col=clamp(Math.floor((cx-L.x)/L.colWidth),0,31);
        if(mode==='peek'||mode==='awake'||mode==='peeking'||mode==='head'){sprite(g,'cat_peek',cx,L.seam-60,130,130);hit.cats.push({id:item.id,x:cx-65,y:L.seam-125,w:130,h:130});}
        if(mode==='lid'||mode==='sitting'||mode==='onLid')sprite(g,'cat_sit',cx,lidY(col)-180,130,150);
        if(mode==='tail'||mode==='ear')sprite(g,'cat_tail',cx+65,lidY(col)-13,70,30,Math.sin(vm.now*18)*.35);
      }
    }
    if(vm.drag?.kind==='item'){
      const d=vm.drag,p=profileFor(d.item,d.angle),inBox=vm.overBox;
      if(inBox){g.save();g.globalAlpha=.45;g.setLineDash([10,7]);g.lineWidth=3;g.strokeStyle='#fff';const v=placeProfile(d.item,d.x,L,d.angle);g.strokeRect(v.x,L.seam-p.height,v.width,p.height);g.restore();}
    }
    if(s.culpritId&&outlines.has(s.culpritId)){
      const o=outlines.get(s.culpritId);g.save();g.strokeStyle='#ef5869';g.lineWidth=6;g.setLineDash([12,8]);g.beginPath();o.points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.stroke();g.restore();
      const msg=(s.burstUntil>s.time?'嘣！':'卡住了！')+safeName(o.item.owner.name)+'的'+KIND_NAMES[o.item.kind]+(o.item.broken?'（断了）':'');
      const tag=safePill(g,{...L,face:L.face.map(p=>[p[0]-tx,p[1]])},msg,clamp(o.v.x+o.v.width/2,L.x+160,L.x+L.L-160),Math.min(o.minY,L.seam-maxGap-108)-32,{color:'#d94356',fill:'#fff2e5',size:23});hit.labels.push({...tag,x:tag.x+tx,item:o.item});
    }
    if(vm.shipping){pill(g,'啪！第 '+vm.sent+' 箱寄出',L.x+L.L/2,L.seam-145,{color:'#d25442',size:28});}
    g.restore();
    if(vm.drag?.kind==='item'){
      const d=vm.drag,[w,h]=itemSize(d.item),r=d.angle*Math.PI/180;
      g.save();g.translate(d.x,d.y);g.rotate(r);itemSprite(g,d.item,-d.grabX,-d.grabY,w,h);g.restore();
      pill(g,safeName(d.item.owner.name)+'的'+KIND_NAMES[d.item.kind],d.x,d.y-100,{size:19});
    }
    if(vm.hand.visible&&vm.handStyle!=='none'){
      const h=vm.hand,pressed=vm.drag?.kind==='press',grabbing=!!vm.drag&&!pressed,key=(vm.handStyle==='glove'?'glove_':'paw_')+(pressed?'press':grabbing?'grab':'open');
      g.save();g.globalAlpha=h.alpha;const shake=pressed&&vm.now-h.downAt>3?Math.sin(vm.now*65)*3:0;
      const meta=META[keyOf(key)],anchor=meta?.anchors?.[pressed?'contact':grabbing?'grip':'contact']||[150,508],size=meta?.size||[300,520],ax=anchor[0]/size[0]*150,ay=anchor[1]/size[1]*260;
      g.translate(h.x,h.y);g.rotate(.3+shake*.01);const handImage=imageOf(key);if(handImage)g.drawImage(handImage,-ax,-ay,150,260);g.restore();
      if(pressed){g.strokeStyle='#6c5344';g.lineWidth=3;for(let n=0;n<3;n++){g.beginPath();g.moveTo(h.x-28-n*13,h.y-12-n*11);g.lineTo(h.x-35-n*15,h.y-22-n*15);g.stroke();}}
    }
    if(vm.card&&vm.now<vm.card.until){
      const name=safeName(vm.card.owner.name);g.font='700 28px "Microsoft YaHei"';const nameWidth=g.measureText(name).width+64;
      g.font='21px "Microsoft YaHei"';const w=Math.min(L.W-24,Math.max(330,nameWidth,g.measureText(vm.card.message).width+44)),h=150,r=avoidFaceRect(L,190,110,w,h),scale=r.scale||1;
      g.save();g.translate(r.x,r.y);g.scale(scale,scale);g.fillStyle='#fff8e8';g.strokeStyle='#755445';g.lineWidth=4;g.beginPath();g.roundRect(0,0,w,h,24);g.fill();g.stroke();pill(g,name,w/2,50,{size:28});g.fillStyle='#5a473c';g.font='21px "Microsoft YaHei"';g.textAlign='center';g.fillText(vm.card.message,w/2,110);g.restore();
    }
    if(vm.editFace){g.strokeStyle='#ed678a';g.setLineDash([10,5]);g.lineWidth=3;g.beginPath();L.face.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.stroke();g.setLineDash([]);for(const p of L.face){g.fillStyle='#fff';g.beginPath();g.arc(...p,10,0,7);g.fill();g.stroke();}}
    g.restore();
    return hit;
  }
  return {draw,hit,renders:()=>renders};
}
const sample=(arr,x)=>arr[clamp(Math.floor(x),0,arr.length-1)]||0;
function easeShipping(start,now,width){const t=now-start;if(t<.25)return 0;if(t<1)return Math.pow((t-.25)/.75,2)*width*1.4;return -Math.pow(1-clamp((t-1)/.5,0,1),2)*width*1.4;}
