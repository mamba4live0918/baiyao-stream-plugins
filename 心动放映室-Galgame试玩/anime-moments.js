// Small, attached anime gestures. Host owns the transparent canvas and frame loop.
(()=>{'use strict';
  const DURATION_MS=Object.freeze({blush:2200,sparkle:1500,question:1700,heartbeat:1800,headpat:2300});
  const ASSET_KEYS=Object.freeze({blush:'momentBlush',question:'momentQuestion',heartbeat:'heartMua',headpat:'momentHand'});
  const POINT_NAMES=Object.freeze({blush:['cheekL','cheekR'],sparkle:['cheekL','cheekR'],question:['headTop'],heartbeat:['chest'],headpat:['headTop']});
  const DEFAULT_POINTS={headTop:{x:.5,y:.2},mouth:{x:.5,y:.4},cheekL:{x:.44,y:.38},cheekR:{x:.56,y:.38},chest:{x:.5,y:.68}};
  const MAX_ACTIVE=5,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),number=(v,f)=>typeof v==='number'&&Number.isFinite(v)?v:f,smooth=t=>t*t*(3-2*t);
  function create(options={}){
    let moments=[],lastNow=0,serial=0;const cache=new Map();
    const viewport=()=>{const v=options.viewport?.()||{};return {width:Math.max(1,number(v.width,1280)),height:Math.max(1,number(v.height,720))};};
    const current=job=>options.isCurrent?.(job)!==false;
    const art=key=>{try{return options.art?.(key)||null;}catch{return null;}};
    const ready=a=>a&&a.complete!==false&&number(a.naturalWidth,number(a.width,0))>0&&number(a.naturalHeight,number(a.height,0))>0;
    function texture(key){
      const source=art(key);if(!ready(source))return null;
      const old=cache.get(key);if(old?.source===source)return old.image;
      const width=number(source.naturalWidth,source.width),height=number(source.naturalHeight,source.height),ratio=Math.min(1,512/Math.max(width,height));let image=source;
      try{
        const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));let canvas;
        if(typeof globalThis.OffscreenCanvas==='function')canvas=new globalThis.OffscreenCanvas(w,h);
        else if(globalThis.document?.createElement){canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;}
        const ctx=canvas?.getContext('2d');if(ctx){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,width,height,0,0,w,h);image=canvas;}
      }catch{/* A decoded original PNG is also a valid reusable texture. */}
      cache.set(key,{source,image});return image;
    }
    function prepareTextures(){for(const key of Object.values(ASSET_KEYS))texture(key);return {cachedTextures:cache.size,assetStates:Object.fromEntries(Object.values(ASSET_KEYS).map(key=>[key,ready(art(key))?'ready':'unavailable']))};}
    function point(job,name){
      const p=options.resolvePoint?.(job,name)||job.pointFallbacks?.[name]||job.point||DEFAULT_POINTS[name]||DEFAULT_POINTS.mouth;
      return {x:clamp(number(p.x,.5),0,1),y:clamp(number(p.y,.4),0,1),angle:clamp(number(p.angle,0),-30,30),scale:clamp(number(p.scale,1),.65,1.4)};
    }
    function update(now=lastNow){
      lastNow=number(now,lastNow);moments=moments.filter(m=>current(m.job)&&lastNow<m.startAt+m.durationMs);
      for(const m of moments){m.elapsed=lastNow-m.startAt;m.progress=clamp(m.elapsed/m.durationMs,0,1);m.phase=m.elapsed<0?'pending':m.elapsed<160?'arrive':m.elapsed>m.durationMs-300?'fade':'hold';m.points=Object.fromEntries(POINT_NAMES[m.moment].map(name=>[name,point(m.job,name)]));}
      return active();
    }
    function enqueue(job={},now=lastNow){
      if(!Object.hasOwn(DURATION_MS,job.moment)||!current(job))return false;
      const startAt=number(now,lastNow);moments=moments.filter(m=>m.moment!==job.moment);if(moments.length>=MAX_ACTIVE)moments.shift();
      moments.push({id:++serial,job,moment:job.moment,planId:job._heartPlanId??job.planId??null,startAt,durationMs:DURATION_MS[job.moment],points:{},elapsed:0,progress:0,phase:'pending'});update(lastNow);return true;
    }
    const opacity=m=>smooth(clamp(m.elapsed/160,0,1))*smooth(clamp((m.durationMs-m.elapsed)/300,0,1));
    const size=(m,p,base,unit,w,h)=>Math.min(unit*base/720*clamp(number(m.job.size,1)*p.scale,.65,1.4),w*.28,h*.28);
    function centre(x,y,s,w,h){const radius=Math.min(s*.73,Math.min(w,h)/2);return {x:clamp(x,radius,w-radius),y:clamp(y,radius,h-radius)};}
    function sprite(c,image,x,y,s,alpha,angle=0,mirror=false){
      if(alpha<=0||s<=0)return;c.save();c.globalAlpha=clamp(alpha,0,1);c.globalCompositeOperation='source-over';c.translate(x,y);c.rotate(angle);if(mirror)c.scale(-1,1);c.drawImage(image,-s/2,-s/2,s,s);c.restore();
    }
    function star(c,x,y,r,alpha,color){
      c.save();c.globalAlpha=clamp(alpha,0,1);c.globalCompositeOperation='source-over';c.fillStyle=color;c.beginPath();
      for(let i=0;i<8;i++){const a=-Math.PI/2+i*Math.PI/4,rad=i%2?r*.25:r,px=x+Math.cos(a)*rad,py=y+Math.sin(a)*rad;if(i)c.lineTo(px,py);else c.moveTo(px,py);}
      c.closePath();c.fill();c.restore();
    }
    function draw(c,now=lastNow){
      update(now);const {width:w,height:h}=viewport(),unit=Math.min(w,h),u=unit/720;
      for(const m of moments){
        if(m.elapsed<0)continue;const alpha=opacity(m);if(alpha<=0)continue;
        const image=ASSET_KEYS[m.moment]?texture(ASSET_KEYS[m.moment]):null;if(m.moment!=='sparkle'&&!image)continue;
        if(m.moment==='blush'){
          for(const [i,name] of POINT_NAMES.blush.entries()){const p=m.points[name],s=size(m,p,64,unit,w,h),at=centre(p.x*w,p.y*h,s,w,h),pulse=.91+.09*Math.sin(m.elapsed/340);sprite(c,image,at.x,at.y,s,alpha*.55*pulse,p.angle*Math.PI/180,i===1);}
        }else if(m.moment==='sparkle'){
          for(const [side,name] of POINT_NAMES.sparkle.entries())for(let i=0;i<2;i++){
            const p=m.points[name],pulse=.55+.45*Math.sin(m.elapsed/180+side*1.3+i*2.1)**2,r=(i?3.1:5.4)*u*clamp(number(m.job.size,1),.65,1.4)*(.7+.3*pulse),at=centre(p.x*w+(i?9:-7)*u,p.y*h-(24+(i?8:0))*u,r*2,w,h);star(c,at.x,at.y,r,alpha*.85*pulse,i?'#f6cbd8':'#fff1b5');
          }
        }else if(m.moment==='question'){
          const p=m.points.headTop,s=size(m,p,46,unit,w,h),bounce=Math.abs(Math.sin(m.elapsed/145))*7*u*Math.exp(-m.elapsed/850),base=centre(p.x*w+40*u,p.y*h-10*u,s,w,h),at=centre(base.x,base.y+bounce,s,w,h);sprite(c,image,at.x,at.y,s,alpha*.95,Math.sin(m.elapsed/220)*.12);
        }else if(m.moment==='heartbeat'){
          const p=m.points.chest,cycle=m.elapsed%850,thump=Math.exp(-(((cycle-120)/65)**2))+.72*Math.exp(-(((cycle-300)/70)**2)),s=size(m,p,42,unit,w,h)*(1+.14*thump),at=centre(p.x*w,p.y*h,s,w,h);sprite(c,image,at.x,at.y,s,alpha*.90);
          c.save();c.globalAlpha=alpha*(.20+.22*Math.min(1,thump));c.strokeStyle='#d97999';c.lineWidth=Math.max(.5,1.3*u);c.lineCap='round';
          for(let i=0;i<3;i++){const side=i===1?-1:1,x=clamp(at.x+side*s*(.49+i*.08),2,w-2),y=clamp(at.y+s*(i===2?.23:-.16),2,h-2),endX=clamp(x+side*6*u,2,w-2);c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(clamp(x+side*5*u,2,w-2),clamp(y-4*u,2,h-2),endX,clamp(y+4*u,2,h-2));c.stroke();}c.restore();
        }else{
          const p=m.points.headTop,arrival=1-smooth(clamp(m.elapsed/360,0,1)),pat=t=>t>=0&&t<=360?Math.sin(t/360*Math.PI):0,touch=pat(m.elapsed-550)+pat(m.elapsed-1200),s=size(m,p,110,unit,w,h),base=centre(p.x*w+(18+85*arrival)*u,p.y*h+(-29-12*arrival)*u,s,w,h),at=centre(base.x,base.y+9*touch*u,s,w,h);sprite(c,image,at.x,at.y,s,alpha*.95,-.06+.05*touch);
          c.save();c.globalAlpha=alpha*(.14+.25*touch);c.strokeStyle='#edbd85';c.lineWidth=Math.max(.6,1.4*u);c.lineCap='round';
          for(let i=0;i<3;i++){const a=(i-1)*.65+Math.PI/2,x=clamp(p.x*w+Math.cos(a)*19*u,2,w-2),y=clamp(p.y*h+Math.sin(a)*7*u,2,h-2);c.beginPath();c.moveTo(x,y);c.lineTo(clamp(x+Math.cos(a)*7*u,2,w-2),clamp(y+Math.sin(a)*7*u,2,h-2));c.stroke();}c.restore();
        }
      }
    }
    function clear(planId){moments=planId===undefined?[]:moments.filter(m=>m.planId!==planId);}
    function active(){return moments.length>0;}
    function snapshot(){return {active:active(),maxActive:MAX_ACTIVE,cachedTextures:cache.size,moments:moments.map(({id,moment,planId,startAt,durationMs,phase,progress,points})=>({id,moment,planId,startAt,durationMs,phase,progress,points:Object.fromEntries(Object.entries(points).map(([key,p])=>[key,{...p}]))}))};}
    return {enqueue,draw,update,clear,active,snapshot,prepareTextures};
  }
  globalThis.BaiyaoAnimeMoments=Object.freeze({create,DURATION_MS,ASSET_KEYS,MAX_ACTIVE});
})();
