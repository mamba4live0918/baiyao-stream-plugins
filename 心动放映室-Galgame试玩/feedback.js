(()=>{
 'use strict';
 const stage=document.getElementById('stage');
 const score=document.getElementById('score');
 const layer=document.createElement('div');
 layer.id='feedbackLayer';layer.className='feedback-layer';layer.setAttribute('aria-hidden','true');stage.append(layer);
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const tracks=new Set();
 const barTweens=new Map();
 const maxTracks=90;
 let scoreTween=null;
 function icon(name){return '<svg class="icon" aria-hidden="true"><use href="#i-'+name+'"/></svg>';}
 function dispose(track){track.animation.cancel();if(track.owned)track.node.remove();tracks.delete(track);}
 function clearGroup(group){for(const track of [...tracks])if(track.group===group)dispose(track);}
 function animate(node,keyframes,time,duration,{owned=false,group='reaction',channel=''}={}){
  if(channel)for(const track of [...tracks])if(track.node===node&&track.channel===channel)dispose(track);
  while(tracks.size>=maxTracks)dispose(tracks.values().next().value);
  const ms=Math.max(1,duration*1000);
  const animation=node.animate(keyframes,{duration:ms,fill:'both',easing:'linear'});
  // The game is the only clock. These animations never run on wall-clock time.
  animation.pause();animation.currentTime=0;
  tracks.add({node,animation,start:time,duration:ms,owned,group,channel});
 }
 function part(className){const node=document.createElement('div');node.className=className;layer.append(node);return node;}
 function ring(x,y,size,time,kind,delay=0){
  const node=part('fx-ring'+(kind==='trouble'?' angular':delay?' thin':''));
  node.style.left=x-size/2+'px';node.style.top=y-size/2+'px';node.style.width=node.style.height=size+'px';
  node.style.color=kind==='trouble'?'var(--fx-negative)':'var(--t-accent)';
  const rotate=kind==='trouble'?' rotate(45deg)':'';
  animate(node,[{opacity:0,transform:'scale(.2)'+rotate,offset:0},{opacity:.7,transform:'scale(.52)'+rotate,offset:.17},{opacity:0,transform:'scale(1.45)'+rotate,offset:1}],time+delay,1.1,{owned:true});
 }
 function pulse(node,time,positive,group='reaction'){
  if(!node)return;
  const frames=media.matches?[{opacity:.8},{opacity:1}]:positive?
   [{transform:'scale(1)',offset:0},{transform:'scale(1.12)',offset:.25},{transform:'scale(.98)',offset:.55},{transform:'scale(1)',offset:1}]:
   [{transform:'translateX(0)',offset:0},{transform:'translateX(-7px)',offset:.15},{transform:'translateX(6px)',offset:.3},{transform:'translateX(-4px)',offset:.45},{transform:'translateX(3px)',offset:.6},{transform:'translateX(0)',offset:1}];
  animate(node,frames,time,media.matches ? 0.15 : 0.65,{group,channel:'pulse'});
 }
 function burst(kind,time,intensity){
  if(media.matches)return;
  const count=kind==='trouble'?14:18;
  for(let i=0;i<count;i++){
   const node=part('fx-particle');node.dataset.kind=kind;
   node.innerHTML=icon(kind==='trouble'?(i%2?'spark':'heart-crack'):(i%3?'heart':'spark'));
   const x=1260+(Math.random()-.5)*150,y=420+(Math.random()-.5)*110;
   const size=(kind==='trouble'?17:20)+Math.random()*18+(intensity>10?5:0);
   node.style.left=x+'px';node.style.top=y+'px';node.style.width=node.style.height=size+'px';
   const dx=kind==='trouble'?(Math.random()-.5)*220:1435-x;
   const dy=kind==='trouble'?-75-Math.random()*130:65-y;
   const tilt=(Math.random()-.5)*80;
   animate(node,[{opacity:0,transform:'translate(0,0) scale(.25) rotate(0deg)',offset:0},{opacity:.95,transform:'translate('+(dx*.12)+'px,'+(dy*.05)+'px) scale(1.12) rotate('+tilt+'deg)',offset:.23},{opacity:.85,transform:'translate('+(dx*.5)+'px,'+(dy*.42)+'px) scale(.85) rotate('+(tilt*.4)+'deg)',offset:.63},{opacity:0,transform:'translate('+dx+'px,'+dy+'px) scale(.3) rotate(0deg)',offset:1}],time+i*.024,1.6+Math.random()*.25,{owned:true});
  }
 }
 function react({amount,requested=amount,source='choice',time,from,to}){
  clearGroup('reaction');
  const kind=requested<0?'trouble':requested>0?'cheer':'neutral';
  layer.dataset.motion=media.matches?'reduced':'full';
  const popup=part('reaction-popup');popup.dataset.kind=kind;popup.dataset.source=source;
  const heading=document.createElement('div');heading.className='reaction-heading';heading.innerHTML=icon(kind==='trouble'?'heart-crack':kind==='neutral'?'spark':'heart');
  const title=document.createElement('span');title.className='reaction-title';
  title.textContent=kind==='trouble'?(source==='audience'?'被你气到了':'踩中她的雷点'):kind==='neutral'?'心意已收到':source==='audience'?'心动应援':'心跳漏了一拍';
  const value=document.createElement('span');value.className='reaction-amount';value.textContent=(amount>0?'+':'')+amount;
  heading.append(title,value);
  const line=document.createElement('div');line.className='reaction-line';
  line.textContent=amount===0&&requested!==0?(requested>0?'好感已经满格，心意照单全收。':'这条记下了，冷板凳先给你留着。'):kind==='trouble'?'哼，刚才那一下我记住了！':kind==='neutral'?'这句话，我会好好记着。':'这一下……有点犯规了。';
  popup.append(heading,line);
  const duration=media.matches?1.7:2.35;
  animate(popup,media.matches?[{opacity:0,offset:0},{opacity:1,offset:.08},{opacity:1,offset:.85},{opacity:0,offset:1}]:[{opacity:0,transform:'translateY(18px) scale(.93)',offset:0},{opacity:1,transform:'translateY(-3px) scale(1.035)',offset:.13},{opacity:1,transform:'translateY(0) scale(1)',offset:.22},{opacity:1,transform:'translateY(0) scale(1)',offset:.76},{opacity:0,transform:'translateY(-18px) scale(.98)',offset:1}],time,duration,{owned:true});
  if(!media.matches){
   ring(1300,385,150,time,kind);ring(1300,385,220,time,kind,.14);
   const emblem=part('reaction-emblem');emblem.dataset.kind=kind;emblem.innerHTML=icon(kind==='trouble'?'heart-crack':kind==='neutral'?'spark':'heart');emblem.style.left='1250px';emblem.style.top='335px';
   animate(emblem,[{opacity:0,transform:'scale(.1) rotate(-18deg)',offset:0},{opacity:1,transform:'scale(1.25) rotate(8deg)',offset:.22},{opacity:1,transform:'scale(.95) rotate(-3deg)',offset:.4},{opacity:0,transform:'translateY(-58px) scale(1.08) rotate(6deg)',offset:1}],time,1.35,{owned:true});
   if(kind==='trouble'){
    const emote=part('comic-emote');emote.textContent='哼！';
    animate(emote,[{opacity:0,transform:'scale(.3) rotate(-20deg)',offset:0},{opacity:1,transform:'scale(1.2) rotate(5deg)',offset:.2},{opacity:1,transform:'scale(1) rotate(-4deg)',offset:.65},{opacity:0,transform:'translateY(-20px) scale(.8)',offset:1}],time+.12,1.3,{owned:true});
   }
  }
  burst(kind,time,Math.abs(requested));pulse(document.querySelector('.status'),time,kind!=='trouble');
  if(kind==='trouble'&&!media.matches){
   for(const node of [document.getElementById('dialogueSkin'),document.getElementById('dialogue')])
    animate(node,[{transform:'translateX(0)',offset:0},{transform:'translateX(-4px)',offset:.15},{transform:'translateX(4px)',offset:.3},{transform:'translateX(-3px)',offset:.45},{transform:'translateX(2px)',offset:.6},{transform:'translateX(0)',offset:1}],time,.45,{channel:'impact'});
  }
  scoreTween={from:Number.isFinite(from)?from:to,to,start:time,duration:media.matches ? 0.12 : 0.65};
 }
 function banner(text,time,{index=null,duration=.95}={}){
  clearGroup('vote-banner');
  const node=part('vote-announcement');node.innerHTML=icon(index===null?'log':'check');
  const label=document.createElement('span');label.textContent=text;node.append(label);
  if(index!==null){const number=document.createElement('strong');number.textContent=String(index+1).padStart(2,'0');node.append(number);}
  animate(node,[{opacity:0,transform:media.matches?'none':'translateY(-12px) scale(.96)',offset:0},{opacity:1,transform:'translateY(0) scale(1)',offset:.16},{opacity:1,transform:'translateY(0) scale(1)',offset:.78},{opacity:0,transform:media.matches?'none':'translateY(7px) scale(1)',offset:1}],time,duration,{owned:true,group:'vote-banner'});
 }
 function voteStart(time){banner('弹幕投票开始',time,{duration:1.2});pulse(document.getElementById('voteClock'),time,true,'vote');}
 function voteBar(index,target,time){
  const node=document.getElementById('choices').children[index]?.querySelector('.vote-bar');
  if(!node)return;
  const from=parseFloat(node.style.width)||0;
  const to=Math.max(0,Math.min(100,Number.isFinite(target)?target:0));
  if(from===to){barTweens.delete(node);return;}
  barTweens.set(node,{from,to,start:time});
 }
 function votePulse(index,time,changed=false){
  const button=document.getElementById('choices').children[index];if(!button)return;
  pulse(button.querySelector('.vote-count'),time,true,'vote');
  if(media.matches)return;
  const node=part('vote-token');node.textContent=changed?'改票':'+1';node.style.left='1195px';node.style.top=(382+index*84)+'px';
  animate(node,[{opacity:0,transform:'translate(35px,14px) scale(.6)',offset:0},{opacity:1,transform:'translate(0,0) scale(1.1)',offset:.3},{opacity:0,transform:'translate(-44px,-18px) scale(.7)',offset:1}],time,.6,{owned:true,group:'vote'});
 }
 function selection(index,time,settled){
  clearGroup('selection');clearGroup('vote');
  const area=document.getElementById('choiceArea');area.classList.add('settling');
  area.dataset.winner=String(index+1);
  const duration=media.matches ? 0.2 : 0.9;
  Array.from(document.getElementById('choices').children).forEach((button,i)=>{
   button.disabled=true;button.classList.toggle('winner',i===index);button.classList.toggle('losing',i!==index);
   const frames=i===index?(media.matches?[{opacity:1},{opacity:1}]:[{opacity:1,transform:'scale(1)',offset:0},{opacity:1,transform:'scale(1.055)',offset:.24},{opacity:1,transform:'scale(1.018)',offset:.46},{opacity:1,transform:'scale(1.018)',offset:.84},{opacity:0,transform:'scale(1.025)',offset:1}]):[{opacity:1,transform:'translateX(0)',offset:0},{opacity:.2,transform:media.matches?'none':'translateX('+(i%2?-24:24)+'px)',offset:.45},{opacity:0,transform:media.matches?'none':'translateX('+(i%2?-36:36)+'px)',offset:1}];
   animate(button,frames,time,duration,{group:'selection',channel:'choice'});
  });
  banner(settled?'弹幕共同选择':'心意已锁定',time,{index,duration});
 }
 function tick(time){
  if(scoreTween){
   const p=Math.min(1,Math.max(0,(time-scoreTween.start)/scoreTween.duration));
   score.textContent=String(Math.round(scoreTween.from+(scoreTween.to-scoreTween.from)*(1-Math.pow(1-p,3))));
   if(p===1)scoreTween=null;
  }
  for(const [node,tween] of barTweens){
   if(!node.isConnected){barTweens.delete(node);continue;}
   const p=Math.min(1,Math.max(0,(time-tween.start)/.24));
   node.style.width=(tween.from+(tween.to-tween.from)*(1-Math.pow(1-p,3)))+'%';
   if(p===1)barTweens.delete(node);
  }
  for(const track of [...tracks]){
   if(!track.node.isConnected){dispose(track);continue;}
   const elapsed=(time-track.start)*1000;
   track.animation.currentTime=Math.max(0,Math.min(track.duration,elapsed));
   if(elapsed>=track.duration)dispose(track);
  }
  layer.dataset.active=String(layer.children.length);
 }
 function clear(){for(const track of [...tracks])dispose(track);barTweens.clear();scoreTween=null;layer.replaceChildren();layer.dataset.active='0';document.getElementById('choiceArea').classList.remove('settling');delete document.getElementById('choiceArea').dataset.winner;}
 window.HeartRoomFeedback=Object.freeze({react,tick,clear,voteStart,votePulse,voteBar,selection,get selectionDuration(){return media.matches ? 0.2 : 0.9;}});
})();
