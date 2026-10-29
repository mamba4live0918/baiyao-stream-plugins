/* V2 transparent, planar scenes. Painted alpha edges are the attachment surface. */
(()=>{
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const cssUrl=value=>{const match=String(value||'').trim().match(/^url\((["']?)(.*?)\1\)$/);return match?match[2]:null;};
  function create({overlay,getSettings=()=>({}),notify=()=>{}}){
    if(!overlay)throw new Error('LockScenes requires an overlay');
    const center=overlay.querySelector('.lock-center'),art=overlay.querySelector('.lock-emblem'),shackle=overlay.querySelector('.lock-shackle'),biteArt=overlay.querySelector('.lock-art');
    const arms=['tl','tr','bl','br'].map(id=>overlay.querySelector('.arm-'+id));
    const samples=new Map(),textures=new Map(),timers=new Set();let shownTotal=0,motion=false,sequence=0,queued=false,work=null,rerun=false,destroyed=false,lastMode=null,lastGeometry={mode:'lock',lockBounds:null,arms:[],cage:null};
    const cage=document.createElement('div');cage.className='scene-cage';cage.setAttribute('aria-hidden','true');
    function part(className,kind='bar'){
      const node=document.createElement('i');node.className=className+' cage-piece cage-piece-'+kind;
      for(const segment of ['head','mid','tail']){const child=document.createElement('b');child.className='cage-part cage-part-'+segment;node.append(child);}
      return node;
    }
    for(const side of ['top','right','bottom','left'])cage.append(part('cage-rail cage-rail-'+side,side==='top'?'top':side==='bottom'?'bottom':'bar'));
    const field=document.createElement('div');field.className='cage-bar-field';cage.append(field);
    for(let index=0;index<12;index++){const bar=part('cage-bar cage-field-bar');bar.style.setProperty('--bar-order',index);field.append(bar);}
    for(const side of ['left','right']){
      const door=document.createElement('div');door.className='cage-door cage-door-'+side;
      for(const edge of ['top','bottom','outer','inner'])door.append(part('cage-door-edge cage-door-edge-'+edge,edge==='top'||edge==='bottom'?'door':'bar'));
      for(let index=1;index<=5;index++){const bar=part('cage-bar cage-door-bar');bar.style.setProperty('--bar-x',(index*100/6)+'%');bar.style.setProperty('--bar-order',index);door.append(bar);}
      const post=part('cage-bar cage-lock-post');const latch=document.createElement('i');latch.className='cage-bolt';door.append(post,latch);cage.append(door);
    }
    overlay.prepend(cage);
    const captivity=document.createElement('div');captivity.className='scene-captivity';captivity.setAttribute('role','status');
    const title=document.createElement('strong');title.textContent='被关押';const hits=document.createElement('span');hits.textContent='逃离累计 0 次';captivity.append(title,hits);overlay.querySelector('.lock-info')?.prepend(captivity);
    for(const arm of arms){if(!arm)continue;const hook=document.createElement('i');hook.className='scene-chain-hook';arm.append(hook);}
    function mode(){const s=getSettings()||{};return (s.mode!==undefined?s.mode:s.sceneMode)==='cage'?'cage':'lock';}
    function setVar(name,value){if(overlay.style.getPropertyValue(name)!==value)overlay.style.setProperty(name,value);}
    function ensureMode(){const current=mode();if(current!==lastMode){clearTimers();overlay.classList.remove('scene-entering','scene-exiting');lastMode=current;overlay.dataset.scene=current;overlay.dataset.cagePhase='closed';overlay.dataset.sceneStatus='held';schedule();}return current;}
    function source(){return getComputedStyle(shackle).backgroundImage;}
    async function sample(value){
      const url=cssUrl(value);if(!url)return null;
      if(!samples.has(url))samples.set(url,(async()=>{
        const image=new Image();image.src=url;await image.decode();
        const scale=Math.min(1,384/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const data=ctx.getImageData(0,0,canvas.width,canvas.height).data,alpha=new Uint8Array(canvas.width*canvas.height);
        let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
        for(let y=0,i=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++,i++){
          const a=data[i*4+3];alpha[i]=a;if(a<=18)continue;
          left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
        }
        if(right<left)throw new Error('锁头素材没有可见图案');
        return {width:canvas.width,height:canvas.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,alpha,bbox:{left,top,right:right+1,bottom:bottom+1}};
      })().catch(error=>{samples.delete(url);notify('锁头边缘暂未能读取，暂按物件边框连接。');return null;}));
      if(samples.size>16){const first=samples.keys().next().value;if(first!==url)samples.delete(first);}
      return await samples.get(url);
    }
    async function chainTexture(){
      const material=overlay.dataset.material||(getSettings().theme==='fufu'?'fufu':undefined),value=getComputedStyle(overlay).getPropertyValue('--typing-lock-chain'),url=cssUrl(value);
      const clear=()=>{delete overlay.dataset.sceneChainTile;overlay.style.removeProperty('--scene-chain-image');overlay.style.removeProperty('--scene-chain-ratio');};
      if(overlay.dataset.customChain==='true'||(mode()!=='cage'&&!['forged-steel','antique-brass','arcane-anime','candy-toon','fufu'].includes(material))||!url){clear();return;}
      if(!textures.has(url))textures.set(url,(async()=>{
        const image=new Image();image.src=url;await image.decode();
        const factor=Math.min(1,2048/image.naturalWidth),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*factor);canvas.height=Math.round(image.naturalHeight*factor);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,spans=new Uint16Array(canvas.width);let top=canvas.height,bottom=-1;
        for(let x=0;x<canvas.width;x++){
          let first=canvas.height,last=-1;
          for(let y=0;y<canvas.height;y++)if(rgba[(y*canvas.width+x)*4+3]>18){first=Math.min(first,y);last=y;}
          if(last>=first){spans[x]=last-first+1;top=Math.min(top,first);bottom=Math.max(bottom,last);}
        }
        const height=bottom-top+1;if(height<=0)return null;
        // The front-facing links have the full painted height; the edge-facing
        // connecting links are shorter. Crop center-to-center between equal faces.
        const runs=[];let start=-1;
        for(let x=0;x<=canvas.width;x++){
          if(x<canvas.width&&spans[x]>=height*.92){if(start<0)start=x;}
          else if(start>=0){if(x-start>=Math.max(3,height*.025))runs.push({left:start,right:x});start=-1;}
        }
        const merged=[];for(const run of runs){const last=merged[merged.length-1];if(last&&run.left-last.right<height*.22)last.right=run.right;else merged.push({...run});}
        if(merged.length<2)return null;
        const first=merged[0],last=merged[merged.length-1],left=Math.round((first.left+first.right)/2),right=Math.round((last.left+last.right)/2);
        if(right-left<height*1.8)return null;
        const tile=document.createElement('canvas');tile.width=right-left;tile.height=height;tile.getContext('2d').drawImage(canvas,left,top,tile.width,height,0,0,tile.width,height);
        const blob=await new Promise(resolve=>tile.toBlob(resolve,'image/png'));if(!blob)return null;
        return {url:URL.createObjectURL(blob),ratio:tile.width/tile.height,width:tile.width,height:tile.height};
      })().catch(()=>null));
      const texture=await textures.get(url);
      if(material!==(overlay.dataset.material||(getSettings().theme==='fufu'?'fufu':undefined))||overlay.dataset.customChain==='true'||value!==getComputedStyle(overlay).getPropertyValue('--typing-lock-chain')){rerun=true;return;}
      if(!texture){clear();return;}
      overlay.dataset.sceneChainTile='true';setVar('--scene-chain-image',`url("${texture.url}")`);setVar('--scene-chain-ratio',String(texture.ratio));
    }
    function painted(sampled,box){
      // Static mask coordinates share the unanimated emblem's coordinate space.
      // A bite changes the silhouette; a WAAPI hit transform must never change it.
      const holes=[...String(biteArt?.style.maskImage||'').matchAll(/circle at ([\d.]+)px ([\d.]+)px, transparent 0(?:px)?(?:, transparent)? ([\d.]+)px/g)].map(m=>({x:box.left+Number(m[1]),y:box.top+Number(m[2]),r:Number(m[3])+.35}));
      if(!sampled)return {left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height,image:{left:box.left,top:box.top,width:box.width,height:box.height},sample:null,holes};
      const factor=Math.min(box.width/sampled.naturalWidth,box.height/sampled.naturalHeight),width=sampled.naturalWidth*factor,height=sampled.naturalHeight*factor;
      const image={left:box.left+(box.width-width)/2,top:box.top+(box.height-height)/2,width,height};
      const left=image.left+sampled.bbox.left/sampled.width*width,top=image.top+sampled.bbox.top/sampled.height*height;
      const right=image.left+sampled.bbox.right/sampled.width*width,bottom=image.top+sampled.bbox.bottom/sampled.height*height;
      return {left,top,right,bottom,width:right-left,height:bottom-top,image,sample:sampled,holes};
    }
    function alphaAt(picture,x,y){
      const {image,sample:s}=picture;
      if(picture.holes?.some(h=>Math.hypot(x-h.x,y-h.y)<=h.r))return 0;
      if(!s)return x>=image.left&&x<image.left+image.width&&y>=image.top&&y<image.top+image.height?255:0;
      const px=Math.floor((x-image.left)/image.width*s.width),py=Math.floor((y-image.top)/image.height*s.height);
      return px>=0&&px<s.width&&py>=0&&py<s.height?s.alpha[py*s.width+px]:0;
    }
    function connect(start,picture){
      const target={x:(picture.left+picture.right)/2,y:(picture.top+picture.bottom)/2};
      const distance=Math.hypot(target.x-start.x,target.y-start.y),ux=(target.x-start.x)/distance,uy=(target.y-start.y)/distance;
      for(let d=0;d<=distance;d+=.5){const x=start.x+d*ux,y=start.y+d*uy,a=alphaAt(picture,x,y);if(a>18)return {start,end:{x,y},alpha:a,length:d,angle:Math.atan2(uy,ux)*180/Math.PI};}
      return {start,end:target,alpha:alphaAt(picture,target.x,target.y),length:distance,angle:Math.atan2(uy,ux)*180/Math.PI};
    }
    async function compute(){
      const current=ensureMode(),viewport=overlay.getBoundingClientRect(),w=viewport.width,h=viewport.height;if(!w||!h)return;
      const inset=clamp(w*.014,8,18),doorLeft=inset,doorRight=w-inset,lockX=w/2,naturalY=current==='cage'?h*2/3:h/2;
      let lockY=naturalY;if(current==='cage'||getSettings().displaySize&&getSettings().displaySize!=='standard'){const size=center.getBoundingClientRect().height,info=overlay.querySelector('.lock-info').getBoundingClientRect(),scale=Number(overlay.style.getPropertyValue('--display-scale'))||1,gap=(current==='cage'?20:8)*scale,bottomPadding=16+(getSettings().theme==='fufu'?10*scale:0);lockY=clamp(naturalY,26+size*.54,Math.max(26+size*.54,h-bottomPadding-size/2-gap-info.height));}
      setVar('--scene-lock-x',lockX+'px');setVar('--scene-lock-y',lockY+'px');setVar('--scene-cage-lock-offset',(lockX-w/2)+'px');
      setVar('--scene-cage-inset',inset+'px');setVar('--scene-door-left',doorLeft+'px');setVar('--scene-door-width',((doorRight-doorLeft)/2)+'px');setVar('--scene-door-right',(w-doorRight)+'px');
      const value=source(),sampled=await sample(value);await chainTexture();if(current!==mode()||value!==source()){rerun=true;return;}
      const actual=art.getBoundingClientRect(),box={left:actual.left-viewport.left,top:actual.top-viewport.top,right:actual.right-viewport.left,bottom:actual.bottom-viewport.top,width:actual.width,height:actual.height};
      const picture=painted(sampled,box);
      let chainY=lockY,anchorGap=0,connections;
      if(current==='cage'){
        // Sample upper shackle rows, never the animated .lock-art / .lock-hit.
        // Require a transparent opening and solid left/right rim on a common row.
        let best=null;
        for(let y=picture.top+picture.height*.11;y<picture.top+picture.height*.35;y+=.5){
          if(alphaAt(picture,lockX,y)>18)continue;
          let left=null,right=null;
          for(let x=picture.left;x<lockX-2;x+=.5)if(alphaAt(picture,x,y)>18){left=x;break;}
          for(let x=picture.right;x>lockX+2;x-=.5)if(alphaAt(picture,x,y)>18){right=x;break;}
          if(left===null||right===null)continue;
          const score=Math.abs((left+right)/2-lockX)*8+Math.abs(y-(picture.top+picture.height*.19))*.1;
          if(!best||score<best.score)best={left,right,y,score};
        }
        if(!best){
          // Custom complete locks may have no U opening. Attach to painted body edges,
          // never to bbox.right (the first transparent column outside the silhouette).
          for(const fraction of [.3,.5,.7]){const y=picture.top+picture.height*fraction;let left=null,right=null;
            for(let x=picture.left;x<picture.right;x+=.5)if(alphaAt(picture,x,y)>18){left=x;break;}
            for(let x=picture.right;x>picture.left;x-=.5)if(alphaAt(picture,x,y)>18){right=x;break;}
            if(left!==null&&right!==null){best={left,right,y};break;}
          }
          if(!best){const startA={x:0,y:lockY},startB={x:w,y:lockY},a=connect(startA,picture),b=connect(startB,picture);best={left:a.end.x,right:b.end.x,y:a.end.y};}
        }
        chainY=best.y;anchorGap=Math.min(w*.3,Math.max(picture.width*.68,48));
        const starts=[{x:lockX-anchorGap,y:chainY},{x:lockX+anchorGap,y:chainY}];
        connections=starts.map((start,i)=>{const x=i?best.right:best.left;return {start,end:{x,y:chainY},alpha:alphaAt(picture,x,chainY),length:Math.abs(x-start.x),angle:i?180:0};});
        setVar('--scene-chain-y',chainY+'px');setVar('--scene-latch-gap',anchorGap+'px');
        // Back bars register exactly behind door bars when closed, avoiding
        // doubled, crowded spacing while retaining the separate entry stage.
        const doorCount=w<650?1:w<1200?2:4;
        [...field.children].forEach((bar,i)=>{bar.hidden=i>=doorCount*2;const side=i<doorCount?0:1,index=i%doorCount;const x=side*((w-2*inset)/2)+(index+1)*(w-2*inset)/2/(doorCount+1);bar.style.setProperty('--bar-x',x+'px');});
        cage.querySelectorAll('.cage-door').forEach(door=>[...door.querySelectorAll('.cage-door-bar')].forEach((bar,i)=>{bar.hidden=i>=doorCount;bar.style.setProperty('--bar-x',((i+1)*100/(doorCount+1))+'%');}));
      }else connections=[{x:0,y:0},{x:w,y:0},{x:0,y:h},{x:w,y:h}].map(start=>connect(start,picture));
      for(let i=0;i<arms.length;i++){
        const arm=arms[i],connection=connections[i];if(!arm)continue;
        arm.dataset.sceneActive=String(!!connection);if(!connection)continue;
        arm.style.setProperty('--scene-arm-x',connection.start.x+'px');arm.style.setProperty('--scene-arm-y',connection.start.y+'px');arm.style.setProperty('--scene-arm-length',connection.length+'px');arm.style.setProperty('--scene-arm-angle',connection.angle+'deg');
        arm.dataset.endX=connection.end.x.toFixed(2);arm.dataset.endY=connection.end.y.toFixed(2);
      }
      lastGeometry={mode:current,lockBounds:{left:picture.left,top:picture.top,right:picture.right,bottom:picture.bottom,width:picture.width,height:picture.height},arms:connections,cage:current==='cage'?{left:inset,top:inset,width:w-2*inset,height:h-2*inset,doorLeft,doorRight,centerX:w/2,chainY,anchorGap}:null};
    }
    function position(){
      if(destroyed)return Promise.resolve();rerun=true;
      if(!work)work=(async()=>{while(rerun&&!destroyed){rerun=false;await compute();}})().finally(()=>{work=null;});
      return work;
    }
    function schedule(){if(queued||destroyed)return;queued=true;requestAnimationFrame(()=>{queued=false;position().catch(()=>{});});}
    function clearTimers(){sequence++;for(const timer of timers)clearTimeout(timer);timers.clear();}
    function later(ms,fn){const current=sequence,timer=setTimeout(()=>{timers.delete(timer);if(current===sequence&&!destroyed)fn();},ms);timers.add(timer);}
    function render(state,{totalLayers,remaining,totalHits,motion:enabled}={}){
      const previous=lastMode;ensureMode();
      if(enabled!==undefined)motion=enabled===true||enabled==='on';
      else{const pref=getSettings()?.motion;motion=pref==='on'||pref==='auto'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;}
      overlay.dataset.motion=motion?'on':'off';
      const locked=(totalLayers??state?.layers??0)>0,total=Math.max(0,Number(totalHits??state?.totalHits??0)||0);
      if(locked||overlay.dataset.sceneStatus!=='exiting')shownTotal=total;
      const fufu=getSettings().theme==='fufu';const caption=locked?(fufu?'鼠鼠被关进笼子啦':'被关押'):(fufu?'鼠鼠逃出来啦':'逃离成功'),countText=(fufu?'拍门 ':'逃离累计 ')+Math.floor(shownTotal).toLocaleString()+' 次';
      if(title.textContent!==caption)title.textContent=caption;
      if(hits.textContent!==countText)hits.textContent=countText;
      captivity.dataset.remaining=String(Math.max(0,Number(remaining)||0));
      if(previous!==lastMode)schedule();
      if(!motion&&overlay.dataset.sceneStatus==='entering'){clearTimers();overlay.classList.remove('scene-entering');overlay.dataset.sceneStatus='held';overlay.dataset.cagePhase='closed';}
    }
    function entrance(){
      clearTimers();ensureMode();motion=overlay.dataset.motion==='on';overlay.classList.remove('scene-exiting');overlay.dataset.sceneStatus='entering';overlay.dataset.cagePhase=mode()==='cage'?'frame':'closed';
      overlay.classList.remove('scene-entering');void overlay.offsetWidth;overlay.classList.add('scene-entering');position().catch(()=>{});
      const duration=motion?(mode()==='cage'?2400:1450):0;
      const finish=()=>{overlay.classList.remove('scene-entering');overlay.dataset.sceneStatus='held';overlay.dataset.cagePhase='closed';};
      if(!duration)finish();else{
        if(mode()==='cage'){later(600,()=>overlay.dataset.cagePhase='bars');later(1350,()=>overlay.dataset.cagePhase='door');later(2000,()=>overlay.dataset.cagePhase='bolt');}
        later(duration,finish);
      }
      return duration;
    }
    function exit({totalHits}={}){
      clearTimers();ensureMode();motion=overlay.dataset.motion==='on';overlay.classList.remove('scene-entering');overlay.classList.add('scene-exiting');overlay.dataset.sceneStatus='exiting';overlay.dataset.cagePhase='opening';title.textContent=getSettings().theme==='fufu'?'鼠鼠逃出来啦':'逃离成功';
      if(Number.isFinite(Number(totalHits))&&Number(totalHits)>=0){shownTotal=Number(totalHits);hits.textContent=(getSettings().theme==='fufu'?'拍门 ':'逃离累计 ')+Math.floor(shownTotal).toLocaleString()+' 次';}
      const duration=motion?950:0,finish=()=>{overlay.classList.remove('scene-exiting');overlay.dataset.sceneStatus='open';overlay.dataset.cagePhase='open';};
      if(duration)later(duration,finish);else finish();return duration;
    }
    function flash(name){if(!motion)return;overlay.classList.remove(name);void overlay.offsetWidth;overlay.classList.add(name);later(360,()=>overlay.classList.remove(name));}
    function applyStyle(entry){
      if(entry){
        for(const [key,property] of [['chain','--typing-lock-chain'],['padlock','--typing-lock-padlock'],['lock','--typing-lock-padlock']])if(entry[key])setVar(property,String(entry[key]).startsWith('url(')?String(entry[key]):`url("${entry[key]}")`);
        for(const [key,property] of [['chainRatioX','--lock-chain-ratio-x'],['chainRatioY','--lock-chain-ratio-y'],['chainOffset','--lock-chain-offset'],['accent','--lock-ui-accent'],['bg','--lock-ui-bg'],['ink','--lock-ui-ink']])if(entry[key]!==undefined)setVar(property,String(entry[key]));
        if(entry.wholeLock!==undefined)overlay.dataset.sceneWholeLock=String(!!entry.wholeLock);
        if(entry.accent)setVar('--scene-cage-metal',String(entry.accent));
      }else{
        overlay.dataset.sceneWholeLock=String(overlay.dataset.customLock==='true'||parseFloat(getComputedStyle(overlay).getPropertyValue('--lock-art-split'))>=99);
        const palette={'forged-steel':'#a7b3bf','antique-brass':'#c4a262','arcane-anime':'#a791db','candy-toon':'#e9b4c2'},metal=getSettings().theme==='fufu'?'#A9D8F5':palette[overlay.dataset.material];
        if(metal)setVar('--scene-cage-metal',metal);else overlay.style.removeProperty('--scene-cage-metal');
      }
      schedule();return position();
    }
    const observer=new ResizeObserver(schedule);observer.observe(overlay);observer.observe(art);observer.observe(overlay.querySelector('.lock-info'));
    const mutations=new MutationObserver(schedule);mutations.observe(overlay,{attributes:true,attributeFilter:['hidden','data-custom-lock','data-custom-chain','data-material','data-style','data-look','data-custom-cage']});
    mutations.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-material']});
    if(biteArt)mutations.observe(biteArt,{attributes:true,attributeFilter:['style']});
    window.addEventListener('resize',schedule);ensureMode();schedule();
    return {position,render,entrance,exit,layerBreak:()=>flash('scene-layer-break'),add:()=>flash('scene-added'),applyStyle,geometry:()=>JSON.parse(JSON.stringify(lastGeometry)),destroy(){destroyed=true;clearTimers();observer.disconnect();mutations.disconnect();window.removeEventListener('resize',schedule);cage.remove();captivity.remove();for(const promise of textures.values())promise.then(texture=>{if(texture?.url)URL.revokeObjectURL(texture.url);});for(const arm of arms)arm?.querySelector('.scene-chain-hook')?.remove();}};
  }
  window.LockScenes=Object.freeze({create});
})();
