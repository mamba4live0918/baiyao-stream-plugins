(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./tricks.js'));else root.GelatoEffectHud=factory(root.GelatoTricks);})(typeof globalThis!=='undefined'?globalThis:this,function(Tricks){
  'use strict';
  const ACTIONS=Object.keys(Tricks.DEFINITIONS).filter(a=>a!=='blast');
  const COLORS=['#c5b2ff','#91d7ff','#ffb194','#a6e3be','#a0def1','#a0def1','#ffd49c','#97cfff'];
  const ICONS=['↔','Ⅱ','−','+','←','→','滴','冰'];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const number=(n,f)=>n!==null&&n!==''&&Number.isFinite(Number(n))?Number(n):f;
  function normalize(value={}){
    value=value&&typeof value==='object'?value:{};
    const cards={};for(const action of ACTIONS){const c=value.cards?.[action]||{};cards[action]={size:clamp(number(c.size,20),12,64),x:c.x==null?null:clamp(number(c.x,0),0,1),y:c.y==null?null:clamp(number(c.y,0),0,1)};if(cards[action].x===null||cards[action].y===null)cards[action].x=cards[action].y=null;}
    return {enabled:value.enabled!==false,color:/^#[0-9a-f]{6}$/i.test(value.color)?value.color:'#ffffff',opacity:clamp(number(value.opacity,72),0,100),cards};
  }
  function formatTime(seconds){const n=Math.ceil(Math.max(0,number(seconds,0)-1e-8));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function rows(snapshot){return ACTIONS.flatMap(action=>{const e=snapshot.find(e=>e.action===action&&e.remaining>1e-8);return e?[{...e,name:Tricks.DEFINITIONS[action].name,time:formatTime(e.remaining),fraction:clamp(e.remaining/(e.total||e.remaining),0,1)}]:[];});}
  function layout(actions,prefs,w,h){
    const gap=8,margin=12,auto=actions.filter(a=>prefs.cards[a].x===null),out=[];
    if(auto.length){
      const maxSize=Math.max(...auto.map(a=>prefs.cards[a].size)),cw=maxSize*12,ch=maxSize*3.8;
      const top=w<600?Math.min(h*.65,Math.max(220,Math.min(h*.3,260))):Math.min(h*.24,150),aw=Math.max(1,w-margin*2),ah=Math.max(1,h-top-margin);
      let best={scale:0};
      for(let cols=1;cols<=auto.length;cols++){const count=Math.ceil(auto.length/cols),scale=Math.min(1,(aw-gap*(cols-1))/(cols*cw),(ah-gap*(count-1))/(count*ch));if(scale>best.scale)best={scale,cols,count};}
      auto.forEach((action,i)=>{const size=prefs.cards[action].size*best.scale,width=size*12,height=size*3.8,col=Math.floor(i/best.count),row=i%best.count;out.push({action,size,width,height,x:w-margin-width-col*(cw*best.scale+gap),y:top+row*(ch*best.scale+gap)});});
    }
    for(const action of actions.filter(a=>prefs.cards[a].x!==null)){const c=prefs.cards[action],size=Math.min(c.size,Math.max(1,w-margin*2)/12,Math.max(1,h-margin*2)/3.8),width=size*12,height=size*3.8;out.push({action,size,width,height,x:clamp(c.x*w,4,Math.max(4,w-width-4)),y:clamp(c.y*h,4,Math.max(4,h-height-4))});}
    return out;
  }
  class Display{
    constructor(root,prefs,{save=()=>{},canDrag=()=>true,onDrag=()=>{}}={}){
      this.root=root;this.prefs=normalize(prefs);this.save=save;this.canDrag=canDrag;this.onDrag=onDrag;this.preview=false;this.nodes=new Map();this.last=[];this.status='ready';this.drag=null;
      ACTIONS.forEach((action,i)=>{
        const card=document.createElement('div');card.className='effect-card';card.dataset.action=action;card.title='拖动调整此效果的位置';card.style.setProperty('--effect-accent',COLORS[i]);card.hidden=true;
        const icon=document.createElement('span');icon.className='effect-icon';icon.textContent=ICONS[i];
        const name=document.createElement('span');name.className='effect-name';name.textContent=Tricks.DEFINITIONS[action].name;
        const time=document.createElement('strong');time.className='effect-time';
        const state=document.createElement('small');state.className='effect-caption';
        const track=document.createElement('div');track.className='effect-track';const fill=document.createElement('div');track.append(fill);
        card.append(icon,name,time,state,track);root.append(card);this.nodes.set(action,{card,time,state,fill,previous:0});
        card.addEventListener('pointerdown',e=>{if(e.button!==0||!this.canDrag())return;e.preventDefault();const r=card.getBoundingClientRect();this.drag={action,id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};card.setPointerCapture(e.pointerId);this.onDrag(false);});
        card.addEventListener('pointermove',e=>{const d=this.drag;if(!d||d.id!==e.pointerId||d.action!==action)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>3)d.moved=true;if(!d.moved)return;const r=card.getBoundingClientRect();card.style.left=clamp(d.left+dx,4,Math.max(4,innerWidth-r.width-4))+'px';card.style.top=clamp(d.top+dy,4,Math.max(4,innerHeight-r.height-4))+'px';});
        const finish=e=>{const d=this.drag;if(!d||d.id!==e.pointerId||d.action!==action)return;if(d.moved){const r=card.getBoundingClientRect();Object.assign(this.prefs.cards[action],{x:r.left/innerWidth,y:r.top/innerHeight});this.save(this.prefs);this.onDrag(true);}this.drag=null;this.render(this.last,this.status);};
        card.addEventListener('pointerup',finish);card.addEventListener('pointercancel',finish);
      });
    }
    render(snapshot,status){
      this.last=snapshot;this.status=status;const actual=rows(snapshot),shown=this.preview?ACTIONS.map(action=>actual.find(e=>e.action===action)||{action,time:'00:30',remaining:30,fraction:1,sample:true}):actual;
      this.root.hidden=!this.prefs.enabled&&!this.preview||!shown.length;
      for(const [action,n] of this.nodes){const e=shown.find(e=>e.action===action);n.card.hidden=!e;if(!e){n.previous=0;continue;}
        n.time.textContent=e.time;n.state.textContent=e.sample?'布局预览':status==='playing'?'剩余时间':status==='won'||status==='lost'?'本局已结束':status==='ready'?'开始后计时':'已暂停';
        n.fill.style.transform='scaleX('+e.fraction+')';n.card.classList.toggle('expiring',!e.sample&&e.remaining<=3);n.card.classList.toggle('sample',!!e.sample);
        if(!e.sample&&n.previous>0&&e.remaining>n.previous+.05&&!matchMedia('(prefers-reduced-motion: reduce)').matches)n.card.animate([{outline:'2px solid '+COLORS[ACTIONS.indexOf(action)]},{outline:'2px solid transparent'}],{duration:600});
        n.previous=e.remaining;n.card.style.color=this.prefs.color;n.card.style.backgroundColor='rgba(18,25,34,'+this.prefs.opacity/100+')';
      }
      for(const b of layout(shown.map(e=>e.action),this.prefs,innerWidth,innerHeight)){if(this.drag?.action===b.action)continue;const s=this.nodes.get(b.action).card.style;s.fontSize=b.size+'px';s.left=b.x+'px';s.top=b.y+'px';}
    }
  }
  return {ACTIONS,normalize,formatTime,rows,layout,Display};
});
