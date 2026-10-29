(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PuppetEffects=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function keyFor(kind,variant){return kind==='kick'?(variant==='barefoot'?'kickBarefoot':'kickShoe'):kind;}
let loading;
const PINCH_POSES=[
  [0,-1.35,-.10,.80,.95,-8,0],[.12,0,0,1,1,0,1],[.18,0,0,1,1,0,1],
  [.22,-.012,0,1,1,0,1],[.38,-.020,0,1,1,0,1],[.54,-.017,0,1,1,0,1],
  [.68,-.021,0,1,1,0,1],[.78,-.018,0,1,1,0,1],[.86,0,0,1,1,0,1],
  [.94,-.55,-.08,.90,1,-4,.55],[1,-1.2,-.16,.75,.9,-10,0]
];
function preload(){
  if(!loading)loading=Promise.all(['hit','pinch','kickShoe','kickBarefoot'].map(kind=>new Promise((resolve,reject)=>{
    const url=root.PuppetArt?.[kind];if(!url){reject(new Error('内置素材缺失：'+kind));return;}
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('内置素材加载失败：'+kind));img.src=url;
  }))).then(images=>{root.PuppetPinchFrames.prepare(images[1],root.PuppetArtMeta.pinch);return images;}).catch(error=>{loading=null;throw error;});
  return loading;
}
function icon(container,kind,variant='shoe'){
  container.replaceChildren();const img=container.ownerDocument.createElement('img');img.src=root.PuppetArt[keyFor(kind,variant)];img.alt='';img.setAttribute('aria-hidden','true');img.className='action-art';container.append(img);
}
function play({kind,settings={},anchors,layers,signal}){
  if(!['hit','pinch','kick'].includes(kind))throw new Error('未知道具动作');
  const artKey=keyFor(kind,settings.variant),meta=root.PuppetArtMeta?.[artKey];
  if(!meta||!root.PuppetArt?.[artKey])throw new Error('内置素材缺失');
  if(signal?.aborted)return Promise.resolve();
  const duration=Number(settings.duration??(kind==='pinch'?4:1))*1000,sizeRatio=Number(settings.size??.16),strength=Number(settings.intensity??1);
  const skinColor=settings.skinColor??'#ffe3d5',markScale=Number(settings.pinchMarkScale??1),markOpacity=Number(settings.pinchMarkOpacity??.85);
  const effectScale=Number(settings.effectScale??1),contactScale=Number(settings.contactScale??1),headHit=kind==='hit'&&settings.hitTarget==='head';
  if(!Number.isFinite(effectScale)||effectScale<.25||effectScale>3||!Number.isFinite(contactScale)||contactScale<.25||contactScale>3)throw new Error('特效大小无效');
  if(kind==='hit')root.PuppetPinchMarks.palette(skinColor);
  if(kind==='pinch'){root.PuppetPinchMarks.palette(skinColor);if(!Number.isFinite(markScale)||markScale<.5||markScale>2||!Number.isFinite(markOpacity)||markOpacity<0||markOpacity>1)throw new Error('捏痕参数无效');}
  const markFade=kind==='pinch'&&markOpacity>0?Math.min(350,duration*.08):0;
  if(!Number.isFinite(duration)||duration<50||duration>(kind==='pinch'?15000:5000)||!Number.isFinite(sizeRatio)||sizeRatio<.02||sizeRatio>1)throw new Error('特效参数无效');
  const nodes=[],animations=[],hands=[],marks=[],power=Math.max(.7,Math.min(1.65,.9+strength*.18));
  const doc=layers?.[0]?.ownerDocument;
  if(!doc)return Promise.resolve();
  const animate=(el,frames,options={})=>{const a=el.animate(frames,{duration,fill:'both',easing:'linear',...options});animations.push(a);return a;};
  const node=(layer,className,styles,html)=>{const el=doc.createElement('div');el.className=className;Object.assign(el.style,{position:'absolute',pointerEvents:'none',...styles});if(html)el.innerHTML=html;layer.append(el);nodes.push(el);return el;};
  function starMarkup(color){return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 2L61 37L98 50L61 62L50 98L38 62L2 50L38 37Z" fill="'+color+'" stroke="#fff7dc" stroke-width="3"/></svg>';}
  function burstMarkup(){return '<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M101 3L117 57L157 24L151 68L198 66L162 95L194 132L147 128L152 181L117 151L98 200L80 146L36 178L49 132L4 126L39 97L8 57L60 66L64 16L87 58Z" fill="#f3ceb9" stroke="#6b4841" stroke-width="3"/><path d="M100 27L111 72L148 44L138 81L177 79L147 100L174 126L134 120L139 161L111 139L99 179L84 135L50 160L63 122L25 119L58 98L32 72L71 80L72 43L88 74Z" fill="#f5ad9c"/><path d="M101 59L115 87L145 101L114 112L99 143L87 114L58 99L85 88Z" fill="#fff5e7"/></svg>';}
  function impact(layer,x,y,size,mirror){
    const w=size*1.22,h=w;
    const burst=node(layer,'fx-burst',{left:x-w/2+'px',top:y-h/2+'px',width:w+'px',height:h+'px'},burstMarkup());
    animate(burst,[{offset:0,opacity:0,transform:'scale(.08) rotate(-15deg)'},{offset:.07,opacity:0,transform:'scale(.08) rotate(-15deg)'},{offset:.10,opacity:1,transform:'scale(1.05) rotate(4deg)'},{offset:.16,opacity:.95,transform:'scale(1.35) rotate(11deg)'},{offset:.36,opacity:0,transform:'scale(1.65) rotate(18deg)'},{offset:1,opacity:0,transform:'scale(1.65) rotate(18deg)'}]);
    const ring=node(layer,'fx-shock',{left:x-size*.4+'px',top:y-size*.4+'px',width:size*.8+'px',height:size*.8+'px',border:Math.max(2,size*.024)+'px solid #fff5cf',borderRadius:'50%',boxShadow:'0 0 '+size*.045+'px #ffcbb5'});
    animate(ring,[{offset:0,opacity:0,transform:'scale(.3)'},{offset:.09,opacity:0,transform:'scale(.3)'},{offset:.13,opacity:1,transform:'scale(.85)'},{offset:.45,opacity:0,transform:'scale(2.6)'},{offset:1,opacity:0,transform:'scale(2.6)'}]);
    for(let i=0;i<7;i++){
      const angle=(i/7*Math.PI*2)-.3,radius=size*(.62+(i%3)*.17)*power,starSize=size*(.08+(i%2)*.035);
      const star=node(layer,'fx-spark',{left:x-starSize/2+'px',top:y-starSize/2+'px',width:starSize+'px',height:starSize+'px'},starMarkup(i%2?'#ffd6c6':'#ffedcd'));
      const dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
      animate(star,[{offset:0,opacity:0,transform:'translate(0,0) scale(.2)'},{offset:.10,opacity:0,transform:'translate(0,0) scale(.2)'},{offset:.16,opacity:1,transform:'translate('+dx*.32+'px,'+dy*.32+'px) scale(1)'},{offset:.72,opacity:.2,transform:'translate('+dx+'px,'+(dy+size*.15)+'px) rotate('+(i%2?150:-130)+'deg) scale(.8)'},{offset:1,opacity:0,transform:'translate('+dx*1.1+'px,'+(dy+size*.4)+'px) rotate(190deg) scale(.1)'}]);
    }
    for(let i=0;i<5;i++){
      const direction=mirror?-1:1,length=size*(.75+(i%3)*.22),thickness=Math.max(2,size*.016),yOffset=(i-2)*size*.105;
      const streak=node(layer,'fx-streak',{left:x-direction*size*.82-(direction>0?length:0)+'px',top:y+yOffset+'px',width:length+'px',height:thickness+'px',borderRadius:'99px',background:'linear-gradient('+ (direction>0?'90':'270')+'deg,transparent,#ffdac8 60%,#fff7d8)',transformOrigin:direction>0?'right center':'left center'});
      animate(streak,[{offset:0,opacity:0,transform:'scaleX(.2)'},{offset:.045,opacity:.9,transform:'scaleX(1)'},{offset:.12,opacity:1,transform:'scaleX(.8)'},{offset:.28,opacity:0,transform:'scaleX(.15)'},{offset:1,opacity:0,transform:'scaleX(.15)'}]);
    }
  }
  function pinchSkin(layer,propSize,propHeight,mirror){
    if(markOpacity===0)return;
    const total=duration+markFade;
    const pads=meta.pads||[{x:.892,y:.177,angle:30},{x:.922,y:.245,angle:-35}];
    const artFrames=Array.from({length:8},(_,frame)=>root.PuppetPinchMarks.pressureMarkup(skinColor,pads.map(p=>({...root.PuppetPinchFrames.warpPoint(p.x,p.y,meta.contact,frame),angle:p.angle})),meta.width,meta.height,markScale));
    const mark=node(layer,'fx-pinch-mark',{left:'0px',top:'0px',width:propSize+'px',height:propHeight+'px',zIndex:'3'},artFrames[0]);
    mark.dataset.skinColor=root.PuppetPinchMarks.palette(skinColor).base;
    mark.dataset.side=mirror?'right':'left';
    const frames=PINCH_POSES.map(pose=>{
      const phase=pose[0];
      const alpha=phase<.18?0:phase===.18?.72:phase>=1?.10:phase>=.94?.22:phase>=.86?.45:1;
      return {offset:phase*duration/total,opacity:alpha*markOpacity};
    });
    frames.push({...frames.at(-1),offset:1,opacity:0});
    animate(mark,frames,{duration:total});
    marks.push({el:mark,frames:artFrames});
  }
  function hitContact(layer,x,y,base,mirror){
    const p=root.PuppetPinchMarks.palette(skinColor),w=base*.64*contactScale,h=base*(headHit?.25:.8)*contactScale;
    const artwork=headHit?'<svg viewBox="0 0 160 80"><path d="M23 24 Q80 68 137 24" fill="none" stroke="#332b38" stroke-opacity=".35" stroke-width="9" stroke-linecap="round"/><path d="M35 20 Q80 48 125 20" fill="none" stroke="#fff6ee" stroke-opacity=".8" stroke-width="3"/><path d="M48 5L58 18M80 0V15M112 5L102 18" stroke="#ffe1b4" stroke-width="4" stroke-linecap="round"/></svg>':'<svg viewBox="0 0 120 160"><ellipse cx="61" cy="106" rx="38" ry="39" fill="'+p.blush+'" opacity=".75"/><path d="M32 95L20 68Q16 58 22 55Q28 52 32 61L43 83L36 29Q35 19 42 18Q50 17 51 27L56 71L56 16Q56 5 63 6Q70 6 70 16L70 72L78 25Q80 15 87 18Q94 20 92 29L84 80L95 45Q99 36 105 40Q111 43 107 53L96 103Q91 139 63 144Q40 143 32 117Z" fill="'+p.shadow+'" opacity=".38"/><path d="M37 108Q59 120 82 106M39 126Q63 135 81 120" stroke="'+p.deep+'" stroke-opacity=".35" fill="none" stroke-width="2" stroke-linecap="round"/></svg>';
    const el=node(layer,'fx-hit-contact',{left:x-w/2+'px',top:y-h*.54+'px',width:w+'px',height:h+'px',zIndex:'1',transformOrigin:'50% 54%'},artwork);
    el.dataset.target=headHit?'head':'face';el.dataset.skinColor=p.base;
    const m=mirror?-1:1;
    animate(el,[{offset:0,opacity:0,transform:'scale('+m+',.6)'},{offset:.08,opacity:0,transform:'scale('+m+',.6)'},{offset:.10,opacity:1,transform:'scale('+m+',.72)'},{offset:.19,opacity:1,transform:'scale('+m+',.82)'},{offset:.28,opacity:.8,transform:'scale('+m+',1)'},{offset:.60,opacity:.45,transform:'scale('+m+',1)'},{offset:.86,opacity:0,transform:'scale('+m+',1)'},{offset:1,opacity:0,transform:'scale('+m+',1)'}]);
  }
  function prop(layer,point,mirror){
    const w=layer.clientWidth,h=layer.clientHeight,base=Math.min(w,h)*sizeRatio;
    const size=base*meta.widthScale,propHeight=size*meta.height/meta.width,x=point.x*w,y=point.y*h,contact=meta.contact,m=mirror?-1:1;
    if(kind!=='pinch'){impact(layer,x,y,base*(kind==='kick'?1.55:.72)*effectScale,mirror);if(kind==='hit')hitContact(layer,x,y,base,mirror);}
    const heightRatio=kind==='pinch'?root.PuppetPinchFrames.HEIGHT_RATIO:1;
    const el=node(layer,'fx-prop fx-prop-'+kind,{left:x-size*contact.x+'px',top:y-propHeight*contact.y+'px',width:size+'px',height:propHeight*heightRatio+'px',transformOrigin:contact.x*100+'% '+contact.y*100/heightRatio+'%',zIndex:'2'});
    el.dataset.art=artKey;
    if(kind==='pinch')pinchSkin(el,size,propHeight,mirror);
    const img=doc.createElement(kind==='pinch'?'canvas':'img');img.className='fx-art';
    if(kind==='pinch'){root.PuppetPinchFrames.draw(img,0);hands.push(img);}else{img.src=root.PuppetArt[artKey];img.alt='';img.draggable=false;}
    img.setAttribute('aria-hidden','true');Object.assign(img.style,{width:'100%',height:'100%',display:'block',objectFit:'contain',position:'relative',zIndex:'1'});el.append(img);
    const f=(offset,dx,dy,sx,sy,rotation,opacity=1)=>({offset,opacity,transform:'translate('+dx*size*m+'px,'+dy*size+'px) rotate('+rotation*m+'deg) scale('+(sx*m)+','+sy+')'});
    let frames;
    if(headHit)frames=[f(0,0,-1.9,.8,.8,165,0),f(.065,0,-.2,1,1,165),f(.10,0,0,1.05,.87,165),f(.16,0,.012,1.10,.80,165),f(.22,0,0,1.03,.93,165),f(.40,0,-.22,.98,1,165,.6),f(.62,0,-1.2,.85,.9,165,0),f(1,0,-1.2,.85,.9,165,0)];
    else if(kind==='hit')frames=[f(0,-2.1,-.3,.65,.65,-32,0),f(.065,-.25,-.08,1.04,1.04,-18),f(.10,0,0,1.1,1.1,0),f(.135,0,0,.92,1.08,0),f(.22,0,0,1,1.07,0),f(.36,-.18,-.08,1.0,1.0,-12),f(.65,-.85,-.35,.82,.82,-32,0),f(1,-.85,-.35,.82,.82,-32,0)];
    else if(kind==='kick')frames=[f(0,-2.3,.7,.55,.55,30,0),f(.065,-.25,.08,1.12,1.12,-12),f(.10,0,0,1.45,1.28,-12),f(.14,.09,-.04,1.52,1.12,-16),f(.22,.04,-.02,1.32,1.24,-12),f(.38,-.3,.08,1.10,1.10,5),f(.63,-1.2,.42,.7,.7,32,0),f(1,-1.2,.42,.7,.7,32,0)];
    else frames=PINCH_POSES.map(pose=>f(...pose));
    animate(el,frames);
  }
  for(const layer of layers){if(kind==='pinch'){prop(layer,anchors.pinchLeft,false);prop(layer,anchors.pinchRight,true);}else prop(layer,headHit?(anchors.hitHead||anchors.hit):anchors[kind],settings.direction==='right');}
  return new Promise(resolve=>{
    let timer,raf,stopped=false,lastFrame=-1;const start=performance.now();
    const tick=now=>{if(stopped)return;const elapsed=now-start,frame=root.PuppetPinchFrames.frameAt(elapsed,duration);
      if(frame!==lastFrame){for(const hand of hands)root.PuppetPinchFrames.draw(hand,frame);for(const mark of marks){mark.el.innerHTML=mark.frames[frame];mark.el.dataset.frame=String(frame);}lastFrame=frame;}
      const opacity=Math.max(0,Math.min(1,(.87-elapsed/duration)/.09));for(const mark of marks)mark.el.querySelector('.pm-skin').style.opacity=String(opacity);
      raf=requestAnimationFrame(tick);
    };
    const finish=()=>{if(stopped)return;stopped=true;clearTimeout(timer);cancelAnimationFrame(raf);signal?.removeEventListener('abort',finish);for(const animation of animations)animation.cancel();for(const el of nodes)el.remove();resolve();};
    if(signal?.aborted){finish();return;}signal?.addEventListener('abort',finish,{once:true});if(kind==='pinch')raf=requestAnimationFrame(tick);timer=setTimeout(finish,duration+markFade+50);
  });
}
return {preload,play,icon};
});
