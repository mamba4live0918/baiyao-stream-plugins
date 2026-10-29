(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PetTornado=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAU=Math.PI*2, SIZE=512, FILAMENTS=48, PARTICLES=22;
  const clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=v=>v*v*(3-2*v);
  const fract=v=>v-Math.floor(v);
  const palette=['#98d5df','#c1ace7','#c3e9ee','#90bfd7'];

  // Height is measured from the narrow foot; depth is an elliptical projection.
  function orbitPoint(height,angle){
    const h=clamp(height),radius=12+147*Math.pow(h,.88);
    const depth=Math.sin(angle);
    return {x:256+Math.cos(angle)*radius,y:427-h*330+depth*radius*.23,depth,radius,height:h};
  }

  function scene(timeSeconds,options){
    const time=options&&options.reduced?0:(Number.isFinite(timeSeconds)?timeSeconds:0);
    const ribbons=[],particles=[];
    for(let i=0;i<FILAMENTS;i++){
      const head=fract(i/FILAMENTS+time*.135);
      const phase=i*2.3999632297+time*(4.2+(i%3)*.13);
      const length=1.4+(i%5)*.23,points=[];
      for(let j=0;j<=18;j++){
        const behind=j/18;
        const h=head-behind*(.031+(i%4)*.006);
        if(h<0)break;
        points.push(orbitPoint(h,phase-behind*length));
      }
      if(points.length<2)continue;
      const fade=Math.min(1,head*12,(1-head)*12);
      ribbons.push({points,depth:Math.sin(phase-length*.5),width:2.5+head*2.5,color:palette[i%4],alpha:(.43+head*.3)*fade});
    }
    for(let i=0;i<PARTICLES;i++){
      const h=fract(i*.754877666+time*(.19+(i%3)*.013));
      const angle=i*2.8+time*4.6;
      const point=orbitPoint(h,angle),tail=orbitPoint(Math.max(0,h-.009),angle-.075);
      particles.push({point,tail,alpha:Math.min(1,h*12,(1-h)*12)*.8,width:1.4+(i%3)*.6});
    }
    return {ribbons,particles};
  }

  function draw(canvas,timeSeconds,options){
    if(!canvas||typeof canvas.getContext!=='function')return false;
    const ctx=canvas.getContext('2d');
    if(!ctx)return false;
    if(canvas.width!==SIZE)canvas.width=SIZE;
    if(canvas.height!==SIZE)canvas.height=SIZE;
    const data=scene(timeSeconds,options);
    ctx.clearRect(0,0,SIZE,SIZE);
    ctx.save();
    ctx.lineCap='round';ctx.lineJoin='round';
    const items=data.ribbons.map(r=>({depth:r.depth,ribbon:r})).concat(data.particles.map(p=>({depth:p.point.depth,particle:p})));
    items.sort((a,b)=>a.depth-b.depth);
    for(const item of items){
      if(item.ribbon){
        const r=item.ribbon;
        ctx.beginPath();
        r.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
        ctx.strokeStyle=r.color;
        ctx.globalAlpha=r.alpha*(r.depth<0?.48:1);
        ctx.lineWidth=r.width*2.1;ctx.stroke();
        ctx.strokeStyle=r.depth<0?r.color:'#f6feff';
        ctx.globalAlpha=r.alpha*(r.depth<0?.65:1);
        ctx.lineWidth=r.width*.55;ctx.stroke();
      }else{
        const p=item.particle;
        ctx.beginPath();ctx.moveTo(p.tail.x,p.tail.y);ctx.lineTo(p.point.x,p.point.y);
        ctx.lineWidth=p.width;ctx.strokeStyle=p.point.depth<0?'#b4c3e8':'#e7fbff';
        ctx.globalAlpha=p.alpha*(p.point.depth<0?.35:1);ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  }

  function capturePoint(progress,start,center,end,size){
    const t=clamp(progress),s=Math.max(1,Number.isFinite(size)?size:64),split=.64;
    if(t===0)return {x:start.x,y:start.y,scale:1,tilt:0,opacity:1};
    if(t===1)return {x:end.x,y:end.y,scale:.14,tilt:0,opacity:.8};
    const lift=Math.min(48,s*.6),eye={x:center.x,y:center.y-lift};
    if(t<=split){
      const u=t/split,e=smooth(u),dx=start.x-center.x,dy=(start.y-center.y)/.46;
      const radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)+TAU*1.05*e;
      const r=radius*(1-e);
      return {x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r*.46-lift*e,scale:1-.3*e,tilt:12*Math.sin(TAU*e)*Math.sin(Math.PI*u),opacity:1};
    }
    // Zero velocity at the join makes the inward spiral and flight continuous.
    const u=(t-split)/(1-split),q=smooth(u),v=1-q;
    const p1={x:eye.x,y:eye.y-Math.min(95,Math.abs(end.x-eye.x)*.2+35)};
    const p2={x:end.x+(eye.x-end.x)*.2,y:end.y-Math.min(80,Math.abs(end.y-eye.y)*.2+24)};
    return {x:v*v*v*eye.x+3*v*v*q*p1.x+3*v*q*q*p2.x+q*q*q*end.x,y:v*v*v*eye.y+3*v*v*q*p1.y+3*v*q*q*p2.y+q*q*q*end.y,scale:.7-.56*q,tilt:-10*Math.sin(Math.PI*q),opacity:1-.2*q};
  }

  function captureFrames(start,center,end,size){
    const frames=[];
    // Include the exact spiral/flight junction as well as both exact endpoints.
    const offsets=Array.from({length:65},(_,i)=>i/64).concat(.64).sort((a,b)=>a-b);
    for(const offset of offsets){
      const p=capturePoint(offset,start,center,end,size);
      frames.push({offset,transform:'translate('+(p.x-size/2)+'px,'+(p.y-size/2)+'px) scale('+p.scale+') rotate('+p.tilt+'deg)',opacity:p.opacity});
    }
    return frames;
  }

  return {draw,scene,orbitPoint,capturePoint,captureFrames,SIZE,FILAMENTS,PARTICLES};
});
