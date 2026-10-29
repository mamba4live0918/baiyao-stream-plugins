/* V2.3 presentation feedback. The outer emblem remains a static geometry anchor. */
(()=>{'use strict';
  const thresholds=[.2,.4,.6,.8,.95];
  // Original 1280-square fufu artwork: body edges below the ears (y >= .63).
  const bites=[[.232,.635], [.757,.68], [.307,.815], [.689,.825], [.49,.873]];
  const tones={horror:[92,.22,'triangle',2.71],cyber:[420,.14,'sine',1.53],typewriter:[185,.16,'triangle',3.15],notebook:[285,.075,'sine',1.18],pixel:[160,.09,'square',2],chalk:[370,.07,'triangle',1.42],terminal:[740,.085,'square',.5],cream:[230,.12,'sine',1.25],fufu:[150,.09,'sine',1.5]};
  function create({overlay,getSettings=()=>({}),spawn=()=>{}}){
    if(!overlay)throw new Error('LockHitFeedback requires an overlay');
    const art=overlay.querySelector('.lock-art');
    if(!art)throw new Error('LockHitFeedback requires .lock-art');
    let wrapper=art.closest('.lock-hit');
    if(!wrapper){wrapper=document.createElement('span');wrapper.className='lock-hit';art.before(wrapper);wrapper.append(art);}
    const emblem=art.closest('.lock-emblem'),animations=new Map(),audioNodes=new Set();let count=0,token,serial=0,ripple=null,paw=null,impactTimer=0,lastPoint=null,maskSize='';
    const settings=()=>getSettings()||{};
    const mode=()=>settings().mode||(settings().sceneMode==='cage'?'cage':'lock');
    const motion=()=>settings().motion!=='off'&&overlay.dataset.motion!=='off';
    function cancelAnimations(){for(const a of animations.values())a.cancel();animations.clear();}
    function animate(el,frames,duration=120){
      if(!el)return;const prior=animations.get(el);if(prior)prior.cancel();
      try{const a=el.animate(frames,{duration,easing:'ease-out'});animations.set(el,a);a.onfinish=()=>{if(animations.get(el)===a)animations.delete(el);};}catch{}
    }
    function clearImpact(){clearTimeout(impactTimer);impactTimer=0;for(const e of [ripple,paw])if(e){animations.get(e)?.cancel();animations.delete(e);e.remove();}ripple=paw=null;}
    function clearMask(){count=0;maskSize='';art.dataset.biteCount='0';art.style.removeProperty('mask-image');art.style.removeProperty('-webkit-mask-image');art.style.removeProperty('mask-composite');art.style.removeProperty('-webkit-mask-composite');}
    function gnawAllowed(){
      if(settings().theme!=='fufu'||mode()==='cage')return false;
      // Imported artwork and material replacements have unknown ear/body anatomy.
      // Preserve them intact rather than cutting guessed holes in the wrong shape.
      if(overlay.dataset.customLock==='true'||overlay.dataset.material){art.dataset.biteSuppressed='custom-art-body-unknown';return false;}
      delete art.dataset.biteSuppressed;return true;
    }
    function bitePoint(index){
      const r=emblem.getBoundingClientRect(),side=Math.min(r.width,r.height),b=bites[Math.max(0,index)],f=overlay.querySelector('#lock-fx')?.getBoundingClientRect()||overlay.getBoundingClientRect();
      return {x:r.x+(r.width-side)/2+b[0]*side-f.x,y:r.y+(r.height-side)/2+b[1]*side-f.y,side};
    }
    function crumbs(index,chunk=false){
      if(!motion()||!gnawAllowed())return;
      const p=bitePoint(index),n=chunk?3:1+serial%3,direction=bites[Math.max(0,index)][0]<.5?-1:1;
      for(let i=0;i<n;i++){
        const dx=direction*(18+Math.random()*25)+(i-1)*8,dy=25+Math.random()*25;
        spawn('hit-crumb hit-crumb-'+i%2,[{transform:`translate(${p.x}px,${p.y}px) scale(1)`,opacity:1},{transform:`translate(${p.x+dx}px,${p.y+dy}px) rotate(${dx*5}deg) scale(.25)`,opacity:0}],{duration:260+Math.random()*100,easing:'ease-out'});
      }
      if(chunk)spawn('hit-cheese-chunk',[{transform:`translate(${p.x}px,${p.y}px) scale(${Math.max(.6,p.side/350)})`,opacity:1},{transform:`translate(${p.x+direction*60}px,${p.y+62}px) rotate(${direction*135}deg) scale(.3)`,opacity:0}],{duration:400,easing:'ease-out'});
    }
    function update(progress,layerToken){
      const changed=layerToken!==token;if(changed){clearMask();token=layerToken;}
      if(!motion()){for(const [el,a] of animations)if(a.effect.getKeyframes().some(f=>f.transform)){a.cancel();animations.delete(el);}clearImpact();}
      if(!gnawAllowed()){clearMask();return;}
      const ratio=Math.max(0,Math.min(1,Number(progress)||0)),next=thresholds.filter(t=>ratio>=t).length;
      const width=wrapper.clientWidth,height=wrapper.clientHeight,sizeKey=width+':'+height;
      if(next===count&&maskSize===sizeKey)return;
      const previous=count;count=next;art.dataset.biteCount=String(next);
      if(!next){clearMask();return;}
      const side=Math.min(width,height),radius=side*.033;maskSize=sizeKey;
      const masks=bites.slice(0,next).map(([x,y])=>`radial-gradient(circle at ${(width-side)/2+x*side}px ${(height-side)/2+y*side}px, transparent 0 ${radius}px, #000 ${radius+.6}px)`);
      art.style.maskImage=masks.join(',');art.style.maskComposite='intersect';
      for(let i=previous;i<next;i++)crumbs(i,true);
    }
    function flash(){animate(wrapper,[{filter:'brightness(1)'},{filter:'brightness(1.35)',offset:.25},{filter:'brightness(1)'}]);}
    function doorImpact(){
      const rect=overlay.getBoundingClientRect(),doors=[...overlay.querySelectorAll('.cage-door')],rects=doors.map(e=>e.getBoundingClientRect());
      const top=rects.length?Math.max(...rects.map(r=>r.top))-rect.top:rect.height*.15,bottom=rects.length?Math.min(...rects.map(r=>r.bottom))-rect.top:rect.height*.75;
      const span=Math.max(0,bottom-top),spread=Math.min(48,rect.width*.035);
      const x=rect.width/2+(Math.random()*2-1)*spread;
      // A seam impact must remain on the door, rather than flashing over the lock/HUD.
      let bands=[[top+32,bottom-32]];
      for(const obstacle of [emblem,overlay.querySelector('.lock-info')]){
        if(!obstacle)continue;const r=obstacle.getBoundingClientRect();
        if(!r.width||!r.height||x<r.left-rect.left-24||x>r.right-rect.left+24)continue;
        const low=r.top-rect.top-32,high=r.bottom-rect.top+32;
        bands=bands.flatMap(([a,b])=>high<=a||low>=b?[[a,b]]:[[a,Math.min(b,low)],[Math.max(a,high),b]].filter(([lo,hi])=>hi-lo>8));
      }
      if(!bands.length)bands=[[top+span*.12,top+span*.88]];
      const total=bands.reduce((sum,[a,b])=>sum+Math.max(0,b-a),0);let pick=Math.random()*total,y=bands[0][0];
      for(const [a,b] of bands){if(pick<=b-a){y=a+pick;break;}pick-=b-a;}
      if(lastPoint&&Math.abs(y-lastPoint.y)<8){const band=bands.find(([a,b])=>y>=a&&y<=b);if(band)y=band[0]+((y-band[0]+(band[1]-band[0])*.43)%(band[1]-band[0]));}
      lastPoint={x,y};
      if(!ripple){ripple=document.createElement('i');ripple.className='door-impact-ripple';ripple.setAttribute('aria-hidden','true');overlay.append(ripple);}
      ripple.style.left=x+'px';ripple.style.top=y+'px';
      animate(ripple,[{transform:'translate(-50%,-50%) scale(.2)',opacity:.9},{transform:'translate(-50%,-50%) scale(1.6)',opacity:0}],250);
      if(settings().theme==='fufu'){
        if(!paw){paw=document.createElement('i');paw.className='door-impact-paw';paw.setAttribute('aria-hidden','true');overlay.append(paw);}
        paw.style.left=x+'px';paw.style.top=y+'px';
        animate(paw,[{transform:'translate(-50%,-50%) rotate(-12deg) scale(.7)',opacity:.95},{transform:'translate(-50%,-50%) rotate(-12deg) scale(1)',opacity:0}],320);
      }else if(paw){animations.get(paw)?.cancel();animations.delete(paw);paw.remove();paw=null;}
      clearTimeout(impactTimer);impactTimer=setTimeout(clearImpact,340);
    }
    function hit(){
      cancelAnimations();serial++;flash();
      if(!motion()){clearImpact();return;}
      const sign=serial%2?1:-1,cage=mode()==='cage';
      // Transform and brightness share one animation so the second does not cancel the first.
      animate(wrapper,cage?[{transform:'rotate(0deg)',filter:'brightness(1)'},{transform:`translateY(-1px) rotate(${sign*2}deg)`,filter:'brightness(1.3)',offset:.3},{transform:`rotate(${-sign}deg)`,offset:.65},{transform:'none',filter:'brightness(1)'}]:[{transform:'scale(1) rotate(0deg)',filter:'brightness(1)'},{transform:`scale(1.045,.94) rotate(${sign*2}deg)`,filter:'brightness(1.3)',offset:.3},{transform:`scale(.985,1.025) rotate(${-sign*.7}deg)`,offset:.65},{transform:'none',filter:'brightness(1)'}],cage?150:120);
      for(const chain of overlay.querySelectorAll('.chain-arm .lock-chain'))animate(chain,[{transform:'none'},{transform:cage?'translateY(1.5px) scaleX(1.006)':'scaleX(1.008) scaleY(.95)',offset:.3},{transform:'none'}],cage?150:120);
      if(cage){
        const doors=[...overlay.querySelectorAll('.cage-door')];doors.forEach((door,i)=>animate(door,[{transform:'none'},{transform:`perspective(900px) rotateY(${i%2?2:-2}deg) scaleX(1.012)`,offset:.3},{transform:`perspective(900px) rotateY(${i%2?-.5:.5}deg)`,offset:.65},{transform:'none'}],150));
        for(const bar of overlay.querySelectorAll('.cage-bar'))animate(bar,[{transform:'none'},{transform:`translateX(${sign*.8}px)`,offset:.3},{transform:`translateX(${-sign*.4}px)`,offset:.65},{transform:'none'}],150);
        doorImpact();return;
      }
      clearImpact();
      if(settings().theme==='fufu'){
        for(const mouse of overlay.querySelectorAll('.fufu-mouse-art'))animate(mouse,[{transform:'none'},{transform:'translateY(2px) rotate(8deg) scaleY(.91)',offset:.35},{transform:'none'}]);
        crumbs(Math.max(0,count-1));
      }
    }
    function synthDoor(ctx,gainScale=1){
      // Cancel previous slap nodes as well: sustained >10Hz input stays bounded.
      for(const node of audioNodes){try{node.stop();}catch{}node.disconnect();}audioNodes.clear();
      const theme=settings().theme,[freq,duration,wave,partial]=tones[theme]||tones.horror,now=ctx.currentTime,volume=Math.max(0,Math.min(2,Number(gainScale)||0));
      function tone(frequency,end,type,level,delay=0,length=duration){
        const osc=ctx.createOscillator(),gain=ctx.createGain(),start=now+delay;osc.type=type;osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),start+length);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.00011,level*volume),start+.004);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
        osc.connect(gain).connect(ctx.destination);audioNodes.add(osc);osc.onended=()=>{audioNodes.delete(osc);osc.disconnect();gain.disconnect();};osc.start(start);osc.stop(start+length+.01);
      }
      tone(freq,freq*.55,wave,theme==='fufu'?.045:.06);tone(freq*partial,freq*partial*.84,theme==='pixel'?'square':'sine',.021,0,duration*.8);
      if(theme==='fufu')tone(1150,1670,'sine',.02,.045,.06);
    }
    function reset(){cancelAnimations();clearImpact();clearMask();token=undefined;lastPoint=null;delete art.dataset.biteSuppressed;}
    function stop(){cancelAnimations();clearImpact();for(const node of audioNodes){try{node.stop();}catch{}node.disconnect();}audioNodes.clear();}
    clearMask();return {update,hit,reset,stop,synthDoor};
  }
  window.LockHitFeedback={create};
})();
