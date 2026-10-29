/* Presentation only. No game state, rules, counts or decay are changed here. */
(()=>{'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const mouse='<svg viewBox="0 0 42 30" aria-hidden="true"><path d="M8 22C-4 22 1 10 8 12" fill="none" stroke="#E2718F" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="23" cy="20" rx="15" ry="9" fill="#F3D99A" stroke="#6A4B3C" stroke-width="1.4"/><circle cx="23" cy="9" r="7" fill="#F3D99A" stroke="#6A4B3C" stroke-width="1.4"/><circle cx="23" cy="9" r="4.5" fill="#F8CBC4"/><path d="M32 15L41 20L34 24" fill="#F3D99A" stroke="#6A4B3C" stroke-width="1.4" stroke-linejoin="round"/><path d="M16 27h5m9 0h4" stroke="#6A4B3C" stroke-width="2" stroke-linecap="round"/></svg>';
  const cheese='<svg viewBox="0 0 32 28" aria-hidden="true"><path d="M3 10L20 2L29 10V25H3Z" fill="#FFCF5A" stroke="#B47B25" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 10H29L20 2Z" fill="#FFE995"/><circle cx="10" cy="16" r="2.5" fill="#E5A239"/><circle cx="23" cy="20" r="3" fill="#E5A239"/><circle cx="18" cy="7" r="1.5" fill="#E5A239"/></svg>';
  function create({overlay,getSettings}){
    const tracks=[];let celebrateTimer=0,fitKey='',fitting=false;
    for(const [parent,kind] of [[overlay.querySelector('.lock-meter'),'bar'],[overlay.querySelector('#lock-counter'),'count']]){
      const track=document.createElement('div');track.className='fufu-race fufu-race-'+kind;track.setAttribute('aria-hidden','true');
      track.innerHTML='<span class="fufu-mouse"><span class="fufu-mouse-art">'+mouse+'</span></span><span class="fufu-cheese">'+cheese+'</span>';parent.append(track);tracks.push(track);
    }
    function updateProgress(ratio){
      overlay.style.setProperty('--lock-progress',String(clamp(Number(ratio)||0,0,1)));
      if(getSettings().theme!=='fufu')return;
      if(overlay.dataset.motion==='off')stop();
      for(const track of tracks){const runner=track.querySelector('.fufu-mouse');const travel=Math.max(0,track.clientWidth-runner.offsetWidth);track.style.setProperty('--fufu-travel',travel+'px');}
    }
    function layerBreak(){
      if(getSettings().theme!=='fufu'||overlay.dataset.motion!=='on')return;
      clearTimeout(celebrateTimer);overlay.classList.add('fufu-celebrate');
      for(const track of tracks){if(!track.clientWidth)continue;track.querySelector('.fufu-mouse-art').animate([{transform:'translateY(0)'},{transform:'translateY(-9px) rotate(-8deg)',offset:.45},{transform:'translateY(0)'}],{duration:420,easing:'ease-out'});track.querySelector('.fufu-cheese').animate([{transform:'scale(1)'},{transform:'scale(.82) rotate(10deg)',offset:.45},{transform:'scale(1)'}],{duration:420});}
      celebrateTimer=setTimeout(()=>overlay.classList.remove('fufu-celebrate'),430);
    }
    function effects(kind,spawn){
      const count=kind==='clear'?30:kind==='layer'?16:kind==='hit'?6:8;
      if(kind==='layer'||kind==='clear'){
        const track=tracks.find(track=>track.clientWidth),layer=overlay.querySelector('#lock-fx');
        if(track&&layer){const cheese=track.querySelector('.fufu-cheese').getBoundingClientRect(),origin=layer.getBoundingClientRect(),x=cheese.x+cheese.width/2-origin.x,y=cheese.y+cheese.height/2-origin.y;
          for(let i=0;i<5;i++)spawn('fufu-particle fufu-cheese fufu-crumb',[{transform:`translate(${x}px,${y}px) scale(.4)`,opacity:1},{transform:`translate(${x+(i-2)*12}px,${y+35+i*4}px) rotate(${i*53}deg) scale(.15)`,opacity:0}],{duration:520,easing:'ease-out'});
        }
      }
      for(let i=0;i<count;i++){const shape=kind==='clear'?'heart':['star','heart','cheese'][i%3],angle=360*i/count+(kind==='hit'?Math.random()*24:0),distance=(kind==='clear'?240:kind==='layer'?150:75)*(0.7+Math.random()*.4);spawn('fufu-particle fufu-'+shape+' fufu-color-'+(i%3),[{transform:`rotate(${angle}deg) translateY(-28px) rotate(${-angle}deg) scale(.7)`,opacity:1},{transform:`rotate(${angle}deg) translateY(-${distance}px) rotate(${90-angle}deg) scale(.35)`,opacity:0}],{duration:kind==='hit'?360:kind==='clear'?850:650,easing:'ease-out'});}
      if(kind==='layer'||kind==='clear'){spawn('fufu-ring',[{transform:'scale(.3)',opacity:.9},{transform:'scale('+(kind==='clear'?2.4:1.5)+')',opacity:0}],{duration:600});spawn('fufu-flash',[{transform:'scale(.2)',opacity:.75},{transform:'scale(1.6)',opacity:0}],{duration:380});}
    }
    function synth(ctx,kind,gainScale){
      const now=ctx.currentTime;
      const squeak=(time)=>{const o=ctx.createOscillator(),g=ctx.createGain(),pitch=1+(Math.random()*.16-.08);o.type='sine';o.frequency.setValueAtTime(1100*pitch,time);o.frequency.exponentialRampToValueAtTime(1700*pitch,time+.045);g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(Math.max(.00011,.024*gainScale),time+.008);g.gain.exponentialRampToValueAtTime(.0001,time+.06);o.connect(g).connect(ctx.destination);o.start(time);o.stop(time+.065);};
      const bell=(time,freq)=>{for(const [ratio,volume] of [[1,.035],[2.76,.009]]){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(freq*ratio,time);g.gain.setValueAtTime(Math.max(.00011,volume*gainScale),time);g.gain.exponentialRampToValueAtTime(.0001,time+.36);o.connect(g).connect(ctx.destination);o.start(time);o.stop(time+.38);}};
      if(kind==='hit')squeak(now);else if(kind==='layer'){squeak(now);squeak(now+.085);bell(now+.17,1568);}else if(kind==='clear'){squeak(now);squeak(now+.085);squeak(now+.17);bell(now+.255,2093);}else{bell(now,784);}
    }
    function fit(){
      if(fitting)return;const settings=getSettings(),w=innerWidth,h=innerHeight,size=settings.displaySize||'large';overlay.dataset.displaySize=size;overlay.dataset.cageFit=String(settings.sceneMode==='cage');
      const key=[w,h,size,settings.sceneMode,settings.theme,overlay.dataset.challenge,overlay.classList.contains('lock-frozen'),overlay.querySelector('#typing-lock-key').textContent,overlay.querySelector('#typing-lock-layers').textContent.length].join('|');
      const baseThickness=clamp(Math.min(w,h)*.055,26,66);
      if(size==='standard'&&settings.sceneMode!=='cage'){overlay.style.setProperty('--display-scale','1');overlay.style.setProperty('--lock-thickness',baseThickness+'px');fitKey=key;return;}
      if(key===fitKey&&!overlay.hidden)return;
      fitting=true;
      const cage=settings.sceneMode==='cage';let baseLock=cage?(h<=540?105:clamp(w*.15,size==='standard'?130:108,size==='standard'?210:190)):(w<=650?clamp(w*.38,140,195):clamp(w*.19,145,245));
      const basePanel=cage?340:330;let scale=Math.min(size==='standard'?1:size==='xlarge'?3.1:2.2,(w-32)/basePanel);
      overlay.style.setProperty('--lock-base-size',baseLock+'px');overlay.style.setProperty('--panel-base-width',basePanel+'px');overlay.style.setProperty('--base-counter-font',(w<=650?24:28)+'px');overlay.style.setProperty('--display-scale',String(scale));
      if(!overlay.hidden){for(let i=0;i<4;i++){const info=overlay.querySelector('.lock-info'),height=baseLock*scale*1.04+info.getBoundingClientRect().height+(cage?20:8)*scale,available=h-42-(settings.theme==='fufu'?10*scale:0);if(height<=available)break;scale*=Math.max(.1,available/height);overlay.style.setProperty('--display-scale',String(scale));}fitKey=key;}
      let artRatio=1;
      if(cage&&!overlay.hidden){
        const info=overlay.querySelector('.lock-info'),originalBase=baseLock;
        if(w>=h||h/3-16-info.getBoundingClientRect().height-20*scale-(settings.theme==='fufu'?10*scale:0)<25*scale){for(let i=0;i<6;i++){const available=h/3-16-(settings.theme==='fufu'?10*scale:0),needed=baseLock*scale/2+info.getBoundingClientRect().height+20*scale;if(needed<=available)break;scale*=Math.max(.1,available/needed);overlay.style.setProperty('--display-scale',String(scale));}}
        else{const room=h/3-16-info.getBoundingClientRect().height-20*scale-(settings.theme==='fufu'?10*scale:0);baseLock=Math.min(baseLock,Math.max(50,room*2/scale));overlay.style.setProperty('--lock-base-size',baseLock+'px');}
        artRatio=baseLock/originalBase;
      }
      overlay.style.setProperty('--lock-thickness',baseThickness*scale*artRatio+'px');fitting=false;updateProgress(parseFloat(overlay.style.getPropertyValue('--lock-progress'))||0);
    }
    function invalidate(){fitKey='';fit();}
    function syncCards(){const box=document.getElementById('theme');for(const card of box.querySelectorAll('button[data-value]')){const selected=card.dataset.value===getSettings().theme;card.setAttribute('aria-checked',String(selected));card.tabIndex=selected?0:-1;}}
    function bindCards(){const box=document.getElementById('theme');box.addEventListener('keydown',event=>{if(event.ctrlKey||event.altKey||event.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const cards=[...box.querySelectorAll('button[data-value]')],current=cards.indexOf(event.target.closest('button[data-value]'));if(current<0)return;event.preventDefault();const columns=getComputedStyle(box).gridTemplateColumns.split(' ').length;let next=event.key==='Home'?0:event.key==='End'?cards.length-1:current+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key]);next=(next+cards.length)%cards.length;cards[next].focus();cards[next].click();});syncCards();}
    function stop(){clearTimeout(celebrateTimer);overlay.classList.remove('fufu-celebrate');for(const track of tracks)for(const animation of track.getAnimations({subtree:true}))animation.cancel();overlay.querySelectorAll('#lock-fx .fufu-particle,#lock-fx .fufu-ring,#lock-fx .fufu-flash').forEach(node=>node.remove());}
    return {updateProgress,layerBreak,effects,synth,fit,invalidate,syncCards,bindCards,stop};
  }
  globalThis.LockPresentation=Object.freeze({create});
})();
