// 白曜重工 · 透明动漫爱心。原生 PNG 材质与连续运动；与受击物理分开。
(()=>{'use strict';
  const MAX_HEARTS=8,MAX_SHARDS=96,MAX_BITMAP_DRAWS=256,PREPARE_MS=350,STAGGER_MS=20,FADE_MS=900,HERO_OPACITY=.62;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const number=(v,f)=>typeof v==='number'&&Number.isFinite(v)?v:f;
  const lightAlpha=(alpha,intensity)=>clamp(alpha*number(intensity,1),0,1);
  const seeded=n=>{let v=Math.imul(n+1,1597334677);v^=v>>>16;v=Math.imul(v,2246822507);return ((v^(v>>>13))>>>0)/4294967296;};
  const smooth=t=>t*t*(3-2*t),STYLES=['glass','candy','starlight','neon'];
  function create(options={}){
    const viewport=()=>{const v=options.viewport?.()||{};return {width:Math.max(1,number(v.width,1280)),height:Math.max(1,number(v.height,720))};};
    const current=job=>options.isCurrent?.(job)!==false;
    const sourceMeta=options.spriteMeta||{},meta={heartGlass:{key:'heartGlass',count:1,cols:1,rows:1,origin:{x:.5,y:.5}},heartBurst:{key:'heartBurst',count:1,cols:1,rows:1,origin:{x:.5,y:.5}}};
    for(const [role,value] of Object.entries(sourceMeta))if(role!=='styles'&&value&&typeof value==='object')meta[role]={...meta[role],...value};
    const styleDefs=sourceMeta.styles||{},styled=STYLES.some(name=>styleDefs[name]?.key&&meta[styleDefs[name].key]);
    const sheets=role=>meta[role]?.sheets||[{...meta[role],key:meta[role]?.key||role}];
    const roles=styled?[...new Set([...STYLES.map(name=>styleDefs[name]?.key),...(sourceMeta.heartMua?['heartMua']:[])].filter(key=>key&&meta[key]))]:Object.keys(meta);
    const keys=[...new Set(roles.flatMap(role=>sheets(role).map((sheet,i)=>sheet.key||role+i)))];
    const image=key=>{try{return options.art?.(key)||null;}catch{return null;}};
    const imageState=key=>{const a=image(key);return !a?'unavailable':a.complete===false?'loading':number(a.naturalWidth,number(a.width,0))>0&&number(a.naturalHeight,number(a.height,0))>0?'ready':'failed';};
    const textureCache=new Map();
    function frame(role,index=0){
      const group=meta[role]||{},list=sheets(role),total=Math.max(1,Math.floor(number(group.count,1))),globalFrame=clamp(Math.floor(number(index,0)),0,total-1);let local=globalFrame,sheetIndex=0;
      while(sheetIndex<list.length-1&&local>=number(list[sheetIndex].count,1)){local-=number(list[sheetIndex].count,1);sheetIndex++;}
      const sheet=list[sheetIndex]||{},assetKey=sheet.key||(list.length===1?role:role+sheetIndex),a=image(assetKey),width=number(a?.naturalWidth,number(a?.width,number(sheet.width,number(group.width,0)))),height=number(a?.naturalHeight,number(a?.height,number(sheet.height,number(group.height,0)))),cols=Math.max(1,Math.floor(number(sheet.cols,1))),rows=Math.max(1,Math.floor(number(sheet.rows,1))),inset=Math.max(0,number(sheet.inset,0)),raw=sheet.rects?.[local];
      const cell=raw?(Array.isArray(raw)?{x:raw[0],y:raw[1],width:raw[2],height:raw[3]}:{...raw}):{x:(local%cols)*width/cols,y:Math.floor(local/cols)*height/rows,width:width/cols,height:height/rows},r={x:cell.x+inset,y:cell.y+inset,width:cell.width-2*inset,height:cell.height-2*inset};
      const valid=width>0&&height>0&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=width+.001&&r.y+r.height<=height+.001;
      return {assetKey,globalFrame,sheetIndex,frameIndex:local,sourceRect:valid?r:null,atlasSafeBounds:{...cell},spriteOrigin:sheet.origin||group.origin||{x:.5,y:.5},assetReady:imageState(assetKey)==='ready'&&valid};
    }
    const paletteFrame=color=>frame('heartGlass',({pink:0,blue:1,aurora:2}[color]||0)%Math.max(1,number(meta.heartGlass.count,1)));
    function styleFrame(style,part,color='pink'){
      const def=styleDefs[style];
      if(styled)return frame(def?.key||'missing-heart-style',number(def?.[part],part==='hero'?0:part==='aura'?1:part==='burst'?2:3));
      return part==='burst'?frame('heartBurst'):part==='sparkle'&&meta.heartSparkle?frame('heartSparkle'):paletteFrame(color);
    }
    const heroFrame=h=>h.mua&&sourceMeta.heartMua?frame('heartMua'):styleFrame(h.style,'hero',h.color);
    // Decode once; alpha is copied unchanged. Never replace image shapes or
    // add expensive full-size blur/color filters in the animation loop.
    function texture(f,part='hero'){
      const a=image(f.assetKey);if(!f.assetReady||!f.sourceRect||!a)return null;
      const limit=part==='hero'?624:part==='sparkle'?128:384,r=f.sourceRect,key=f.assetKey+':'+f.globalFrame+':'+limit,old=textureCache.get(key);
      if(old?.source===a)return old;
      const ratio=Math.min(1,limit/Math.max(r.width,r.height)),width=Math.max(1,Math.round(r.width*ratio)),height=Math.max(1,Math.round(r.height*ratio));let canvas=null;
      try{
        if(options.createCanvas)canvas=options.createCanvas(width,height);
        else if(typeof globalThis.OffscreenCanvas==='function')canvas=new globalThis.OffscreenCanvas(width,height);
        else if(globalThis.document?.createElement){canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;}
        const ctx=canvas?.getContext('2d');if(!ctx)return {source:a,image:a,rect:r};
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(a,r.x,r.y,r.width,r.height,0,0,width,height);
        const result={source:a,image:canvas,rect:{x:0,y:0,width,height}};textureCache.set(key,result);return result;
      }catch{return {source:a,image:a,rect:r};}
    }
    function prepareTextures(){
      if(styled){for(const style of STYLES)for(const part of ['hero','aura','burst','sparkle'])texture(styleFrame(style,part),part);}
      if(sourceMeta.heartMua)texture(frame('heartMua'));
      return {cachedTextures:textureCache.size,assetStates:Object.fromEntries(keys.map(key=>[key,imageState(key)]))};
    }
    let hearts=[],shards=[],bursts=[],serial=0,shardSerial=0,lastNow=0,bitmapCount=0;
    const stats={received:0,represented:0,launched:0,merged:0,expired:0,cleared:0,pops:0,fragmentsSpawned:0,maxHearts:0,maxShards:0,maxSprites:0};
    function resolve(job){const p=options.resolvePoint?.(job)||job.point||{x:.5,y:job.heartVariant==='send'?.65:.4};return {x:clamp(number(p.x,.5),0,1),y:clamp(number(p.y,.5),0,1)};}
    function enqueue(job={},startAt=lastNow){
      if(!current(job))return false;
      const mua=job.mua===true,prepareMs=mua?100:PREPARE_MS;
      const quantity=mua?1:clamp(Math.floor(number(job.quantity,1)),1,20000000),count=Math.min(MAX_HEARTS,quantity),at=number(startAt,lastNow);
      const scale=clamp(number(job.size,number(job.heartScale,number(job.impactScale,number(job.handScale,1)))),mua?.75:.25,mua?1.25:3);
      // Keep the complete default effect inside the existing 2400 ms plan,
      // including gathering, stagger and the final fragment fade.
      const flightMs=mua?1200:clamp(number(job.heartFlightMs,number(job.durationMs,2400)-PREPARE_MS-FADE_MS-(count-1)*STAGGER_MS),700,2600),base=Math.floor(quantity/count),remainder=quantity%count;
      stats.received+=quantity;stats.represented+=quantity;
      for(let i=0;i<count;i++){
        let carry=0;if(hearts.length>=MAX_HEARTS){
          // Decorative Mua hearts never absorb or contribute gift quantities.
          // Prefer replacing a previous Mua; otherwise consolidate two gifts
          // before inserting the single-heart gesture into the same budget.
          const previousMua=mua?hearts.findIndex(h=>h.mua):-1,old=hearts.splice(previousMua>=0?previousMua:0,1)[0];
          if(old.mua)stats.cleared++;
          else{stats.merged+=old.count;if(mua)hearts.find(h=>!h.mua).count+=old.count;else carry=old.count;}
        }
        const variant=job.heartVariant==='send'?'send':'kiss',h={id:++serial,planId:job._heartPlanId||null,job,variant,mua,prepareMs,style:STYLES.includes(job.heartStyle)?job.heartStyle:'glass',color:['pink','blue','aurora'].includes(job.heartColor)?job.heartColor:'pink',count:mua?1:base+(i<remainder?1:0)+carry,prepareAt:at+i*STAGGER_MS,launchAt:at+i*STAGGER_MS+prepareMs,flightMs,scale,intensity:clamp(number(job.intensity,1),.2,3),origin:resolve(job),phase:'prepare',x:0,y:0,size:0,depth:0,angle:0,alpha:0,index:i,spread:count};
        hearts.push(h);
      }
      stats.maxHearts=Math.max(stats.maxHearts,hearts.length);return true;
    }
    function dimensions(h,unit){return {far:clamp(unit*.09*h.scale,18,unit*.2),near:clamp(unit*.58*h.scale,unit*.18,unit*.65),lift:Math.min(unit*(h.variant==='send'?.075:.045),h.origin.y*viewport().height*.65)};}
    function containHeart(h,w,height){
      // Fit complete rotating raster rectangles and orbital ornaments, rather
      // than clipping a ring against the top of a narrow source canvas.
      const extent=h.style==='neon'?.96:h.style==='candy'?.78:h.style==='starlight'?.90:.86,margin=6;
      const radiusLimit=Math.max(12,Math.min((w-margin*2)/2,(height-margin*2)/2,Math.max(24,h.origin.y*height-margin)));
      h.size=Math.min(h.size,radiusLimit/extent);h.visualRadius=h.size*extent;
      h.x=clamp(h.x,h.visualRadius+margin,w-h.visualRadius-margin);h.y=clamp(h.y,h.visualRadius+margin,height-h.visualRadius-margin);
    }
    function flightPose(h,t,w,height,unit){
      if(h.mua){
        // A single mouth-sized raster glides outward and slightly upward.
        // Keep the exact source (including edge positions) rather than lifting
        // or moving it toward the centre as the camera-facing presets do.
        const move=smooth(t),direction=h.origin.x>.7?-1:1;
        h.depth=t;h.x=h.origin.x*w+direction*unit*(84/720)*move;h.y=h.origin.y*height-unit*(54/720)*move;
        h.size=unit*(36+6*move)/720*h.scale;h.visualRadius=h.size*.5;h.angle=direction*.10*Math.sin(Math.PI*t);h.alpha=1;h.heroOpacityScale=1;h.motionPhase='mua-glide';return;
      }
      const {far,near,lift}=dimensions(h,unit),sx=h.origin.x*w,sy=h.origin.y*height-lift,ex=w*.5+Math.sin(h.index*2.4)*unit*.055,ey=Math.max(0,Math.min(h.origin.y*height-lift*.35,height*.46)),side=h.index%2?-1:1;
      h.depth=t;h.alpha=1;h.heroOpacityScale=1;
      // Each performance owns its path and temporal stages. Shared inputs
      // describe a source point and lifetime, not a shared animated curve.
      if(h.style==='candy'){
        const u=clamp(t/.66,0,1),move=smooth(u),hop=Math.sin(Math.PI*u);
        h.x=sx+(ex-sx)*move+side*unit*.035*hop;h.y=sy+(ey-sy)*move-unit*(h.variant==='send'?.13:.10)*hop*hop;
        h.size=far+(near-far)*(1-(1-u)**3);h.angle=-side*.12*hop;
        if(t<.66)h.motionPhase='hop-forward';
        else if(t<.80){const p=(t-.66)/.14;h.motionPhase='lens-tap';h.size=near*(1+.06*Math.sin(Math.PI*p));h.angle=side*.06*Math.sin(Math.PI*p);}
        else{const p=smooth((t-.80)/.20);h.motionPhase='rebound';h.size=near*(1-.14*p);h.y=ey-unit*.025*Math.sin(Math.PI*p);h.angle=side*.055*Math.sin(Math.PI*p);}
      }else if(h.style==='glass'){
        const move=smooth(t),turn=t*Math.PI*2.3,petal=Math.sin(Math.PI*t)*unit*.062;
        h.motionPhase=t<.78?'weave-approach':'petal-poise';h.x=sx+(ex-sx)*move+Math.sin(turn)*petal*side;h.y=sy+(ey-sy)*move-(1-Math.cos(turn))*petal*.55;
        h.size=far+(near-far)*(.2*t+.8*move);h.angle=Math.sin(turn)*Math.sin(Math.PI*t)*.24*side;
      }else if(h.style==='starlight'){
        const u=clamp(t/.72,0,1),move=smooth(u),radius=unit*.072*Math.sin(Math.PI*u),turn=u*Math.PI*4;
        h.x=sx+(ex-sx)*move+Math.sin(turn)*radius;h.y=sy+(ey-sy)*move-(1-Math.cos(turn))*radius*.52;
        h.size=far+(near*.94-far)*move;h.angle=Math.sin(turn)*.11;
        if(t<.72)h.motionPhase='spiral-advance';
        else if(t<.90){const p=(t-.72)/.18;h.motionPhase='star-hold';h.x=ex;h.y=ey;h.size=near*.94;h.angle=.045*Math.sin(p*Math.PI*2);}
        else{const p=smooth((t-.90)/.10);h.motionPhase='star-release';h.x=ex;h.y=ey;h.size=near*(.94+.06*p);h.angle=0;}
      }else{
        if(t<.28){const p=t/.28;h.motionPhase='charge-hover';h.x=sx;h.y=sy-unit*.012*Math.sin(p*Math.PI);h.size=far*(1+.06*smooth(p));h.angle=0;}
        else if(t<.82){const p=(t-.28)/.54,dash=p**2.25;h.motionPhase='dash-forward';h.x=sx+(ex-sx)*dash;h.y=sy+(ey-sy)*dash-unit*.025*Math.sin(p*Math.PI);h.size=far*1.06+(near-far*1.06)*dash;h.angle=side*.035*Math.sin(p*Math.PI);}
        else{const p=(t-.82)/.18;h.motionPhase='lens-pulse';h.x=ex;h.y=ey;h.size=near*(1+.028*Math.sin(p*Math.PI*4));h.angle=0;}
      }
      containHeart(h,w,height);
    }
    function scatter(h,at){
      if(lastNow-at>=FADE_MS)return;
      const {width:w,height:hgt}=viewport(),unit=Math.min(w,hgt),n=56;stats.pops++;stats.fragmentsSpawned+=n;
      if(bursts.length>=MAX_HEARTS)bursts.shift();bursts.push({job:h.job,planId:h.planId,style:h.style,intensity:h.intensity,x:h.x,y:h.y,born:at,life:600,size:clamp(unit*.67*h.scale,unit*.35,unit*.82),heroSize:h.size,heroAngle:h.angle,heroOpacity:styled?number(h.materialOpacity,HERO_OPACITY):.78/Math.sqrt(Math.max(1,hearts.filter(value=>value.alpha>0).length)),color:h.color});
      for(let i=0;i<n;i++){
        if(shards.length>=MAX_SHARDS)shards.shift();
        const seed=((i*73+h.id*19)%997)/997,a=i*2.3999632297+h.index*.41,initial=unit*(.02+.025*seed),distance=unit*(.16+.19*seed);
        const s={id:++shardSerial,job:h.job,planId:h.planId,style:h.style,intensity:h.intensity,part:i%7!==0?'hero':'sparkle',wave:i%2,spoke:i%8,from:{x:h.x,y:h.y},born:at,life:FADE_MS,theta:a,initial,distance,unit,size:clamp(unit*(.020+(i%5)*.0038)*Math.min(h.scale,1.65),8,unit*.065),angle:(seed-.5)*.8,spin:(i%2?-1:1)*(.45+.8*seed),color:i%3===0?'blue':h.color};
        if(styled||h.style==='candy'){
          const layerIndex=i<8?0:i<24?1:i<48?2:3,base=i+h.id*97,r=k=>seeded(base+k*193);
          const delays=h.style==='glass'?[0,35,80]:h.style==='starlight'?[0,45,95]:h.style==='neon'?[0,16,35]:[0,50,120];
          Object.assign(s,{part:i<48?'hero':'sparkle',layerIndex,layer:['front','middle','back','sparkle'][layerIndex],delayMs:(h.style==='neon'?s.wave*180:0)+(layerIndex<3?delays[layerIndex]:40+(i-48)*15),jitterX:(r(0)-.5)*unit*.05,jitterY:(r(1)-.5)*unit*.05,vx:(r(2)-.5)*unit*(.60+.12*Math.min(layerIndex,2))*(.65+.7*r(3)),vy:-unit*(.085+.26*r(4)),gravity:unit*(.13+.16*r(5)),sway:(r(6)-.5)*unit*.05,ease:1.45+.9*r(7),size:clamp(unit*(h.style==='candy'?[.074,.042,.023,.017]:[.078,.044,.024,.018])[layerIndex]*(.84+.32*r(8))*Math.min(h.scale,1.65),6,unit*.13),angle:(r(9)-.5)*.5,spin:(r(10)-.5)*1.3});
          if(h.style==='glass')Object.assign(s,{arm:i%2,theta:(i%2)*Math.PI+(r(11)-.5)*.95,distance:unit*(.08+.34*r(2)),curl:Math.PI*(.60+.85*r(12))});
          if(h.style==='starlight')Object.assign(s,{vy:-unit*(.14+.26*r(4)),gravity:unit*(.30+.30*r(5))});
          if(h.style==='neon')Object.assign(s,{theta:r(11)*Math.PI*2,distance:unit*(.08+.36*r(2))});
        }
        shards.push(s);
      }
      stats.maxShards=Math.max(stats.maxShards,shards.length);
    }
    function update(now){
      lastNow=number(now,lastNow);const {width:w,height:hgt}=viewport(),unit=Math.min(w,hgt),next=[];
      for(const h of hearts){
        if(!current(h.job)){stats.cleared++;continue;}
        const finish=h.launchAt+h.flightMs;
        if(h.mua&&lastNow>=finish){
          if(lastNow>=finish+200){stats.expired++;continue;}
          flightPose(h,1,w,hgt,unit);h.phase='fade';h.motionPhase='mua-fade';h.alpha=1-smooth((lastNow-finish)/200);next.push(h);continue;
        }
        if(lastNow>=finish){if(lastNow<finish+FADE_MS){flightPose(h,1,w,hgt,unit);scatter(h,finish);}stats.expired++;continue;}
        if(lastNow<h.prepareAt){h.alpha=0;next.push(h);continue;}
        if(lastNow<h.launchAt){
          if(h.mua){h.origin=resolve(h.job);flightPose(h,0,w,hgt,unit);h.phase='prepare';h.motionPhase='mua-prepare';h.alpha=clamp((lastNow-h.prepareAt)/h.prepareMs,0,1);next.push(h);continue;}
          h.origin=resolve(h.job);h.phase='prepare';h.depth=0;const u=clamp((lastNow-h.prepareAt)/h.prepareMs,0,1),g=smooth(u),{far,lift}=dimensions(h,unit);
          h.x=clamp(h.origin.x*w+Math.sin(u*Math.PI)*unit*.008*(h.index%2?-1:1),0,w);h.y=h.origin.y*hgt-lift*g;h.size=far*(.92+.08*g)+(h.style==='candy'?Math.sin(u*Math.PI)*far*.04:0);h.angle=Math.sin(u*Math.PI)*.055;h.alpha=clamp((lastNow-h.prepareAt)/100,0,1);
          h.motionPhase={glass:'twin-gather',candy:'spring-gather',starlight:'orbit-charge',neon:'ring-charge'}[h.style];h.heroOpacityScale=h.style==='glass'?.35+.65*g:1;
          if(h.style==='candy'){h.size+=Math.sin(u*Math.PI*3)*Math.sin(u*Math.PI)*far*.11;h.y+=Math.sin(u*Math.PI*2)*Math.sin(u*Math.PI)*unit*.012;}
          if(h.style==='neon'){h.x=h.origin.x*w;h.angle=0;h.size=far*(.92+.08*g);}
          containHeart(h,w,hgt);
        }else{
          if(h.phase==='prepare'){h.origin=resolve(h.job);h.phase='flight';stats.launched++;}
          flightPose(h,clamp((lastNow-h.launchAt)/h.flightMs,0,1),w,hgt,unit);
        }
        next.push(h);
      }
      hearts=next;shards=shards.filter(s=>current(s.job)&&lastNow-s.born<s.life);bursts=bursts.filter(b=>current(b.job)&&lastNow-b.born<b.life);return active();
    }
    function shardPose(s){
      const elapsed=lastNow-s.born,delay=number(s.delayMs,s.style==='neon'?s.wave*180:0),t=clamp((elapsed-delay)/(s.life-delay),0,1),e=1-(1-t)**3;
      let x,y,angle=s.angle+s.spin*t,pattern;
      if(s.style==='candy'){
        pattern='layered-heart-cloud';const travel=1-(1-t)**s.ease;
        x=s.from.x+s.jitterX+s.vx*travel+s.sway*Math.sin(t*Math.PI);y=s.from.y+s.jitterY+s.vy*travel+s.gravity*t*t;angle=s.angle+s.spin*travel+Math.sin(t*Math.PI*2+s.theta)*.045;
      }else if(s.style==='glass'){
        pattern='petal-spiral';const travel=1-(1-t)**number(s.ease,2),a=s.theta+travel*number(s.curl,Math.PI*1.15),r=s.distance*travel+(styled?0:s.initial);
        x=s.from.x+number(s.jitterX,0)+Math.cos(a)*r;y=s.from.y+number(s.jitterY,0)+Math.sin(a)*r*.67-s.unit*.060*t;angle=s.angle+s.spin*travel;
      }else if(s.style==='starlight'){
        pattern='star-cascade';if(styled){const lift=1-(1-t)**1.2,travel=1-(1-t)**s.ease;x=s.from.x+s.jitterX+s.vx*travel+s.sway*Math.sin(t*Math.PI);y=s.from.y+s.jitterY+s.vy*lift+s.gravity*t*t;angle=s.angle+s.spin*.35*Math.sin(t*Math.PI);}
        else{const a=s.spoke*Math.PI/4+s.wave*.16+t*.22,r=s.initial+s.distance*e;x=s.from.x+Math.cos(a)*r;y=s.from.y+Math.sin(a)*r*.72+s.unit*.14*t*t;angle=s.angle+Math.sin(t*Math.PI)*.15;}
      }else{
        pattern='double-wave';const travel=1-(1-t)**number(s.ease,3),r=(styled?0:s.initial)+s.distance*travel*(s.wave?.92:1.08);
        x=s.from.x+number(s.jitterX,0)+Math.cos(s.theta)*r;y=s.from.y+number(s.jitterY,0)+Math.sin(s.theta)*r*.72-s.unit*.045*t;angle=s.angle*.35+s.spin*t*.25;
      }
      const material=styled?(s.style==='candy'?[.72,.64,.57,.70]:[.80,.76,.72,.82])[s.layerIndex]:.92;
      const alpha=styled?material*smooth(clamp((elapsed-delay)/(s.style==='candy'?120:80),0,1))*(elapsed<=450?1:clamp((s.life-elapsed)/(s.life-450),0,1)**.9):(elapsed<delay?0:t<=.45?material:material*((1-t)/.55)**.85);
      return {id:s.id,type:s.part==='hero'?'heart':'sparkle',style:s.style,intensity:s.intensity,part:s.part,pattern,wave:s.wave,...(styled?{layer:s.layer,layerIndex:s.layerIndex,delayMs:s.delayMs,...(s.arm!==undefined?{arm:s.arm}:{})}:{}),from:{...s.from},x,y,size:s.size*(1+.1*Math.sin(t*Math.PI)-t*.22),angle,alpha:s.part==='sparkle'?lightAlpha(alpha,s.intensity):alpha,born:s.born,life:s.life,color:s.color,...styleFrame(s.style,s.part,s.color)};
    }
    function sprite(c,f,x,y,size,angle,alpha,{composite='source-over',part='hero'}={}){
      if(!f?.assetReady||!f.sourceRect||alpha<=0||size<=0||bitmapCount>=MAX_BITMAP_DRAWS)return false;
      const a=texture(f,part);if(!a)return false;const r=a.rect,width=size,height=size*f.sourceRect.height/f.sourceRect.width,origin=f.spriteOrigin;
      c.save();c.globalAlpha=clamp(alpha,0,1);c.globalCompositeOperation=composite;c.translate(x,y);c.rotate(angle||0);c.drawImage(a.image,r.x,r.y,r.width,r.height,-width*origin.x,-height*origin.y,width,height);c.restore();bitmapCount++;return true;
    }
    function companions(h){
      if(h.mua)return [];
      const age=(lastNow-h.prepareAt)/1000,u=clamp((lastNow-h.prepareAt)/h.prepareMs,0,1),result=[];
      if(h.style==='glass'&&(h.phase==='prepare'||h.depth<.30)){
        const merge=h.phase==='prepare'?smooth(u):1,fade=h.phase==='prepare'?1:1-smooth(h.depth/.30),spread=h.size*(.56-.31*merge),turn=(h.phase==='prepare'?u:h.depth+1)*Math.PI*.8;
        for(let i=0;i<2;i++){const a=turn+i*Math.PI;result.push({kind:'twin-heart',part:'hero',x:h.x+Math.cos(a)*spread,y:h.y+Math.sin(a)*spread*.48,size:h.size*(.66-.16*merge),angle:Math.sin(a)*.18,alpha:h.alpha*fade*.78,front:Math.sin(a)>=0});}
      }
      const n=h.style==='starlight'?4:h.style==='glass'?2:h.style==='neon'?2:3;
      for(let i=0;i<n;i++){
        let x,y,size,angle,front,alpha,kind;const a=age*(h.style==='starlight'?4.2:1.4)+i*Math.PI*2/n;
        if(h.style==='starlight'){const radius=h.phase==='prepare'?.68-.15*smooth(u):h.motionPhase==='star-hold'?.64:.59;x=h.x+Math.cos(a)*h.size*radius;y=h.y+Math.sin(a)*h.size*radius*.52;size=h.size*.17;angle=a*.45;front=Math.sin(a)>=0;alpha=h.alpha*(front?.84:.45);kind='orbit-star';}
        else if(h.style==='candy'){x=h.x+(i-1)*h.size*.48;y=h.y-h.size*(.35+.13*Math.abs(Math.sin(age*3+i)));size=h.size*.13;angle=Math.sin(age*3+i)*.14;front=true;alpha=h.alpha*.68;kind='bouncing-sparkle';}
        else if(h.style==='glass'){x=h.x+Math.cos(a)*h.size*.60;y=h.y+Math.sin(a)*h.size*.27;size=h.size*.13;angle=a*.4;front=Math.sin(a)>=0;alpha=h.alpha*.56;kind='petal-orbit';}
        else{x=h.x+(i?1:-1)*h.size*.60;y=h.y+Math.sin(age*5+i*Math.PI)*h.size*.11;size=h.size*.15;angle=0;front=true;alpha=h.alpha*(.46+.24*Math.sin(age*5+i)**2);kind='pulse-spark';}
        result.push({kind,part:'sparkle',x,y,size,angle,alpha:lightAlpha(alpha,h.intensity),front});
      }
      return result;
    }
    function ornaments(c,h,front,items=companions(h)){
      for(const p of items){if(p.front!==front)continue;sprite(c,styleFrame(h.style,p.part,h.color),p.x,p.y,p.size,p.angle,p.alpha,{part:p.part});}
    }
    function heroMaterials(visible){
      const result=new Map(),material=HERO_OPACITY/Math.sqrt(Math.max(1,visible.length));
      // Preserve the established concurrency scaling. Position changes never
      // change opacity, so crossing another heart cannot introduce a flash.
      for(const h of visible){const items=companions(h);for(const p of items)if(p.part==='hero')p.alpha=p.alpha/.78*material;result.set(h,{items,material});}
      return result;
    }
    function burstPose(b){
      if(styled){
        const elapsed=lastNow-b.born,pop=clamp(elapsed/150,0,1),heroSize=b.heroSize*(1+(b.style==='candy'?.065:b.style==='glass'?.035:.018)*Math.sin(pop*Math.PI)),heroAlpha=b.heroOpacity*(1-smooth(pop)),glintLife=b.style==='starlight'?220:180,twinkleSize=b.heroSize*(.12+.10*smooth(clamp(elapsed/glintLife,0,1))),twinkleAlpha=b.style==='neon'?0:lightAlpha(.56*(1-smooth(clamp(elapsed/glintLife,0,1))),b.intensity);
        const delays=b.style==='glass'?[0,35,80]:b.style==='starlight'?[0,45,95]:b.style==='neon'?[0,16,35]:[0,50,120],presentation={glass:'petal-heart-arcs',candy:'layered-heart-shower',starlight:'star-heart-cascade',neon:'energy-heart-waves'}[b.style];
        const {width:w,height}=viewport(),diameter=Math.max(1,Math.min(b.x,w-b.x,b.y,height-b.y)-6)*2,waves=b.style==='neon'?[0,1].map(wave=>{const local=elapsed-wave*180,p=clamp(local/(b.life-wave*180),0,1),envelope=local<0?0:clamp(local/55,.12,1)*(1-smooth(p));return {wave,part:'aura',x:b.x,y:b.y,size:Math.min(diameter,b.heroSize*((wave?.48:.62)+(wave?.88:1.08)*(1-(1-p)**2))),angle:0,alpha:lightAlpha(.22*envelope,b.intensity),delayMs:wave*180};}):[];
        return {style:b.style,intensity:b.intensity,motionPhase:b.style==='neon'?(elapsed<180?'wave-one':'wave-two'):presentation,stamp:false,presentation,layers:[{layer:'front',count:8,delayMs:delays[0]},{layer:'middle',count:16,delayMs:delays[1]},{layer:'back',count:24,delayMs:delays[2]}],x:b.x,y:b.y,born:b.born,life:b.life,size:heroSize,visualRadius:Math.max(heroAlpha>0?heroSize*.5*(Math.abs(Math.cos(b.heroAngle))+Math.abs(Math.sin(b.heroAngle))):0,twinkleAlpha>0?twinkleSize*.71:0,...waves.map(wave=>wave.alpha>0?wave.size*.5:0)),angle:b.heroAngle,alpha:heroAlpha,waves,heroSize,heroAngle:b.heroAngle,heroAlpha,twinkleSize,twinkleAlpha,...styleFrame(b.style,b.style==='neon'?'aura':'hero',b.color)};
      }
      const t=clamp((lastNow-b.born)/b.life,0,1),envelope=styled?(t<=.30?1:((1-t)/.70)**1.1):(t<=.58?1:((1-t)/.42)**1.05);
      const f=styled?styleFrame(b.style,'burst',b.color):frame('heartBurst',Math.floor(t*Math.max(1,number(meta.heartBurst.count,1))));
      const {width:w,height}=viewport(),x=b.x+(w*.5-b.x)*smooth(t)*.6,y=b.y+(height*.5-b.y)*smooth(t)*.6,radiusLimit=Math.max(1,Math.min(x,w-x,y,height-y)-6),extent=.91;
      const size=Math.min(b.size*(.86+.40*(1-(1-t)**2)),radiusLimit/extent),alpha=(styled?.80:.86)*envelope*(styled?clamp(t/.12,.2,1):1)/Math.sqrt(Math.max(1,bursts.length));
      const waves=b.style==='neon'?[0,1].map(wave=>{const p=clamp((lastNow-b.born-wave*180)/(b.life-wave*180),0,1);return {wave,x,y,size:size*((wave?.37:.55)+(wave?.48:.45)*(1-(1-p)**2)),angle:0,alpha:lastNow-b.born<wave*180?0:lightAlpha(alpha*(wave?.85:1),b.intensity),delayMs:wave*180};}):[];
      const heroAlpha=styled?b.heroOpacity*(1-smooth(clamp(t/.25,0,1))):0,heroExtent=b.heroSize*.5*(Math.abs(Math.cos(b.heroAngle))+Math.abs(Math.sin(b.heroAngle)));
      return {style:b.style,intensity:b.intensity,motionPhase:b.style==='neon'?(t<.30?'wave-one':'wave-two'):{glass:'petal-spiral',candy:'heart-shower',starlight:'star-cascade'}[b.style],x,y,born:b.born,life:b.life,size,visualRadius:Math.max(size*extent,heroAlpha>0?heroExtent:0),angle:b.style==='neon'?0:Math.sin(t*Math.PI)*(b.style==='starlight'?.18:b.style==='glass'?.35:.08),alpha,waves,heroSize:b.heroSize,heroAngle:b.heroAngle,heroAlpha,...f};
    }
    function muaAccents(c,h){
      if(h.phase!=='flight')return;
      const pulse=Math.sin(Math.PI*h.depth),direction=h.origin.x>.7?-1:1,s=h.size;
      c.save();c.globalAlpha=h.alpha*pulse*.34;c.strokeStyle='#c65380';c.lineWidth=clamp(s*.035,.7,1.7);c.lineCap='round';
      c.beginPath();c.moveTo(h.x-direction*s*.94,h.y+s*.36);c.quadraticCurveTo(h.x-direction*s*.72,h.y+s*.40,h.x-direction*s*.58,h.y+s*.21);c.stroke();
      if(h.depth>.12&&h.depth<.88)for(let i=0;i<2;i++){
        const x=h.x+direction*s*(i?-.57:.53),y=h.y+s*(i?.48:-.44),r=Math.min(3.5,s*(i?.060:.075)),inner=r*.23;
        c.globalAlpha=h.alpha*pulse*(i?.38:.50);c.fillStyle=i?'#d57b9b':'#f3b8cc';c.beginPath();
        for(let j=0;j<8;j++){const a=-Math.PI/2+j*Math.PI/4,radius=j%2?inner:r,px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius;if(j)c.lineTo(px,py);else c.moveTo(px,py);}
        c.closePath();c.fill();
      }
      c.restore();
    }
    function draw(c,now){
      update(now);bitmapCount=0;const {width:w,height:hgt}=viewport(),unit=Math.min(w,hgt),visible=hearts.filter(h=>h.alpha>0&&heroFrame(h).assetReady),overlap=Math.sqrt(Math.max(1,visible.length)),material=clamp(number(meta.heartGlass.opacity,.78),.2,1)/overlap,materials=styled?heroMaterials(visible):null,labelHearts=visible.filter(h=>!h.mua),labelHeart=labelHearts[labelHearts.length-1],labelCount=labelHearts.reduce((sum,h)=>sum+h.count,0);
      for(const h of hearts){
        const f=heroFrame(h);if(!h.alpha||!f.assetReady)continue;const age=(lastNow-h.prepareAt)/1000,info=materials?.get(h);h.materialOpacity=info?.material??material;
        if(h.mua)muaAccents(c,h);
        ornaments(c,h,false,info?.items);
        if(styled&&!h.mua){
          const aura=styleFrame(h.style,'aura',h.color),pulse=h.style==='neon'?.08*Math.sin(age*Math.PI*3):.025*Math.sin(age*2.5);
          sprite(c,aura,h.x,h.y,h.size*(1.20+pulse),h.style==='starlight'?age*.22:h.style==='glass'?-age*.1:0,lightAlpha(h.alpha*(h.style==='neon'?.48:.30)/overlap,h.intensity),{part:'aura'});
          if(h.style==='neon')sprite(c,aura,h.x,h.y,h.size*(1.48-pulse),-age*.08,lightAlpha(h.alpha*(.13+.05*Math.sin(age*Math.PI*3+.8))/overlap,h.intensity),{part:'aura'});
        }
        sprite(c,f,h.x,h.y,h.size,h.angle,h.alpha*h.materialOpacity*number(h.heroOpacityScale,1));
        ornaments(c,h,true,info?.items);
        if(!h.mua&&h===labelHeart&&labelCount>1){
          c.save();c.globalAlpha=h.alpha;c.textAlign='center';c.font='700 '+Math.max(12,Math.min(30,unit*.034))+'px "Microsoft YaHei",sans-serif';c.lineWidth=3;c.strokeStyle='#583753';c.fillStyle='#fff6fc';
          const label='×'+labelCount,margin=Math.min(w/2,c.measureText(label).width/2+6),lx=clamp(h.x,margin,w-margin),ly=clamp(h.y+h.size*.58,24,hgt-20);c.strokeText(label,lx,ly);c.fillText(label,lx,ly);c.restore();
        }
      }
      for(const b of bursts){const p=burstPose(b);if(styled){for(const wave of p.waves)sprite(c,styleFrame(b.style,'aura',b.color),wave.x,wave.y,wave.size,wave.angle,wave.alpha,{part:'aura'});sprite(c,styleFrame(b.style,'hero',b.color),p.x,p.y,p.heroSize,p.heroAngle,p.heroAlpha);sprite(c,styleFrame(b.style,'sparkle',b.color),p.x,p.y,p.twinkleSize,0,p.twinkleAlpha,{part:'sparkle'});continue;}sprite(c,p,p.x,p.y,p.size,p.angle,p.alpha,{part:'burst'});}
      const ordered=styled?[...shards].sort((a,b)=>(b.part==='sparkle'?-1:number(b.layerIndex,0))-(a.part==='sparkle'?-1:number(a.layerIndex,0))):shards;
      for(const s of ordered){const p=shardPose(s);sprite(c,p,p.x,p.y,p.size,p.angle,p.alpha*(styled&&s.part==='hero'?.78:.84),{part:s.part});}
      stats.maxSprites=Math.max(stats.maxSprites,bitmapCount);
    }
    function clear(id){bitmapCount=0;if(id===undefined){stats.cleared+=hearts.length;hearts=[];shards=[];bursts=[];}else{hearts=hearts.filter(h=>h.planId!==id);shards=shards.filter(s=>s.planId!==id);bursts=bursts.filter(b=>b.planId!==id);}}
    function active(){return hearts.length>0||shards.length>0||bursts.length>0;
    }
    function snapshot(){const faceOpacity=(styled?HERO_OPACITY:.78)/Math.sqrt(Math.max(1,hearts.filter(h=>h.alpha>0).length)),assetStates=Object.fromEntries(keys.map(key=>[key,imageState(key)])),missingAssets=keys.filter(key=>assetStates[key]!=='ready');return {active:active(),hearts:hearts.map(h=>{const {id,planId,variant,style,count,origin,phase,motionPhase,x,y,size,depth,alpha,angle,color,intensity,launchAt,flightMs,visualRadius}=h;return {id,planId,variant,style,count,origin:{...origin},phase,motionPhase,x,y,size,depth,alpha,angle,intensity,faceOpacity:number(h.materialOpacity,faceOpacity),launchAt,flightMs,visualRadius,companions:companions(h),...heroFrame(h)};}),shards:shards.length,shardDetails:shards.map(shardPose),bursts:bursts.map(burstPose),renderMode:styled?'raster-anime':'raster-jewel',assetStates,assetsReady:missingAssets.length===0,missingAssets,bitmapImages:keys.length,bitmapCount,cachedTextures:textureCache.size,assetNote:missingAssets.length?'爱心 PNG 素材尚未就绪；保持原时序，不回退旧画法或延后重播':'',stats:{...stats},maxHearts:MAX_HEARTS,maxShards:MAX_SHARDS,maxBitmapDraws:MAX_BITMAP_DRAWS};}
    return {enqueue,update,draw,clear,active,snapshot,prepareTextures,stats};
  }
  globalThis.BaiyaoHeartProjectile=Object.freeze({create,MAX_HEARTS,MAX_SHARDS,MAX_BITMAP_DRAWS,PREPARE_MS});
})();
